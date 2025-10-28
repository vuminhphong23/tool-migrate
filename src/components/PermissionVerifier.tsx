import React, { useState } from 'react';
import { DirectusClient } from '../lib/DirectusClient';

interface PermissionVerifierProps {
  targetUrl: string;
  targetToken: string;
  isVisible: boolean;
  onClose: () => void;
  onStatusUpdate: (status: { type: 'success' | 'error' | 'info' | 'warning'; message: string }) => void;
}

interface PermissionInfo {
  id: number;
  collection: string;
  action: string;
  policy: string | null;
  permissions: any;
  validation: any;
  presets: any;
  fields: string[] | null;
}

export function PermissionVerifier({ 
  targetUrl, 
  targetToken, 
  isVisible, 
  onClose, 
  onStatusUpdate 
}: PermissionVerifierProps) {
  const [loading, setLoading] = useState(false);
  const [permissions, setPermissions] = useState<PermissionInfo[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCollection, setFilterCollection] = useState('');
  const [filterAction, setFilterAction] = useState('');

  const loadPermissions = async () => {
    setLoading(true);
    try {
      const client = new DirectusClient(targetUrl, targetToken);
      const response = await client.get('/permissions', { params: { limit: -1 } });
      const permissionsData = response.data || response || [];
      
      setPermissions(permissionsData);
      onStatusUpdate({
        type: 'success',
        message: `Loaded ${permissionsData.length} permissions from target instance`
      });
    } catch (error: any) {
      onStatusUpdate({
        type: 'error',
        message: `Failed to load permissions: ${error.message}`
      });
    } finally {
      setLoading(false);
    }
  };

  const getUniqueCollections = () => {
    return [...new Set(permissions.map(p => p.collection))].sort();
  };

  const getUniqueActions = () => {
    return [...new Set(permissions.map(p => p.action))].sort();
  };

  const getFilteredPermissions = () => {
    return permissions.filter(permission => {
      const matchesSearch = !searchTerm || 
        permission.collection.toLowerCase().includes(searchTerm.toLowerCase()) ||
        permission.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (permission.policy && permission.policy.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesCollection = !filterCollection || permission.collection === filterCollection;
      const matchesAction = !filterAction || permission.action === filterAction;
      
      return matchesSearch && matchesCollection && matchesAction;
    });
  };

  const exportPermissions = () => {
    const filtered = getFilteredPermissions();
    const csv = [
      'ID,Collection,Action,Policy,Fields,Has Permissions,Has Validation,Has Presets',
      ...filtered.map(p => [
        p.id,
        p.collection,
        p.action,
        p.policy || 'None',
        p.fields ? p.fields.join(';') : 'All',
        p.permissions ? 'Yes' : 'No',
        p.validation ? 'Yes' : 'No',
        p.presets ? 'Yes' : 'No'
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `permissions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
        padding: '2rem',
        borderRadius: '8px',
        maxWidth: '1000px',
        width: '90%',
        maxHeight: '80vh',
        overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, color: '#059669' }}>🔑 Permission Verifier</h2>
          <button
            onClick={onClose}
            style={{
              backgroundColor: '#6b7280',
              color: 'white',
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>

        {/* Controls */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <button
              onClick={loadPermissions}
              disabled={loading}
              style={{
                backgroundColor: '#3b82f6',
                color: 'white',
                padding: '0.75rem 1.5rem',
                border: 'none',
                borderRadius: '6px',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1
              }}
            >
              {loading ? 'Loading...' : 'Load Permissions'}
            </button>
            
            {permissions.length > 0 && (
              <button
                onClick={exportPermissions}
                style={{
                  backgroundColor: '#10b981',
                  color: 'white',
                  padding: '0.75rem 1.5rem',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Export CSV
              </button>
            )}
          </div>

          {/* Filters */}
          {permissions.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <input
                type="text"
                placeholder="Search permissions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px'
                }}
              />
              
              <select
                value={filterCollection}
                onChange={(e) => setFilterCollection(e.target.value)}
                style={{
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px'
                }}
              >
                <option value="">All Collections</option>
                {getUniqueCollections().map(collection => (
                  <option key={collection} value={collection}>{collection}</option>
                ))}
              </select>
              
              <select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                style={{
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px'
                }}
              >
                <option value="">All Actions</option>
                {getUniqueActions().map(action => (
                  <option key={action} value={action}>{action}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Summary */}
        {permissions.length > 0 && (
          <div style={{ 
            backgroundColor: '#f0f9ff', 
            padding: '1rem', 
            borderRadius: '6px', 
            marginBottom: '1.5rem',
            border: '1px solid #0ea5e9'
          }}>
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#0369a1' }}>📊 Summary</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', fontSize: '0.875rem' }}>
              <div>
                <strong>Total Permissions:</strong> {permissions.length}
              </div>
              <div>
                <strong>Collections:</strong> {getUniqueCollections().length}
              </div>
              <div>
                <strong>Actions:</strong> {getUniqueActions().length}
              </div>
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
              <strong>Filtered Results:</strong> {getFilteredPermissions().length}
            </div>
          </div>
        )}

        {/* Permissions List */}
        {permissions.length > 0 && (
          <div style={{ 
            border: '1px solid #e5e7eb', 
            borderRadius: '6px', 
            maxHeight: '400px', 
            overflowY: 'auto' 
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ backgroundColor: '#f9fafb', position: 'sticky', top: 0 }}>
                <tr>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>ID</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Collection</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Action</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Policy</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Fields</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Rules</th>
                </tr>
              </thead>
              <tbody>
                {getFilteredPermissions().map(permission => (
                  <tr key={permission.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>{permission.id}</td>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem', fontWeight: '500' }}>
                      {permission.collection}
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                      <span style={{
                        backgroundColor: '#dbeafe',
                        color: '#1e40af',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '12px',
                        fontSize: '0.75rem'
                      }}>
                        {permission.action}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                      {permission.policy ? (
                        <span style={{
                          backgroundColor: '#dcfce7',
                          color: '#166534',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '12px',
                          fontSize: '0.75rem'
                        }}>
                          {permission.policy}
                        </span>
                      ) : (
                        <span style={{
                          backgroundColor: '#fee2e2',
                          color: '#dc2626',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '12px',
                          fontSize: '0.75rem'
                        }}>
                          No Policy
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                      {permission.fields ? (
                        permission.fields.length > 3 ? 
                          `${permission.fields.slice(0, 3).join(', ')}...` : 
                          permission.fields.join(', ')
                      ) : (
                        <span style={{ color: '#6b7280', fontStyle: 'italic' }}>All fields</span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        {permission.permissions && (
                          <span style={{
                            backgroundColor: '#fef3c7',
                            color: '#92400e',
                            padding: '0.125rem 0.25rem',
                            borderRadius: '4px',
                            fontSize: '0.625rem'
                          }}>
                            P
                          </span>
                        )}
                        {permission.validation && (
                          <span style={{
                            backgroundColor: '#e0e7ff',
                            color: '#3730a3',
                            padding: '0.125rem 0.25rem',
                            borderRadius: '4px',
                            fontSize: '0.625rem'
                          }}>
                            V
                          </span>
                        )}
                        {permission.presets && (
                          <span style={{
                            backgroundColor: '#f3e8ff',
                            color: '#6b21a8',
                            padding: '0.125rem 0.25rem',
                            borderRadius: '4px',
                            fontSize: '0.625rem'
                          }}>
                            PR
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {permissions.length === 0 && !loading && (
          <div style={{ 
            textAlign: 'center', 
            padding: '2rem',
            color: '#6b7280'
          }}>
            Click "Load Permissions" to verify migrated permissions
          </div>
        )}
      </div>
    </div>
  );
}
