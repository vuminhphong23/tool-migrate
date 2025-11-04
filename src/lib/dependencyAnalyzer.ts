/**
 * Dependency Analysis Utilities for Collection Migration
 * Analyzes relations between collections and determines migration order
 */

export interface CollectionDependency {
  collection: string;
  dependsOn: string[]; // Collections that must be migrated first
  requiredBy: string[]; // Collections that require this one (same as dependedBy)
  dependedBy: string[]; // Collections that depend on this collection
  level: number; // Migration order level (0 = no dependencies, can go first)
}

export interface DependencyGraph {
  [collection: string]: CollectionDependency;
}

export interface MigrationOrder {
  order: string[];
  cycles: string[][];
  warnings: string[];
  collections: string[]; // Alias for order
  levels: Map<number, string[]>; // Group collections by level
  dependencies: Map<string, CollectionDependency>;
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
      requiredBy: [],
      dependedBy: [],
      level: 0
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
      // Also populate dependedBy (alias for requiredBy)
      if (!graph[targetCollection].dependedBy.includes(sourceCollection)) {
        graph[targetCollection].dependedBy.push(sourceCollection);
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
        requiredBy: [],
        dependedBy: [],
        level: 0
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

  // Calculate levels for collections
  const levels = calculateLevelsFromGraph(filteredGraph, result);
  
  // Convert filteredGraph to Map for dependencies
  const dependenciesMap = new Map<string, CollectionDependency>();
  Object.entries(filteredGraph).forEach(([key, value]) => {
    dependenciesMap.set(key, value);
  });

  return {
    order: result,
    cycles,
    warnings,
    collections: result, // Alias for order
    levels,
    dependencies: dependenciesMap
  };
}

/**
 * Calculate migration levels from dependency graph
 */
function calculateLevelsFromGraph(
  graph: DependencyGraph,
  order: string[]
): Map<number, string[]> {
  const levels = new Map<number, string[]>();
  const collectionLevels = new Map<string, number>();

  function calculateLevel(collection: string, visited = new Set<string>()): number {
    if (collectionLevels.has(collection)) {
      return collectionLevels.get(collection)!;
    }

    if (visited.has(collection)) {
      // Circular dependency - assign level 0
      return 0;
    }

    visited.add(collection);
    const deps = graph[collection]?.dependsOn || [];
    
    if (deps.length === 0) {
      collectionLevels.set(collection, 0);
      if (graph[collection]) {
        graph[collection].level = 0;
      }
      return 0;
    }

    let maxDepLevel = -1;
    for (const dep of deps) {
      const depLevel = calculateLevel(dep, new Set(visited));
      maxDepLevel = Math.max(maxDepLevel, depLevel);
    }

    const level = maxDepLevel + 1;
    collectionLevels.set(collection, level);
    if (graph[collection]) {
      graph[collection].level = level;
    }
    
    return level;
  }

  // Calculate level for each collection in order
  order.forEach(collection => {
    calculateLevel(collection);
  });

  // Group collections by level
  collectionLevels.forEach((level, collection) => {
    if (!levels.has(level)) {
      levels.set(level, []);
    }
    levels.get(level)!.push(collection);
  });

  return levels;
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

/**
 * Analyze collection dependencies from schema relations
 * Alternative implementation using Map instead of graph object
 */
export function analyzeCollectionDependencies(
  collections: any[],
  relations: any[]
): MigrationOrder {
  const dependencyMap = new Map<string, CollectionDependency>();
  
  // Initialize dependency map for all collections
  collections.forEach(col => {
    const collectionName = col.collection || col;
    dependencyMap.set(collectionName, {
      collection: collectionName,
      dependsOn: [],
      dependedBy: [],
      requiredBy: [],
      level: 0
    });
  });

  // Analyze relations to build dependency graph
  relations.forEach(relation => {
    const fromCollection = relation.collection;
    const toCollection = relation.related_collection;

    // Skip if either collection is not in our list
    if (!dependencyMap.has(fromCollection) || !dependencyMap.has(toCollection)) {
      return;
    }

    // Skip self-references
    if (fromCollection === toCollection) {
      return;
    }

    // fromCollection depends on toCollection (has foreign key to it)
    const fromDep = dependencyMap.get(fromCollection)!;
    const toDep = dependencyMap.get(toCollection)!;

    if (!fromDep.dependsOn.includes(toCollection)) {
      fromDep.dependsOn.push(toCollection);
    }

    if (!toDep.dependedBy.includes(fromCollection)) {
      toDep.dependedBy.push(fromCollection);
    }
    
    if (!toDep.requiredBy.includes(fromCollection)) {
      toDep.requiredBy.push(fromCollection);
    }
  });

  // Calculate migration levels using topological sort
  const levels = calculateMigrationLevels(dependencyMap);

  // Sort collections by level
  const sortedCollections: string[] = [];
  const levelNumbers = Array.from(levels.keys()).sort((a, b) => a - b);
  
  for (const level of levelNumbers) {
    const collectionsAtLevel = levels.get(level) || [];
    sortedCollections.push(...collectionsAtLevel);
  }

  return {
    order: sortedCollections,
    cycles: [],
    warnings: [],
    collections: sortedCollections,
    levels,
    dependencies: dependencyMap
  };
}

/**
 * Calculate migration levels using topological sort
 * Level 0 = no dependencies (can migrate first)
 * Level 1 = depends only on level 0
 * Level 2 = depends on level 0 or 1, etc.
 */
function calculateMigrationLevels(
  dependencyMap: Map<string, CollectionDependency>
): Map<number, string[]> {
  const levels = new Map<number, string[]>();
  const collectionLevels = new Map<string, number>();
  const visiting = new Set<string>();

  function visit(collection: string): number {
    if (collectionLevels.has(collection)) {
      return collectionLevels.get(collection)!;
    }

    if (visiting.has(collection)) {
      // Circular dependency detected - assign to level 0
      console.warn(`Circular dependency detected for ${collection}`);
      return 0;
    }

    visiting.add(collection);
    const dep = dependencyMap.get(collection);
    
    if (!dep || dep.dependsOn.length === 0) {
      // No dependencies - level 0
      collectionLevels.set(collection, 0);
      visiting.delete(collection);
      return 0;
    }

    // Calculate level based on dependencies
    let maxDepLevel = -1;
    for (const depCollection of dep.dependsOn) {
      const depLevel = visit(depCollection);
      maxDepLevel = Math.max(maxDepLevel, depLevel);
    }

    const level = maxDepLevel + 1;
    collectionLevels.set(collection, level);
    dep.level = level;
    
    visiting.delete(collection);
    
    return level;
  }

  // Visit all collections
  for (const collection of dependencyMap.keys()) {
    visit(collection);
  }

  // Group collections by level
  for (const [collection, level] of collectionLevels.entries()) {
    if (!levels.has(level)) {
      levels.set(level, []);
    }
    levels.get(level)!.push(collection);
  }

  return levels;
}

/**
 * Get suggested migration order as a simple array
 */
export function getSuggestedMigrationOrder(
  collections: any[],
  relations: any[]
): string[] {
  const analysis = analyzeCollectionDependencies(collections, relations);
  return analysis.collections;
}

/**
 * Check if a collection can be migrated given already migrated collections
 */
export function canMigrateCollection(
  collection: string,
  alreadyMigrated: string[],
  dependencies: Map<string, CollectionDependency>
): boolean {
  const dep = dependencies.get(collection);
  if (!dep) return true;

  // Check if all dependencies are already migrated
  return dep.dependsOn.every(depCol => alreadyMigrated.includes(depCol));
}

/**
 * Get next collections that can be migrated
 */
export function getNextMigratableCollections(
  remainingCollections: string[],
  alreadyMigrated: string[],
  dependencies: Map<string, CollectionDependency>
): string[] {
  return remainingCollections.filter(col => 
    canMigrateCollection(col, alreadyMigrated, dependencies)
  );
}

/**
 * Format dependency info for display
 */
export function formatDependencyInfo(dep: CollectionDependency): string {
  const parts: string[] = [];
  
  if (dep.dependsOn.length > 0) {
    parts.push(`Depends on: ${dep.dependsOn.join(', ')}`);
  }
  
  if (dep.dependedBy.length > 0) {
    parts.push(`Required by: ${dep.dependedBy.join(', ')}`);
  }
  
  parts.push(`Level: ${dep.level}`);
  
  return parts.join(' | ');
}
