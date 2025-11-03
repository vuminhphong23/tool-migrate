import React, { useState, useEffect } from 'react'
import { analyzeCollectionDependencies, formatDependencyInfo, type CollectionDependency, type MigrationOrder } from '../lib/dependencyAnalyzer'

interface MigrationOrderManagerProps {
  collections: any[]
  relations: any[]
  onClose: () => void
  onStartMigration: (orderedCollections: string[]) => void
}

export function MigrationOrderManager({
  collections,
  relations,
  onClose,
  onStartMigration
}: MigrationOrderManagerProps) {
  const [migrationOrder, setMigrationOrder] = useState<MigrationOrder | null>(null)
  const [customOrder, setCustomOrder] = useState<string[]>([])
  const [useCustomOrder, setUseCustomOrder] = useState(false)
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null)

  useEffect(() => {
    // Analyze dependencies on mount
    const analysis = analyzeCollectionDependencies(collections, relations)
    setMigrationOrder(analysis)
    setCustomOrder(analysis.collections)
  }, [collections, relations])

  if (!migrationOrder) {
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
        <div style={{ color: 'white', fontSize: '1.25rem' }}>
          Analyzing dependencies...
        </div>
      </div>
    )
  }

  const moveUp = (index: number) => {
    if (index === 0) return
    const newOrder = [...customOrder]
    ;[newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]]
    setCustomOrder(newOrder)
    setUseCustomOrder(true)
  }

  const moveDown = (index: number) => {
    if (index === customOrder.length - 1) return
    const newOrder = [...customOrder]
    ;[newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]]
    setCustomOrder(newOrder)
    setUseCustomOrder(true)
  }

  const resetToSuggested = () => {
    setCustomOrder(migrationOrder.collections)
    setUseCustomOrder(false)
  }

  const handleStartMigration = () => {
    onStartMigration(useCustomOrder ? customOrder : migrationOrder.collections)
  }

  const getDependencyInfo = (collection: string): CollectionDependency | undefined => {
    return migrationOrder.dependencies.get(collection)
  }

  const getLevelColor = (level: number): string => {
    const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#ef4444']
    return colors[level % colors.length]
  }

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
      zIndex: 1000,
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        maxWidth: '1000px',
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600', color: '#111827' }}>
              🔄 Migration Order Manager
            </h2>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
              {collections.length} collections | {relations.length} relationships detected
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0.5rem'
            }}
          >
            ✕
          </button>
        </div>

        {/* Migration Order List */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem 1.5rem'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {customOrder.map((collection, index) => {
              const dep = getDependencyInfo(collection)
              const isSelected = selectedCollection === collection
              
              return (
                <div
                  key={collection}
                  onClick={() => setSelectedCollection(isSelected ? null : collection)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '1rem',
                    border: isSelected ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                    borderRadius: '8px',
                    backgroundColor: isSelected ? '#eff6ff' : 'white',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  {/* Order Number */}
                  <div style={{
                    minWidth: '2.5rem',
                    height: '2.5rem',
                    borderRadius: '50%',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: '600',
                    fontSize: '0.875rem'
                  }}>
                    {index + 1}
                  </div>

                  {/* Collection Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: '600',
                      fontSize: '0.875rem',
                      color: '#111827',
                      marginBottom: '0.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      {collection}
                      {dep && (
                        <span style={{
                          padding: '0.125rem 0.5rem',
                          borderRadius: '9999px',
                          backgroundColor: getLevelColor(dep.level),
                          color: 'white',
                          fontSize: '0.75rem',
                          fontWeight: '500'
                        }}>
                          Level {dep.level}
                        </span>
                      )}
                    </div>
                    {dep && (
                      <div style={{
                        fontSize: '0.75rem',
                        color: '#6b7280',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {formatDependencyInfo(dep)}
                      </div>
                    )}
                  </div>

                  {/* Move Buttons */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        moveUp(index)
                      }}
                      disabled={index === 0}
                      style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: index === 0 ? '#f3f4f6' : '#3b82f6',
                        color: index === 0 ? '#9ca3af' : 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: index === 0 ? 'not-allowed' : 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: '600'
                      }}
                    >
                      ▲
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        moveDown(index)
                      }}
                      disabled={index === customOrder.length - 1}
                      style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: index === customOrder.length - 1 ? '#f3f4f6' : '#3b82f6',
                        color: index === customOrder.length - 1 ? '#9ca3af' : 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: index === customOrder.length - 1 ? 'not-allowed' : 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: '600'
                      }}
                    >
                      ▼
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {useCustomOrder && (
              <button
                onClick={resetToSuggested}
                style={{
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  padding: '0.625rem 1.25rem',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}
              >
                🔄 Reset to Suggested
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={onClose}
              style={{
                backgroundColor: '#f3f4f6',
                color: '#374151',
                padding: '0.625rem 1.25rem',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleStartMigration}
              style={{
                backgroundColor: '#10b981',
                color: 'white',
                padding: '0.625rem 1.25rem',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '600',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
              }}
            >
              🚀 Start Migration ({customOrder.length} collections)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
