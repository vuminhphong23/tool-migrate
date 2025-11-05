import React, { useState } from 'react'
import { importFromDirectus, previewCollectionItems, importSelectedItems, getRelations } from '../lib/apiHandlers'
import { FlowsManager } from './FlowsManager'
import { AccessControlManager } from './AccessControlManager'
import { DocumentationTab } from './DocumentationTab'
import { ItemSelectorModal } from './ItemSelectorModal'
import { FilesManager } from './FilesManager'
import type { Collection, OperationStatus } from '../types'
import { analyzeDependencies, calculateMigrationOrder, validateCustomOrder, type DependencyGraph, type MigrationOrder } from '../lib/dependencyAnalyzer'

interface CollectionListProps {
  collections: Collection[]
  sourceUrl: string
  sourceToken: string
  targetUrl: string
  targetToken: string
  onStatusUpdate: (status: OperationStatus | null) => void
  loading: Record<string, boolean>
  setLoading: (key: string, state: boolean) => void
}

export function CollectionList({
  collections,
  sourceUrl,
  sourceToken,
  targetUrl,
  targetToken,
  onStatusUpdate: _onStatusUpdate, // Ignore status updates - will use inline notifications
  loading,
  setLoading
}: CollectionListProps) {
  // Empty function to replace all onStatusUpdate calls
  const onStatusUpdate = (_status: any) => {};
  const [importLimit, setImportLimit] = useState<number | null>(null)
  const [titleFilter, setTitleFilter] = useState<string>('')
  const [showFlowsManager, setShowFlowsManager] = useState(false)
  const [showAccessControlManager, setShowAccessControlManager] = useState(false)
  const [showFilesManager, setShowFilesManager] = useState(false)
  const [showDocumentation, setShowDocumentation] = useState(false)
  const [selectedCollections, setSelectedCollections] = useState<string[]>([])
  const [validationResults, setValidationResults] = useState<Record<string, { isValid: boolean; errors: string[]; warnings: string[] }>>({})
  const [isValidating, setIsValidating] = useState(false)
  const [showSystemCollections, setShowSystemCollections] = useState(false)
  const [systemCollectionsAcknowledged, setSystemCollectionsAcknowledged] = useState(false)
  const [targetCollections, setTargetCollections] = useState<Collection[]>([])
  const [statusFilter, setStatusFilter] = useState<'existing' | 'new'>('existing')
  const [showNewCollectionWarning, setShowNewCollectionWarning] = useState(false)
  const [schemaMigrationStep, setSchemaMigrationStep] = useState<'idle' | 'snapshot' | 'diff' | 'apply' | 'complete'>('idle')
  const [schemaSnapshot, setSchemaSnapshot] = useState<any>(null)
  const [schemaDiff, setSchemaDiff] = useState<any>(null)
  const [errorLogs, setErrorLogs] = useState<Array<{id: string, timestamp: string, operation: string, error: any}>>([])
  const [showErrorLogs, setShowErrorLogs] = useState(false)
  const [showImportOptions, setShowImportOptions] = useState(false)
  const [itemsPerPage, setItemsPerPage] = useState<number>(20)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [importProgress, setImportProgress] = useState<Record<string, { current: number; total: number }>>({})
  const [selectedSchemaCollections, setSelectedSchemaCollections] = useState<string[]>([])
  const [schemaCollectionFilter, setSchemaCollectionFilter] = useState<string>('')
  const [collapsedFieldDetails, setCollapsedFieldDetails] = useState<Record<string, boolean>>({})
  const [migratedCollections, setMigratedCollections] = useState<string[]>([])
  
  // Item Selector states
  const [showItemSelector, setShowItemSelector] = useState(false)
  const [currentPreviewCollection, setCurrentPreviewCollection] = useState<string>('')
  const [previewItems, setPreviewItems] = useState<any[]>([])
  const [previewTotal, setPreviewTotal] = useState<number>(0)
  const [previewOffset, setPreviewOffset] = useState<number>(0)
  const [selectedItemIds, setSelectedItemIds] = useState<(string | number)[]>([])
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [sourceRelations, setSourceRelations] = useState<any[]>([])
  
  // Load target collections for comparison
  const loadTargetCollections = async () => {
    try {
      const { getAllCollections } = await import('../lib/apiHandlers');
      const result = await getAllCollections(targetUrl, targetToken);
      if (result.success) {
        setTargetCollections(result.collections || []);
      }
    } catch (error) {
      // Silent fail
    }
  };


  // Helper function to check if collection exists in target
  const getCollectionStatus = (sourceCollection: Collection): 'existing' | 'new' | 'unknown' => {
    if (targetCollections.length === 0) {
      return 'unknown'; // Target collections not loaded yet
    }
    const exists = targetCollections.some(targetCollection => 
      targetCollection.collection === sourceCollection.collection
    );
    return exists ? 'existing' : 'new';
  };

  // Auto-load target collections when component mounts
  React.useEffect(() => {
    if (targetUrl && targetToken) {
      loadTargetCollections();
    }
  }, [targetUrl, targetToken]);

  // Load source relations for data migration
  React.useEffect(() => {
    const loadSourceRelations = async () => {
      try {
        const result = await getRelations(sourceUrl, sourceToken);
        if (result.success && result.relations) {
          setSourceRelations(result.relations);
        }
      } catch (error) {
        // Silent fail
      }
    };

    if (sourceUrl && sourceToken) {
      loadSourceRelations();
    }
  }, [sourceUrl, sourceToken]);

  // ========================================
  // Schema Migration Functions (Simplified - Following Directus API Docs)
  // ========================================
  
  const handleSchemaSnapshot = async () => {
    setSchemaMigrationStep('snapshot');
    setLoading('schema_snapshot', true);
    
    try {
      const { DirectusClient } = await import('../lib/DirectusClient');
      const sourceClient = new DirectusClient(sourceUrl, sourceToken);
      
      const response = await sourceClient.get('/schema/snapshot');
      const snapshot = response.data || response;
      
      if (!snapshot || !Array.isArray(snapshot.collections)) {
        throw new Error('Invalid snapshot response');
      }
      
      setSchemaSnapshot(snapshot);
      setSchemaMigrationStep('diff');
      
      onStatusUpdate({
        type: 'success',
        message: `✅ Snapshot: ${snapshot.collections.length} collections, ${snapshot.fields?.length || 0} fields`
      });
    } catch (error: any) {
      logError('Schema Snapshot', error);
      onStatusUpdate({ type: 'error', message: `❌ Snapshot failed: ${error.message}` });
      setSchemaMigrationStep('idle');
    } finally {
      setLoading('schema_snapshot', false);
    }
  };

  const handleSchemaDiff = async () => {
    if (!schemaSnapshot) return;
    
    setSchemaMigrationStep('diff');
    setLoading('schema_diff', true);
    
    try {
      const { DirectusClient } = await import('../lib/DirectusClient');
      const targetClient = new DirectusClient(targetUrl, targetToken);
      
      // POST snapshot to /schema/diff?force=true to bypass version check
      const response = await targetClient.post('/schema/diff?force=true', schemaSnapshot);
      const diffResult = response.data || response;
      
      if (!diffResult || !diffResult.diff || !diffResult.hash) {
        throw new Error('Invalid diff response');
      }
      
      setSchemaDiff(diffResult);
      
      // Count changes
      const collectionsCount = diffResult.diff.collections?.length || 0;
      const fieldsCount = diffResult.diff.fields?.length || 0;
      const relationsCount = diffResult.diff.relations?.length || 0;
      const totalChanges = collectionsCount + fieldsCount + relationsCount;
      
      if (totalChanges === 0) {
        onStatusUpdate({ 
          type: 'success', 
          message: '✅ No differences found. Schemas are in sync!' 
        });
        setSchemaMigrationStep('complete');
        return;
      }
      
      // Auto-select all collections from diff
      const allCollections = new Set<string>();
      
      diffResult.diff.collections?.forEach((col: any) => {
        if (col.collection) allCollections.add(col.collection);
      });
      
      diffResult.diff.fields?.forEach((field: any) => {
        if (field.collection) allCollections.add(field.collection);
      });
      
      diffResult.diff.relations?.forEach((rel: any) => {
        if (rel.collection) allCollections.add(rel.collection);
      });
      
      
      setSelectedSchemaCollections(Array.from(allCollections));
      
      onStatusUpdate({ 
        type: 'info', 
        message: `✅ Found changes: ${collectionsCount} collections, ${fieldsCount} fields, ${relationsCount} relations` 
      });
      setSchemaMigrationStep('apply');
    } catch (error: any) {
      logError('Schema Diff', error);
      
      // Handle specific error for payload too large
      const errorMessage = error.message || '';
      const isPayloadTooLarge = errorMessage.toLowerCase().includes('too large') || 
                                errorMessage.toLowerCase().includes('entity too large') ||
                                error.response?.data?.errors?.[0]?.extensions?.reason?.toLowerCase().includes('too large');
      
      if (isPayloadTooLarge) {
        onStatusUpdate({ 
          type: 'error', 
          message: `Schema is too large for direct comparison. Please try: 1) Increase target server's request size limit, 2) Use Directus CLI for large schemas, or 3) Migrate collections in smaller batches.` 
        });
      } else {
        onStatusUpdate({ 
          type: 'error', 
          message: `Failed to compare schemas: ${error.message}` 
        });
      }
      
      setSchemaMigrationStep('idle');
    } finally {
      setLoading('schema_diff', false);
    }
  };

  const handleSchemaApply = async () => {
    if (!schemaDiff || !schemaDiff.hash) {
      onStatusUpdate({ type: 'error', message: '❌ No diff data. Please run Compare Schemas first.' });
      return;
    }
    
    setSchemaMigrationStep('apply');
    setLoading('schema_apply', true);
    
    try {
      const { DirectusClient } = await import('../lib/DirectusClient');
      const targetClient = new DirectusClient(targetUrl, targetToken);
      
      // Filter out system collections (directus_*) but keep all relations
      // Relations to system collections are allowed and necessary
      const filteredCollections = (schemaDiff.diff.collections || []).filter((col: any) => 
        col.collection && !col.collection.startsWith('directus_')
      );
      
      const filteredFields = (schemaDiff.diff.fields || []).filter((field: any) => 
        field.collection && !field.collection.startsWith('directus_')
      );
      
      // Keep ALL relations - even those pointing to system collections
      const filteredRelations = schemaDiff.diff.relations || [];
      
      const filteredDiff = {
        hash: schemaDiff.hash,
        diff: {
          collections: filteredCollections,
          fields: filteredFields,
          relations: filteredRelations
        }
      };
      
      // Check if there's anything to apply
      if (filteredCollections.length === 0 && filteredFields.length === 0 && filteredRelations.length === 0) {
        onStatusUpdate({ 
          type: 'warning', 
          message: '⚠️ No custom collections to migrate. System collections cannot be migrated.' 
        });
        setSchemaMigrationStep('complete');
        return;
      }
      
      // POST the filtered diff to /schema/apply?force=true
      await targetClient.post('/schema/apply?force=true', filteredDiff);
      
      const collectionsCount = filteredCollections.length;
      const fieldsCount = filteredFields.length;
      const relationsCount = filteredRelations.length;
      
      onStatusUpdate({ 
        type: 'success', 
        message: `✅ Schema applied! ${collectionsCount} collections, ${fieldsCount} fields, ${relationsCount} relations` 
      });
      
      setSchemaMigrationStep('complete');
      await loadTargetCollections();
    } catch (error: any) {
      logError('Schema Apply', error);
      onStatusUpdate({ 
        type: 'error', 
        message: `❌ Apply failed: ${error.message}` 
      });
      setSchemaMigrationStep('idle');
    } finally {
      setLoading('schema_apply', false);
    }
  };

  const resetSchemaMigration = () => {
    setSchemaMigrationStep('idle');
    setSchemaSnapshot(null);
    setSchemaDiff(null);
    setMigratedCollections([]);
  };

  // Helper function to categorize and analyze schema differences
  const analyzeSchemaChanges = (diffData: any, sourceSnapshot: any) => {
    const newCollections: any[] = [];
    const modifiedCollections: any[] = [];
    const deletedCollections: any[] = [];

    if (!diffData?.diff) return { newCollections, modifiedCollections, deletedCollections };

    // Parse diff structure - each item has {collection, field, diff: [{kind, rhs/lhs}]}
    // kind: 'N' = New, 'D' = Delete, 'E' = Edit
    
    const fieldsByCollection: Record<string, any[]> = {};
    
    (diffData.diff.fields || []).forEach((fieldItem: any) => {
      const collectionName = fieldItem.collection;
      if (!fieldsByCollection[collectionName]) {
        fieldsByCollection[collectionName] = [];
      }
      
      // Parse the diff array to determine action
      const diffArray = fieldItem.diff || [];
      let fieldAction = 'update';
      let fieldData = null;
      const diffDetails: string[] = [];
      
      diffArray.forEach((diffItem: any) => {
        if (diffItem.kind === 'N') {
          fieldAction = 'create'; // New field
          fieldData = diffItem.rhs; // Right-hand side = new value
          diffDetails.push(`NEW field - will be created in target`);
        } else if (diffItem.kind === 'D') {
          fieldAction = 'delete'; // Deleted field
          fieldData = diffItem.lhs; // Left-hand side = old value
          diffDetails.push(`DELETED field - exists in target but removed from source`);
        } else if (diffItem.kind === 'E') {
          fieldAction = 'update'; // Modified field
          fieldData = diffItem.rhs || fieldItem;
          
          // Extract the path to understand what changed
          const changePath = diffItem.path?.join('.') || 'unknown';
          const oldValue = diffItem.lhs;
          const newValue = diffItem.rhs;
          
          // Build detailed difference string
          if (diffItem.differences && Array.isArray(diffItem.differences)) {
            // Use our custom detailed differences from metadata detection
            diffDetails.push(...diffItem.differences);
          } else {
            // Generic difference logging
            diffDetails.push(`${changePath}: ${JSON.stringify(oldValue)} → ${JSON.stringify(newValue)}`);
          }
        }
      });
      
      fieldsByCollection[collectionName].push({
        ...fieldItem,
        fieldName: fieldItem.field,
        action: fieldAction,
        data: fieldData,
        diffDetails: diffDetails
      });
    });

    // Group relations by collection
    const relationsByCollection: Record<string, any[]> = {};
    (diffData.diff.relations || []).forEach((relationItem: any) => {
      const collectionName = relationItem.collection;
      if (!relationsByCollection[collectionName]) {
        relationsByCollection[collectionName] = [];
      }
      
      // Parse diff array for relations
      const diffArray = relationItem.diff || [];
      let relationAction = 'update';
      
      diffArray.forEach((diffItem: any) => {
        if (diffItem.kind === 'N') relationAction = 'create';
        else if (diffItem.kind === 'D') relationAction = 'delete';
        else if (diffItem.kind === 'E') relationAction = 'update';
      });
      
      relationsByCollection[collectionName].push({
        ...relationItem,
        action: relationAction
      });
    });

    // First, create a set of all collections mentioned in fields and relations
    const allCollectionsInDiff = new Set<string>();
    Object.keys(fieldsByCollection).forEach(name => allCollectionsInDiff.add(name));
    Object.keys(relationsByCollection).forEach(name => allCollectionsInDiff.add(name));
    
    // Track which collections we've already processed
    const processedCollections = new Set<string>();
    
    // Analyze each collection in the diff
    (diffData.diff.collections || []).forEach((colItem: any) => {
      const collectionName = colItem.collection;
      if (!collectionName) return; // Skip if no collection name
      
      processedCollections.add(collectionName);
      
      // Parse collection diff array to determine action
      const diffArray = colItem.diff || [];
      let collectionAction = 'update';
      let collectionData = null;
      
      diffArray.forEach((diffItem: any) => {
        if (diffItem.kind === 'N') {
          collectionAction = 'create';
          collectionData = diffItem.rhs;
        } else if (diffItem.kind === 'D') {
          collectionAction = 'delete';
          collectionData = diffItem.lhs;
        } else if (diffItem.kind === 'E') {
          collectionAction = 'update';
          collectionData = diffItem.rhs;
        }
      });

      const collectionFields = fieldsByCollection[collectionName] || [];
      const collectionRelations = relationsByCollection[collectionName] || [];

      if (collectionAction === 'create') {
        // New collection that doesn't exist in target
        newCollections.push({
          ...colItem,
          collection: collectionName,
          action: collectionAction,
          data: collectionData,
          fields: collectionFields,
          relations: collectionRelations,
          fieldChanges: collectionFields
            .filter((f: any) => f.action === 'create') // Only show new fields
            .map((f: any) => ({
              field: f.fieldName,
              action: f.action,
              type: f.data?.type,
              validation: f.data?.meta?.validation,
              meta: f.data?.meta,
              schema: f.data?.schema,
              constraints: f.data?.schema ? {
                nullable: f.data.schema.is_nullable,
                unique: f.data.schema.is_unique,
                primaryKey: f.data.schema.is_primary_key,
                defaultValue: f.data.schema.default_value,
                maxLength: f.data.schema.max_length
              } : null
            }))
        });
      } else if (collectionAction === 'delete') {
        // Collection exists in target but deleted from source
        deletedCollections.push({
          ...colItem,
          collection: collectionName,
          action: collectionAction,
          data: collectionData
        });
      } else {
        // Modified collection - has field or validation changes
        // Only include if there are actual changes to fields/relations
        const newFields = collectionFields.filter((f: any) => f.action === 'create');
        const deletedFields = collectionFields.filter((f: any) => f.action === 'delete');
        const modifiedFields = collectionFields.filter((f: any) => f.action === 'update');
        
        if (newFields.length > 0 || deletedFields.length > 0 || modifiedFields.length > 0 || collectionRelations.length > 0) {
          modifiedCollections.push({
            ...colItem,
            collection: collectionName,
            action: collectionAction,
            data: collectionData,
            fields: collectionFields,
            relations: collectionRelations,
            fieldChanges: collectionFields.map((f: any) => ({
              field: f.fieldName,
              action: f.action,
              type: f.data?.type,
              validation: f.data?.meta?.validation,
              meta: f.data?.meta,
              schema: f.data?.schema,
              constraints: f.data?.schema ? {
                nullable: f.data.schema.is_nullable,
                unique: f.data.schema.is_unique,
                primaryKey: f.data.schema.is_primary_key,
                defaultValue: f.data.schema.default_value,
                maxLength: f.data.schema.max_length
              } : null
            })),
            newFieldsCount: newFields.length,
            deletedFieldsCount: deletedFields.length,
            modifiedFieldsCount: modifiedFields.length
          });
        }
      }
    });
    
    // Handle collections that have field/relation changes but weren't in the collections array
    // These are existing collections with only field or relation modifications
    allCollectionsInDiff.forEach((collectionName: string) => {
      if (processedCollections.has(collectionName)) return; // Already processed
      // Note: No longer skipping system collections here - will be filtered in UI based on toggle
      
      const collectionFields = fieldsByCollection[collectionName] || [];
      const collectionRelations = relationsByCollection[collectionName] || [];
      
      // Only add if there are actual field or relation changes
      if (collectionFields.length > 0 || collectionRelations.length > 0) {
        const newFields = collectionFields.filter((f: any) => f.action === 'create');
        const deletedFields = collectionFields.filter((f: any) => f.action === 'delete');
        const modifiedFields = collectionFields.filter((f: any) => f.action === 'update');
        
        modifiedCollections.push({
          collection: collectionName,
          action: 'update',
          data: null,
          fields: collectionFields,
          relations: collectionRelations,
          fieldChanges: collectionFields.map((f: any) => ({
            field: f.fieldName,
            action: f.action,
            type: f.data?.type,
            validation: f.data?.meta?.validation,
            meta: f.data?.meta,
            schema: f.data?.schema,
            constraints: f.data?.schema ? {
              nullable: f.data.schema.is_nullable,
              unique: f.data.schema.is_unique,
              primaryKey: f.data.schema.is_primary_key,
              defaultValue: f.data.schema.default_value,
              maxLength: f.data.schema.max_length
            } : null
          })),
          newFieldsCount: newFields.length,
          deletedFieldsCount: deletedFields.length,
          modifiedFieldsCount: modifiedFields.length
        });
      }
    });

    return { newCollections, modifiedCollections, deletedCollections };
  };

  // Error logging function
  const logError = (operation: string, error: any) => {
    const errorLog = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleString('en-GB', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }) + ' GMT+7',
      operation,
      error: {
        message: error.message || 'Unknown error',
        status: error.response?.status || error.status || 'N/A',
        statusText: error.response?.statusText || error.statusText || 'N/A',
        data: error.response?.data || error.data || null,
        stack: error.stack || null
      }
    };
    
    setErrorLogs(prev => [errorLog, ...prev].slice(0, 50)); // Keep last 50 errors
  };

  // Preview items before importing - Load ALL items at once
  const handlePreviewItems = async (collectionName: string) => {
    setCurrentPreviewCollection(collectionName)
    setPreviewItems([])
    setPreviewTotal(0)
    setPreviewOffset(0)
    setSelectedItemIds([])
    setLoadingPreview(true)
    setShowItemSelector(true)

    try {
      // Load ALL items (limit: -1 means no limit in Directus)
      const result = await previewCollectionItems(
        sourceUrl,
        sourceToken,
        collectionName,
        { limit: -1, offset: 0 }
      )

      if (result.success) {
        setPreviewItems(result.items || [])
        setPreviewTotal(result.total || 0)
        onStatusUpdate({
          type: 'success',
          message: `Loaded ${result.items?.length || 0} items from ${collectionName}`
        })
      } else {
        onStatusUpdate({
          type: 'error',
          message: `Failed to preview items: ${result.error?.message || 'Unknown error'}`
        })
        setShowItemSelector(false)
      }
    } catch (error: any) {
      onStatusUpdate({
        type: 'error',
        message: `Preview failed: ${error.message}`
      })
      setShowItemSelector(false)
    } finally {
      setLoadingPreview(false)
    }
  }

  // Load more is no longer needed - we load all items at once

  // Import selected items
  const handleImportSelected = async (selectedFields?: string[]) => {
    if (selectedItemIds.length === 0) return

    const collectionName = currentPreviewCollection
    const loadingKey = `import_selected_${collectionName}`
    setLoading(loadingKey, true)
    setShowItemSelector(false)
    onStatusUpdate(null)
    setImportProgress(prev => ({ ...prev, [collectionName]: { current: 0, total: selectedItemIds.length } }))

    try {
      const result = await importSelectedItems(
        sourceUrl,
        sourceToken,
        targetUrl,
        targetToken,
        collectionName,
        selectedItemIds,
        {
          selectedFields: selectedFields,  // Pass selected fields
          onProgress: (current: number, total: number) => {
            setImportProgress(prev => ({ ...prev, [collectionName]: { current, total } }))
          }
        }
      )

      if (result.success) {
        const importedItems = result.importedItems || []
        const successful = importedItems.filter(item => item.status !== 'error').length
        const failed = importedItems.filter(item => item.status === 'error').length
        const created = importedItems.filter(item => item.action === 'created').length
        const updated = importedItems.filter(item => item.action === 'updated').length

        onStatusUpdate({
          type: failed > 0 ? 'warning' : 'success',
          message: `Import complete for ${collectionName}: ${created} created, ${updated} updated, ${failed} failed`
        })

        if (failed > 0) {
          const failedItems = importedItems.filter(item => item.status === 'error')
          console.log(`Failed items for ${collectionName}:`, failedItems)
        }
      } else {
        onStatusUpdate({
          type: 'error',
          message: result.message || `Failed to import selected items from ${collectionName}`
        })
      }
    } catch (error: any) {
      onStatusUpdate({
        type: 'error',
        message: `Import failed: ${error.message}`
      })
      logError(`import_selected_${collectionName}`, error);
    } finally {
      setLoading(loadingKey, false)
      setTimeout(() => {
        setImportProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[collectionName];
          return newProgress;
        });
      }, 1000);
    }
  }

  const handleImport = async (collectionName: string) => {
    const loadingKey = `import_${collectionName}`
    setLoading(loadingKey, true)
    onStatusUpdate(null)
    setImportProgress(prev => ({ ...prev, [collectionName]: { current: 0, total: 0 } }))

    try {
      const result = await importFromDirectus(
        sourceUrl,
        sourceToken,
        targetUrl,
        targetToken,
        collectionName,
        {
          limit: importLimit || undefined,
          titleFilter: titleFilter.trim() || undefined,
          onProgress: (current: number, total: number) => {
            setImportProgress(prev => ({ ...prev, [collectionName]: { current, total } }))
          }
        }
      )

      if (result.success) {
        const importedItems = result.importedItems || []
        const successful = importedItems.filter(item => item.status !== 'error').length
        const failed = importedItems.filter(item => item.status === 'error').length
        const created = importedItems.filter(item => item.action === 'created').length
        const updated = importedItems.filter(item => item.action === 'updated').length

        onStatusUpdate({
          type: failed > 0 ? 'warning' : 'success',
          message: `Import complete for ${collectionName}: ${created} created, ${updated} updated, ${failed} failed`
        })

        if (failed > 0) {
          const failedItems = importedItems.filter(item => item.status === 'error')
          console.log(`Failed items for ${collectionName}:`, failedItems)
        }
      } else {
        onStatusUpdate({
          type: 'error',
          message: result.message || `Failed to import ${collectionName}`
        })
      }
    } catch (error: any) {
      onStatusUpdate({
        type: 'error',
        message: `Import failed: ${error.message}`
      })
      logError(`import_collection_${collectionName}`, error);
    } finally {
      setLoading(loadingKey, false)
      // Clear progress after a short delay to show completion
      setTimeout(() => {
        setImportProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[collectionName];
          return newProgress;
        });
      }, 1000);
    }
  }

  if (collections.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
        No collections found or none are accessible with the provided token.
      </div>
    )
  }

  return (
    <div>
      {/* Schema Migration Section */}
      <div style={{ 
        marginBottom: '2rem', 
        padding: '1.5rem', 
        backgroundColor: '#fef3c7', 
        borderRadius: '8px',
        border: '2px solid #f59e0b'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, color: '#92400e' }}>⚡ Schema Migration</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {errorLogs.length > 0 && (
              <button
                onClick={() => setShowErrorLogs(true)}
                style={{
                  backgroundColor: '#dc2626',
                  color: 'white',
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.75rem',
                  fontWeight: '500',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
                title="View error logs"
              >
                🚨 Error Logs ({errorLogs.length})
              </button>
            )}
            <div style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: '500' }}>
              Critical: Run this before data migration
            </div>
          </div>
        </div>
        
        <div style={{ marginBottom: '1rem', fontSize: '0.875rem', color: '#78350f', lineHeight: '1.5' }}>
          Sync collection schemas, fields, and relationships from source to target environment.
          This ensures data migration will work correctly for new collections.
        </div>
        
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Step 1: Snapshot */}
          <button
            onClick={handleSchemaSnapshot}
            disabled={loading.schema_snapshot || schemaMigrationStep === 'complete'}
            style={{
              backgroundColor: schemaMigrationStep === 'idle' ? '#f59e0b' : schemaMigrationStep === 'snapshot' ? '#d97706' : '#10b981',
              color: 'white',
              padding: '0.75rem 1rem',
              fontWeight: '500',
              borderRadius: '6px',
              border: 'none',
              cursor: loading.schema_snapshot ? 'not-allowed' : 'pointer',
              opacity: loading.schema_snapshot ? 0.7 : 1,
              fontSize: '0.875rem'
            }}
          >
            {loading.schema_snapshot ? '📸 Getting Snapshot...' : 
             schemaMigrationStep === 'idle' ? '1️⃣ Get Schema Snapshot' : '✅ Snapshot Retrieved'}
          </button>

          {/* Step 2: Diff */}
          <button
            onClick={handleSchemaDiff}
            disabled={!schemaSnapshot || loading.schema_diff || schemaMigrationStep === 'complete'}
            style={{
              backgroundColor: schemaMigrationStep === 'diff' && !loading.schema_diff ? '#f59e0b' : 
                             schemaMigrationStep === 'apply' || schemaMigrationStep === 'complete' ? '#10b981' : '#9ca3af',
              color: 'white',
              padding: '0.75rem 1rem',
              fontWeight: '500',
              borderRadius: '6px',
              border: 'none',
              cursor: (!schemaSnapshot || loading.schema_diff) ? 'not-allowed' : 'pointer',
              opacity: (!schemaSnapshot || loading.schema_diff) ? 0.7 : 1,
              fontSize: '0.875rem'
            }}
          >
            {loading.schema_diff ? '🔍 Comparing...' : 
             schemaMigrationStep === 'diff' ? '2️⃣ Compare Schemas' : 
             schemaMigrationStep === 'apply' || schemaMigrationStep === 'complete' ? '✅ Differences Found' : '2️⃣ Compare Schemas'}
          </button>

          {/* Step 3: Apply */}
          <button
            onClick={handleSchemaApply}
            disabled={!schemaDiff || loading.schema_apply || schemaMigrationStep === 'complete'}
            style={{
              backgroundColor: schemaMigrationStep === 'apply' && !loading.schema_apply ? '#dc2626' : 
                             schemaMigrationStep === 'complete' ? '#10b981' : '#9ca3af',
              color: 'white',
              padding: '0.75rem 1rem',
              fontWeight: '500',
              borderRadius: '6px',
              border: 'none',
              cursor: (!schemaDiff || loading.schema_apply) ? 'not-allowed' : 'pointer',
              opacity: (!schemaDiff || loading.schema_apply) ? 0.7 : 1,
              fontSize: '0.875rem'
            }}
          >
            {loading.schema_apply ? '⚡ Applying Changes...' : 
             schemaMigrationStep === 'apply' ? '3️⃣ Apply to Target' : 
             schemaMigrationStep === 'complete' ? '✅ Migration Complete' : '3️⃣ Apply to Target'}
          </button>

          {/* Reset Button */}
          {schemaMigrationStep !== 'idle' && (
            <button
              onClick={resetSchemaMigration}
              disabled={Object.values(loading).some(Boolean)}
              style={{
                backgroundColor: '#6b7280',
                color: 'white',
                padding: '0.5rem 0.75rem',
                fontWeight: '500',
                borderRadius: '6px',
                border: 'none',
                cursor: Object.values(loading).some(Boolean) ? 'not-allowed' : 'pointer',
                fontSize: '0.75rem'
              }}
            >
              🔄 Reset
            </button>
          )}
        </div>

        {/* Detailed Schema Diff Viewer */}
        {schemaDiff && schemaMigrationStep === 'apply' && !loading.schema_apply && (() => {
          const { newCollections, modifiedCollections, deletedCollections } = analyzeSchemaChanges(schemaDiff, schemaSnapshot);
          
          // Apply search filter and system collections filter
          const filterTerm = schemaCollectionFilter.toLowerCase().trim();
          
          const filteredNewCollections = newCollections.filter((col: any) => {
            const matchesSearch = col.collection.toLowerCase().includes(filterTerm);
            const isSystemCollection = col.collection.startsWith('directus_');
            const shouldShow = showSystemCollections || !isSystemCollection;
            return matchesSearch && shouldShow;
          });
          
          const filteredModifiedCollections = modifiedCollections.filter((col: any) => 
            col.collection.toLowerCase().includes(filterTerm) &&
            (showSystemCollections || !col.collection.startsWith('directus_'))
          );
          const filteredDeletedCollections = deletedCollections.filter((col: any) => 
            col.collection.toLowerCase().includes(filterTerm) &&
            (showSystemCollections || !col.collection.startsWith('directus_'))
          );
          
          const totalCollections = newCollections.length + modifiedCollections.length + deletedCollections.length;
          const filteredTotal = filteredNewCollections.length + filteredModifiedCollections.length + filteredDeletedCollections.length;
          
          // Count system collections in diff
          const systemCollectionsCount = [
            ...newCollections.filter((c: any) => c.collection.startsWith('directus_')),
            ...modifiedCollections.filter((c: any) => c.collection.startsWith('directus_')),
            ...deletedCollections.filter((c: any) => c.collection.startsWith('directus_'))
          ].length;
          
          // Calculate how many collections will actually be applied (have real changes)
          const selectedSet = new Set(selectedSchemaCollections);
          const collectionsToApply = [
            ...newCollections,
            ...modifiedCollections,
            ...deletedCollections
          ].filter((col: any) => {
            // Must be selected
            if (!selectedSet.has(col.collection)) return false;
            // Must have valid diff with changes
            if (!col.diff || !Array.isArray(col.diff) || col.diff.length === 0) return false;
            // Check if has actual change kinds (N/E/D)
            const hasRealChange = col.diff.some((d: any) => ['N', 'E', 'D'].includes(d.kind));
            return hasRealChange;
          }).length;
          
          return (
            <div style={{
              marginTop: '1rem',
              padding: '1rem',
              backgroundColor: '#fff7ed',
              border: '2px solid #fb923c',
              borderRadius: '8px'
            }}>
              {/* System Collections Warning */}
              {showSystemCollections && systemCollectionsCount > 0 && (
                <div style={{
                  padding: '0.75rem',
                  backgroundColor: '#fee2e2',
                  borderRadius: '6px',
                  border: '1px solid #fecaca',
                  marginBottom: '1rem'
                }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#dc2626', marginBottom: '0.5rem' }}>
                    ⚠️ System Collections Warning:
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#dc2626', lineHeight: '1.4' }}>
                    {systemCollectionsCount} system collection(s) detected in schema diff. Migrating these can affect core Directus functionality. Proceed with caution.
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h4 style={{ margin: 0, color: '#9a3412', fontSize: '1rem' }}>
                  📊 Schema Differences: {totalCollections} collection(s) ({selectedSchemaCollections.length} checked, {collectionsToApply} with changes)
                  {filterTerm && ` - Showing ${filteredTotal} matching`}
                </h4>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {/* Search box */}
                  <input
                    type="text"
                    placeholder="🔍 Search collections..."
                    value={schemaCollectionFilter}
                    onChange={(e) => setSchemaCollectionFilter(e.target.value)}
                    style={{
                      padding: '0.4rem 0.75rem',
                      fontSize: '0.75rem',
                      border: '1px solid #fb923c',
                      borderRadius: '4px',
                      minWidth: '200px',
                      outline: 'none'
                    }}
                  />
                  {/* Toggle System Collections */}
                  <button
                    onClick={() => {
                      console.log('🔘 Toggle clicked! Current state:', showSystemCollections);
                      console.log('📊 Total collections before filter:', {
                        new: newCollections.length,
                        modified: modifiedCollections.length,
                        deleted: deletedCollections.length
                      });
                      console.log('🎯 System collections count:', systemCollectionsCount);
                      const newState = !showSystemCollections;
                      setShowSystemCollections(newState);
                      console.log('✅ New state:', newState);
                    }}
                    style={{
                      padding: '0.25rem 0.75rem',
                      fontSize: '0.75rem',
                      backgroundColor: showSystemCollections ? '#dc2626' : '#f3f4f6',
                      color: showSystemCollections ? 'white' : '#6b7280',
                      border: `1px solid ${showSystemCollections ? '#dc2626' : '#d1d5db'}`,
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: '500',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}
                    title={showSystemCollections ? 'Hide directus_* collections' : 'Show directus_* collections'}
                  >
                    {showSystemCollections ? '🔒 Hide System' : '🔓 Show System'}
                  </button>
                  <button
                    onClick={() => {
                      const allCollections = [
                        ...newCollections.filter((c: any) => showSystemCollections || !c.collection.startsWith('directus_')).map((c: any) => c.collection),
                        ...modifiedCollections.filter((c: any) => showSystemCollections || !c.collection.startsWith('directus_')).map((c: any) => c.collection),
                        ...deletedCollections.filter((c: any) => showSystemCollections || !c.collection.startsWith('directus_')).map((c: any) => c.collection)
                      ];
                      setSelectedSchemaCollections(allCollections);
                    }}
                    style={{
                      padding: '0.25rem 0.75rem',
                      fontSize: '0.75rem',
                      backgroundColor: '#fb923c',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: '500'
                    }}
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => setSelectedSchemaCollections([])}
                    style={{
                      padding: '0.25rem 0.75rem',
                      fontSize: '0.75rem',
                      backgroundColor: '#6b7280',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* New Collections */}
                {filteredNewCollections.length > 0 && (
                  <div style={{
                    backgroundColor: '#ecfdf5',
                    border: '2px solid #10b981',
                    borderRadius: '8px',
                    padding: '1rem'
                  }}>
                    <h5 style={{ margin: '0 0 0.75rem 0', color: '#065f46', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      ✨ New Collections ({filteredNewCollections.length}{filterTerm ? ` of ${newCollections.length}` : ''})
                      <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: '#059669' }}>
                        - Will be created in target
                      </span>
                    </h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {filteredNewCollections.map((col: any) => (
                        <div key={col.collection} style={{
                          backgroundColor: 'white',
                          border: selectedSchemaCollections.includes(col.collection) ? '2px solid #10b981' : '1px solid #d1fae5',
                          borderRadius: '6px',
                          padding: '0.75rem'
                        }}>
                          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={selectedSchemaCollections.includes(col.collection)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedSchemaCollections(prev => [...prev, col.collection]);
                                } else {
                                  setSelectedSchemaCollections(prev => prev.filter(c => c !== col.collection));
                                }
                              }}
                              style={{ marginTop: '0.25rem', cursor: 'pointer' }}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: '600', color: '#065f46', marginBottom: '0.25rem' }}>
                                {col.collection}
                              </div>
                              {col.fields && col.fields.length > 0 && (
                                <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '0.5rem' }}>
                                  📝 {col.fields.length} field(s): {col.fields.map((f: any) => f.field).join(', ')}
                                </div>
                              )}
                              {col.relations && col.relations.length > 0 && (
                                <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '0.25rem' }}>
                                  🔗 {col.relations.length} relation(s)
                                </div>
                              )}
                            </div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Modified Collections */}
                {filteredModifiedCollections.length > 0 && (
                  <div style={{
                    backgroundColor: '#fef3c7',
                    border: '2px solid #f59e0b',
                    borderRadius: '8px',
                    padding: '1rem'
                  }}>
                    <h5 style={{ margin: '0 0 0.75rem 0', color: '#92400e', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      🔄 Modified Collections ({filteredModifiedCollections.length}{filterTerm ? ` of ${modifiedCollections.length}` : ''})
                      <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: '#d97706' }}>
                        - Have field or validation changes
                      </span>
                    </h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {filteredModifiedCollections.map((col: any) => {
                        const isCollapsed = collapsedFieldDetails[col.collection] ?? true;
                        const hasDetails = col.fieldChanges && col.fieldChanges.length > 0;
                        
                        return (
                          <div key={col.collection} style={{
                            backgroundColor: 'white',
                            border: selectedSchemaCollections.includes(col.collection) ? '2px solid #f59e0b' : '1px solid #fde68a',
                            borderRadius: '6px',
                            padding: '0.75rem'
                          }}>
                            {/* Header with checkbox and collection name */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                              <input
                                type="checkbox"
                                checked={selectedSchemaCollections.includes(col.collection)}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  if (e.target.checked) {
                                    setSelectedSchemaCollections(prev => [...prev, col.collection]);
                                  } else {
                                    setSelectedSchemaCollections(prev => prev.filter(c => c !== col.collection));
                                  }
                                }}
                                style={{ marginTop: '0.25rem', cursor: 'pointer' }}
                              />
                              <div style={{ flex: 1 }}>
                                <div style={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'space-between',
                                  marginBottom: '0.5rem'
                                }}>
                                  <div style={{ fontWeight: '600', color: '#92400e' }}>
                                    {col.collection}
                                  </div>
                                  {hasDetails && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setCollapsedFieldDetails(prev => ({
                                          ...prev,
                                          [col.collection]: !isCollapsed
                                        }));
                                      }}
                                      style={{
                                        background: 'none',
                                        border: '1px solid #d97706',
                                        borderRadius: '4px',
                                        padding: '0.25rem 0.5rem',
                                        cursor: 'pointer',
                                        fontSize: '0.7rem',
                                        color: '#92400e',
                                        fontWeight: '600',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.25rem'
                                      }}
                                    >
                                      {isCollapsed ? '▶' : '▼'} {isCollapsed ? 'Show' : 'Hide'} Details
                                    </button>
                                  )}
                                </div>
                                
                                {/* Summary Badge */}
                                <div style={{ 
                                  display: 'flex', 
                                  gap: '0.5rem', 
                                  marginBottom: hasDetails && !isCollapsed ? '0.5rem' : '0',
                                  flexWrap: 'wrap'
                                }}>
                                  {col.newFieldsCount > 0 && (
                                    <span style={{
                                      fontSize: '0.7rem',
                                      padding: '0.25rem 0.5rem',
                                      backgroundColor: '#dcfce7',
                                      color: '#166534',
                                      borderRadius: '4px',
                                      fontWeight: '600'
                                    }}>
                                      ➕ {col.newFieldsCount} new field{col.newFieldsCount > 1 ? 's' : ''}
                                    </span>
                                  )}
                                  {col.deletedFieldsCount > 0 && (
                                    <span style={{
                                      fontSize: '0.7rem',
                                      padding: '0.25rem 0.5rem',
                                      backgroundColor: '#fee2e2',
                                      color: '#991b1b',
                                      borderRadius: '4px',
                                      fontWeight: '600'
                                    }}>
                                      ➖ {col.deletedFieldsCount} deleted field{col.deletedFieldsCount > 1 ? 's' : ''}
                                    </span>
                                  )}
                                  {col.modifiedFieldsCount > 0 && (
                                    <span style={{
                                      fontSize: '0.7rem',
                                      padding: '0.25rem 0.5rem',
                                      backgroundColor: '#e0e7ff',
                                      color: '#3730a3',
                                      borderRadius: '4px',
                                      fontWeight: '600'
                                    }}>
                                      ✏️ {col.modifiedFieldsCount} modified field{col.modifiedFieldsCount > 1 ? 's' : ''}
                                    </span>
                                  )}
                                  {col.relations && col.relations.length > 0 && (
                                    <span style={{
                                      fontSize: '0.7rem',
                                      padding: '0.25rem 0.5rem',
                                      backgroundColor: '#fef3c7',
                                      color: '#92400e',
                                      borderRadius: '4px',
                                      fontWeight: '600'
                                    }}>
                                      🔗 {col.relations.length} relation{col.relations.length > 1 ? 's' : ''}
                                    </span>
                                  )}
                                </div>
                                
                                {/* Collapsible Field Details */}
                                {!isCollapsed && hasDetails && (
                                  <div style={{ 
                                    backgroundColor: '#fffbeb', 
                                    padding: '0.5rem', 
                                    borderRadius: '4px',
                                    marginTop: '0.5rem',
                                    marginBottom: '0.5rem',
                                    border: '1px solid #fde68a'
                                  }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#92400e', marginBottom: '0.5rem' }}>
                                      📝 Field Details:
                                    </div>
                                    {col.fieldChanges.map((field: any, idx: number) => (
                                      <div key={idx} style={{ 
                                        fontSize: '0.75rem', 
                                        color: '#78350f',
                                        marginLeft: '1rem',
                                        marginBottom: '0.5rem',
                                        lineHeight: '1.4',
                                        padding: '0.5rem',
                                        backgroundColor: field.action === 'create' ? '#f0fdf4' : 
                                                         field.action === 'delete' ? '#fef2f2' : '#f5f3ff',
                                        borderLeft: `3px solid ${field.action === 'create' ? '#10b981' : 
                                                                   field.action === 'delete' ? '#dc2626' : '#6366f1'}`,
                                        borderRadius: '4px'
                                      }}>
                                        <div style={{ marginBottom: '0.25rem' }}>
                                          <strong style={{ fontSize: '0.85rem' }}>{field.field}</strong> 
                                          <span style={{ 
                                            marginLeft: '0.5rem',
                                            padding: '0.125rem 0.375rem',
                                            backgroundColor: field.action === 'create' ? '#dcfce7' : 
                                                            field.action === 'delete' ? '#fee2e2' : '#e0e7ff',
                                            color: field.action === 'create' ? '#166534' : 
                                                   field.action === 'delete' ? '#991b1b' : '#3730a3',
                                            borderRadius: '3px',
                                            fontSize: '0.7rem',
                                            fontWeight: '600'
                                          }}>
                                            {field.action === 'create' ? '✨ NEW' : 
                                             field.action === 'delete' ? '🗑️ DELETED' : '✏️ MODIFIED'}
                                          </span>
                                          {field.type && <span style={{ marginLeft: '0.5rem', color: '#a16207', fontWeight: '600' }}>({field.type})</span>}
                                        </div>
                                        
                                        {/* Description based on action */}
                                        <div style={{ fontSize: '0.7rem', color: '#6b7280', marginBottom: '0.25rem', fontStyle: 'italic' }}>
                                          {field.action === 'create' && '📍 Field exists in source but not in target'}
                                          {field.action === 'delete' && '📍 Field exists in target but removed from source'}
                                          {field.action === 'update' && '📍 Field has different configuration between source and target'}
                                        </div>
                                        
                                        {/* Validation info */}
                                        {field.validation && (
                                          <div style={{ marginLeft: '1rem', marginTop: '0.25rem', color: '#b45309' }}>
                                            ✓ Validation: {JSON.stringify(field.validation)}
                                          </div>
                                        )}
                                        
                                        {/* Constraints info */}
                                        {field.constraints && (
                                          <div style={{ marginLeft: '1rem', marginTop: '0.25rem', color: '#92400e', fontSize: '0.7rem' }}>
                                            {field.constraints.nullable !== undefined && `Nullable: ${field.constraints.nullable}, `}
                                            {field.constraints.unique && `Unique: ${field.constraints.unique}, `}
                                            {field.constraints.primaryKey && `Primary Key: ${field.constraints.primaryKey}, `}
                                            {field.constraints.maxLength && `Max Length: ${field.constraints.maxLength}`}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                
                                {/* Collection-level validation */}
                                {!isCollapsed && (col.schema?.validation || col.meta?.validation) && (
                                  <div style={{ 
                                    backgroundColor: '#fef3c7', 
                                    padding: '0.5rem', 
                                    borderRadius: '4px',
                                    border: '1px solid #fcd34d',
                                    fontSize: '0.75rem',
                                    color: '#92400e',
                                    marginTop: '0.5rem'
                                  }}>
                                    <strong>Collection Validation:</strong>
                                    <pre style={{ margin: '0.25rem 0 0 0', fontSize: '0.7rem', whiteSpace: 'pre-wrap' }}>
                                      {JSON.stringify(col.schema?.validation || col.meta?.validation, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Deleted Collections */}
                {filteredDeletedCollections.length > 0 && (
                  <div style={{
                    backgroundColor: '#fee2e2',
                    border: '2px solid #dc2626',
                    borderRadius: '8px',
                    padding: '1rem'
                  }}>
                    <h5 style={{ margin: '0 0 0.75rem 0', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      🗑️ Deleted Collections ({filteredDeletedCollections.length}{filterTerm ? ` of ${deletedCollections.length}` : ''})
                      <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: '#dc2626' }}>
                        - Exist in target but removed from source
                      </span>
                    </h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {filteredDeletedCollections.map((col: any) => (
                        <div key={col.collection} style={{
                          backgroundColor: 'white',
                          border: selectedSchemaCollections.includes(col.collection) ? '2px solid #dc2626' : '1px solid #fecaca',
                          borderRadius: '6px',
                          padding: '0.75rem'
                        }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={selectedSchemaCollections.includes(col.collection)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedSchemaCollections(prev => [...prev, col.collection]);
                                } else {
                                  setSelectedSchemaCollections(prev => prev.filter(c => c !== col.collection));
                                }
                              }}
                              style={{ cursor: 'pointer' }}
                            />
                            <div style={{ flex: 1 }}>
                              <span style={{ fontWeight: '600', color: '#991b1b' }}>{col.collection}</span>
                              <span style={{ fontSize: '0.75rem', color: '#dc2626', marginLeft: '0.5rem' }}>
                                ⚠️ Will be deleted from target
                              </span>
                            </div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {totalCollections === 0 && (
                  <div style={{
                    textAlign: 'center',
                    padding: '2rem',
                    backgroundColor: '#f0fdf4',
                    border: '2px solid #10b981',
                    borderRadius: '8px',
                    color: '#065f46'
                  }}>
                    ✅ No schema differences found. Schemas are in sync!
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Progress Indicator */}
        {(schemaMigrationStep !== 'idle' || Object.values(loading).some(Boolean)) && (
          <div style={{ 
            marginTop: '1rem', 
            padding: '0.75rem', 
            backgroundColor: '#fbbf24', 
            borderRadius: '6px',
            fontSize: '0.875rem',
            color: '#92400e'
          }}>
            <strong>Status:</strong> {
              loading.schema_snapshot ? '📸 Getting schema snapshot from source...' :
              loading.schema_diff ? '🔍 Comparing schemas...' :
              loading.schema_apply ? '⚡ Applying changes to target...' :
              schemaMigrationStep === 'snapshot' ? '📸 Retrieved schema snapshot from source' :
              schemaMigrationStep === 'diff' ? '🔍 Ready to compare schemas' :
              schemaMigrationStep === 'apply' ? '⚡ Ready to apply changes to target' :
              schemaMigrationStep === 'complete' ? '✅ Schema migration completed successfully!' : ''
            }
          </div>
        )}

        {/* Migrated Collections List */}
        {migratedCollections.length > 0 && (
          <div style={{
            marginTop: '1rem',
            padding: '1rem',
            backgroundColor: '#d1fae5',
            border: '2px solid #10b981',
            borderRadius: '8px'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '0.75rem'
            }}>
              <h4 style={{ 
                margin: 0, 
                color: '#065f46', 
                fontSize: '0.95rem',
                fontWeight: '600'
              }}>
                ✅ Successfully Migrated Collections ({migratedCollections.length})
              </h4>
              <button
                onClick={() => setMigratedCollections([])}
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.75rem',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
                title="Clear list"
              >
                🗑️ Clear
              </button>
            </div>
            <div style={{
              maxHeight: '200px',
              overflowY: 'auto',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '0.5rem'
            }}>
              {migratedCollections.map((collection, index) => (
                <div
                  key={`${collection}-${index}`}
                  style={{
                    padding: '0.5rem 0.75rem',
                    backgroundColor: 'white',
                    border: '1px solid #10b981',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    color: '#065f46',
                    fontFamily: 'monospace',
                    wordBreak: 'break-word'
                  }}
                >
                  {collection}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Advanced Migration Options */}
      <div style={{ 
        marginBottom: '2rem', 
        padding: '1rem', 
        backgroundColor: '#f0f9ff', 
        borderRadius: '8px',
        border: '1px solid #0ea5e9'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>🚀 Advanced Migration</h3>
          <button
            onClick={() => setShowDocumentation(true)}
            style={{
              backgroundColor: 'transparent',
              color: '#6366f1',
              padding: '0.25rem 0.5rem',
              fontSize: '0.75rem',
              fontWeight: '500',
              border: '1px solid #6366f1',
              borderRadius: '4px',
              cursor: 'pointer',
              textDecoration: 'none'
            }}
            title="View API documentation and examples"
          >
            📚 Documentation
          </button>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowFlowsManager(true)}
            style={{
              flex: 1,
              backgroundColor: '#8b5cf6',
              color: 'white',
              padding: '0.75rem 1.5rem',
              border: 'none',
              borderRadius: '6px',
              cursor: Object.values(loading).some(Boolean) ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              opacity: Object.values(loading).some(Boolean) ? 0.6 : 1,
              transition: 'all 0.2s ease'
            }}
            disabled={Object.values(loading).some(Boolean)}
          >
            🔄 Migrate Flows & Operations
          </button>

          <button
            onClick={() => setShowAccessControlManager(true)}
            style={{
              flex: 1,
              backgroundColor: '#f59e0b',
              color: 'white',
              padding: '0.75rem 1.5rem',
              border: 'none',
              borderRadius: '6px',
              cursor: Object.values(loading).some(Boolean) ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              opacity: Object.values(loading).some(Boolean) ? 0.6 : 1,
              transition: 'all 0.2s ease'
            }}
            disabled={Object.values(loading).some(Boolean)}
          >
            🔐 Access Control Migration
          </button>

          <button
            onClick={() => setShowFilesManager(true)}
            style={{
              flex: 1,
              backgroundColor: '#0891b2',
              color: 'white',
              padding: '0.75rem 1.5rem',
              border: 'none',
              borderRadius: '6px',
              cursor: Object.values(loading).some(Boolean) ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              opacity: Object.values(loading).some(Boolean) ? 0.6 : 1,
              transition: 'all 0.2s ease'
            }}
            disabled={Object.values(loading).some(Boolean)}
          >
            📁 Migrate Files
          </button>
        </div>
      </div>

      {/* Import Options */}
      <div style={{ 
        marginBottom: '2rem', 
        padding: '1rem', 
        backgroundColor: '#f9fafb', 
        borderRadius: '8px' 
      }}>
        <div 
          style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            cursor: 'pointer',
            marginBottom: showImportOptions ? '1rem' : '0'
          }}
          onClick={() => setShowImportOptions(!showImportOptions)}
        >
          <h3 style={{ margin: 0 }}>
  Collection Import Options (<span style={{ color: "red" }}>⚠️Upcomming</span>)
</h3>

          <span style={{ fontSize: '1.25rem', userSelect: 'none' }}>
            {showImportOptions ? '▼' : '▶'}
          </span>
        </div>
        
        {showImportOptions && (
          <div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="importLimit">Import Limit:</label>
                <input
                  id="importLimit"
                  type="number"
                  min="1"
                  value={importLimit || ''}
                  onChange={(e) => setImportLimit(e.target.value ? Number(e.target.value) : null)}
                  placeholder="Max items to import (optional)"
                />
              </div>

              {/* Title Filter - Disabled due to schema compatibility issues
              <div className="form-group">
                <label htmlFor="titleFilter">Title Filter:</label>
                <input
                  id="titleFilter"
                  type="text"
                  value={titleFilter}
                  onChange={(e) => setTitleFilter(e.target.value)}
                  placeholder="Filter by title (optional)"
                />
              </div>
              */}

              <div className="form-group">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setImportLimit(null)
                    setTitleFilter('')
                  }}
                  style={{ backgroundColor: '#6b7280' }}
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Title filter message - Disabled
        {titleFilter && (
          <div style={{ 
            marginTop: '0.5rem', 
            fontSize: '0.875rem', 
            color: '#3b82f6' 
          }}>
            Will import only items with titles containing "{titleFilter}"
          </div>
        )}
        */}
      </div>

      {/* File Migration Warning */}
      {selectedCollections.some(col => col === 'directus_files' || col === 'directus_folders') || 
       collections.some(c => selectedCollections.includes(c.collection) && 
         (c.meta?.note?.includes('file') || JSON.stringify(c.schema).includes('directus_files'))) ? (
        <div style={{
          padding: '1rem',
          backgroundColor: '#dbeafe',
          borderRadius: '6px',
          border: '1px solid #3b82f6',
          marginBottom: '1rem'
        }}>
          <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1e40af', marginBottom: '0.5rem' }}>
            📎 Files & Foreign Keys Notice:
          </div>
          <div style={{ fontSize: '0.8rem', color: '#1e40af', lineHeight: '1.4' }}>
            <strong>Important:</strong> If your collections contain file fields, follow this order:
            <ol style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
              <li><strong>First:</strong> Migrate <code>directus_folders</code> (if using folder structure)</li>
              <li><strong>Second:</strong> Use "Files Manager" tab to migrate files → this creates records in <code>directus_files</code></li>
              <li><strong>Then:</strong> Migrate your collections with file references</li>
            </ol>
            This prevents foreign key errors when migrating data with file references.
          </div>
        </div>
      ) : null}

      {/* Main Action Buttons */}
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
        <button
          onClick={async () => {
            setLoading('refresh_collections', true);
            try {
              // Refresh target collections for comparison
              await loadTargetCollections();
              onStatusUpdate({ type: 'info', message: 'Target collections refreshed successfully' });
            } catch (error: any) {
              onStatusUpdate({ type: 'error', message: `Failed to refresh: ${error.message}` });
            } finally {
              setLoading('refresh_collections', false);
            }
          }}
          style={{
            backgroundColor: '#6b7280',
            color: 'white',
            padding: '0.75rem 1.5rem',
            fontWeight: '500',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            minWidth: '140px'
          }}
          disabled={Object.values(loading).some(Boolean)}
        >
          {loading.refresh_collections ? 'Loading...' : 'Refresh Data'}
        </button>

        <button
          onClick={async () => {
            if (selectedCollections.length === 0) {
              onStatusUpdate({ type: 'error', message: 'Please select at least one collection to validate' });
              return;
            }
            
            setIsValidating(true);
            const results: Record<string, { isValid: boolean; errors: string[]; warnings: string[] }> = {};
            
            try {
              for (const collectionName of selectedCollections) {
                const collection = collections.find(c => c.collection === collectionName);
                if (!collection) continue;
                
                const errors: string[] = [];
                const warnings: string[] = [];
                
                // Validation logic
                if (collection.collection.startsWith('directus_')) {
                  warnings.push('System collection - migration may affect core functionality');
                }
                
                if (collection.meta?.singleton) {
                  warnings.push('Singleton collection - only one record expected');
                }
                
                // Add more validation checks here
                // Check if collection exists in target, field compatibility, etc.
                
                results[collectionName] = {
                  isValid: errors.length === 0,
                  errors,
                  warnings
                };
              }
              
              setValidationResults(results);
              
              const totalErrors = Object.values(results).reduce((sum, r) => sum + r.errors.length, 0);
              const totalWarnings = Object.values(results).reduce((sum, r) => sum + r.warnings.length, 0);
              
              if (totalErrors > 0) {
                onStatusUpdate({ type: 'error', message: `Validation failed: ${totalErrors} errors found` });
              } else if (totalWarnings > 0) {
                onStatusUpdate({ type: 'warning', message: `Validation passed with ${totalWarnings} warnings` });
              } else {
                onStatusUpdate({ type: 'success', message: 'All collections validated successfully' });
              }
            } catch (error: any) {
              onStatusUpdate({ type: 'error', message: `Validation failed: ${error.message}` });
            } finally {
              setIsValidating(false);
            }
          }}
          style={{
            backgroundColor: '#f59e0b',
            color: 'white',
            padding: '0.75rem 1.5rem',
            fontWeight: '500',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            minWidth: '160px'
          }}
          disabled={Object.values(loading).some(Boolean) || selectedCollections.length === 0}
        >
          {isValidating ? 'Validating...' : 'Validate Migration'}
        </button>
      </div>

      {/* Custom Collections List */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 style={{ margin: 0 }}>
            📦 Custom Collections ({collections.filter(c => !c.collection.startsWith('directus_')).length})
          </h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Pagination Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Show:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                style={{
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  backgroundColor: 'white',
                  cursor: 'pointer'
                }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={-1}>All</option>
              </select>
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>per page</span>
            </div>
            
            <div style={{ width: '1px', height: '20px', backgroundColor: '#d1d5db' }}></div>
            
            <button
              onClick={() => {
                setStatusFilter('existing');
                setCurrentPage(1);
                const customCollections = collections.filter(c => showSystemCollections || !c.collection.startsWith('directus_'));
                const existingCollections = customCollections.filter(c => getCollectionStatus(c) === 'existing');
                setSelectedCollections(prev => [...prev.filter(id => !showSystemCollections && id.startsWith('directus_')), ...existingCollections.map(c => c.collection)]);
              }}
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.75rem',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: statusFilter === 'existing' ? '#f97316' : '#e5e7eb',
                color: statusFilter === 'existing' ? 'white' : '#374151'
              }}
            >
              Existing ({collections.filter(c => !c.collection.startsWith('directus_') && getCollectionStatus(c) === 'existing').length})
            </button>
            <button
              onClick={() => {
                setStatusFilter('new');
                setCurrentPage(1);
                setShowNewCollectionWarning(true);
                const customCollections = collections.filter(c => showSystemCollections || !c.collection.startsWith('directus_'));
                const newCollections = customCollections.filter(c => getCollectionStatus(c) === 'new');
                setSelectedCollections(prev => [...prev.filter(id => !showSystemCollections && id.startsWith('directus_')), ...newCollections.map(c => c.collection)]);
              }}
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.75rem',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: statusFilter === 'new' ? '#3B82F6' : '#e5e7eb',
                color: statusFilter === 'new' ? 'white' : '#374151'
              }}
            >
              New ({collections.filter(c => !c.collection.startsWith('directus_') && getCollectionStatus(c) === 'new').length})
            </button>
            <button
              onClick={() => setSelectedCollections(prev => prev.filter(id => id.startsWith('directus_')))}
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.75rem',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: '#6b7280',
                color: 'white'
              }}
            >
              Clear
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '1rem' }}>
          {(() => {
            const filteredCollections = collections.filter(c => {
              // Filter system collections based on toggle
              if (!showSystemCollections && c.collection.startsWith('directus_')) return false;
              if (statusFilter === 'existing') return getCollectionStatus(c) === 'existing';
              if (statusFilter === 'new') return getCollectionStatus(c) === 'new';
              return false;
            });
            
            const totalItems = filteredCollections.length;
            const totalPages = itemsPerPage === -1 ? 1 : Math.ceil(totalItems / itemsPerPage);
            const startIndex = itemsPerPage === -1 ? 0 : (currentPage - 1) * itemsPerPage;
            const endIndex = itemsPerPage === -1 ? totalItems : startIndex + itemsPerPage;
            const paginatedCollections = filteredCollections.slice(startIndex, endIndex);
            
            return paginatedCollections.map((collection) => {
            const isSelected = selectedCollections.includes(collection.collection);
            const validationResult = validationResults[collection.collection];
            const hasValidationErrors = validationResult && !validationResult.isValid;
            const hasValidationWarnings = validationResult && validationResult.warnings.length > 0;
            const collectionStatus = getCollectionStatus(collection);
            
            return (
              <div key={collection.collection} className="collection-item" style={{
                padding: '1rem',
                border: `1px solid ${hasValidationErrors ? '#fecaca' : isSelected ? '#93c5fd' : '#e5e7eb'}`,
                borderRadius: '8px',
                backgroundColor: hasValidationErrors ? '#fef2f2' : isSelected ? '#f0f9ff' : 'white'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  marginBottom: '0.5rem'
                }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedCollections(prev => [...prev, collection.collection]);
                      } else {
                        setSelectedCollections(prev => prev.filter(c => c !== collection.collection));
                      }
                    }}
                    style={{ transform: 'scale(1.2)' }}
                  />
                  
                  <div style={{ flex: 1 }}>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      marginBottom: '0.25rem'
                    }}>
                      <div>
                        <h4 style={{ 
                          margin: 0, 
                          fontSize: '1rem', 
                          fontWeight: '600',
                          color: '#1f2937'
                        }}>
                          {collection.collection}
                        </h4>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {/* Target Status Badge */}
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: '500',
                          backgroundColor: collectionStatus === 'existing' ? '#fef3c7' : collectionStatus === 'new' ? '#dbeafe' : '#f3f4f6',
                          color: collectionStatus === 'existing' ? '#92400e' : collectionStatus === 'new' ? '#1e40af' : '#6b7280',
                          lineHeight: '1'
                        }}>
                          {collectionStatus === 'existing' ? 'Existing' : collectionStatus === 'new' ? 'New' : 'Unknown'}
                        </span>
                        
                        {validationResult && (
                          <span style={{
                            padding: '0.25rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: '500',
                            backgroundColor: hasValidationErrors ? '#fee2e2' : hasValidationWarnings ? '#fef3c7' : '#dcfce7',
                            color: hasValidationErrors ? '#dc2626' : hasValidationWarnings ? '#d97706' : '#16a34a',
                            border: `1px solid ${hasValidationErrors ? '#fecaca' : hasValidationWarnings ? '#fde68a' : '#bbf7d0'}`,
                            lineHeight: '1'
                          }}>
                            {hasValidationErrors ? '❌ Error' : hasValidationWarnings ? '⚠️ Warning' : '✅ Valid'}
                          </span>
                        )}
                        
                        {collection.meta?.singleton && (
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: '500',
                            backgroundColor: '#dc2626',
                            color: 'white'
                          }}>
                            Singleton
                          </span>
                        )}
                      </div>
                    </div>
                    
                    
                    {/* Collection Meta Info */}
                    {collection.meta && (
                      <div style={{ 
                        fontSize: '0.75rem', 
                        color: '#6b7280',
                        marginBottom: '0.5rem'
                      }}>
                        {collection.meta.note && (
                          <div>📝 {collection.meta.note}</div>
                        )}
                      </div>
                    )}
                    
                    
                    {validationResult && (
                      <div style={{ marginTop: '0.5rem' }}>
                        {validationResult.errors.length > 0 && (
                          <div style={{
                            padding: '0.5rem',
                            backgroundColor: '#fef2f2',
                            borderRadius: '4px',
                            border: '1px solid #fecaca',
                            marginBottom: '0.5rem'
                          }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#dc2626', marginBottom: '0.25rem' }}>
                              🚨 Validation Errors:
                            </div>
                            {validationResult.errors.map((error, index) => (
                              <div key={index} style={{ fontSize: '0.7rem', color: '#dc2626' }}>
                                • {error}
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {validationResult.warnings.length > 0 && (
                          <div style={{
                            padding: '0.5rem',
                            backgroundColor: '#fffbeb',
                            borderRadius: '4px',
                            border: '1px solid #fde68a',
                            marginBottom: '0.5rem'
                          }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#d97706', marginBottom: '0.25rem' }}>
                              ⚠️ Warnings:
                            </div>
                            {validationResult.warnings.map((warning, index) => (
                              <div key={index} style={{ fontSize: '0.7rem', color: '#d97706' }}>
                                • {warning}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="button-group">
                    {loading[`import_${collection.collection}`] && importProgress[collection.collection] ? (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.5rem 1rem',
                        backgroundColor: '#fef3c7',
                        borderRadius: '6px',
                        border: '2px solid #f59e0b',
                        minWidth: '200px'
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ 
                            fontSize: '0.75rem', 
                            color: '#92400e', 
                            marginBottom: '0.25rem',
                            fontWeight: '500'
                          }}>
                            Importing... {importProgress[collection.collection].current}/{importProgress[collection.collection].total}
                          </div>
                          <div style={{
                            width: '100%',
                            height: '6px',
                            backgroundColor: '#fde68a',
                            borderRadius: '3px',
                            overflow: 'hidden'
                          }}>
                            <div style={{
                              width: `${(importProgress[collection.collection].current / importProgress[collection.collection].total) * 100}%`,
                              height: '100%',
                              backgroundColor: '#f59e0b',
                              transition: 'width 0.3s ease'
                            }}></div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => handlePreviewItems(collection.collection)}
                          disabled={loading[`import_${collection.collection}`] || hasValidationErrors || collectionStatus === 'new'}
                          style={{
                            backgroundColor: hasValidationErrors || collectionStatus === 'new' ? '#9ca3af' : '#3b82f6',
                            color: 'white',
                            padding: '0.5rem 1rem',
                            borderRadius: '6px',
                            border: 'none',
                            cursor: hasValidationErrors || collectionStatus === 'new' ? 'not-allowed' : 'pointer',
                            fontWeight: '500',
                            fontSize: '0.875rem'
                          }}
                          title="Preview and select specific items to import"
                        >
                          📋 Select Items
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          });
          })()}
        </div>
        
        {/* Pagination Navigation */}
        {(() => {
          const filteredCollections = collections.filter(c => {
            // Filter system collections based on toggle
            if (!showSystemCollections && c.collection.startsWith('directus_')) return false;
            if (statusFilter === 'existing') return getCollectionStatus(c) === 'existing';
            if (statusFilter === 'new') return getCollectionStatus(c) === 'new';
            return false;
          });
          
          const totalItems = filteredCollections.length;
          const totalPages = itemsPerPage === -1 ? 1 : Math.ceil(totalItems / itemsPerPage);
          
          if (itemsPerPage === -1 || totalPages <= 1) return null;
          
          return (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center', 
              gap: '0.5rem',
              marginTop: '1rem',
              padding: '1rem',
              borderTop: '1px solid #e5e7eb'
            }}>
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                style={{
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.875rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  backgroundColor: currentPage === 1 ? '#f3f4f6' : 'white',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  color: currentPage === 1 ? '#9ca3af' : '#374151'
                }}
              >
                ««
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                style={{
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.875rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  backgroundColor: currentPage === 1 ? '#f3f4f6' : 'white',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  color: currentPage === 1 ? '#9ca3af' : '#374151'
                }}
              >
                «
              </button>
              
              <span style={{ fontSize: '0.875rem', color: '#6b7280', padding: '0 0.5rem' }}>
                Page {currentPage} of {totalPages} ({totalItems} items)
              </span>
              
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                style={{
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.875rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  backgroundColor: currentPage === totalPages ? '#f3f4f6' : 'white',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  color: currentPage === totalPages ? '#9ca3af' : '#374151'
                }}
              >
                »
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                style={{
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.875rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  backgroundColor: currentPage === totalPages ? '#f3f4f6' : 'white',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  color: currentPage === totalPages ? '#9ca3af' : '#374151'
                }}
              >
                »»
              </button>
            </div>
          );
        })()}
      </div>

      {/* System Collections Section - Dangerous */}
      <div style={{
        border: '2px solid #dc2626',
        borderRadius: '8px',
        backgroundColor: '#fef2f2',
        padding: '1rem'
      }}>
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <h3 style={{ margin: 0, color: '#dc2626' }}>
              ⚠️ System Collections ({collections.filter(c => c.collection.startsWith('directus_')).length})
            </h3>
            <span style={{
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '0.7rem',
              fontWeight: '600',
              backgroundColor: '#dc2626',
              color: 'white'
            }}>
              DANGEROUS
            </span>
          </div>
          
          <div style={{
            padding: '0.75rem',
            backgroundColor: '#fee2e2',
            borderRadius: '6px',
            border: '1px solid #fecaca',
            marginBottom: '1rem'
          }}>
            <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#dc2626', marginBottom: '0.5rem' }}>
              🚨 Critical Warning:
            </div>
            <div style={{ fontSize: '0.8rem', color: '#dc2626', lineHeight: '1.4' }}>
              System collections contain core Directus functionality. Migrating these can break your target instance.
              Only proceed if you understand the risks and have a full backup.
            </div>
          </div>
          
          {!showSystemCollections ? (
            <button
              onClick={() => setShowSystemCollections(true)}
              style={{
                backgroundColor: '#dc2626',
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                fontWeight: '500',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              🔓 Show System Collections
            </button>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                  <input
                    type="checkbox"
                    checked={systemCollectionsAcknowledged}
                    onChange={(e) => setSystemCollectionsAcknowledged(e.target.checked)}
                    style={{ transform: 'scale(1.2)' }}
                  />
                  <span style={{ color: '#dc2626', fontWeight: '500' }}>
                    I understand the risks and have backed up my target instance
                  </span>
                </label>
              </div>
              
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <button
                  onClick={() => {
                    const systemCollections = collections.filter(c => c.collection.startsWith('directus_'));
                    const systemSelected = selectedCollections.filter(id => id.startsWith('directus_'));
                    if (systemSelected.length === systemCollections.length) {
                      setSelectedCollections(prev => prev.filter(id => !id.startsWith('directus_')));
                    } else {
                      setSelectedCollections(prev => [...prev.filter(id => !id.startsWith('directus_')), ...systemCollections.map(c => c.collection)]);
                    }
                  }}
                  disabled={!systemCollectionsAcknowledged}
                  style={{
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    border: '1px solid #bfdbfe',
                    borderRadius: '4px',
                    cursor: systemCollectionsAcknowledged ? 'pointer' : 'not-allowed',
                    fontWeight: '500',
                    backgroundColor: systemCollectionsAcknowledged ? '#dbeafe' : '#f3f4f6',
                    color: systemCollectionsAcknowledged ? '#1d4ed8' : '#9ca3af'
                  }}
                >
                  Select All
                </button>
                <button
                  onClick={() => {
                    const systemCollections = collections.filter(c => c.collection.startsWith('directus_'));
                    const existingCollections = systemCollections.filter(c => getCollectionStatus(c) === 'existing');
                    setSelectedCollections(prev => [...prev.filter(id => !id.startsWith('directus_')), ...existingCollections.map(c => c.collection)]);
                  }}
                  disabled={!systemCollectionsAcknowledged}
                  style={{
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    border: '1px solid #fecaca',
                    borderRadius: '4px',
                    cursor: systemCollectionsAcknowledged ? 'pointer' : 'not-allowed',
                    fontWeight: '500',
                    backgroundColor: systemCollectionsAcknowledged ? '#fee2e2' : '#f3f4f6',
                    color: systemCollectionsAcknowledged ? '#dc2626' : '#9ca3af'
                  }}
                >
                  Existing ({collections.filter(c => c.collection.startsWith('directus_') && getCollectionStatus(c) === 'existing').length})
                </button>
                <button
                  onClick={() => {
                    const systemCollections = collections.filter(c => c.collection.startsWith('directus_'));
                    const newCollections = systemCollections.filter(c => getCollectionStatus(c) === 'new');
                    setSelectedCollections(prev => [...prev.filter(id => !id.startsWith('directus_')), ...newCollections.map(c => c.collection)]);
                  }}
                  disabled={!systemCollectionsAcknowledged}
                  style={{
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    border: '1px solid #bbf7d0',
                    borderRadius: '4px',
                    cursor: systemCollectionsAcknowledged ? 'pointer' : 'not-allowed',
                    fontWeight: '500',
                    backgroundColor: systemCollectionsAcknowledged ? '#dcfce7' : '#f3f4f6',
                    color: systemCollectionsAcknowledged ? '#16a34a' : '#9ca3af'
                  }}
                >
                  New ({collections.filter(c => c.collection.startsWith('directus_') && getCollectionStatus(c) === 'new').length})
                </button>
                <button
                  onClick={() => setSelectedCollections(prev => prev.filter(id => !id.startsWith('directus_')))}
                  style={{
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '500',
                    backgroundColor: '#f3f4f6',
                    color: '#6b7280'
                  }}
                >
                  Clear
                </button>
                <button
                  onClick={() => {
                    setShowSystemCollections(false);
                    setSystemCollectionsAcknowledged(false);
                    setSelectedCollections(prev => prev.filter(id => !id.startsWith('directus_')));
                  }}
                  style={{
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    border: '1px solid #6b7280',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '500',
                    backgroundColor: '#6b7280',
                    color: 'white'
                  }}
                >
                  🔒 Hide System Collections
                </button>
              </div>
              
              <div style={{ display: 'grid', gap: '1rem' }}>
                {collections.filter(c => c.collection.startsWith('directus_')).map((collection) => {
                  const isSelected = selectedCollections.includes(collection.collection);
                  const validationResult = validationResults[collection.collection];
                  const hasValidationErrors = validationResult && !validationResult.isValid;
                  const hasValidationWarnings = validationResult && validationResult.warnings.length > 0;
                  const collectionStatus = getCollectionStatus(collection);
                  
                  return (
                    <div key={collection.collection} style={{
                      padding: '1rem',
                      border: `2px solid ${hasValidationErrors ? '#dc2626' : isSelected ? '#dc2626' : '#fecaca'}`,
                      borderRadius: '8px',
                      backgroundColor: hasValidationErrors ? '#fef2f2' : isSelected ? '#fee2e2' : '#fefefe'
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem'
                      }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!systemCollectionsAcknowledged}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCollections(prev => [...prev, collection.collection]);
                            } else {
                              setSelectedCollections(prev => prev.filter(c => c !== collection.collection));
                            }
                          }}
                          style={{ 
                            transform: 'scale(1.2)',
                            opacity: systemCollectionsAcknowledged ? 1 : 0.5
                          }}
                        />
                        
                        <div style={{ flex: 1 }}>
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between',
                            marginBottom: '0.25rem'
                          }}>
                            <h4 style={{ 
                              margin: 0, 
                              fontSize: '1rem', 
                              fontWeight: '600',
                              color: '#dc2626'
                            }}>
                              {collection.collection}
                            </h4>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              {/* Target Status Badge */}
                              <span style={{
                                padding: '2px 6px',
                                borderRadius: '9999px',
                                fontSize: '0.7rem',
                                fontWeight: '500',
                                backgroundColor: collectionStatus === 'existing' ? '#fef3c7' : collectionStatus === 'new' ? '#dbeafe' : '#f3f4f6',
                                color: collectionStatus === 'existing' ? '#92400e' : collectionStatus === 'new' ? '#1e40af' : '#6b7280'
                              }}>
                                {collectionStatus === 'existing' ? 'Existing' : collectionStatus === 'new' ? 'New' : 'Unknown'}
                              </span>
                              
                              {validationResult && (
                                <span style={{
                                  padding: '2px 6px',
                                  borderRadius: '3px',
                                  fontSize: '0.7rem',
                                  fontWeight: '500',
                                  backgroundColor: hasValidationErrors ? '#fee2e2' : hasValidationWarnings ? '#fef3c7' : '#dcfce7',
                                  color: hasValidationErrors ? '#dc2626' : hasValidationWarnings ? '#d97706' : '#16a34a',
                                  border: `1px solid ${hasValidationErrors ? '#fecaca' : hasValidationWarnings ? '#fde68a' : '#bbf7d0'}`
                                }}>
                                  {hasValidationErrors ? '❌ Error' : hasValidationWarnings ? '⚠️ Warning' : '✅ Valid'}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          
                          {collection.meta && (
                            <div style={{ 
                              fontSize: '0.75rem', 
                              color: '#6b7280',
                              marginBottom: '0.5rem'
                            }}>
                              {collection.meta.note && (
                                <div>📝 {collection.meta.note}</div>
                              )}
                            </div>
                          )}
                          
                          
                          {validationResult && (
                            <div style={{ marginTop: '0.5rem' }}>
                              {validationResult.errors.length > 0 && (
                                <div style={{
                                  padding: '0.5rem',
                                  backgroundColor: '#fef2f2',
                                  borderRadius: '4px',
                                  border: '1px solid #fecaca',
                                  marginBottom: '0.5rem'
                                }}>
                                  <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#dc2626', marginBottom: '0.25rem' }}>
                                    🚨 Validation Errors:
                                  </div>
                                  {validationResult.errors.map((error, index) => (
                                    <div key={index} style={{ fontSize: '0.7rem', color: '#dc2626' }}>
                                      • {error}
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {validationResult.warnings.length > 0 && (
                                <div style={{
                                  padding: '0.5rem',
                                  backgroundColor: '#fffbeb',
                                  borderRadius: '4px',
                                  border: '1px solid #fde68a',
                                  marginBottom: '0.5rem'
                                }}>
                                  <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#d97706', marginBottom: '0.25rem' }}>
                                    ⚠️ Warnings:
                                  </div>
                                  {validationResult.warnings.map((warning, index) => (
                                    <div key={index} style={{ fontSize: '0.7rem', color: '#d97706' }}>
                                      • {warning}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        
                        <div>
                          {loading[`import_${collection.collection}`] && importProgress[collection.collection] ? (
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.75rem',
                              padding: '0.5rem 1rem',
                              backgroundColor: '#fef2f2',
                              borderRadius: '6px',
                              border: '2px solid #dc2626',
                              minWidth: '200px'
                            }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ 
                                  fontSize: '0.75rem', 
                                  color: '#991b1b', 
                                  marginBottom: '0.25rem',
                                  fontWeight: '500'
                                }}>
                                  Importing... {importProgress[collection.collection].current}/{importProgress[collection.collection].total}
                                </div>
                                <div style={{
                                  width: '100%',
                                  height: '6px',
                                  backgroundColor: '#fecaca',
                                  borderRadius: '3px',
                                  overflow: 'hidden'
                                }}>
                                  <div style={{
                                    width: `${(importProgress[collection.collection].current / importProgress[collection.collection].total) * 100}%`,
                                    height: '100%',
                                    backgroundColor: '#dc2626',
                                    transition: 'width 0.3s ease'
                                  }}></div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleImport(collection.collection)}
                              disabled={loading[`import_${collection.collection}`] || hasValidationErrors || !systemCollectionsAcknowledged}
                              style={{ 
                                backgroundColor: (!systemCollectionsAcknowledged || hasValidationErrors) ? '#9ca3af' : '#dc2626',
                                color: 'white',
                                padding: '0.5rem 1rem',
                                borderRadius: '6px',
                                border: 'none',
                                fontWeight: '500',
                                cursor: (loading[`import_${collection.collection}`] || hasValidationErrors || !systemCollectionsAcknowledged) ? 'not-allowed' : 'pointer',
                                opacity: (loading[`import_${collection.collection}`] || hasValidationErrors || !systemCollectionsAcknowledged) ? 0.7 : 1
                              }}
                            >
                              {!systemCollectionsAcknowledged
                                ? 'Acknowledge First'
                                : hasValidationErrors 
                                ? 'Fix Errors First'
                                : 'Import System'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Collection Warning Modal */}
      {showNewCollectionWarning && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '12px',
            maxWidth: '500px',
            margin: '1rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '2rem', marginRight: '0.5rem' }}>⚠️</span>
              <h3 style={{ margin: 0, color: '#dc2626' }}>Schema Sync Required</h3>
            </div>
            
            <div style={{ marginBottom: '1.5rem', lineHeight: '1.6' }}>
              <p style={{ margin: '0 0 1rem 0' }}>
                You've selected <strong>"New"</strong> collections that don't exist in the target environment.
              </p>
              <p style={{ margin: '0 0 1rem 0' }}>
                <strong>Before importing data</strong>, you must sync the collection schemas first:
              </p>
              <ol style={{ margin: '0 0 1rem 1.5rem', paddingLeft: 0 }}>
                <li>Export schema from source: <code>directus schema snapshot</code></li>
                <li>Import schema to target: <code>directus schema apply</code></li>
                <li>Or manually create collections in target Directus</li>
              </ol>
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#6b7280' }}>
                Import buttons are disabled for "New" collections to prevent errors.
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowNewCollectionWarning(false)}
                style={{
                  padding: '0.5rem 1rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  backgroundColor: 'white',
                  color: '#6b7280',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flows Manager Modal */}
      <FlowsManager
        sourceUrl={sourceUrl}
        sourceToken={sourceToken}
        targetUrl={targetUrl}
        targetToken={targetToken}
        isVisible={showFlowsManager}
        onClose={() => setShowFlowsManager(false)}
        onStatusUpdate={(status) => onStatusUpdate({
          type: status.type,
          message: status.message
        })}
      />

      {/* Access Control Manager Modal */}
      <AccessControlManager
        sourceUrl={sourceUrl}
        sourceToken={sourceToken}
        targetUrl={targetUrl}
        targetToken={targetToken}
        isVisible={showAccessControlManager}
        onClose={() => setShowAccessControlManager(false)}
        onStatusUpdate={(status) => onStatusUpdate({
          type: status.type,
          message: status.message
        })}
      />

      {/* Files Manager Modal */}
      {showFilesManager && (
        <FilesManager
          sourceUrl={sourceUrl}
          sourceToken={sourceToken}
          targetUrl={targetUrl}
          targetToken={targetToken}
          onClose={() => setShowFilesManager(false)}
          onStatusUpdate={onStatusUpdate}
        />
      )}

      {/* Item Selector Modal */}
      {showItemSelector && (
        <ItemSelectorModal
          collectionName={currentPreviewCollection}
          items={previewItems}
          total={previewTotal}
          selectedIds={selectedItemIds}
          onSelectionChange={setSelectedItemIds}
          onClose={() => setShowItemSelector(false)}
          onImport={handleImportSelected}
          onLoadMore={() => {}}
          hasMore={false}
          loading={loadingPreview}
          relations={sourceRelations}
        />
      )}

      {/* Error Logs Modal */}
      {showErrorLogs && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '12px',
            maxWidth: '800px',
            maxHeight: '80vh',
            margin: '1rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: '#dc2626' }}>🚨 Error Logs</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => setErrorLogs([])}
                  style={{
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    backgroundColor: 'white',
                    color: '#6b7280',
                    cursor: 'pointer'
                  }}
                >
                  Clear All
                </button>
                <button
                  onClick={() => setShowErrorLogs(false)}
                  style={{
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    backgroundColor: 'white',
                    color: '#6b7280',
                    cursor: 'pointer'
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            
            <div style={{ 
              flex: 1, 
              overflow: 'auto',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              backgroundColor: '#f9fafb'
            }}>
              {errorLogs.length === 0 ? (
                <div style={{ 
                  padding: '2rem', 
                  textAlign: 'center', 
                  color: '#6b7280' 
                }}>
                  No error logs yet
                </div>
              ) : (
                errorLogs.map((log) => (
                  <div key={log.id} style={{
                    padding: '1rem',
                    borderBottom: '1px solid #e5e7eb',
                    fontFamily: 'monospace',
                    fontSize: '0.875rem'
                  }}>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      marginBottom: '0.5rem'
                    }}>
                      <strong style={{ color: '#dc2626' }}>{log.operation}</strong>
                      <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>{log.timestamp}</span>
                    </div>
                    
                    <div style={{ marginBottom: '0.5rem' }}>
                      <strong>Message:</strong> {log.error.message}
                    </div>
                    
                    <div style={{ marginBottom: '0.5rem' }}>
                      <strong>Status:</strong> {log.error.status} {log.error.statusText}
                    </div>
                    
                    {log.error.data && (
                      <details style={{ marginTop: '0.5rem' }}>
                        <summary style={{ cursor: 'pointer', color: '#3b82f6' }}>
                          View Error Details
                        </summary>
                        <pre style={{
                          marginTop: '0.5rem',
                          padding: '0.5rem',
                          backgroundColor: '#fee2e2',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          overflow: 'auto',
                          maxHeight: '200px',
                          border: '1px solid #fecaca'
                        }}>
                          {JSON.stringify(log.error.data, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <DocumentationTab 
        isVisible={showDocumentation}
        onClose={() => setShowDocumentation(false)} 
      />

      {/* Item Selector Modal */}
      {showItemSelector && (
        <ItemSelectorModal
          collectionName={currentPreviewCollection}
          items={previewItems}
          total={previewTotal}
          selectedIds={selectedItemIds}
          onSelectionChange={setSelectedItemIds}
          onClose={() => setShowItemSelector(false)}
          onImport={handleImportSelected}
          onLoadMore={() => {}} // No longer needed - all items loaded at once
          hasMore={false} // Always false since we load all items
          loading={loadingPreview}
        />
      )}
    </div>
  )
}
