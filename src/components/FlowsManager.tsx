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
  const [selectedFlows, setSelectedFlows] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [migrationOptions, setMigrationOptions] = useState<FlowMigrationOptions>({
    preserveIds: true,
    validateReferences: true,
    transformOptions: false,
    conflictResolution: 'skip'
  });
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Load flows from source
  useEffect(() => {
    if (isVisible && sourceUrl && sourceToken) {
      loadSourceFlows();
    }
  }, [isVisible, sourceUrl, sourceToken]);

  const loadSourceFlows = async () => {
    setLoading(true);
    try {
      const result = await getFlowsFromDirectus(sourceUrl, sourceToken);
      if (result.success) {
        setSourceFlows(result.flows || []);
        setSourceOperations(result.operations || []);
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

  const handleFlowSelection = (flowId: string, selected: boolean) => {
    if (selected) {
      setSelectedFlows(prev => [...prev, flowId]);
    } else {
      setSelectedFlows(prev => prev.filter(id => id !== flowId));
    }
  };

  const handleSelectAll = () => {
    if (selectedFlows.length === sourceFlows.length) {
      setSelectedFlows([]);
    } else {
      setSelectedFlows(sourceFlows.map(flow => flow.id));
    }
  };

  const validateMigration = () => {
    const selectedFlowObjects = sourceFlows.filter(flow => selectedFlows.includes(flow.id));
    const relatedOperations = sourceOperations.filter(op => selectedFlows.includes(op.flow));
    
    const validation = validateFlowMigration(selectedFlowObjects, relatedOperations, migrationOptions);
    
    if (validation.isValid) {
      onStatusUpdate({
        type: 'success',
        message: 'Flow validation passed! Ready for migration.'
      });
    } else {
      onStatusUpdate({
        type: 'error',
        message: `Validation failed: ${validation.errors.join(', ')}`
      });
    }

    if (validation.warnings.length > 0) {
      onStatusUpdate({
        type: 'info',
        message: `Warnings: ${validation.warnings.join(', ')}`
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

    // Validate first
    const validation = validateMigration();
    if (!validation.isValid && migrationOptions.validateReferences) {
      return;
    }

    setLoading(true);
    try {
      const result = await importFlowsToDirectus(
        selectedFlowObjects,
        relatedOperations,
        targetUrl,
        targetToken,
        migrationOptions
      );

      if (result.success) {
        onStatusUpdate({
          type: 'success',
          message: result.message
        });
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
    } finally {
      setLoading(false);
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
          <h2 style={{ margin: 0 }}>🔄 Flows Migration</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer'
            }}
          >
            ×
          </button>
        </div>

        {/* Source Flows List */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>Available Flows ({sourceFlows.length})</h3>
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
                {selectedFlows.length === sourceFlows.length ? 'Deselect All' : 'Select All'}
              </button>
              <button
                onClick={loadSourceFlows}
                style={{
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem'
                }}
                disabled={loading}
              >
                {loading ? 'Loading...' : 'Refresh'}
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
            ) : (
              sourceFlows.map(flow => {
                const operationCount = sourceOperations.filter(op => op.flow === flow.id).length;
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
                      <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                        {flow.icon && <span style={{ marginRight: '0.5rem' }}>{flow.icon}</span>}
                        {flow.name}
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
              })
            )}
          </div>
        </div>

        {/* Migration Options */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0 }}>Migration Options</h3>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                backgroundColor: 'transparent',
                color: '#3b82f6',
                border: '1px solid #3b82f6',
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem'
              }}
            >
              {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={migrationOptions.preserveIds}
                onChange={(e) => setMigrationOptions(prev => ({ ...prev, preserveIds: e.target.checked }))}
              />
              <span>Preserve original IDs</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={migrationOptions.validateReferences}
                onChange={(e) => setMigrationOptions(prev => ({ ...prev, validateReferences: e.target.checked }))}
              />
              <span>Validate references</span>
            </label>

            {showAdvanced && (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={migrationOptions.transformOptions}
                    onChange={(e) => setMigrationOptions(prev => ({ ...prev, transformOptions: e.target.checked }))}
                  />
                  <span>Transform environment options</span>
                </label>

                <div>
                  <label style={{ fontSize: '0.875rem', marginBottom: '0.25rem', display: 'block' }}>
                    Conflict Resolution:
                  </label>
                  <select
                    value={migrationOptions.conflictResolution}
                    onChange={(e) => setMigrationOptions(prev => ({ 
                      ...prev, 
                      conflictResolution: e.target.value as 'skip' | 'overwrite' | 'rename' 
                    }))}
                    style={{ width: '100%', padding: '0.5rem' }}
                  >
                    <option value="skip">Skip existing</option>
                    <option value="overwrite">Overwrite existing</option>
                    <option value="rename">Rename conflicts</option>
                  </select>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          <button
            onClick={validateMigration}
            style={{
              backgroundColor: '#f59e0b',
              color: 'white',
              padding: '0.75rem 1.5rem',
              fontWeight: '500'
            }}
            disabled={loading || selectedFlows.length === 0}
          >
            Validate Migration
          </button>
          
          <button
            onClick={executeMigration}
            style={{
              backgroundColor: '#10b981',
              color: 'white',
              padding: '0.75rem 1.5rem',
              fontWeight: '500'
            }}
            disabled={loading || selectedFlows.length === 0}
          >
            {loading ? 'Migrating...' : `Migrate ${selectedFlows.length} Flow${selectedFlows.length !== 1 ? 's' : ''}`}
          </button>
        </div>

        {/* Info */}
        <div style={{
          marginTop: '1rem',
          padding: '0.75rem',
          backgroundColor: '#fffbeb',
          borderRadius: '6px',
          fontSize: '0.875rem',
          color: '#92400e'
        }}>
          <strong>⚠️ Important:</strong> Flow migration is experimental. Always backup your target instance before proceeding.
          Flows with complex operations or environment-specific configurations may require manual adjustment.
        </div>
      </div>
    </div>
  );
}
