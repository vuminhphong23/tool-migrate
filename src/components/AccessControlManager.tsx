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
import { DirectusClient } from '../lib/DirectusClient';

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
  const [targetRoles, setTargetRoles] = useState<DirectusRole[]>([]);
  const [targetPolicies, setTargetPolicies] = useState<DirectusPolicy[]>([]);
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
  const [validationResults, setValidationResults] = useState<any>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Load source data when modal opens
  useEffect(() => {
    if (isVisible && step === 'selection') {
      loadSourceData();
    }
  }, [isVisible, sourceUrl, sourceToken]);

  // Helper functions to determine status
  const getRoleStatus = (role: DirectusRole): 'Admin' | 'Existing' | 'New' => {
    if (role.admin_access) return 'Admin';
    const existsInTarget = targetRoles.some(targetRole => 
      targetRole.id === role.id || targetRole.name === role.name
    );
    return existsInTarget ? 'Existing' : 'New';
  };

  const getPolicyStatus = (policy: DirectusPolicy): 'Admin' | 'Existing' | 'New' => {
    if (policy.admin_access) return 'Admin';
    const existsInTarget = targetPolicies.some(targetPolicy => 
      targetPolicy.id === policy.id || targetPolicy.name === policy.name
    );
    return existsInTarget ? 'Existing' : 'New';
  };

  const loadSourceData = async () => {
    setLoading(true);
    
    try {
      const sourceClient = new DirectusClient(sourceUrl, sourceToken);
      const targetClient = new DirectusClient(targetUrl, targetToken);
      
      // Load source data
      const [sourceRolesRes, sourcePoliciesRes, sourcePermissionsRes] = await Promise.all([
        sourceClient.get('/roles'),
        sourceClient.get('/policies'),
        sourceClient.get('/permissions')
      ]);

      // Load target data for comparison
      const [targetRolesRes, targetPoliciesRes] = await Promise.all([
        targetClient.get('/roles').catch(() => ({ data: [] })), // Fallback if fails
        targetClient.get('/policies').catch(() => ({ data: [] })) // Fallback if fails
      ]);

      const sourceRolesData = sourceRolesRes.data || [];
      const sourcePoliciesData = sourcePoliciesRes.data || [];
      const sourcePermissionsData = sourcePermissionsRes.data || [];
      const targetRolesData = targetRolesRes.data || [];
      const targetPoliciesData = targetPoliciesRes.data || [];

      setSourceRoles(sourceRolesData);
      setSourcePolicies(sourcePoliciesData);
      setSourcePermissions(sourcePermissionsData);
      setTargetRoles(targetRolesData);
      setTargetPolicies(targetPoliciesData);

      const analysisResult = analyzeAccessControlData(
        sourceRolesData,
        sourcePoliciesData,
        sourcePermissionsData
      );
      setAnalysis(analysisResult);

      onStatusUpdate({
        type: 'success',
        message: `Loaded ${sourceRolesData.length} roles, ${sourcePoliciesData.length} policies, ${sourcePermissionsData.length} permissions`
      });
    } catch (error: any) {
      onStatusUpdate({
        type: 'error',
        message: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const validateMigration = async () => {
    setIsValidating(true);
    setValidationResults(null);
    
    try {
      // Filter selected roles and policies
      const rolesToMigrate = sourceRoles.filter(role => selectedRoles.includes(role.id));
      const policiesToMigrate = sourcePolicies.filter(policy => selectedPolicies.includes(policy.id));
      const permissionsToMigrate = sourcePermissions.filter(permission => 
        permission.policy && selectedPolicies.includes(permission.policy)
      );

      // Validation checks
      const validation = {
        roles: {
          selected: rolesToMigrate.length,
          adminRoles: rolesToMigrate.filter(r => r.admin_access).length,
          customRoles: rolesToMigrate.filter(r => !r.admin_access).length,
          issues: [] as string[]
        },
        policies: {
          selected: policiesToMigrate.length,
          adminPolicies: policiesToMigrate.filter(p => p.admin_access).length,
          customPolicies: policiesToMigrate.filter(p => !p.admin_access).length,
          issues: [] as string[]
        },
        permissions: {
          selected: permissionsToMigrate.length,
          orphaned: sourcePermissions.filter(p => !p.policy).length,
          issues: [] as string[]
        },
        warnings: [] as string[],
        canMigrate: true
      };

      // Check for issues
      if (rolesToMigrate.length === 0 && policiesToMigrate.length === 0) {
        validation.warnings.push('No roles or policies selected for migration');
        validation.canMigrate = false;
      }

      if (validation.roles.adminRoles > 0 && !migrationOptions.roles?.skipAdminRoles) {
        validation.warnings.push(`${validation.roles.adminRoles} admin roles selected - this may cause security issues`);
      }

      if (validation.policies.adminPolicies > 0 && !migrationOptions.policies?.skipAdminPolicies) {
        validation.warnings.push(`${validation.policies.adminPolicies} admin policies selected - this may cause security issues`);
      }

      if (validation.permissions.orphaned > 0) {
        validation.warnings.push(`${validation.permissions.orphaned} orphaned permissions found (no policy assigned)`);
      }

      // Note: Skip connectivity check during validation to avoid unnecessary API calls
      // Connectivity will be tested during actual migration

      setValidationResults(validation);
      
      onStatusUpdate({
        type: validation.canMigrate ? (validation.warnings.length > 0 ? 'warning' : 'success') : 'error',
        message: validation.canMigrate 
          ? `Validation completed: ${rolesToMigrate.length} roles, ${policiesToMigrate.length} policies, ${permissionsToMigrate.length} permissions ready to migrate`
          : 'Validation failed - please check issues before migration'
      });

    } catch (error: any) {
      onStatusUpdate({
        type: 'error',
        message: `Validation error: ${error.message}`
      });
    } finally {
      setIsValidating(false);
    }
  };

  const executeMigration = async () => {
    setLoading(true);
    // Stay on selection step to show progress and results in main screen
    // setStep('migrate'); // Commented out to keep in main screen
    
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
      // Stay on selection step to show results in main screen
      // setStep('results'); // Commented out to keep results in main screen
      
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
            {loading && !analysis ? (
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
                        Existing ({sourceRoles.filter(r => getRoleStatus(r) === 'Existing').length})
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
                        New ({sourceRoles.filter(r => getRoleStatus(r) === 'New').length})
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
                              backgroundColor: getRoleStatus(role) === 'Admin' ? '#dc2626' : getRoleStatus(role) === 'New' ? '#10b981' : '#f97316',
                              color: 'white',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '12px',
                              fontSize: '0.75rem'
                            }}>
                              {getRoleStatus(role)}
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
                        Existing ({sourcePolicies.filter(p => getPolicyStatus(p) === 'Existing').length})
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
                        New ({sourcePolicies.filter(p => getPolicyStatus(p) === 'New').length})
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
                                backgroundColor: getPolicyStatus(policy) === 'Admin' ? '#dc2626' : getPolicyStatus(policy) === 'New' ? '#10b981' : '#f97316',
                                color: 'white',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '12px',
                                fontSize: '0.75rem'
                              }}>
                                {getPolicyStatus(policy)}
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
                
                {/* Migration Results Summary */}
                {migrationResults && (
                  <div style={{ 
                    backgroundColor: '#f8fafc', 
                    padding: '1.5rem', 
                    borderRadius: '8px', 
                    marginBottom: '1.5rem',
                    border: '1px solid #e2e8f0'
                  }}>
                    <h4 style={{ margin: '0 0 1rem 0', color: '#1e293b', display: 'flex', alignItems: 'center' }}>
                      📊 Migration Results
                    </h4>
                    
                    {/* Success Message */}
                    <div style={{ 
                      padding: '1rem', 
                      backgroundColor: migrationResults.success ? '#d1fae5' : '#fee2e2',
                      color: migrationResults.success ? '#065f46' : '#dc2626',
                      borderRadius: '6px',
                      marginBottom: '1rem',
                      fontSize: '0.875rem',
                      fontWeight: '500'
                    }}>
                      {migrationResults.message}
                    </div>

                    {/* Detailed Results */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {migrationResults.importedRoles && (
                        <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.875rem' }}>
                          <span style={{ marginRight: '0.5rem' }}>👥</span>
                          <strong>Roles:</strong>
                          <span style={{ marginLeft: '0.5rem', color: '#059669' }}>
                            {migrationResults.importedRoles.filter((r: any) => r.status === 'success').length}/{migrationResults.importedRoles.length} successful
                          </span>
                        </div>
                      )}
                      
                      {migrationResults.importedPolicies && (
                        <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.875rem' }}>
                          <span style={{ marginRight: '0.5rem' }}>🔐</span>
                          <strong>Policies:</strong>
                          <span style={{ marginLeft: '0.5rem', color: '#059669' }}>
                            {migrationResults.importedPolicies.filter((p: any) => p.status === 'success').length}/{migrationResults.importedPolicies.length} successful
                          </span>
                        </div>
                      )}
                      
                      {migrationResults.importedPermissions && (
                        <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.875rem' }}>
                          <span style={{ marginRight: '0.5rem' }}>🔑</span>
                          <strong>Permissions:</strong>
                          <span style={{ marginLeft: '0.5rem', color: '#059669' }}>
                            {migrationResults.importedPermissions.filter((p: any) => p.status === 'success').length}/{migrationResults.importedPermissions.length} successful
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Clear Results Button */}
                    <div style={{ textAlign: 'right', marginTop: '1rem' }}>
                      <button
                        onClick={() => {
                          setMigrationResults(null);
                          setValidationResults(null);
                        }}
                        style={{
                          backgroundColor: '#6b7280',
                          color: 'white',
                          padding: '0.5rem 1rem',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
                      >
                        Clear Results
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Validation Results */}
                {validationResults && (
                  <div style={{ 
                    backgroundColor: validationResults.canMigrate ? '#f0f9ff' : '#fef2f2', 
                    padding: '1.5rem', 
                    borderRadius: '8px', 
                    marginBottom: '1.5rem',
                    border: `1px solid ${validationResults.canMigrate ? '#0ea5e9' : '#f87171'}`
                  }}>
                    <h4 style={{ margin: '0 0 1rem 0', color: validationResults.canMigrate ? '#0369a1' : '#dc2626' }}>
                      🔍 Validation Results
                    </h4>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.875rem' }}>Roles: {validationResults.roles.selected}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Admin: {validationResults.roles.adminRoles} | Custom: {validationResults.roles.customRoles}</div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.875rem' }}>Policies: {validationResults.policies.selected}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Admin: {validationResults.policies.adminPolicies} | Custom: {validationResults.policies.customPolicies}</div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.875rem' }}>Permissions: {validationResults.permissions.selected}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Orphaned: {validationResults.permissions.orphaned}</div>
                      </div>
                    </div>

                    {validationResults.warnings.length > 0 && (
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.875rem', marginBottom: '0.5rem', color: '#f59e0b' }}>⚠️ Warnings:</div>
                        {validationResults.warnings.map((warning: string, index: number) => (
                          <div key={index} style={{ fontSize: '0.75rem', color: '#92400e', marginBottom: '0.25rem' }}>
                            • {warning}
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ 
                      marginTop: '1rem', 
                      padding: '0.75rem', 
                      backgroundColor: validationResults.canMigrate ? '#dcfce7' : '#fee2e2',
                      borderRadius: '4px',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      color: validationResults.canMigrate ? '#166534' : '#dc2626'
                    }}>
                      {validationResults.canMigrate ? '✅ Ready to migrate' : '❌ Migration blocked - resolve issues first'}
                    </div>
                  </div>
                )}

                {/* Migration Progress Indicator */}
                {loading && (
                  <div style={{ 
                    backgroundColor: '#fef3c7', 
                    padding: '1.5rem', 
                    borderRadius: '8px', 
                    marginBottom: '1.5rem',
                    border: '1px solid #f59e0b',
                    textAlign: 'center'
                  }}>
                    <h4 style={{ margin: '0 0 1rem 0', color: '#92400e' }}>
                      🚀 Migration in Progress...
                    </h4>
                    <div style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#92400e' }}>
                      Please wait while we migrate your access control data.
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#78350f' }}>
                      This may take a few minutes depending on the amount of data.
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button
                    onClick={loadSourceData}
                    disabled={loading}
                    style={{
                      backgroundColor: '#6b7280',
                      color: 'white',
                      padding: '0.75rem 1.5rem',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontSize: '0.875rem',
                      opacity: loading ? 0.6 : 1
                    }}
                  >
                    Refresh Data
                  </button>
                  
                  <button
                    onClick={validateMigration}
                    disabled={loading || isValidating || (selectedRoles.length === 0 && selectedPolicies.length === 0)}
                    style={{
                      backgroundColor: '#f59e0b',
                      color: 'white',
                      padding: '0.75rem 1.5rem',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: loading || isValidating || (selectedRoles.length === 0 && selectedPolicies.length === 0) ? 'not-allowed' : 'pointer',
                      fontSize: '0.875rem',
                      opacity: loading || isValidating || (selectedRoles.length === 0 && selectedPolicies.length === 0) ? 0.6 : 1
                    }}
                  >
                    {isValidating ? 'Validating...' : 'Validate Migration'}
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
                  setValidationResults(null);
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
