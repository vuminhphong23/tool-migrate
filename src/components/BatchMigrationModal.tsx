import React from 'react';
import type { DependencyGraph, MigrationOrder } from '../lib/dependencyAnalyzer';

interface BatchMigrationModalProps {
  isVisible: boolean;
  onClose: () => void;
  migrationOrder: MigrationOrder | null;
  dependencyGraph: DependencyGraph | null;
  customOrder: string[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  onStartMigration: () => void;
  progress: {
    current: number;
    total: number;
    currentCollection: string;
    status: 'idle' | 'running' | 'completed' | 'failed';
    results: Array<{ collection: string; success: boolean; message: string }>;
  };
}

export function BatchMigrationModal({
  isVisible,
  onClose,
  migrationOrder,
  dependencyGraph,
  customOrder,
  onReorder,
  onStartMigration,
  progress
}: BatchMigrationModalProps) {
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
        borderRadius: '12px',
        padding: '2rem',
        maxWidth: '800px',
        width: '90%',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700', color: '#111827' }}>
            🔄 Smart Batch Migration
          </h2>
          <button
            onClick={() => {
              if (progress.status === 'running') {
                if (confirm('Migration is in progress. Are you sure you want to close?')) {
                  onClose();
                }
              } else {
                onClose();
              }
            }}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0.25rem'
            }}
            disabled={progress.status === 'running'}
          >
            ✕
          </button>
        </div>

        {/* Migration Order Section */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem', color: '#374151' }}>
            Migration Order
          </h3>
          
          {migrationOrder && migrationOrder.warnings.length > 0 && (
            <div style={{
              backgroundColor: '#fef3c7',
              border: '1px solid #fde68a',
              borderRadius: '6px',
              padding: '0.75rem',
              marginBottom: '1rem'
            }}>
              <div style={{ fontWeight: '600', color: '#d97706', marginBottom: '0.5rem' }}>⚠️ Warnings:</div>
              {migrationOrder.warnings.map((warning, index) => (
                <div key={index} style={{ fontSize: '0.875rem', color: '#92400e', marginBottom: '0.25rem' }}>
                  • {warning}
                </div>
              ))}
            </div>
          )}

          {migrationOrder && migrationOrder.cycles.length > 0 && (
            <div style={{
              backgroundColor: '#fee2e2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              padding: '0.75rem',
              marginBottom: '1rem'
            }}>
              <div style={{ fontWeight: '600', color: '#dc2626', marginBottom: '0.5rem' }}>
                ⚠️ Circular Dependencies Detected:
              </div>
              {migrationOrder.cycles.map((cycle, index) => (
                <div key={index} style={{ fontSize: '0.875rem', color: '#991b1b', marginBottom: '0.25rem' }}>
                  • {cycle.join(' → ')}
                </div>
              ))}
              <div style={{ fontSize: '0.875rem', color: '#991b1b', marginTop: '0.5rem', fontStyle: 'italic' }}>
                You may need to manually reorder collections or migrate in multiple passes.
              </div>
            </div>
          )}

          <div style={{
            backgroundColor: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            padding: '1rem'
          }}>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem' }}>
              Use ▲ ▼ buttons to reorder. Collections will be migrated in this order:
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {customOrder.map((collectionName, index) => {
                const deps = dependencyGraph?.[collectionName]?.dependsOn || [];
                const filteredDeps = deps.filter(dep => customOrder.includes(dep));
                
                return (
                  <div
                    key={collectionName}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem',
                      backgroundColor: 'white',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px'
                    }}
                  >
                    <div style={{ 
                      fontWeight: '600', 
                      color: '#6b7280',
                      minWidth: '2rem',
                      textAlign: 'center'
                    }}>
                      {index + 1}
                    </div>
                    
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', color: '#111827' }}>
                        {collectionName}
                      </div>
                      {filteredDeps.length > 0 && (
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                          Depends on: {filteredDeps.join(', ')}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button
                        onClick={() => onReorder(index, Math.max(0, index - 1))}
                        disabled={index === 0 || progress.status === 'running'}
                        style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.875rem',
                          backgroundColor: index === 0 ? '#f3f4f6' : 'white',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          cursor: index === 0 || progress.status === 'running' ? 'not-allowed' : 'pointer',
                          opacity: index === 0 ? 0.5 : 1
                        }}
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => onReorder(index, Math.min(customOrder.length - 1, index + 1))}
                        disabled={index === customOrder.length - 1 || progress.status === 'running'}
                        style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.875rem',
                          backgroundColor: index === customOrder.length - 1 ? '#f3f4f6' : 'white',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          cursor: index === customOrder.length - 1 || progress.status === 'running' ? 'not-allowed' : 'pointer',
                          opacity: index === customOrder.length - 1 ? 0.5 : 1
                        }}
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Progress Section */}
        {progress.status !== 'idle' && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem', color: '#374151' }}>
              Migration Progress
            </h3>
            
            <div style={{
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              padding: '1rem'
            }}>
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151' }}>
                    {progress.currentCollection || 'Preparing...'}
                  </span>
                  <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#6b7280' }}>
                    {progress.current} / {progress.total}
                  </span>
                </div>
                <div style={{
                  width: '100%',
                  height: '8px',
                  backgroundColor: '#e5e7eb',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${(progress.current / progress.total) * 100}%`,
                    height: '100%',
                    backgroundColor: progress.status === 'completed' ? '#10b981' : '#3b82f6',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>

              {progress.results.length > 0 && (
                <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                  {progress.results.map((result, index) => (
                    <div
                      key={index}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem',
                        fontSize: '0.875rem',
                        borderBottom: index < progress.results.length - 1 ? '1px solid #e5e7eb' : 'none'
                      }}
                    >
                      <span style={{ fontSize: '1rem' }}>
                        {result.success ? '✅' : '❌'}
                      </span>
                      <span style={{ fontWeight: '600', color: '#374151' }}>
                        {result.collection}:
                      </span>
                      <span style={{ color: '#6b7280' }}>
                        {result.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={progress.status === 'running'}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '0.875rem',
              fontWeight: '500',
              backgroundColor: 'white',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: progress.status === 'running' ? 'not-allowed' : 'pointer',
              color: '#374151',
              opacity: progress.status === 'running' ? 0.5 : 1
            }}
          >
            {progress.status === 'completed' ? 'Close' : 'Cancel'}
          </button>
          
          <button
            onClick={onStartMigration}
            disabled={progress.status === 'running' || customOrder.length === 0}
            style={{
              padding: '0.75rem 1.5rem',
              fontSize: '0.875rem',
              fontWeight: '500',
              backgroundColor: progress.status === 'running' ? '#9ca3af' : '#dc2626',
              border: 'none',
              borderRadius: '6px',
              cursor: progress.status === 'running' || customOrder.length === 0 ? 'not-allowed' : 'pointer',
              color: 'white',
              opacity: progress.status === 'running' || customOrder.length === 0 ? 0.5 : 1
            }}
          >
            {progress.status === 'running' 
              ? `Migrating... (${progress.current}/${progress.total})`
              : progress.status === 'completed'
              ? 'Migration Complete'
              : `Start Migration (${customOrder.length} collections)`
            }
          </button>
        </div>
      </div>
    </div>
  );
}
