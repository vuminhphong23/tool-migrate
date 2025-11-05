import React, { useState, useEffect } from 'react'

interface ItemSelectorModalProps {
  collectionName: string
  items: any[]
  total: number
  selectedIds: (string | number)[]
  onSelectionChange: (ids: (string | number)[]) => void
  onClose: () => void
  onImport: (selectedFields?: string[]) => void  // Add selectedFields param
  onLoadMore: () => void
  hasMore: boolean
  loading: boolean
  relations?: any[] // Optional: for showing dependency notes
}

export function ItemSelectorModal({
  collectionName,
  items,
  total,
  selectedIds,
  onSelectionChange,
  onClose,
  onImport,
  onLoadMore,
  hasMore,
  loading,
  relations = []
}: ItemSelectorModalProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectAll, setSelectAll] = useState(false)
  const [selectedFields, setSelectedFields] = useState<string[]>([])
  const [availableFields, setAvailableFields] = useState<{field: string, isM2M: boolean}[]>([])
  const [showFieldSelector, setShowFieldSelector] = useState(false)

  // Extract available fields from items
  useEffect(() => {
    if (items.length > 0) {
      const firstItem = items[0]
      const fields: {field: string, isM2M: boolean}[] = []
      const systemFields = ['id', 'date_created', 'date_updated', 'user_created', 'user_updated']
      
      Object.keys(firstItem).forEach(key => {
        if (systemFields.includes(key)) return
        
        const value = firstItem[key]
        let isRelationField = false
        
        // Check if this field has a relation definition in schema
        if (relations && relations.length > 0) {
          // M2O: This collection has a foreign key field pointing to another collection
          const hasM2O = relations.some((rel: any) => 
            rel.collection === collectionName && rel.field === key
          )
          
          // O2M: Another collection points to this one, and we have the reverse field
          const hasO2M = relations.some((rel: any) => 
            rel.related_collection === collectionName && 
            rel.meta?.one_field === key
          )
          
          // M2M: This is part of a many-to-many via junction table
          const hasM2M = relations.some((rel: any) => 
            (rel.collection === collectionName && rel.meta?.junction_field) ||
            (rel.related_collection === collectionName && rel.meta?.junction_field)
          )
          
          if (hasM2O || hasO2M || hasM2M) {
            isRelationField = true
          }
        }
        
        // Fallback: Detect by value structure when no relations metadata
        if (!isRelationField) {
          // Arrays often indicate O2M or M2M relationships
          if (Array.isArray(value) && value.length > 0) {
            // M2A has structure: [{collection: 'xxx', item: 'yyy'}, ...]
            if (value[0]?.collection && (value[0]?.item !== undefined)) {
              isRelationField = true // M2A
            } 
            // Regular array of IDs or objects indicates O2M/M2M
            else if (typeof value[0] === 'string' || typeof value[0] === 'number' || typeof value[0] === 'object') {
              isRelationField = true
            }
          }
        }
        
        fields.push({ field: key, isM2M: isRelationField })
      })
      
      setAvailableFields(fields)
    }
  }, [items, relations, collectionName])

  // Filter items based on search
  const filteredItems = items.filter(item => {
    if (!searchTerm) return true
    const searchLower = searchTerm.toLowerCase()
    
    // Search in common fields
    const searchableText = [
      item.id,
      item.title,
      item.name,
      item.email,
      item.status,
      JSON.stringify(item)
    ].join(' ').toLowerCase()
    
    return searchableText.includes(searchLower)
  })

  const handleToggleItem = (id: string | number) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(selectedId => selectedId !== id))
    } else {
      onSelectionChange([...selectedIds, id])
    }
  }

  const handleSelectAll = () => {
    if (selectAll) {
      onSelectionChange([])
    } else {
      onSelectionChange(filteredItems.map(item => item.id))
    }
    setSelectAll(!selectAll)
  }

  // Update selectAll state when selection changes
  useEffect(() => {
    setSelectAll(filteredItems.length > 0 && filteredItems.every(item => selectedIds.includes(item.id)))
  }, [selectedIds, filteredItems])

  // Get display value for an item
  const getItemDisplayText = (item: any): string => {
    // Try common display fields
    return item.title || item.name || item.email || item.label || `Item ${item.id}`
  }

  // Get item preview (first few fields)
  const getItemPreview = (item: any): string => {
    const excludeKeys = ['id', 'date_created', 'date_updated', 'user_created', 'user_updated']
    const previewKeys = Object.keys(item)
      .filter(key => !excludeKeys.includes(key))
      .slice(0, 3)
    
    return previewKeys
      .map(key => {
        const value = item[key]
        if (typeof value === 'object') return `${key}: [object]`
        if (typeof value === 'string' && value.length > 50) return `${key}: ${value.substring(0, 50)}...`
        return `${key}: ${value}`
      })
      .join(', ')
  }

  // Get missing dependencies for an item
  const getItemDependencies = (item: any): Array<{ field: string; collection: string; value: any }> => {
    if (!relations || relations.length === 0) return []
    
    const missingDeps: Array<{ field: string; collection: string; value: any }> = []
    
    relations.forEach((relation: any) => {
      // M2O: Many-to-One (current collection → related collection)
      if (relation.collection === collectionName && relation.related_collection) {
        const fieldName = relation.field
        const relatedCollection = relation.related_collection
        
        // Check if item has a value for this FK field
        const value = item[fieldName]
        if (value !== null && value !== undefined) {
          missingDeps.push({
            field: fieldName,
            collection: relatedCollection,
            value: value
          })
        }
      }
      
      // O2M: One-to-Many (check reverse relation)
      if (relation.related_collection === collectionName && relation.meta?.one_field) {
        const fieldName = relation.meta.one_field
        const relatedCollection = relation.collection
        
        const value = item[fieldName]
        if (Array.isArray(value) && value.length > 0) {
          missingDeps.push({
            field: fieldName,
            collection: relatedCollection,
            value: value
          })
        }
      }
      
      // M2M: Many-to-Many (through junction table)
      if (relation.meta?.junction_field === collectionName) {
        const fieldName = relation.field
        const junctionCollection = relation.collection
        
        const value = item[fieldName]
        if (Array.isArray(value) && value.length > 0) {
          missingDeps.push({
            field: fieldName,
            collection: junctionCollection,
            value: value
          })
        }
      }
    })
    
    // M2A: Many-to-Any (special case - array of {collection, item})
    Object.keys(item).forEach(key => {
      const value = item[key]
      if (Array.isArray(value) && value.length > 0) {
        // Check if it's M2A structure
        if (value[0]?.collection && value[0]?.item) {
          // Each item in M2A can reference different collections
          const collections = [...new Set(value.map((v: any) => v.collection))]
          collections.forEach(col => {
            missingDeps.push({
              field: key,
              collection: col,
              value: value.filter((v: any) => v.collection === col).map((v: any) => v.item)
            })
          })
        }
      }
    })
    
    return missingDeps
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
        maxWidth: '900px',
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
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
              Select Items to Migrate
            </h2>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
              Collection: <strong>{collectionName}</strong> | Total: {total} items | Selected: {selectedIds.length}
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
              padding: '0.5rem',
              lineHeight: 1
            }}
          >
            ✕
          </button>
        </div>

        {/* Field Selector */}
        <div style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb'
        }}>
          <button
            onClick={() => setShowFieldSelector(!showFieldSelector)}
            style={{
              backgroundColor: 'white',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            🔧 Select Fields to Migrate
            {selectedFields.length > 0 && ` (${selectedFields.length} selected)`}
            <span style={{ marginLeft: 'auto' }}>{showFieldSelector ? '▲' : '▼'}</span>
          </button>

          {showFieldSelector && (
            <div style={{
              marginTop: '0.75rem',
              padding: '1rem',
              backgroundColor: 'white',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              maxHeight: '300px',
              overflowY: 'auto'
            }}>
              <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => setSelectedFields(availableFields.map(f => f.field))}
                  style={{
                    padding: '0.375rem 0.75rem',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.75rem'
                  }}
                >
                  Select All
                </button>
                <button
                  onClick={() => setSelectedFields([])}
                  style={{
                    padding: '0.375rem 0.75rem',
                    backgroundColor: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.75rem'
                  }}
                >
                  Clear All
                </button>
                <button
                  onClick={() => setSelectedFields(availableFields.filter(f => !f.isM2M).map(f => f.field))}
                  style={{
                    padding: '0.375rem 0.75rem',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.75rem'
                  }}
                >
                  Only Regular Fields
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {availableFields.map(({field, isM2M}) => (
                  <label
                    key={field}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem',
                      backgroundColor: isM2M ? '#fef3c7' : '#f3f4f6',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFields.includes(field)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedFields([...selectedFields, field])
                        } else {
                          setSelectedFields(selectedFields.filter(f => f !== field))
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                      {field}
                      {isM2M && <span style={{ marginLeft: '0.5rem', color: '#f59e0b', fontSize: '0.75rem' }}>🔗 Relation</span>}
                    </span>
                  </label>
                ))}
              </div>

              {selectedFields.length === 0 && (
                <div style={{
                  marginTop: '0.75rem',
                  padding: '0.75rem',
                  backgroundColor: '#eff6ff',
                  borderLeft: '3px solid #3b82f6',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  color: '#1e40af'
                }}>
                  ℹ️ No fields selected = Migrate all fields (default behavior)
                </div>
              )}
            </div>
          )}
        </div>

        {/* Search and Select All */}
        <div style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          gap: '1rem',
          alignItems: 'center'
        }}>
          <input
            type="text"
            placeholder="Search items..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.875rem'
            }}
          />
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '500',
            whiteSpace: 'nowrap'
          }}>
            <input
              type="checkbox"
              checked={selectAll}
              onChange={handleSelectAll}
              style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
            />
            Select All ({filteredItems.length})
          </label>
        </div>

        {/* Items List */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem 1.5rem'
        }}>
          {/* Showing X of Y info */}
          {!loading && items.length > 0 && (
            <div style={{ 
              marginBottom: '1rem', 
              padding: '0.75rem',
              backgroundColor: searchTerm ? '#fef3c7' : '#f0fdf4',
              borderRadius: '6px',
              fontSize: '0.875rem',
              color: '#374151',
              fontWeight: '500',
              textAlign: 'center',
              border: searchTerm ? '1px solid #fbbf24' : '1px solid #86efac'
            }}>
              {searchTerm ? (
                <>
                  Found {filteredItems.length} of {items.length} items matching "{searchTerm}"
                </>
              ) : (
                <>
                  ✅ All {items.length} items loaded
                  {items.length !== total && (
                    <span style={{ color: '#dc2626', marginLeft: '0.5rem' }}>
                      (Expected {total}, got {items.length})
                    </span>
                  )}
                </>
              )}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
              Loading items...
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
              No items found
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {filteredItems.map((item) => (
                  <label
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.75rem',
                      padding: '0.75rem',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      backgroundColor: selectedIds.includes(item.id) ? '#eff6ff' : 'white',
                      transition: 'all 0.15s'
                    }}
                    onMouseEnter={(e) => {
                      if (!selectedIds.includes(item.id)) {
                        e.currentTarget.style.backgroundColor = '#f9fafb'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!selectedIds.includes(item.id)) {
                        e.currentTarget.style.backgroundColor = 'white'
                      }
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() => handleToggleItem(item.id)}
                      style={{ 
                        width: '1rem', 
                        height: '1rem', 
                        cursor: 'pointer',
                        marginTop: '0.125rem',
                        flexShrink: 0
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ 
                        fontWeight: '500', 
                        color: '#111827',
                        fontSize: '0.875rem',
                        marginBottom: '0.25rem'
                      }}>
                        ID: {item.id} - {getItemDisplayText(item)}
                      </div>
                      <div style={{ 
                        fontSize: '0.75rem', 
                        color: '#6b7280',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {getItemPreview(item)}
                      </div>
                      
                      {/* Item Dependencies Note */}
                      {(() => {
                        const deps = getItemDependencies(item)
                        if (deps.length > 0) {
                          return (
                            <div style={{
                              marginTop: '0.5rem',
                              padding: '0.375rem 0.5rem',
                              backgroundColor: '#fef3c7',
                              borderLeft: '3px solid #f59e0b',
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              color: '#92400e'
                            }}>
                              <strong>⚠️ Needs:</strong>{' '}
                              {deps.map((dep, idx) => (
                                <span key={idx}>
                                  {dep.collection} (ID: {dep.value})
                                  {idx < deps.length - 1 ? ', ' : ''}
                                </span>
                              ))}
                            </div>
                          )
                        }
                        return null
                      })()}
                    </div>
                  </label>
                ))}
              </div>

              {/* Load More Button - Only show when NOT searching */}
              {!searchTerm && hasMore && (
                <div style={{ 
                  marginTop: '1rem', 
                  padding: '1rem',
                  textAlign: 'center',
                  backgroundColor: '#eff6ff',
                  borderRadius: '8px',
                  border: '2px dashed #3b82f6'
                }}>
                  <div style={{ 
                    marginBottom: '0.5rem', 
                    fontSize: '0.875rem', 
                    color: '#1e40af',
                    fontWeight: '500'
                  }}>
                    {total - items.length} more items available
                  </div>
                  <button
                    onClick={onLoadMore}
                    style={{
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      padding: '0.625rem 1.5rem',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
                    }}
                  >
                    📥 Load More Items (Next 100)
                  </button>
                </div>
              )}
            </>
          )}
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
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            {selectedIds.length} item(s) selected
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
              onClick={() => {
                console.log('Selected fields:', selectedFields);
                onImport(selectedFields.length > 0 ? selectedFields : undefined);
              }}
              disabled={selectedIds.length === 0}
              style={{
                backgroundColor: selectedIds.length === 0 ? '#9ca3af' : '#3b82f6',
                color: 'white',
                padding: '0.625rem 1.25rem',
                border: 'none',
                borderRadius: '6px',
                cursor: selectedIds.length === 0 ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                opacity: selectedIds.length === 0 ? 0.6 : 1
              }}
            >
              Import Selected ({selectedIds.length})
              {selectedFields.length > 0 && ` - ${selectedFields.length} fields`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
