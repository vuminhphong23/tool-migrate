import React, { useState } from 'react'
import { importFromDirectus } from '../lib/apiHandlers'
import { FlowsManager } from './FlowsManager'
import { AccessControlManager } from './AccessControlManager'
import { DocumentationTab } from './DocumentationTab'
import type { Collection, OperationStatus } from '../types'

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
  onStatusUpdate,
  loading,
  setLoading
}: CollectionListProps) {
  const [importLimit, setImportLimit] = useState<number | null>(null)
  const [titleFilter, setTitleFilter] = useState<string>('')
  const [showFlowsManager, setShowFlowsManager] = useState(false)
  const [showAccessControlManager, setShowAccessControlManager] = useState(false)
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

  // Load target collections for comparison
  const loadTargetCollections = async () => {
    try {
      const { getAllCollections } = await import('../lib/apiHandlers');
      const result = await getAllCollections(targetUrl, targetToken);
      if (result.success) {
        setTargetCollections(result.collections || []);
      }
    } catch (error) {
      console.warn('Failed to load target collections for comparison:', error);
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

  // Schema Migration Functions
  const handleSchemaSnapshot = async () => {
    setSchemaMigrationStep('snapshot');
    setLoading('schema_snapshot', true);
    
    try {
      const client = await import('../lib/DirectusClient').then(m => m.DirectusClient);
      const sourceClient = new client(sourceUrl, sourceToken);
      
      const response = await sourceClient.get('/schema/snapshot');
      // Extract the actual schema data (remove the "data" wrapper)
      const schemaData = response.data;
      setSchemaSnapshot(schemaData);
      
      onStatusUpdate({ 
        type: 'success', 
        message: `Schema snapshot retrieved from source (${Object.keys(schemaData?.collections || {}).length} collections)` 
      });
      
      setSchemaMigrationStep('diff');
    } catch (error: any) {
      logError('Schema Snapshot', error);
      onStatusUpdate({ 
        type: 'error', 
        message: `Failed to retrieve schema snapshot: ${error.message}` 
      });
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
      const client = await import('../lib/DirectusClient').then(m => m.DirectusClient);
      const targetClient = new client(targetUrl, targetToken);
      
      const response = await targetClient.post('/schema/diff', schemaSnapshot);
      // Extract the actual diff data (remove the "data" wrapper)
      const diffData = response.data;
      setSchemaDiff(diffData);
      
      const hasChanges = diffData?.diff && Object.keys(diffData.diff).length > 0;
      
      if (hasChanges) {
        onStatusUpdate({ 
          type: 'info', 
          message: `Schema differences found. Ready to apply changes to target.` 
        });
        setSchemaMigrationStep('apply');
      } else {
        onStatusUpdate({ 
          type: 'success', 
          message: 'No schema differences found. Schemas are already in sync!' 
        });
        setSchemaMigrationStep('complete');
      }
    } catch (error: any) {
      logError('Schema Diff', error);
      onStatusUpdate({ 
        type: 'error', 
        message: `Failed to compare schemas: ${error.message}` 
      });
      setSchemaMigrationStep('idle');
    } finally {
      setLoading('schema_diff', false);
    }
  };

  const handleSchemaApply = async () => {
    if (!schemaDiff) return;
    
    setSchemaMigrationStep('apply');
    setLoading('schema_apply', true);
    
    try {
      const client = await import('../lib/DirectusClient').then(m => m.DirectusClient);
      const targetClient = new client(targetUrl, targetToken);
      
      await targetClient.post('/schema/apply', schemaDiff);
      
      onStatusUpdate({ 
        type: 'success', 
        message: 'Schema migration completed successfully! Target schema is now in sync.' 
      });
      
      setSchemaMigrationStep('complete');
      
      // Refresh target collections after schema migration
      await loadTargetCollections();
    } catch (error: any) {
      logError('Schema Apply', error);
      onStatusUpdate({ 
        type: 'error', 
        message: `Failed to apply schema changes: ${error.message}` 
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

  const handleImport = async (collectionName: string) => {
    const loadingKey = `import_${collectionName}`
    setLoading(loadingKey, true)
    onStatusUpdate(null)

    try {
      const result = await importFromDirectus(
        sourceUrl,
        sourceToken,
        targetUrl,
        targetToken,
        collectionName,
        {
          limit: importLimit || undefined,
          titleFilter: titleFilter.trim() || undefined
        }
      )

      if (result.success) {
        const importedItems = result.importedItems || []
        const successful = importedItems.filter(item => item.status !== 'error').length
        const failed = importedItems.filter(item => item.status === 'error').length

        onStatusUpdate({
          type: failed > 0 ? 'warning' : 'success',
          message: `Successfully imported ${successful} items from ${collectionName} (${failed} failed)`
        })

        if (failed > 0) {
          const failedItems = importedItems.filter(item => item.status === 'error')
          console.warn('Some items failed to import:', failedItems)
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
    } finally {
      setLoading(loadingKey, false)
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

        {/* Progress Indicator */}
        {schemaMigrationStep !== 'idle' && (
          <div style={{ 
            marginTop: '1rem', 
            padding: '0.75rem', 
            backgroundColor: '#fbbf24', 
            borderRadius: '6px',
            fontSize: '0.875rem',
            color: '#92400e'
          }}>
            <strong>Status:</strong> {
              schemaMigrationStep === 'snapshot' ? '📸 Retrieved schema snapshot from source' :
              schemaMigrationStep === 'diff' ? '🔍 Ready to compare schemas' :
              schemaMigrationStep === 'apply' ? '⚡ Ready to apply changes to target' :
              schemaMigrationStep === 'complete' ? '✅ Schema migration completed successfully!' : ''
            }
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
              backgroundColor: '#8b5cf6',
              color: 'white',
              padding: '0.75rem 1.5rem',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
            disabled={Object.values(loading).some(Boolean)}
          >
            🔄 Migrate Flows & Operations
          </button>

          <button
            onClick={() => setShowAccessControlManager(true)}
            style={{
              backgroundColor: '#7c3aed',
              color: 'white',
              padding: '0.75rem 1.5rem',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              marginLeft: '1rem'
            }}
          >
            🔐 Access Control Migration
          </button>

          {/* Debug: Show loading states */}
          {Object.values(loading).some(Boolean) && (
            <div style={{ 
              fontSize: '0.75rem', 
              color: '#dc2626',
              padding: '0.5rem',
              backgroundColor: '#fef2f2',
              borderRadius: '4px',
              border: '1px solid #fecaca'
            }}>
              Loading: {Object.entries(loading).filter(([_, isLoading]) => isLoading).map(([key]) => key).join(', ')}
              <button 
                onClick={() => {
                  Object.keys(loading).forEach(key => setLoading(key, false));
                }}
                style={{
                  marginLeft: '0.5rem',
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.75rem',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer'
                }}
              >
                Clear All
              </button>
            </div>
          )}
          
        </div>
      </div>

      {/* Import Options */}
      <div style={{ 
        marginBottom: '2rem', 
        padding: '1rem', 
        backgroundColor: '#f9fafb', 
        borderRadius: '8px' 
      }}>
        <h3 style={{ margin: '0 0 1rem 0' }}>Collection Import Options</h3>
        
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

          <div className="form-group">
            <button
              type="button"
              onClick={() => {
                setImportLimit(null)
                setTitleFilter('')
              }}
              style={{ backgroundColor: '#6b7280' }}
            >
              Clear Filters
            </button>
          </div>
        </div>

        {titleFilter && (
          <div style={{ 
            marginTop: '0.5rem', 
            fontSize: '0.875rem', 
            color: '#3b82f6' 
          }}>
            Will import only items with titles containing "{titleFilter}"
          </div>
        )}
      </div>

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

        <button
          onClick={async () => {
            if (selectedCollections.length === 0) {
              onStatusUpdate({ type: 'error', message: 'Please select at least one collection to migrate' });
              return;
            }
            
            // Check if validation passed
            const hasErrors = selectedCollections.some(name => 
              validationResults[name] && !validationResults[name].isValid
            );
            
            if (hasErrors) {
              onStatusUpdate({ type: 'error', message: 'Please fix validation errors before migration' });
              return;
            }
            
            setLoading('migrate_selected', true);
            try {
              let successCount = 0;
              let errorCount = 0;
              
              for (const collectionName of selectedCollections) {
                try {
                  await handleImport(collectionName);
                  successCount++;
                } catch (error) {
                  errorCount++;
                }
              }
              
              if (errorCount > 0) {
                onStatusUpdate({ 
                  type: 'warning', 
                  message: `Migration completed: ${successCount} successful, ${errorCount} failed` 
                });
              } else {
                onStatusUpdate({ 
                  type: 'success', 
                  message: `Successfully migrated ${successCount} collections` 
                });
              }
            } catch (error: any) {
              onStatusUpdate({ type: 'error', message: `Migration failed: ${error.message}` });
            } finally {
              setLoading('migrate_selected', false);
            }
          }}
          style={{
            backgroundColor: '#dc2626',
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
          {loading.migrate_selected ? 'Migrating...' : `Migrate Selected (${selectedCollections.length})`}
        </button>
      </div>

      {/* Custom Collections List */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>
            📦 Custom Collections ({collections.filter(c => !c.collection.startsWith('directus_')).length})
          </h3>
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                setStatusFilter('existing');
                const customCollections = collections.filter(c => !c.collection.startsWith('directus_'));
                const existingCollections = customCollections.filter(c => getCollectionStatus(c) === 'existing');
                setSelectedCollections(prev => [...prev.filter(id => id.startsWith('directus_')), ...existingCollections.map(c => c.collection)]);
              }}
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                border: `1px solid ${statusFilter === 'existing' ? '#dc2626' : '#fecaca'}`,
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '500',
                backgroundColor: statusFilter === 'existing' ? '#dc2626' : '#fee2e2',
                color: statusFilter === 'existing' ? 'white' : '#dc2626'
              }}
            >
              Existing ({collections.filter(c => !c.collection.startsWith('directus_') && getCollectionStatus(c) === 'existing').length})
            </button>
            <button
              onClick={() => {
                setStatusFilter('new');
                setShowNewCollectionWarning(true);
                const customCollections = collections.filter(c => !c.collection.startsWith('directus_'));
                const newCollections = customCollections.filter(c => getCollectionStatus(c) === 'new');
                setSelectedCollections(prev => [...prev.filter(id => id.startsWith('directus_')), ...newCollections.map(c => c.collection)]);
              }}
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                border: `1px solid ${statusFilter === 'new' ? '#16a34a' : '#bbf7d0'}`,
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '500',
                backgroundColor: statusFilter === 'new' ? '#16a34a' : '#dcfce7',
                color: statusFilter === 'new' ? 'white' : '#16a34a'
              }}
            >
              New ({collections.filter(c => !c.collection.startsWith('directus_') && getCollectionStatus(c) === 'new').length})
            </button>
            <button
              onClick={() => setSelectedCollections(prev => prev.filter(id => id.startsWith('directus_')))}
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
          </div>
        </div>

        <div style={{ display: 'grid', gap: '1rem' }}>
          {collections.filter(c => {
            if (c.collection.startsWith('directus_')) return false;
            if (statusFilter === 'existing') return getCollectionStatus(c) === 'existing';
            if (statusFilter === 'new') return getCollectionStatus(c) === 'new';
            return false;
          }).map((collection) => {
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
                      <h4 style={{ 
                        margin: 0, 
                        fontSize: '1rem', 
                        fontWeight: '600',
                        color: '#1f2937'
                      }}>
                        {collection.collection}
                      </h4>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {/* Target Status Badge */}
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: '500',
                          backgroundColor: collectionStatus === 'existing' ? '#fee2e2' : collectionStatus === 'new' ? '#dcfce7' : '#f3f4f6',
                          color: collectionStatus === 'existing' ? '#dc2626' : collectionStatus === 'new' ? '#16a34a' : '#6b7280',
                          border: `1px solid ${collectionStatus === 'existing' ? '#fecaca' : collectionStatus === 'new' ? '#bbf7d0' : '#d1d5db'}`,
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
                            padding: '0.25rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: '500',
                            backgroundColor: '#fef3c7',
                            color: '#d97706',
                            border: '1px solid #fde68a',
                            lineHeight: '1'
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
                    <button
                      onClick={() => handleImport(collection.collection)}
                      disabled={loading[`import_${collection.collection}`] || hasValidationErrors || collectionStatus === 'new'}
                      style={{
                        backgroundColor: hasValidationErrors || collectionStatus === 'new' ? '#9ca3af' : '#f97316',
                        color: 'white',
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        border: 'none',
                        cursor: hasValidationErrors || collectionStatus === 'new' ? 'not-allowed' : 'pointer',
                        fontWeight: '500',
                        opacity: loading[`import_${collection.collection}`] ? 0.7 : 1
                      }}
                      title={collectionStatus === 'new' ? 'Cannot import to new collections. Please sync schema first.' : ''}
                    >
                      {loading[`import_${collection.collection}`] ? 'Importing...' : 
                       collectionStatus === 'new' ? 'Schema Required' : 'Import from Source'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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
                                borderRadius: '3px',
                                fontSize: '0.7rem',
                                fontWeight: '500',
                                backgroundColor: collectionStatus === 'existing' ? '#fee2e2' : collectionStatus === 'new' ? '#dcfce7' : '#f3f4f6',
                                color: collectionStatus === 'existing' ? '#dc2626' : collectionStatus === 'new' ? '#16a34a' : '#6b7280',
                                border: `1px solid ${collectionStatus === 'existing' ? '#fecaca' : collectionStatus === 'new' ? '#bbf7d0' : '#d1d5db'}`
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
                            {loading[`import_${collection.collection}`] 
                              ? 'Importing...' 
                              : !systemCollectionsAcknowledged
                              ? 'Acknowledge First'
                              : hasValidationErrors 
                              ? 'Fix Errors First'
                              : 'Import System'
                            }
                          </button>
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
    </div>
  )
}
