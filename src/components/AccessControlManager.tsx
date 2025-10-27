import React, { useState, useEffect } from 'react';
import { 
  fetchAccessControlData, 
  analyzeAccessControlData, 
  importAccessControlData,
  type AccessControlMigrationOptions,
  type AccessControlAnalysis,
  type DirectusRole,
  type DirectusPolicy,
  type DirectusPermission
} from '../lib/accessControlHandler';

interface AccessControlManagerProps {
  sourceUrl: string;
  sourceToken: string;
  targetUrl: string;
  targetToken: string;
  isVisible: boolean;
  onClose: () => void;
  onStatusUpdate: (status: { type: 'success' | 'error' | 'info' | 'warning'; message: string }) => void;
}

export function AccessControlManager({ 
  sourceUrl, 
  sourceToken, 
  targetUrl, 
  targetToken, 
  isVisible, 
  onClose, 
  onStatusUpdate 
}: AccessControlManagerProps) {
  
  const [sourceRoles, setSourceRoles] = useState<DirectusRole[]>([]);
  const [sourcePolicies, setSourcePolicies] = useState<DirectusPolicy[]>([]);
  const [sourcePermissions, setSourcePermissions] = useState<DirectusPermission[]>([]);
  const [analysis, setAnalysis] = useState<AccessControlAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'selection' | 'migrate' | 'results'>('selection');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedPolicies, setSelectedPolicies] = useState<string[]>([]);
  const [migrationOptions, setMigrationOptions] = useState<AccessControlMigrationOptions>({
    roles: { preserveIds: true, skipAdminRoles: true },
    policies: { preserveIds: true, skipAdminPolicies: true },
    permissions: { validateCollections: true, skipInvalidPermissions: true }
  });
  const [migrationResults, setMigrationResults] = useState<any>(null);

  // Load source data when modal opens
  useEffect(() => {
    if (isVisible && step === 'selection') {
      loadSourceData();
    }
  }, [isVisible, sourceUrl, sourceToken]);

  const loadSourceData = async () => {
    setLoading(true);
    try {
      const result = await fetchAccessControlData(sourceUrl, sourceToken);
      
      if (result.success && result.roles && result.policies && result.permissions) {
        setSourceRoles(result.roles);
        setSourcePolicies(result.policies);
        setSourcePermissions(result.permissions);
        
        const analysisResult = analyzeAccessControlData(result.roles, result.policies, result.permissions);
        setAnalysis(analysisResult);
        
        onStatusUpdate({
          type: 'success',
          message: `Loaded ${result.roles.length} roles, ${result.policies.length} policies, ${result.permissions.length} permissions`
        });
      } else {
        throw new Error(result.error || 'Failed to load access control data');
      }
    } catch (error: any) {
      onStatusUpdate({
        type: 'error',
        message: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const executeMigration = async () => {
    setLoading(true);
    setStep('migrate');
    
    try {
      // Filter selected roles and policies
      const rolesToMigrate = sourceRoles.filter(role => selectedRoles.includes(role.id));
      const policiesToMigrate = sourcePolicies.filter(policy => selectedPolicies.includes(policy.id));
      
      // Get permissions related to selected policies
      const permissionsToMigrate = sourcePermissions.filter(permission => 
        permission.policy && selectedPolicies.includes(permission.policy)
      );
      
      const result = await importAccessControlData(
        rolesToMigrate,
        policiesToMigrate,
        permissionsToMigrate,
        targetUrl,
        targetToken,
        migrationOptions
      );
      
      setMigrationResults(result);
      setStep('results');
      
      onStatusUpdate({
        type: result.success ? 'success' : 'error',
        message: result.message
      });
    } catch (error: any) {
      onStatusUpdate({
        type: 'error',
        message: error.message
      });
      setStep('selection');
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
        padding: '2rem',
        borderRadius: '8px',
        maxWidth: '800px',
        width: '90%',
        maxHeight: '80vh',
        overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, color: '#7c3aed' }}>🔐 Access Control Migration</h2>
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

        {/* Step 1: Selection */}
        {step === 'selection' && (
          <div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <div>Loading access control data...</div>
              </div>
            ) : analysis ? (
              <div>
                {/* Source Analysis Section */}
                <div style={{ 
                  backgroundColor: '#f8fafc', 
                  padding: '1.5rem', 
                  borderRadius: '8px', 
                  marginBottom: '1.5rem',
                  border: '1px solid #e2e8f0'
                }}>
                  <h3 style={{ margin: '0 0 1rem 0', color: '#1e293b', display: 'flex', alignItems: 'center' }}>
                    📊 Source Analysis
                  </h3>
                  
                  {/* Relationship Diagram */}
                  <div style={{ textAlign: 'center', marginBottom: '1.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                    🔗 <strong>Relationship:</strong> <span style={{ color: '#3b82f6' }}>Role</span> → (n) <span style={{ color: '#7c3aed' }}>Policy</span> → (n) <span style={{ color: '#059669' }}>Permission</span>
                  </div>

                  {/* Statistics Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                      <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>Roles: {analysis.roles.count} total</div>
                      <div style={{ fontSize: '0.875rem', color: '#dc2626' }}>Admin: {analysis.roles.adminRoles.length}</div>
                      <div style={{ fontSize: '0.875rem', color: '#059669' }}>Custom: {analysis.roles.customRoles.length}</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>Policies: {analysis.policies.count} total</div>
                      <div style={{ fontSize: '0.875rem', color: '#dc2626' }}>Admin: {analysis.policies.adminPolicies.length}</div>
                      <div style={{ fontSize: '0.875rem', color: '#059669' }}>Custom: {analysis.policies.customPolicies.length}</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>Permissions: {analysis.permissions.count} total</div>
                      <div style={{ fontSize: '0.875rem', color: '#059669' }}>Collections: {Object.keys(analysis.permissions.byCollection).length}</div>
                      <div style={{ fontSize: '0.875rem', color: '#f59e0b' }}>Orphaned: 0</div>
                    </div>
                  </div>

                  {/* Available Permissions */}
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ color: '#10b981', marginRight: '0.5rem' }}>✅</span>
                    <span style={{ color: '#059669', fontSize: '0.875rem' }}>{analysis.permissions.count} permissions available</span>
                  </div>
                  
                  {/* Warning Text */}
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic' }}>
                    ⚠️ Permissions are organized by policies and will be migrated automatically when you select policies
                  </div>
                </div>

                {/* Roles and Policies Selection */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
                  {/* Roles Section */}
                  <div>
                    <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center' }}>
                      👥 Roles ({sourceRoles.length})
                    </h3>
                    
                    {/* Tab Buttons */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                      <button
                        onClick={() => setSelectedRoles(sourceRoles.map(r => r.id))}
                        style={{
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          padding: '0.5rem 0.75rem',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
                      >
                        Select All
                      </button>
                      <button
                        style={{
                          backgroundColor: '#f97316',
                          color: 'white',
                          padding: '0.5rem 0.75rem',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '0.75rem'
                        }}
                      >
                        Existing ({sourceRoles.length})
                      </button>
                      <button
                        style={{
                          backgroundColor: '#10b981',
                          color: 'white',
                          padding: '0.5rem 0.75rem',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '0.75rem'
                        }}
                      >
                        New (0)
                      </button>
                      <button
                        onClick={() => setSelectedRoles([])}
                        style={{
                          backgroundColor: '#6b7280',
                          color: 'white',
                          padding: '0.5rem 0.75rem',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
                      >
                        Clear
                      </button>
                    </div>

                    {/* Roles List */}
                    <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.5rem' }}>
                      {sourceRoles.map(role => (
                        <label key={role.id} style={{ display: 'block', padding: '0.75rem 0.5rem', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <input
                                type="checkbox"
                                checked={selectedRoles.includes(role.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedRoles(prev => [...prev, role.id]);
                                  } else {
                                    setSelectedRoles(prev => prev.filter(id => id !== role.id));
                                  }
                                }}
                                style={{ marginRight: '0.75rem' }}
                              />
                              <div>
                                <div style={{ fontWeight: '500' }}>{role.name}</div>
                                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>ID: {role.id}</div>
                              </div>
                            </div>
                            <span style={{
                              backgroundColor: role.admin_access ? '#dc2626' : '#f97316',
                              color: 'white',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '12px',
                              fontSize: '0.75rem'
                            }}>
                              {role.admin_access ? 'Admin' : 'Existing'}
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Policies Section */}
                  <div>
                    <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center' }}>
                      🔐 Policies ({sourcePolicies.length})
                    </h3>
                    
                    {/* Tab Buttons */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                      <button
                        onClick={() => setSelectedPolicies(sourcePolicies.map(p => p.id))}
                        style={{
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          padding: '0.5rem 0.75rem',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
                      >
                        Select All
                      </button>
                      <button
                        style={{
                          backgroundColor: '#f97316',
                          color: 'white',
                          padding: '0.5rem 0.75rem',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '0.75rem'
                        }}
                      >
                        Existing ({sourcePolicies.filter(p => p.admin_access).length})
                      </button>
                      <button
                        style={{
                          backgroundColor: '#10b981',
                          color: 'white',
                          padding: '0.5rem 0.75rem',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '0.75rem'
                        }}
                      >
                        New ({sourcePolicies.filter(p => !p.admin_access).length})
                      </button>
                      <button
                        onClick={() => setSelectedPolicies([])}
                        style={{
                          backgroundColor: '#6b7280',
                          color: 'white',
                          padding: '0.5rem 0.75rem',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
                      >
                        Clear
                      </button>
                    </div>

                    {/* Policies List */}
                    <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.5rem' }}>
                      {sourcePolicies.map(policy => {
                        const relatedPermissions = sourcePermissions.filter(p => p.policy === policy.id);
                        return (
                          <label key={policy.id} style={{ display: 'block', padding: '0.75rem 0.5rem', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={selectedPolicies.includes(policy.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedPolicies(prev => [...prev, policy.id]);
                                    } else {
                                      setSelectedPolicies(prev => prev.filter(id => id !== policy.id));
                                    }
                                  }}
                                  style={{ marginRight: '0.75rem' }}
                                />
                                <div>
                                  <div style={{ fontWeight: '500' }}>{policy.name}</div>
                                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                    Permissions: {relatedPermissions.length} • ID: {policy.id}
                                  </div>
                                </div>
                              </div>
                              <span style={{
                                backgroundColor: policy.admin_access ? '#f97316' : '#10b981',
                                color: 'white',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '12px',
                                fontSize: '0.75rem'
                              }}>
                                {policy.admin_access ? 'Existing' : 'New'}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Migration Settings */}
                <div style={{ 
                  backgroundColor: '#f8fafc', 
                  padding: '1.5rem', 
                  borderRadius: '8px', 
                  marginBottom: '1.5rem',
                  border: '1px solid #e2e8f0'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
                      ⚙️ Migration Settings
                    </h3>
                    <span style={{ fontSize: '0.875rem', color: '#6b7280', cursor: 'pointer' }}>
                      ▶ Advanced Options
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={migrationOptions.roles?.skipAdminRoles || false}
                        onChange={(e) => setMigrationOptions(prev => ({
                          ...prev,
                          roles: { ...prev.roles, skipAdminRoles: e.target.checked }
                        }))}
                        style={{ marginRight: '0.75rem' }}
                      />
                      <span>Skip admin roles <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>(recommended for security)</span></span>
                    </label>
                    
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={migrationOptions.policies?.skipAdminPolicies || false}
                        onChange={(e) => setMigrationOptions(prev => ({
                          ...prev,
                          policies: { ...prev.policies, skipAdminPolicies: e.target.checked }
                        }))}
                        style={{ marginRight: '0.75rem' }}
                      />
                      <span>Skip admin policies <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>(recommended for security)</span></span>
                    </label>
                  </div>
                </div>
                
                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button
                    onClick={loadSourceData}
                    style={{
                      backgroundColor: '#6b7280',
                      color: 'white',
                      padding: '0.75rem 1.5rem',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    Refresh Data
                  </button>
                  
                  <button
                    style={{
                      backgroundColor: '#f59e0b',
                      color: 'white',
                      padding: '0.75rem 1.5rem',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.875rem'
                    }}
                  >
                    Validate Migration
                  </button>
                  
                  <button
                    onClick={executeMigration}
                    disabled={loading || (selectedRoles.length === 0 && selectedPolicies.length === 0)}
                    style={{
                      backgroundColor: '#dc2626',
                      color: 'white',
                      padding: '0.75rem 1.5rem',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: loading || (selectedRoles.length === 0 && selectedPolicies.length === 0) ? 'not-allowed' : 'pointer',
                      fontSize: '0.875rem',
                      opacity: loading || (selectedRoles.length === 0 && selectedPolicies.length === 0) ? 0.6 : 1
                    }}
                  >
                    {loading ? 'Migrating...' : 'Migrate Selected'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <button
                  onClick={loadSourceData}
                  style={{
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    padding: '0.75rem 1.5rem',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  Load Source Data
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Migration Progress */}
        {step === 'migrate' && (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <h3>🚀 Migration in Progress...</h3>
            <div style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>
              Please wait while we migrate your access control data.
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              This may take a few minutes depending on the amount of data.
            </div>
          </div>
        )}

        {/* Step 3: Results */}
        {step === 'results' && migrationResults && (
          <div>
            <h3>📊 Migration Results</h3>
            
            <div style={{ 
              padding: '1rem', 
              backgroundColor: migrationResults.success ? '#d1fae5' : '#fee2e2',
              color: migrationResults.success ? '#065f46' : '#dc2626',
              borderRadius: '6px',
              marginBottom: '1.5rem'
            }}>
              {migrationResults.message}
            </div>

            {migrationResults.importedRoles && (
              <div style={{ marginBottom: '1rem' }}>
                <h4>👥 Roles: {migrationResults.importedRoles.filter((r: any) => r.status === 'success').length}/{migrationResults.importedRoles.length} successful</h4>
              </div>
            )}

            {migrationResults.importedPolicies && (
              <div style={{ marginBottom: '1rem' }}>
                <h4>🔐 Policies: {migrationResults.importedPolicies.filter((p: any) => p.status === 'success').length}/{migrationResults.importedPolicies.length} successful</h4>
              </div>
            )}

            {migrationResults.importedPermissions && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h4>🔑 Permissions: {migrationResults.importedPermissions.filter((p: any) => p.status === 'success').length}/{migrationResults.importedPermissions.length} successful</h4>
              </div>
            )}

            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => {
                  setStep('selection');
                  setMigrationResults(null);
                  setSelectedRoles([]);
                  setSelectedPolicies([]);
                }}
                style={{
                  backgroundColor: '#7c3aed',
                  color: 'white',
                  padding: '0.75rem 1.5rem',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Start New Migration
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
