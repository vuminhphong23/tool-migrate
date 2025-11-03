/**
 * Dependency Analyzer for Collections
 * Analyzes relationships between collections and suggests migration order
 */

export interface CollectionDependency {
  collection: string;
  dependsOn: string[]; // Collections that this collection depends on
  dependedBy: string[]; // Collections that depend on this collection
  level: number; // Migration order level (0 = no dependencies, can go first)
}

export interface MigrationOrder {
  collections: string[];
  levels: Map<number, string[]>; // Group collections by level
  dependencies: Map<string, CollectionDependency>;
}

/**
 * Analyze collection dependencies from schema relations
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
  });

  // Calculate migration levels using topological sort
  const levels = calculateMigrationLevels(dependencyMap);

  // Sort collections by level
  const sortedCollections: string[] = [];
  const levelNumbers = Array.from(levels.keys());
  const maxLevel = levelNumbers.length > 0 ? Math.max(...levelNumbers) : 0;
  
  for (let level = 0; level <= maxLevel; level++) {
    const collectionsAtLevel = levels.get(level) || [];
    sortedCollections.push(...collectionsAtLevel);
  }

  return {
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
  const visited = new Set<string>();
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
      visited.add(collection);
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
    visited.add(collection);
    
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
