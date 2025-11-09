import React, { useState, useEffect } from 'react';
import { getFlowsFromDirectus, importFlowsToDirectus, buildFlowDependencyGraph, validateFlowMigration } from '../lib/flowsHandler';
import type { DirectusFlow, DirectusOperation, FlowMigrationOptions, FlowImportResult } from '../lib/flowsHandler';

interface FlowsManagerProps {
  sourceUrl: string;
  sourceToken: string;
  targetUrl: string;
  targetToken: string;
  isVisible: boolean;
  onClose: () => void;
  onStatusUpdate: (status: { type: 'success' | 'error' | 'info'; message: string }) => void;
}

export function FlowsManager({
  sourceUrl,
  sourceToken,
  targetUrl,
  targetToken,
  isVisible,
  onClose,
  onStatusUpdate
}: FlowsManagerProps) {
  const [sourceFlows, setSourceFlows] = useState<DirectusFlow[]>([]);
  const [sourceOperations, setSourceOperations] = useState<DirectusOperation[]>([]);
  const [targetFlows, setTargetFlows] = useState<DirectusFlow[]>([]);
  const [targetOperations, setTargetOperations] = useState<DirectusOperation[]>([]);
  const [selectedFlows, setSelectedFlows] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingTarget, setLoadingTarget] = useState(false);
  const [activeTab, setActiveTab] = useState<'flows' | 'operations'>('flows');
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'existing'>('all');
  const [collapsedFlows, setCollapsedFlows] = useState<Set<string>>(new Set());
  const [initialCollapseSet, setInitialCollapseSet] = useState(false);
  const [migrationOptions, setMigrationOptions] = useState<FlowMigrationOptions>({
    preserveIds: true,
    validateReferences: true,
    transformOptions: false,
    conflictResolution: 'overwrite'
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResults, setMigrationResults] = useState<FlowImportResult | null>(null);
  const [validationResult, setValidationResult] = useState<{ isValid: boolean; errors: string[]; warnings: string[] } | null>(null);
  const [flowSearch, setFlowSearch] = useState('');

  useEffect(() => {
    if (isVisible && sourceUrl && sourceToken) {
      loadSourceFlows();
    }
    if (isVisible && targetUrl && targetToken) {
      loadTargetFlows();
    }
  }, [isVisible, sourceUrl, sourceToken, targetUrl, targetToken]);

  const loadSourceFlows = async () => {
    setLoading(true);
    try {
      const result = await getFlowsFromDirectus(sourceUrl, sourceToken);
      if (result.success) {
        setSourceFlows(result.flows || []);
        setSourceOperations(result.operations || []);
        
        if (!initialCollapseSet && result.flows && result.flows.length > 0) {
          const allFlowIds = result.flows.map(f => f.id);
          setCollapsedFlows(new Set(allFlowIds));
          setInitialCollapseSet(true);
        }
        
        onStatusUpdate({
          type: 'success',
          message: `Loaded ${result.flows?.length || 0} flows and ${result.operations?.length || 0} operations from source`
        });
      } else {
        onStatusUpdate({
          type: 'error',
          message: `Failed to load flows: ${result.error?.message || 'Unknown error'}`
        });
      }
    } catch (error: any) {
      onStatusUpdate({
        type: 'error',
        message: `Error loading flows: ${error.message}`
      });
    } finally {
      setLoading(false);
    }
  };

  const loadTargetFlows = async () => {
    setLoadingTarget(true);
    try {
      const result = await getFlowsFromDirectus(targetUrl, targetToken);
      if (result.success) {
        setTargetFlows(result.flows || []);
        setTargetOperations(result.operations || []);
      }
    } catch (error: any) {
    } finally {
      setLoadingTarget(false);
    }
  };

  const handleFlowSelection = (flowId: string, selected: boolean) => {
    if (selected) {
      setSelectedFlows(prev => [...prev, flowId]);
    } else {
      setSelectedFlows(prev => prev.filter(id => id !== flowId));
    }
  };

  const handleSelectAll = () => {
    const filteredFlows = sourceFlows.filter(flow => {
      const existsInTarget = targetFlows.some(tf => tf.id === flow.id);
      if (statusFilter === 'new') return !existsInTarget;
      if (statusFilter === 'existing') return existsInTarget;
      return true;
    });

    const filteredFlowIds = filteredFlows.map(f => f.id);
    const allFilteredSelected = filteredFlowIds.every(id => selectedFlows.includes(id));

    if (allFilteredSelected && filteredFlowIds.length > 0) {
      setSelectedFlows(prev => prev.filter(id => !filteredFlowIds.includes(id)));
    } else {
      setSelectedFlows(prev => [...new Set([...prev, ...filteredFlowIds])]);
    }
  };

  const validateMigration = () => {
    const selectedFlowObjects = sourceFlows.filter(flow => selectedFlows.includes(flow.id));
    const relatedOperations = sourceOperations.filter(op => selectedFlows.includes(op.flow));
    
    if (selectedFlowObjects.length === 0) {
      const result = { isValid: false, errors: ['No flows selected'], warnings: [] };
      setValidationResult(result);
      onStatusUpdate({
        type: 'error',
        message: 'Please select at least one flow to validate'
      });
      return result;
    }
    
    const validation = validateFlowMigration(selectedFlowObjects, relatedOperations, migrationOptions);
    
    setValidationResult(validation);
    
    if (validation.isValid) {
      onStatusUpdate({
        type: 'success',
        message: `✅ Validation passed! ${selectedFlowObjects.length} flow(s) ready for migration.`
      });
    } else {
      onStatusUpdate({
        type: 'error',
        message: `❌ Validation failed: ${validation.errors.join(', ')}`
      });
    }

    if (validation.warnings.length > 0) {
      onStatusUpdate({
        type: 'info',
        message: `⚠️ Warnings: ${validation.warnings.join(', ')}`
      });
    }

    return validation;
  };

  const executeMigration = async () => {
    const selectedFlowObjects = sourceFlows.filter(flow => selectedFlows.includes(flow.id));
    const relatedOperations = sourceOperations.filter(op => selectedFlows.includes(op.flow));

    if (selectedFlowObjects.length === 0) {
      onStatusUpdate({
        type: 'error',
        message: 'Please select at least one flow to migrate'
      });
      return;
    }

    setLoading(true);
    setIsMigrating(true);
    setMigrationResults(null);
    setValidationResult(null);
    
    try {
      const result = await importFlowsToDirectus(
        selectedFlowObjects,
        relatedOperations,
        targetUrl,
        targetToken,
        migrationOptions
      );

      setMigrationResults(result);
      
      if (result.success) {
        onStatusUpdate({
          type: 'success',
          message: result.message
        });
        
        setSelectedFlows([]);
        await loadTargetFlows();
      } else {
        onStatusUpdate({
          type: 'error',
          message: result.message
        });
      }
    } catch (error: any) {
      onStatusUpdate({
        type: 'error',
        message: `Migration failed: ${error.message}`
      });
      setMigrationResults({
        success: false,
        message: `Migration failed: ${error.message}`,
        importedFlows: [],
        importedOperations: []
      });
    } finally {
      setLoading(false);
      setIsMigrating(false);
    }
  };

  if (!isVisible) return null;

  return (
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
        borderRadius: '8px',
        padding: '2rem',
        maxWidth: '800px',
        maxHeight: '80vh',
        width: '90%',
        overflow: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0 }}>🔄 Flows & Operations Migration</h2>
          <button
            onClick={onClose}
            style={{
              backgroundColor: '#6b7280',
              color: 'white',
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            Close
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1.5rem',
          borderBottom: '2px solid #e5e7eb'
        }}>
          <button
            onClick={() => setActiveTab('flows')}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '0.875rem',
              fontWeight: '500',
              border: 'none',
              borderBottom: activeTab === 'flows' ? '2px solid #3b82f6' : '2px solid transparent',
              backgroundColor: 'transparent',
              color: activeTab === 'flows' ? '#3b82f6' : '#6b7280',
              cursor: 'pointer',
              marginBottom: '-2px'
            }}
          >
            🔄 Flows ({sourceFlows.length})
          </button>
          <button
            onClick={() => setActiveTab('operations')}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '0.875rem',
              fontWeight: '500',
              border: 'none',
              borderBottom: activeTab === 'operations' ? '2px solid #3b82f6' : '2px solid transparent',
              backgroundColor: 'transparent',
              color: activeTab === 'operations' ? '#3b82f6' : '#6b7280',
              cursor: 'pointer',
              marginBottom: '-2px'
            }}
          >
            ⚙️ Operations ({sourceOperations.length})
          </button>
        </div>

        {/* Flows Tab Content */}
        {activeTab === 'flows' && (
          <>
        {/* Source Analysis */}
        <div style={{
          backgroundColor: '#f8fafc',
          padding: '1.5rem',
          borderRadius: '8px', 
          marginBottom: '1.5rem',
          border: '1px solid #e2e8f0'
        }}>
                    
          {/* Relationship Diagram */}
          <div style={{ textAlign: 'center', marginBottom: '1.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
            🔗 <strong>Relationship:</strong> <span style={{ color: '#3b82f6' }}>Flow</span> → (n) <span style={{ color: '#059669' }}>Operation</span>
          </div>

          {/* Statistics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>Flows: {sourceFlows.length} total</div>
              <div style={{ fontSize: '0.875rem', color: '#059669' }}>New: {sourceFlows.filter(f => !targetFlows.some(tf => tf.id === f.id)).length}</div>
              <div style={{ fontSize: '0.875rem', color: '#f59e0b' }}>Existing: {sourceFlows.filter(f => targetFlows.some(tf => tf.id === f.id)).length}</div>
            </div>
            <div>
              <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>Operations: {sourceOperations.length} total</div>
              <div style={{ fontSize: '0.875rem', color: '#059669' }}>New: {sourceOperations.filter(op => !targetOperations.some(to => to.id === op.id)).length}</div>
              <div style={{ fontSize: '0.875rem', color: '#f59e0b' }}>Existing: {sourceOperations.filter(op => targetOperations.some(to => to.id === op.id)).length}</div>
            </div>
          </div>

          {/* Available Flows */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ color: '#10b981', marginRight: '0.5rem' }}>✅</span>
            <span style={{ color: '#059669', fontSize: '0.875rem' }}>{sourceFlows.length} flows available</span>
          </div>
          
          {/* Warning Text */}
          <div style={{ fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic' }}>
            ⚠️ Operations are organized by flows and will be migrated automatically when you select flows
          </div>
        </div>

        {/* Filter Buttons */}
        {sourceFlows.length > 0 && !loadingTarget && (
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            marginBottom: '1rem',
            padding: '0.5rem',
            backgroundColor: '#f8fafc',
            borderRadius: '6px',
            border: '1px solid #e2e8f0'
          }}>
            <span style={{ fontSize: '0.875rem', color: '#64748b', alignSelf: 'center', marginRight: '0.5rem' }}>Filter:</span>
            <button
              onClick={() => setStatusFilter('all')}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '500',
                backgroundColor: statusFilter === 'all' ? '#3b82f6' : 'white',
                color: statusFilter === 'all' ? 'white' : '#64748b',
           
              }}
            >
              All ({sourceFlows.length})
            </button>
            <button
              onClick={() => setStatusFilter('new')}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '500',
                backgroundColor: statusFilter === 'new' ? '#10B981' : 'white',
                color: statusFilter === 'new' ? 'white' : '#1e40af',
             
              }}
            >
              New ({sourceFlows.filter(f => !targetFlows.some(tf => tf.id === f.id)).length})
            </button>
            <button
              onClick={() => setStatusFilter('existing')}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '500',
                backgroundColor: statusFilter === 'existing' ? '#F97316' : 'white',
                color: statusFilter === 'existing' ? 'white' : '#92400e',
                
              }}
            >
              Existing ({sourceFlows.filter(f => targetFlows.some(tf => tf.id === f.id)).length})
            </button>
          </div>
        )}

        {/* Search Bar */}
        {sourceFlows.length > 0 && (
          <div style={{ marginBottom: '1rem', marginRight: '1rem' }}>
            <input
              type="text"
              placeholder="Search flows (name, trigger, description)..."
              value={flowSearch}
              onChange={(e) => setFlowSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                fontSize: '0.875rem'
              }}
            />
          </div>
        )}

        {/* Source Flows List */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>Available Flows ({sourceFlows.filter(flow => {
              const existsInTarget = targetFlows.some(tf => tf.id === flow.id);
              if (statusFilter === 'new') return !existsInTarget;
              if (statusFilter === 'existing') return existsInTarget;
              return true;
            }).length})</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={handleSelectAll}
                style={{
                  backgroundColor: '#6b7280',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem'
                }}
                disabled={loading}
              >
                {(() => {
                  const filteredFlows = sourceFlows.filter(flow => {
                    const existsInTarget = targetFlows.some(tf => tf.id === flow.id);
                    if (statusFilter === 'new') return !existsInTarget;
                    if (statusFilter === 'existing') return existsInTarget;
                    return true;
                  });
                  const filteredFlowIds = filteredFlows.map(f => f.id);
                  const allFilteredSelected = filteredFlowIds.every(id => selectedFlows.includes(id)) && filteredFlowIds.length > 0;
                  return allFilteredSelected ? 'Deselect All' : 'Select All';
                })()}
              </button>
              <button
                onClick={() => setSelectedFlows([])}
                style={{
                  backgroundColor: '#ef4444',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: selectedFlows.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: selectedFlows.length === 0 ? 0.6 : 1
                }}
                disabled={selectedFlows.length === 0}
                title={selectedFlows.length === 0 ? 'No flows selected' : `Clear ${selectedFlows.length} selected flow(s)`}
              >
                Clear Selected
              </button>
              <button
                onClick={() => {
                  loadSourceFlows();
                  loadTargetFlows();
                }}
                style={{
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem'
                }}
                disabled={loading || loadingTarget}
              >
                {loading || loadingTarget ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>

          <div style={{
            maxHeight: '300px',
            overflowY: 'auto',
            border: '1px solid #e5e7eb',
            borderRadius: '6px'
          }}>
            {sourceFlows.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                {loading ? 'Loading flows...' : 'No flows found in source instance'}
              </div>
            ) : (() => {
              const filteredFlows = sourceFlows.filter(flow => {
                // Apply search filter
                if (flowSearch) {
                  const searchLower = flowSearch.toLowerCase();
                  const matchesSearch = (
                    flow.name.toLowerCase().includes(searchLower) ||
                    (flow.trigger && flow.trigger.toLowerCase().includes(searchLower)) ||
                    (flow.description && flow.description.toLowerCase().includes(searchLower))
                  );
                  if (!matchesSearch) return false;
                }
                
                // Apply status filter
                const existsInTarget = targetFlows.some(tf => tf.id === flow.id);
                if (statusFilter === 'new') return !existsInTarget;
                if (statusFilter === 'existing') return existsInTarget;
                return true;
              });

              if (filteredFlows.length === 0) {
                return (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                    No {statusFilter === 'new' ? 'new' : statusFilter === 'existing' ? 'existing' : ''} flows found
                  </div>
                );
              }

              return filteredFlows.map(flow => {
                  const operationCount = sourceOperations.filter(op => op.flow === flow.id).length;
                  const existsInTarget = targetFlows.some(tf => tf.id === flow.id);
                  const isNew = !existsInTarget;
                  
                  return (
                  <div
                    key={flow.id}
                    style={{
                      padding: '1rem',
                      borderBottom: '1px solid #f3f4f6',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFlows.includes(flow.id)}
                      onChange={(e) => handleFlowSelection(flow.id, e.target.checked)}
                      disabled={loading}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: '600' }}>
                          {flow.name}
                        </span>
                        {loadingTarget ? (
                          <span style={{
                            fontSize: '0.75rem',
                            padding: '0.125rem 0.5rem',
                            borderRadius: '9999px',
                            backgroundColor: '#f3f4f6',
                            color: '#6b7280'
                          }}>
                            Checking...
                          </span>
                        ) : (
                          <span style={{
                            fontSize: '0.75rem',
                            padding: '0.125rem 0.5rem',
                            borderRadius: '9999px',
                            fontWeight: '500',
                            backgroundColor: isNew ? '#dbeafe' : '#fef3c7',
                            color: isNew ? '#1e40af' : '#92400e'
                          }}>
                            {isNew ? 'New' : 'Existing'}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                        Status: {flow.status} • Operations: {operationCount} • Trigger: {flow.trigger || 'None'}
                      </div>
                      {flow.description && (
                        <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                          {flow.description}
                        </div>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          <button
            onClick={validateMigration}
            style={{
              backgroundColor: selectedFlows.length === 0 ? '#9ca3af' : '#f59e0b',
              color: 'white',
              padding: '0.75rem 1.5rem',
              fontWeight: '500',
              border: 'none',
              borderRadius: '6px',
              cursor: loading || selectedFlows.length === 0 ? 'not-allowed' : 'pointer',
              opacity: loading || selectedFlows.length === 0 ? 0.6 : 1,
              transition: 'all 0.2s ease',
              fontSize: '0.875rem'
            }}
            disabled={loading || selectedFlows.length === 0}
            title={selectedFlows.length === 0 ? 'Please select at least one flow' : 'Validate selected flows before migration'}
          >
            Validate Migration
          </button>
          
          <button
            onClick={executeMigration}
            style={{
              backgroundColor: loading || selectedFlows.length === 0 ? '#9ca3af' : '#10b981',
              color: 'white',
              padding: '0.75rem 1.5rem',
              fontWeight: '500',
              border: 'none',
              borderRadius: '6px',
              cursor: loading || selectedFlows.length === 0 ? 'not-allowed' : 'pointer',
              opacity: loading || selectedFlows.length === 0 ? 0.6 : 1,
              transition: 'all 0.2s ease',
              fontSize: '0.875rem'
            }}
            disabled={loading || selectedFlows.length === 0}
            title={selectedFlows.length === 0 ? 'Please select at least one flow' : 'Execute migration for selected flows'}
          >
            {loading ? 'Migrating...' : `Migrate ${selectedFlows.length} Flow${selectedFlows.length !== 1 ? 's' : ''}`}
          </button>
        </div>

        {/* Migration Progress Status */}
        {isMigrating && (
          <div style={{
            marginTop: '1rem',
            padding: '1.5rem',
            backgroundColor: '#fef3c7',
            borderRadius: '8px',
            border: '2px solid #f59e0b',
            textAlign: 'center'
          }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#92400e' }}>🚀 Migration in Progress...</h3>
            <div style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#78350f' }}>
              Please wait while we migrate your flows and operations.
            </div>
            <div style={{ fontSize: '0.875rem', color: '#92400e' }}>
              This may take a few minutes depending on the amount of data.
            </div>
          </div>
        )}

        {/* Validation Result Display */}
        {validationResult && !isMigrating && (
          <div style={{
            marginTop: '1rem',
            padding: '1rem',
            backgroundColor: validationResult.isValid ? '#ecfdf5' : '#fef2f2',
            border: `2px solid ${validationResult.isValid ? '#10b981' : '#ef4444'}`,
            borderRadius: '8px',
            fontSize: '0.875rem'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'flex-start',
              marginBottom: '0.5rem'
            }}>
              <div style={{ 
                fontWeight: '600', 
                color: validationResult.isValid ? '#065f46' : '#991b1b',
                fontSize: '1rem'
              }}>
                {validationResult.isValid ? '✅ Validation Passed' : '❌ Validation Failed'}
              </div>
              <button
                onClick={() => setValidationResult(null)}
                style={{
                  backgroundColor: 'white',
                  color: '#6b7280',
                  padding: '0.25rem 0.75rem',
                  fontSize: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Clear
              </button>
            </div>
            
            {validationResult.isValid && validationResult.errors.length === 0 && (
              <div style={{ color: '#065f46', marginBottom: '0.5rem' }}>
                All selected flows are ready for migration. You can proceed with the migration.
              </div>
            )}
            
            {validationResult.errors.length > 0 && (
              <div style={{ marginBottom: '0.5rem' }}>
                <div style={{ fontWeight: '600', color: '#991b1b', marginBottom: '0.25rem' }}>Errors:</div>
                <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#dc2626' }}>
                  {validationResult.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {validationResult.warnings.length > 0 && (
              <div>
                <div style={{ fontWeight: '600', color: '#d97706', marginBottom: '0.25rem' }}>Warnings:</div>
                <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#f59e0b' }}>
                  {validationResult.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Migration Results Display */}
        {migrationResults && !isMigrating && (
          <div style={{
            marginTop: '1rem',
            padding: '1.5rem',
            backgroundColor: migrationResults.success ? '#d1fae5' : '#fee2e2',
            borderRadius: '8px',
            border: `2px solid ${migrationResults.success ? '#10b981' : '#ef4444'}`
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: migrationResults.success ? '#065f46' : '#991b1b' }}>
                📊 Migration Results
              </h3>
              <button
                onClick={() => setMigrationResults(null)}
                style={{
                  backgroundColor: '#6b7280',
                  color: 'white',
                  padding: '0.25rem 0.75rem',
                  fontSize: '0.75rem',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                Clear Results
              </button>
            </div>
            
            <div style={{ 
              padding: '0.75rem', 
              backgroundColor: migrationResults.success ? '#a7f3d0' : '#fecaca',
              color: migrationResults.success ? '#065f46' : '#991b1b',
              borderRadius: '6px',
              marginBottom: '1rem',
              fontSize: '0.95rem'
            }}>
              {migrationResults.message}
            </div>

            {migrationResults.importedFlows && migrationResults.importedFlows.length > 0 && (
              <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem', color: migrationResults.success ? '#065f46' : '#991b1b' }}>
                <strong>🔄 Flows:</strong> {migrationResults.importedFlows.filter(f => f.status === 'success').length}/{migrationResults.importedFlows.length} successful
              </div>
            )}

            {migrationResults.importedOperations && migrationResults.importedOperations.length > 0 && (
              <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem', color: migrationResults.success ? '#065f46' : '#991b1b' }}>
                <strong>⚙️ Operations:</strong> {migrationResults.importedOperations.filter(o => o.status === 'success').length}/{migrationResults.importedOperations.length} successful
              </div>
            )}
          </div>
        )}
          </>
        )}

        {/* Operations Tab Content */}
        {activeTab === 'operations' && (
          <>
            {/* Info Message */}
            <div style={{
              marginBottom: '1.5rem',
              padding: '0.75rem',
              backgroundColor: '#eff6ff',
              borderRadius: '6px',
              fontSize: '0.875rem',
              color: '#1e40af',
              border: '1px solid #bfdbfe'
            }}>
              <strong>ℹ️ Note:</strong> Operations are now migrated together with their parent flows. 
              Use the <strong>Flows tab</strong> to migrate flows with all their operations.
            </div>

            {/* Operations Filter */}
            {sourceOperations.length > 0 && !loadingTarget && (
              <div style={{
                display: 'flex',
                gap: '0.5rem',
                marginBottom: '1rem',
                padding: '0.5rem',
                backgroundColor: '#f8fafc',
                borderRadius: '6px',
                border: '1px solid #e2e8f0'
              }}>
                <span style={{ fontSize: '0.875rem', color: '#64748b', alignSelf: 'center', marginRight: '0.5rem' }}>Filter:</span>
                <button
                  onClick={() => setStatusFilter('all')}
                  style={{
                    padding: '0.5rem 1rem',
                    fontSize: '0.875rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '500',
                    border: 'none',
                    backgroundColor: statusFilter === 'all' ? '#3b82f6' : 'white',
                    color: statusFilter === 'all' ? 'white' : '#64748b'
                  }}
                >
                  All ({sourceOperations.length})
                </button>
                <button
                  onClick={() => setStatusFilter('new')}
                  style={{
                    padding: '0.5rem 1rem',
                    fontSize: '0.875rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '500',
                    border: 'none',
                    backgroundColor: statusFilter === 'new' ? '#10B981' : 'white',
                    color: statusFilter === 'new' ? 'white' : '#1e40af'
                  }}
                >
                  New ({sourceOperations.filter(op => !targetOperations.some(to => to.id === op.id)).length})
                </button>
                <button
                  onClick={() => setStatusFilter('existing')}
                  style={{
                    padding: '0.5rem 1rem',
                    fontSize: '0.875rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '500',
                    border: 'none',
                    backgroundColor: statusFilter === 'existing' ? '#F97316' : 'white',
                    color: statusFilter === 'existing' ? 'white' : '#92400e'
                  }}
                >
                  Existing ({sourceOperations.filter(op => targetOperations.some(to => to.id === op.id)).length})
                </button>
              </div>
            )}

            {/* Operations List */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0 }}>Available Operations ({sourceOperations.filter(op => {
                  const existsInTarget = targetOperations.some(to => to.id === op.id);
                  if (statusFilter === 'new') return !existsInTarget;
                  if (statusFilter === 'existing') return existsInTarget;
                  return true;
                }).length})</h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => setCollapsedFlows(new Set())}
                    style={{
                      backgroundColor: '#10b981',
                      color: 'white',
                      padding: '0.5rem 1rem',
                      fontSize: '0.875rem',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                    disabled={loading}
                  >
                    Expand All
                  </button>
                  <button
                    onClick={() => {
                      const uniqueFlowIds = [...new Set(sourceOperations.map(op => op.flow))];
                      setCollapsedFlows(new Set(uniqueFlowIds));
                    }}
                    style={{
                      backgroundColor: '#ef4444',
                      color: 'white',
                      padding: '0.5rem 1rem',
                      fontSize: '0.875rem',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                    disabled={loading}
                  >
                    Collapse All
                  </button>
                  <button
                    onClick={() => {
                      loadSourceFlows();
                      loadTargetFlows();
                    }}
                    style={{
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      padding: '0.5rem 1rem',
                      fontSize: '0.875rem',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                    disabled={loading || loadingTarget}
                  >
                    {loading || loadingTarget ? 'Loading...' : 'Refresh'}
                  </button>
                </div>
              </div>

              <div style={{
                maxHeight: '300px',
                overflowY: 'auto',
                border: '1px solid #e5e7eb',
                borderRadius: '6px'
              }}>
                {sourceOperations.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                    {loading ? 'Loading operations...' : 'No operations found'}
                  </div>
                ) : (() => {
                  const filteredOps = sourceOperations.filter(op => {
                    const existsInTarget = targetOperations.some(to => to.id === op.id);
                    if (statusFilter === 'new') return !existsInTarget;
                    if (statusFilter === 'existing') return existsInTarget;
                    return true;
                  });

                  if (filteredOps.length === 0) {
                    return (
                      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                        No {statusFilter === 'new' ? 'new' : statusFilter === 'existing' ? 'existing' : ''} operations found
                      </div>
                    );
                  }

                  const opsByFlow: Record<string, DirectusOperation[]> = {};
                  filteredOps.forEach(op => {
                    if (!opsByFlow[op.flow]) {
                      opsByFlow[op.flow] = [];
                    }
                    opsByFlow[op.flow].push(op);
                  });

                  const sortedFlowIds = Object.keys(opsByFlow).sort((a, b) => {
                    const flowA = sourceFlows.find(f => f.id === a);
                    const flowB = sourceFlows.find(f => f.id === b);
                    const nameA = flowA?.name || 'Unknown';
                    const nameB = flowB?.name || 'Unknown';
                    return nameA.localeCompare(nameB);
                  });

                  return sortedFlowIds.map(flowId => {
                    const operations = opsByFlow[flowId];
                    const parentFlow = sourceFlows.find(f => f.id === flowId);
                    const isCollapsed = collapsedFlows.has(flowId);
                    
                    return (
                      <div key={flowId}>
                        {/* Flow Header */}
                        <div 
                          style={{
                            padding: '0.75rem 1rem',
                            backgroundColor: '#f8fafc',
                            borderBottom: '2px solid #e5e7eb',
                            fontWeight: '600',
                            fontSize: '0.875rem',
                            color: '#1e293b',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            userSelect: 'none',
                            transition: 'background-color 0.2s'
                          }}
                        >
                          <span 
                            onClick={() => {
                              setCollapsedFlows(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(flowId)) {
                                  newSet.delete(flowId);
                                } else {
                                  newSet.add(flowId);
                                }
                                return newSet;
                              });
                            }}
                            style={{ 
                              fontSize: '0.75rem',
                              transition: 'transform 0.2s',
                              transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                              display: 'inline-block',
                              cursor: 'pointer'
                            }}
                          >
                            ▼
                          </span>
                          <span 
                            onClick={() => {
                              setCollapsedFlows(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(flowId)) {
                                  newSet.delete(flowId);
                                } else {
                                  newSet.add(flowId);
                                }
                                return newSet;
                              });
                            }}
                            style={{ 
                              flex: 1,
                              cursor: 'pointer'
                            }}
                          >
                            {parentFlow?.name || 'Unknown Flow'}
                          </span>
                          <span style={{ 
                            fontSize: '0.75rem', 
                            color: '#6b7280',
                            fontWeight: '400'
                          }}>
                            ({operations.length} operation{operations.length !== 1 ? 's' : ''})
                          </span>
                        </div>
                        
                        {/* Operations in this flow */}
                        {!isCollapsed && operations.map(operation => {
                          const existsInTarget = targetOperations.some(to => to.id === operation.id);
                          const isNew = !existsInTarget;
                          
                          return (
                            <div
                              key={operation.id}
                              style={{
                                padding: '1rem',
                                paddingLeft: '2rem',
                                borderBottom: '1px solid #f3f4f6',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1rem',
                                backgroundColor: 'white'
                              }}
                            >
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                  <span style={{ fontWeight: '600' }}>
                                    {operation.name || operation.key}
                                  </span>
                                  {loadingTarget ? (
                                    <span style={{
                                      fontSize: '0.75rem',
                                      padding: '0.125rem 0.5rem',
                                      borderRadius: '9999px',
                                      backgroundColor: '#f3f4f6',
                                      color: '#6b7280'
                                    }}>
                                      Checking...
                                    </span>
                                  ) : (
                                    <span style={{
                                      fontSize: '0.75rem',
                                      padding: '0.125rem 0.5rem',
                                      borderRadius: '9999px',
                                      fontWeight: '500',
                                      backgroundColor: isNew ? '#dbeafe' : '#fef3c7',
                                      color: isNew ? '#1e40af' : '#92400e'
                                    }}>
                                      {isNew ? 'New' : 'Existing'}
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                                  Type: {operation.key} • Position: ({operation.position_x}, {operation.position_y})
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

          </>
        )}
      </div>
    </div>
  );
}
