/**
 * Dependency Analysis Utilities for Collection Migration
 * Analyzes relations between collections and determines migration order
 */

export interface CollectionDependency {
  collection: string;
  dependsOn: string[]; // Collections that must be migrated first
  requiredBy: string[]; // Collections that require this one
}

export interface DependencyGraph {
  [collection: string]: CollectionDependency;
}

export interface MigrationOrder {
  order: string[];
  cycles: string[][];
  warnings: string[];
}

/**
 * Analyzes schema relations to build a dependency graph
 */
export function analyzeDependencies(relations: any[]): DependencyGraph {
  const graph: DependencyGraph = {};

  // Initialize graph for all collections
  const allCollections = new Set<string>();
  relations.forEach((rel: any) => {
    if (rel.collection && !rel.collection.startsWith('directus_')) {
      allCollections.add(rel.collection);
    }
    if (rel.related_collection && !rel.related_collection.startsWith('directus_')) {
      allCollections.add(rel.related_collection);
    }
  });

  allCollections.forEach(collection => {
    graph[collection] = {
      collection,
      dependsOn: [],
      requiredBy: []
    };
  });

  // Build dependency relationships
  relations.forEach((rel: any) => {
    const sourceCollection = rel.collection;
    const targetCollection = rel.related_collection;

    // Skip system collections
    if (sourceCollection?.startsWith('directus_') || targetCollection?.startsWith('directus_')) {
      return;
    }

    if (!sourceCollection || !targetCollection) {
      return;
    }

    // Determine dependency direction based on relation type
    // For many-to-one: source depends on target (target must exist first)
    // For one-to-many: target depends on source
    const relationType = rel.meta?.one_collection_field || rel.meta?.one_field;
    const isManyToOne = relationType !== null;

    if (isManyToOne) {
      // Source collection depends on target collection
      if (!graph[sourceCollection].dependsOn.includes(targetCollection)) {
        graph[sourceCollection].dependsOn.push(targetCollection);
      }
      if (!graph[targetCollection].requiredBy.includes(sourceCollection)) {
        graph[targetCollection].requiredBy.push(sourceCollection);
      }
    }
  });

  return graph;
}

/**
 * Performs topological sort to determine migration order
 * Returns ordered list of collections and any circular dependencies found
 */
export function calculateMigrationOrder(graph: DependencyGraph, selectedCollections: string[]): MigrationOrder {
  const result: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const cycles: string[][] = [];
  const warnings: string[] = [];

  // Filter graph to only selected collections
  const filteredGraph: DependencyGraph = {};
  selectedCollections.forEach(collection => {
    if (graph[collection]) {
      filteredGraph[collection] = {
        ...graph[collection],
        dependsOn: graph[collection].dependsOn.filter(dep => selectedCollections.includes(dep))
      };
    } else {
      // Collection not in graph (no relations)
      filteredGraph[collection] = {
        collection,
        dependsOn: [],
        requiredBy: []
      };
    }
  });

  // Detect cycles using DFS
  function detectCycle(node: string, path: string[]): string[] | null {
    if (visiting.has(node)) {
      // Found a cycle
      const cycleStart = path.indexOf(node);
      return path.slice(cycleStart).concat(node);
    }
    if (visited.has(node)) {
      return null;
    }

    visiting.add(node);
    path.push(node);

    const deps = filteredGraph[node]?.dependsOn || [];
    for (const dep of deps) {
      const cycle = detectCycle(dep, [...path]);
      if (cycle) {
        return cycle;
      }
    }

    visiting.delete(node);
    visited.delete(node); // Reset for topological sort
    return null;
  }

  // Find all cycles
  for (const collection of selectedCollections) {
    if (!visited.has(collection)) {
      const cycle = detectCycle(collection, []);
      if (cycle) {
        cycles.push(cycle);
        warnings.push(`Circular dependency detected: ${cycle.join(' → ')}`);
      }
    }
  }

  // Reset for topological sort
  visited.clear();
  visiting.clear();

  // Topological sort using DFS
  function visit(node: string): void {
    if (visited.has(node) || visiting.has(node)) {
      return;
    }

    visiting.add(node);

    const deps = filteredGraph[node]?.dependsOn || [];
    for (const dep of deps) {
      visit(dep);
    }

    visiting.delete(node);
    visited.add(node);
    result.push(node);
  }

  // Process all selected collections
  for (const collection of selectedCollections) {
    visit(collection);
  }

  // Add warnings for dependencies on system collections
  selectedCollections.forEach(collection => {
    const allDeps = graph[collection]?.dependsOn || [];
    const systemDeps = allDeps.filter(dep => dep.startsWith('directus_'));
    if (systemDeps.length > 0) {
      warnings.push(`${collection} has relations to system collections: ${systemDeps.join(', ')}. Ensure ID mapping is handled.`);
    }
  });

  return {
    order: result,
    cycles,
    warnings
  };
}

/**
 * Groups collections into batches that can be migrated in parallel
 */
export function groupIntoBatches(graph: DependencyGraph, order: string[]): string[][] {
  const batches: string[][] = [];
  const processed = new Set<string>();

  while (processed.size < order.length) {
    const batch: string[] = [];

    for (const collection of order) {
      if (processed.has(collection)) {
        continue;
      }

      // Check if all dependencies are processed
      const deps = graph[collection]?.dependsOn || [];
      const allDepsProcessed = deps.every(dep => processed.has(dep) || !order.includes(dep));

      if (allDepsProcessed) {
        batch.push(collection);
      }
    }

    if (batch.length === 0) {
      // No progress - remaining collections have circular dependencies
      // Add them to a final batch
      order.forEach(col => {
        if (!processed.has(col)) {
          batch.push(col);
        }
      });
    }

    batch.forEach(col => processed.add(col));
    batches.push(batch);
  }

  return batches;
}

/**
 * Validates if a custom order respects dependencies
 */
export function validateCustomOrder(graph: DependencyGraph, order: string[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const positionMap = new Map<string, number>();

  order.forEach((collection, index) => {
    positionMap.set(collection, index);
  });

  order.forEach(collection => {
    const deps = graph[collection]?.dependsOn || [];
    deps.forEach(dep => {
      const collectionPos = positionMap.get(collection);
      const depPos = positionMap.get(dep);

      if (collectionPos !== undefined && depPos !== undefined && collectionPos < depPos) {
        errors.push(`${collection} is positioned before its dependency ${dep}`);
      }
    });
  });

  return {
    valid: errors.length === 0,
    errors
  };
}
