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
  const [targetPermissions, setTargetPermissions] = useState<DirectusPermission[]>([]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'selection' | 'migrate' | 'results'>('selection');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedPolicies, setSelectedPolicies] = useState<string[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<(string | number)[]>([]);
  const [permissionFilter, setPermissionFilter] = useState<'all' | 'related' | 'orphaned' | 'existing' | 'new'>('all');
  const [policyFilter, setPolicyFilter] = useState<'all' | 'existing' | 'new'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'existing' | 'new'>('all');
  
  // Permission grouping states
  const [permissionSearch, setPermissionSearch] = useState('');
  const [permissionsPerPage, setPermissionsPerPage] = useState(50);
  const [groupPages, setGroupPages] = useState<Record<string, number>>({});
  const [showSystemPermissions, setShowSystemPermissions] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
    'faq-policy': true,
    'custom-policy-35a39ef5': true,
    'admin-policies': true,
    'custom-policies': true,
    'orphaned': true,
    'system': true
  });
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

  // Filter functions
  const getFilteredPermissions = () => {
    let filtered = sourcePermissions;
    
    // Apply policy filter first
    if (selectedPolicies.length > 0) {
      filtered = filtered.filter(p => selectedPolicies.includes(p.policy || ''));
    }
    
    // Apply permission filter
    switch (permissionFilter) {
      case 'related':
        return filtered.filter(p => p.policy && selectedPolicies.includes(p.policy));
      case 'orphaned':
        return filtered.filter(p => !p.policy);
      default:
        return filtered;
    }
  };

  const getFilteredPolicies = () => {
    switch (policyFilter) {
      case 'existing':
        return sourcePolicies.filter(p => getPolicyStatus(p) === 'Existing');
      case 'new':
        return sourcePolicies.filter(p => getPolicyStatus(p) === 'New');
      default:
        return sourcePolicies;
    }
  };

  const getFilteredRoles = () => {
    switch (roleFilter) {
      case 'existing':
        return sourceRoles.filter(r => getRoleStatus(r) === 'Existing');
      case 'new':
        return sourceRoles.filter(r => getRoleStatus(r) === 'New');
      default:
        return sourceRoles;
    }
  };

  // Auto-select permissions when policies change
  const updatePermissionsFromPolicies = (policyIds: string[]) => {
    const relatedPermissions = sourcePermissions.filter(permission => 
      permission.policy && policyIds.includes(permission.policy)
    );
    setSelectedPermissions(relatedPermissions.map(p => p.id));
  };

  // Auto-select policies and permissions when roles change
  const updatePoliciesAndPermissionsFromRoles = (roleIds: string[]) => {
    const selectedRolesData = sourceRoles.filter(role => roleIds.includes(role.id));
    
    // Get all policies from selected roles
    const rolePolicies = sourceRoles
      .filter(role => roleIds.includes(role.id))
      .flatMap(role => role.policies || []);
    
    // Remove duplicates
    const uniquePolicies = [...new Set(rolePolicies)];
    
    if (uniquePolicies.length === 0) {
      return;
    }
    
    // Update selected policies
    setSelectedPolicies(uniquePolicies);
    
    // Auto-select permissions from those policies
    updatePermissionsFromPolicies(uniquePolicies);
  };

  // Group permissions by policy
  const getGroupedPermissions = () => {
    // Special policy IDs that get their own groups
    const specialPolicyIds = {
      '8c359f36-2c9d-4807-943f-dee31d880c52': {
        title: 'FAQ Policy Permissions',
        color: '#10b981'
      },
      '35a39ef5-afd7-4a43-b0d7-4fae3590b5e0': {
        title: 'Custom Policy (35a39ef5) Permissions', 
        color: '#8b5cf6'
      }
    };
    
    // Apply search filter and status filter
    let filteredPermissions = sourcePermissions.filter(permission => {
      // Search filter
      if (permissionSearch) {
        const searchLower = permissionSearch.toLowerCase();
        const matchesSearch = (
          permission.collection.toLowerCase().includes(searchLower) ||
          permission.action.toLowerCase().includes(searchLower) ||
          (permission.policy && permission.policy.toLowerCase().includes(searchLower))
        );
        if (!matchesSearch) return false;
      }
      
      // Status filter (existing/new)
      if (permissionFilter === 'existing') {
        const existsInTarget = targetPermissions.some(targetPerm => 
          targetPerm.collection === permission.collection &&
          targetPerm.action === permission.action &&
          targetPerm.policy === permission.policy
        );
        if (!existsInTarget) return false;
      } else if (permissionFilter === 'new') {
        const existsInTarget = targetPermissions.some(targetPerm => 
          targetPerm.collection === permission.collection &&
          targetPerm.action === permission.action &&
          targetPerm.policy === permission.policy
        );
        if (existsInTarget) return false;
      }
      
      return true;
    });

    // Find policies with many permissions (threshold: 25+) that aren't already special
    const policyPermissionCounts = filteredPermissions.reduce((acc: any, permission) => {
      if (permission.policy && !specialPolicyIds[permission.policy as keyof typeof specialPolicyIds]) {
        acc[permission.policy] = (acc[permission.policy] || 0) + 1;
      }
      return acc;
    }, {});

    const largePolicyIds = Object.keys(policyPermissionCounts)
      .filter(policyId => policyPermissionCounts[policyId] >= 25)
      .sort((a, b) => policyPermissionCounts[b] - policyPermissionCounts[a]); // Sort by permission count descending

    // Color palette for dynamic groups
    const colors = [
      '#f97316', // orange
      '#06b6d4', // cyan
      '#84cc16', // lime
      '#ec4899', // pink
      '#6366f1', // indigo
      '#f59e0b', // amber
      '#ef4444', // red
      '#10b981', // emerald
      '#8b5cf6', // violet
      '#f97316', // orange (repeat)
      '#06b6d4', // cyan (repeat)
      '#84cc16'  // lime (repeat)
    ];

    const groups: any = {};

    // Add special policy groups
    Object.entries(specialPolicyIds).forEach(([policyId, config]) => {
      const groupKey = `special-${policyId.substring(0, 8)}`;
      groups[groupKey] = {
        title: config.title,
        permissions: filteredPermissions.filter(p => p.policy === policyId),
        color: config.color
      };
    });

    // Add dynamic large policy groups
    largePolicyIds.forEach((policyId, index) => {
      const policy = sourcePolicies.find(p => p.id === policyId);
      const policyName = policy?.name || `Policy ${policyId.substring(0, 8)}`;
      const groupKey = `large-policy-${policyId.substring(0, 8)}`;
      const permissionCount = policyPermissionCounts[policyId];
      
      groups[groupKey] = {
        title: policyName,
        permissions: filteredPermissions.filter(p => p.policy === policyId),
        color: colors[index % colors.length]
      };
    });

    // Get all special and large policy IDs for exclusion
    const excludedPolicyIds = [
      ...Object.keys(specialPolicyIds),
      ...largePolicyIds
    ];

    // Add standard groups
    groups['admin-policies'] = {
      title: 'Admin Policy Permissions',
      permissions: filteredPermissions.filter(p => {
        if (!p.policy || excludedPolicyIds.includes(p.policy)) return false;
        const policy = sourcePolicies.find(pol => pol.id === p.policy);
        return policy?.admin_access === true;
      }),
      color: '#dc2626'
    };

    groups['custom-policies'] = {
      title: 'Other Custom Policy Permissions',
      permissions: filteredPermissions.filter(p => {
        if (!p.policy || excludedPolicyIds.includes(p.policy)) return false;
        const policy = sourcePolicies.find(pol => pol.id === p.policy);
        return policy?.admin_access !== true;
      }),
      color: '#3b82f6'
    };

    groups['orphaned'] = {
      title: 'Orphaned Permissions',
      permissions: filteredPermissions.filter(p => !p.policy),
      color: '#6b7280'
    };

    groups['system'] = {
      title: 'System Permissions',
      permissions: filteredPermissions.filter(p => p.collection.startsWith('directus_')),
      color: '#f59e0b'
    };

    // Remove system permissions from other groups if they're hidden
    if (!showSystemPermissions) {
      Object.keys(groups).forEach(key => {
        if (key !== 'system') {
          groups[key as keyof typeof groups].permissions = groups[key as keyof typeof groups].permissions.filter(
            (p: any) => !p.collection.startsWith('directus_')
          );
        }
      });
    }

    // Remove empty groups (groups with no permissions after filtering)
    const nonEmptyGroups: any = {};
    Object.keys(groups).forEach(key => {
      if (groups[key].permissions.length > 0) {
        nonEmptyGroups[key] = groups[key];
      }
    });

    return nonEmptyGroups;
  };

  // Toggle group collapse
  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupKey]: prev[groupKey] !== undefined ? !prev[groupKey] : false // Default to expanded for new groups when clicked
    }));
  };

  // Get paginated permissions for a group
  const getPaginatedPermissions = (permissions: any[], groupKey: string) => {
    const isCollapsed = collapsedGroups[groupKey] !== undefined ? collapsedGroups[groupKey] : true; // Default collapsed
    if (isCollapsed) return [];
    
    const currentPage = groupPages[groupKey] || 1;
    const startIndex = (currentPage - 1) * permissionsPerPage;
    const endIndex = startIndex + permissionsPerPage;
    return permissions.slice(startIndex, endIndex);
  };

  // Set page for specific group
  const setGroupPage = (groupKey: string, page: number) => {
    setGroupPages(prev => ({
      ...prev,
      [groupKey]: page
    }));
  };

  // Get group status (existing/new/mixed)
  const getGroupStatus = (permissions: any[]) => {
    if (permissions.length === 0) return { status: 'empty', existing: 0, new: 0 };
    
    let existingCount = 0;
    let newCount = 0;
    
    permissions.forEach(permission => {
      // Check if permission exists in target by matching collection + action + policy
      const existsInTarget = targetPermissions.some(targetPerm => 
        targetPerm.collection === permission.collection &&
        targetPerm.action === permission.action &&
        targetPerm.policy === permission.policy
      );
      
      if (existsInTarget) {
        existingCount++;
      } else {
        newCount++;
      }
    });
    
    if (existingCount === permissions.length) {
      return { status: 'existing', existing: existingCount, new: 0 };
    } else if (newCount === permissions.length) {
      return { status: 'new', existing: 0, new: newCount };
    } else {
      return { status: 'mixed', existing: existingCount, new: newCount };
    }
  };

  const loadSourceData = async () => {
    setLoading(true);
    
    try {
      const sourceClient = new DirectusClient(sourceUrl, sourceToken);
      const targetClient = new DirectusClient(targetUrl, targetToken);
      
      // Load source data and access relationships
      const [sourceRolesRes, sourcePoliciesRes, sourcePermissionsRes, sourceAccessRes] = await Promise.all([
        sourceClient.get('/roles', { params: { limit: -1 } }),
        sourceClient.get('/policies', { params: { limit: -1 } }),
        sourceClient.get('/permissions', { params: { limit: -1 } }),
        sourceClient.get('/access', { params: { limit: -1 } }).catch(() => ({ data: [] })) // Fetch role-policy relationships
      ]);

      // Load target data for comparison
      const [targetRolesRes, targetPoliciesRes, targetPermissionsRes] = await Promise.all([
        targetClient.get('/roles').catch(() => ({ data: [] })), // Fallback if fails
        targetClient.get('/policies').catch(() => ({ data: [] })), // Fallback if fails
        targetClient.get('/permissions').catch(() => ({ data: [] })) // Fallback if fails
      ]);

      const sourceRolesData = sourceRolesRes.data || [];
      const sourcePoliciesData = sourcePoliciesRes.data || [];
      const sourcePermissionsData = sourcePermissionsRes.data || [];
      const sourceAccessData = sourceAccessRes.data || [];
      const targetRolesData = targetRolesRes.data || [];
      const targetPoliciesData = targetPoliciesRes.data || [];
      const targetPermissionsData = targetPermissionsRes.data || [];

      // Map access relationships to roles (add policies array to each role)
      const sourceRolesWithPolicies = sourceRolesData.map((role: any) => {
        const rolePolicies = sourceAccessData
          .filter((access: any) => access.role === role.id)
          .map((access: any) => access.policy);
        
        return {
          ...role,
          policies: rolePolicies
        };
      });

      setSourceRoles(sourceRolesWithPolicies); // Use roles with policies mapped
      setSourcePolicies(sourcePoliciesData);
      setSourcePermissions(sourcePermissionsData);
      setTargetRoles(targetRolesData);
      setTargetPolicies(targetPoliciesData);
      setTargetPermissions(targetPermissionsData);

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
      // Filter selected roles, policies, and permissions
      const rolesToMigrate = sourceRoles.filter(role => selectedRoles.includes(role.id));
      const policiesToMigrate = sourcePolicies.filter(policy => selectedPolicies.includes(policy.id));
      const permissionsToMigrate = sourcePermissions.filter(permission => 
        selectedPermissions.includes(permission.id)
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
      if (rolesToMigrate.length === 0 && policiesToMigrate.length === 0 && permissionsToMigrate.length === 0) {
        validation.warnings.push('No roles, policies, or permissions selected for migration');
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
      // Filter selected roles, policies, and permissions
      const rolesToMigrate = sourceRoles.filter(role => selectedRoles.includes(role.id));
      const policiesToMigrate = sourcePolicies.filter(policy => selectedPolicies.includes(policy.id));
      
      // Get explicitly selected permissions
      const permissionsToMigrate = sourcePermissions.filter(permission => 
        selectedPermissions.includes(permission.id)
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
      
      if (result.success) {
        // Deselect successfully migrated items
        const successfulRoleIds = result.importedRoles?.filter((r: any) => r.status === 'success').map((r: any) => r.originalId) || [];
        const successfulPolicyIds = result.importedPolicies?.filter((p: any) => p.status === 'success').map((p: any) => p.originalId) || [];
        const successfulPermissionIds = result.importedPermissions?.filter((p: any) => p.status === 'success').map((p: any) => p.originalId) || [];
        
        
        // Remove successful items from selection
        setSelectedRoles(prev => prev.filter(id => !successfulRoleIds.includes(id)));
        setSelectedPolicies(prev => prev.filter(id => !successfulPolicyIds.includes(id)));
        setSelectedPermissions(prev => prev.filter(id => !successfulPermissionIds.includes(id)));
        
        // Refresh data to update status (New → Existing)
        await loadSourceData();
        
        onStatusUpdate({
          type: 'success',
          message: `${result.message} - Data refreshed and selections cleared`
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
          <h2 style={{ margin: 0, color: '#121213ff' }}>🔐 Access Control Migration</h2>
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

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '2rem' }}>
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
                    disabled={loading || isValidating || (selectedRoles.length === 0 && selectedPolicies.length === 0 && selectedPermissions.length === 0)}
                    style={{
                      backgroundColor: '#f59e0b',
                      color: 'white',
                      padding: '0.75rem 1.5rem',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: loading || isValidating || (selectedRoles.length === 0 && selectedPolicies.length === 0 && selectedPermissions.length === 0) ? 'not-allowed' : 'pointer',
                      fontSize: '0.875rem',
                      opacity: loading || isValidating || (selectedRoles.length === 0 && selectedPolicies.length === 0 && selectedPermissions.length === 0) ? 0.6 : 1
                    }}
                  >
                    {isValidating ? 'Validating...' : 'Validate Migration'}
                  </button>
                  
                  <button
                    onClick={executeMigration}
                    disabled={loading || (selectedRoles.length === 0 && selectedPolicies.length === 0 && selectedPermissions.length === 0)}
                    style={{
                      backgroundColor: '#dc2626',
                      color: 'white',
                      padding: '0.75rem 1.5rem',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: loading || (selectedRoles.length === 0 && selectedPolicies.length === 0 && selectedPermissions.length === 0) ? 'not-allowed' : 'pointer',
                      fontSize: '0.875rem',
                      opacity: loading || (selectedRoles.length === 0 && selectedPolicies.length === 0 && selectedPermissions.length === 0) ? 0.6 : 1
                    }}
                  >
                    {loading ? 'Migrating...' : 'Migrate Selected'}
                  </button>
                </div>

                {/* Permissions Section - Grouped */}
                <div style={{ marginBottom: '2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
                      🔑 Permissions ({selectedPermissions.length} selected)
                    </h3>
                    
                    {/* Controls */}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.875rem' }}>
                        <input
                          type="checkbox"
                          checked={showSystemPermissions}
                          onChange={(e) => setShowSystemPermissions(e.target.checked)}
                          style={{ marginRight: '0.5rem' }}
                        />
                        Show System
                      </label>
                      
                      <select
                        value={permissionsPerPage}
                        onChange={(e) => {
                          setPermissionsPerPage(Number(e.target.value));
                          // Reset all group pages when items per page changes
                          setGroupPages({});
                        }}
                        style={{
                          padding: '0.25rem 0.5rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '0.75rem'
                        }}
                      >
                        <option value={25}>25/page</option>
                        <option value={50}>50/page</option>
                        <option value={100}>100/page</option>
                        <option value={200}>200/page</option>
                      </select>
                    </div>
                  </div>

                  {/* Filter Buttons */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => {
                        setPermissionFilter('all');
                        // Select all visible permissions
                        const allPermissionIds = sourcePermissions.map(p => p.id);
                        setSelectedPermissions(allPermissionIds);
                      }}
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
                      onClick={() => {
                        setPermissionFilter('existing');
                        // Select only existing permissions
                        const existingPermissionIds = sourcePermissions
                          .filter(permission => {
                            return targetPermissions.some(targetPerm => 
                              targetPerm.collection === permission.collection &&
                              targetPerm.action === permission.action &&
                              targetPerm.policy === permission.policy
                            );
                          })
                          .map(p => p.id);
                        setSelectedPermissions(existingPermissionIds);
                      }}
                      style={{
                        backgroundColor: permissionFilter === 'existing' ? '#f97316' : '#e5e7eb',
                        color: permissionFilter === 'existing' ? 'white' : '#374151',
                        padding: '0.5rem 0.75rem',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.75rem'
                      }}
                    >
                      Existing ({sourcePermissions.filter(p => targetPermissions.some(tp => tp.collection === p.collection && tp.action === p.action && tp.policy === p.policy)).length})
                    </button>
                    <button
                      onClick={() => {
                        setPermissionFilter('new');
                        // Select only new permissions
                        const newPermissionIds = sourcePermissions
                          .filter(permission => {
                            return !targetPermissions.some(targetPerm => 
                              targetPerm.collection === permission.collection &&
                              targetPerm.action === permission.action &&
                              targetPerm.policy === permission.policy
                            );
                          })
                          .map(p => p.id);
                        setSelectedPermissions(newPermissionIds);
                      }}
                      style={{
                        backgroundColor: permissionFilter === 'new' ? '#10b981' : '#e5e7eb',
                        color: permissionFilter === 'new' ? 'white' : '#374151',
                        padding: '0.5rem 0.75rem',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.75rem'
                      }}
                    >
                      New ({sourcePermissions.filter(p => !targetPermissions.some(tp => tp.collection === p.collection && tp.action === p.action && tp.policy === p.policy)).length})
                    </button>
                    <button
                      onClick={() => {
                        setPermissionFilter('all');
                        setSelectedPermissions([]);
                      }}
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

                  {/* Search */}
                  <div style={{ marginBottom: '1rem' }}>
                    <input
                      type="text"
                      placeholder="Search permissions (collection, action, policy)..."
                      value={permissionSearch}
                      onChange={(e) => {
                        setPermissionSearch(e.target.value);
                        // Reset all group pages when search changes
                        setGroupPages({});
                      }}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.875rem'
                      }}
                    />
                  </div>

                  {/* Permission Groups */}
                  {(() => {
                    const groups = getGroupedPermissions();
                    return Object.entries(groups).map(([groupKey, group]: [string, any]) => {
                      if (groupKey === 'system' && !showSystemPermissions) return null;
                      if (group.permissions.length === 0) return null;
                      
                      const isCollapsed = collapsedGroups[groupKey] !== undefined ? collapsedGroups[groupKey] : true; // Default collapsed
                      const displayedPermissions = getPaginatedPermissions(group.permissions, groupKey);
                      
                      return (
                        <div key={groupKey} style={{ marginBottom: '1rem', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
                          {/* Group Header */}
                          <div
                            onClick={() => toggleGroup(groupKey)}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '0.75rem 1rem',
                              backgroundColor: '#f9fafb',
                              borderBottom: isCollapsed ? 'none' : '1px solid #e5e7eb',
                              cursor: 'pointer',
                              borderRadius: isCollapsed ? '6px' : '6px 6px 0 0'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontSize: '0.875rem' }}>
                                {isCollapsed ? '▶' : '▼'}
                              </span>
                              <span style={{ fontWeight: '500', color: group.color }}>
                                {group.title}
                              </span>
                              <span style={{
                                backgroundColor: group.color,
                                color: 'white',
                                padding: '0.125rem 0.5rem',
                                borderRadius: '12px',
                                fontSize: '0.75rem'
                              }}>
                                {group.permissions.length}
                              </span>
                              
                              {/* Status Badge */}
                              {(() => {
                                const groupStatus = getGroupStatus(group.permissions);
                                if (groupStatus.status === 'empty') return null;
                                
                                let badgeColor, badgeTextColor, badgeText;
                                if (groupStatus.status === 'existing') {
                                  badgeColor = '#fef3c7'; // yellow light
                                  badgeTextColor = '#92400e'; // yellow dark
                                  badgeText = 'Existing';
                                } else if (groupStatus.status === 'new') {
                                  badgeColor = '#dbeafe'; // blue light
                                  badgeTextColor = '#1e40af'; // blue dark
                                  badgeText = 'New';
                                } else {
                                  badgeColor = '#e5e7eb'; // gray light
                                  badgeTextColor = '#374151'; // gray dark
                                  badgeText = `Mixed (${groupStatus.existing}/${groupStatus.new})`;
                                }
                                
                                return (
                                  <span style={{
                                    backgroundColor: badgeColor,
                                    color: badgeTextColor,
                                    padding: '0.125rem 0.5rem',
                                    borderRadius: '9999px',
                                    fontSize: '0.75rem',
                                    fontWeight: '500'
                                  }}>
                                    {badgeText}
                                  </span>
                                );
                              })()}
                            </div>
                            
                            {!isCollapsed && (
                              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPermissionFilter('all');
                                    const groupPermissionIds = group.permissions.map((p: any) => p.id);
                                    setSelectedPermissions(prev => [...new Set([...prev, ...groupPermissionIds])]);
                                  }}
                                  style={{
                                    backgroundColor: group.color,
                                    color: 'white',
                                    padding: '0.25rem 0.5rem',
                                    border: 'none',
                                    borderRadius: '4px',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Select All
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPermissionFilter('existing');
                                    // Select only existing permissions in this group
                                    const existingIds = group.permissions
                                      .filter((p: any) => {
                                        return targetPermissions.some(targetPerm => 
                                          targetPerm.collection === p.collection &&
                                          targetPerm.action === p.action &&
                                          targetPerm.policy === p.policy
                                        );
                                      })
                                      .map((p: any) => p.id);
                                    setSelectedPermissions(prev => [...new Set([...prev, ...existingIds])]);
                                  }}
                                  style={{
                                    backgroundColor: '#f97316',
                                    color: 'white',
                                    padding: '0.25rem 0.5rem',
                                    border: 'none',
                                    borderRadius: '4px',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Existing ({group.permissions.filter((p: any) => targetPermissions.some((tp: any) => tp.collection === p.collection && tp.action === p.action && tp.policy === p.policy)).length})
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPermissionFilter('new');
                                    // Select only new permissions in this group
                                    const newIds = group.permissions
                                      .filter((p: any) => {
                                        return !targetPermissions.some(targetPerm => 
                                          targetPerm.collection === p.collection &&
                                          targetPerm.action === p.action &&
                                          targetPerm.policy === p.policy
                                        );
                                      })
                                      .map((p: any) => p.id);
                                    setSelectedPermissions(prev => [...new Set([...prev, ...newIds])]);
                                  }}
                                  style={{
                                    backgroundColor: '#10b981',
                                    color: 'white',
                                    padding: '0.25rem 0.5rem',
                                    border: 'none',
                                    borderRadius: '4px',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer'
                                  }}
                                >
                                  New ({group.permissions.filter((p: any) => !targetPermissions.some((tp: any) => tp.collection === p.collection && tp.action === p.action && tp.policy === p.policy)).length})
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPermissionFilter('all');
                                    const groupPermissionIds = group.permissions.map((p: any) => p.id);
                                    setSelectedPermissions(prev => prev.filter(id => !groupPermissionIds.includes(id as any)));
                                  }}
                                  style={{
                                    backgroundColor: '#6b7280',
                                    color: 'white',
                                    padding: '0.25rem 0.5rem',
                                    border: 'none',
                                    borderRadius: '4px',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Clear
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Group Content */}
                          {!isCollapsed && (
                            <div style={{ padding: '0.5rem' }}>
                              {displayedPermissions.map(permission => {
                                // Check if this permission exists in target
                                const existsInTarget = targetPermissions.some(targetPerm => 
                                  targetPerm.collection === permission.collection &&
                                  targetPerm.action === permission.action &&
                                  targetPerm.policy === permission.policy
                                );
                                
                                return (
                                  <label key={permission.id} style={{ 
                                    display: 'block', 
                                    padding: '0.5rem', 
                                    cursor: 'pointer', 
                                    borderBottom: '1px solid #f3f4f6',
                                    backgroundColor: selectedPermissions.includes(permission.id) ? '#f0f9ff' : 'transparent'
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                                        <input
                                          type="checkbox"
                                          checked={selectedPermissions.includes(permission.id)}
                                          onChange={(e) => {
                                            if (e.target.checked) {
                                              setSelectedPermissions(prev => [...prev, permission.id]);
                                            } else {
                                              setSelectedPermissions(prev => prev.filter(id => id !== permission.id));
                                            }
                                          }}
                                          style={{ marginRight: '0.75rem' }}
                                        />
                                        <div style={{ flex: 1 }}>
                                          <div style={{ fontWeight: '500', fontSize: '0.875rem' }}>
                                            {permission.collection}.{permission.action}
                                          </div>
                                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                            ID: {permission.id} • Policy: {permission.policy || 'None'}
                                          </div>
                                        </div>
                                      </div>
                                      
                                      {/* Individual Permission Status Badge */}
                                      <span style={{
                                        backgroundColor: existsInTarget ? '#fef3c7' : '#dbeafe',
                                        color: existsInTarget ? '#92400e' : '#1e40af',
                                        padding: '0.25rem 0.5rem',
                                        borderRadius: '9999px',
                                        fontSize: '0.75rem',
                                        fontWeight: '500',
                                        marginLeft: '0.5rem'
                                      }}>
                                        {existsInTarget ? 'Existing' : 'New'}
                                      </span>
                                    </div>
                                  </label>
                                );
                              })}
                              
                              {/* Pagination for this group */}
                              {group.permissions.length > permissionsPerPage && (() => {
                                const currentPage = groupPages[groupKey] || 1;
                                const totalPages = Math.ceil(group.permissions.length / permissionsPerPage);
                                
                                return (
                                  <div style={{ 
                                    display: 'flex', 
                                    justifyContent: 'center', 
                                    alignItems: 'center', 
                                    gap: '0.5rem',
                                    padding: '0.5rem',
                                    borderTop: '1px solid #f3f4f6'
                                  }}>
                                    <button
                                      onClick={() => setGroupPage(groupKey, Math.max(1, currentPage - 1))}
                                      disabled={currentPage === 1}
                                      style={{
                                        padding: '0.25rem 0.5rem',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '4px',
                                        fontSize: '0.75rem',
                                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                                        opacity: currentPage === 1 ? 0.5 : 1
                                      }}
                                    >
                                      Previous
                                    </button>
                                    
                                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                      Page {currentPage} of {totalPages}
                                    </span>
                                    
                                    <button
                                      onClick={() => setGroupPage(groupKey, Math.min(totalPages, currentPage + 1))}
                                      disabled={currentPage >= totalPages}
                                      style={{
                                        padding: '0.25rem 0.5rem',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '4px',
                                        fontSize: '0.75rem',
                                        cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                                        opacity: currentPage >= totalPages ? 0.5 : 1
                                      }}
                                    >
                                      Next
                                    </button>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Policies Section */}
                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center' }}>
                    🔐 Policies ({sourcePolicies.length})
                  </h3>
                  
                  {/* Tab Buttons */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                    <button
                      onClick={() => {
                        const filtered = getFilteredPolicies();
                        const newPolicies = filtered.map(p => p.id);
                        setSelectedPolicies(newPolicies);
                        updatePermissionsFromPolicies(newPolicies);
                      }}
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
                      onClick={() => setPolicyFilter('existing')}
                      style={{
                        backgroundColor: policyFilter === 'existing' ? '#f97316' : '#e5e7eb',
                        color: policyFilter === 'existing' ? 'white' : '#374151',
                        padding: '0.5rem 0.75rem',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.75rem'
                      }}
                    >
                      Existing ({sourcePolicies.filter(p => getPolicyStatus(p) === 'Existing').length})
                    </button>
                    <button
                      onClick={() => setPolicyFilter('new')}
                      style={{
                        backgroundColor: policyFilter === 'new' ? '#10b981' : '#e5e7eb',
                        color: policyFilter === 'new' ? 'white' : '#374151',
                        padding: '0.5rem 0.75rem',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.75rem'
                      }}
                    >
                      New ({sourcePolicies.filter(p => getPolicyStatus(p) === 'New').length})
                    </button>
                    <button
                      onClick={() => {
                        setSelectedPolicies([]);
                        setPolicyFilter('all');
                        setSelectedPermissions([]);
                      }}
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
                  <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.5rem' }}>
                    {getFilteredPolicies().map(policy => {
                      const relatedPermissions = sourcePermissions.filter(p => p.policy === policy.id);
                      return (
                        <label key={policy.id} style={{ display: 'block', padding: '0.5rem', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <input
                                type="checkbox"
                                checked={selectedPolicies.includes(policy.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    const newPolicies = [...selectedPolicies, policy.id];
                                    setSelectedPolicies(newPolicies);
                                    updatePermissionsFromPolicies(newPolicies);
                                  } else {
                                    const newPolicies = selectedPolicies.filter(id => id !== policy.id);
                                    setSelectedPolicies(newPolicies);
                                    updatePermissionsFromPolicies(newPolicies);
                                  }
                                }}
                                style={{ marginRight: '0.75rem' }}
                              />
                              <div>
                                <div style={{ fontWeight: '500', fontSize: '0.875rem' }}>{policy.name}</div>
                                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                  Permissions: {relatedPermissions.length} • ID: {policy.id}
                                </div>
                              </div>
                            </div>
                            <span style={{
                              backgroundColor: getPolicyStatus(policy) === 'Admin' ? '#dc2626' : getPolicyStatus(policy) === 'New' ? '#dbeafe' : '#fef3c7',
                              color: getPolicyStatus(policy) === 'Admin' ? 'white' : getPolicyStatus(policy) === 'New' ? '#1e40af' : '#92400e',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '9999px',
                              fontSize: '0.75rem',
                              fontWeight: '500'
                            }}>
                              {getPolicyStatus(policy)}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Roles Section */}
                <div style={{ marginBottom: '2rem' }}>
                    <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center' }}>
                      👥 Roles ({sourceRoles.length})
                      {selectedRoles.length > 0 && (
                        <span style={{ 
                          marginLeft: '0.5rem', 
                          fontSize: '0.75rem', 
                          color: '#059669',
                          fontWeight: 'normal'
                        }}>
                          → Auto-selecting related policies & permissions
                        </span>
                      )}
                    </h3>
                    
                    {/* Tab Buttons */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => {
                          const filtered = getFilteredRoles();
                          const roleIds = filtered.map(r => r.id);
                          setSelectedRoles(roleIds);
                          updatePoliciesAndPermissionsFromRoles(roleIds);
                        }}
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
                        onClick={() => setRoleFilter('existing')}
                        style={{
                          backgroundColor: roleFilter === 'existing' ? '#f97316' : '#e5e7eb',
                          color: roleFilter === 'existing' ? 'white' : '#374151',
                          padding: '0.5rem 0.75rem',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
                      >
                        Existing ({sourceRoles.filter(r => getRoleStatus(r) === 'Existing').length})
                      </button>
                      <button
                        onClick={() => setRoleFilter('new')}
                        style={{
                          backgroundColor: roleFilter === 'new' ? '#10b981' : '#e5e7eb',
                          color: roleFilter === 'new' ? 'white' : '#374151',
                          padding: '0.5rem 0.75rem',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
                      >
                        New ({sourceRoles.filter(r => getRoleStatus(r) === 'New').length})
                      </button>
                      <button
                        onClick={() => {
                          setSelectedRoles([]);
                          setSelectedPolicies([]);
                          setSelectedPermissions([]);
                          setRoleFilter('all');
                        }}
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
                    <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.5rem' }}>
                      {getFilteredRoles().map(role => (
                        <label key={role.id} style={{ display: 'block', padding: '0.75rem 0.5rem', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <input
                                type="checkbox"
                                checked={selectedRoles.includes(role.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    const newRoles = [...selectedRoles, role.id];
                                    setSelectedRoles(newRoles);
                                    updatePoliciesAndPermissionsFromRoles(newRoles);
                                  } else {
                                    const newRoles = selectedRoles.filter(id => id !== role.id);
                                    setSelectedRoles(newRoles);
                                    updatePoliciesAndPermissionsFromRoles(newRoles);
                                  }
                                }}
                                style={{ marginRight: '0.75rem' }}
                              />
                              <div>
                                <div style={{ fontWeight: '500' }}>{role.name}</div>
                                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                  ID: {role.id}
                                  {role.policies && role.policies.length > 0 && (
                                    <span style={{ marginLeft: '0.5rem', color: '#059669' }}>
                                      • {role.policies.length} {role.policies.length === 1 ? 'policy' : 'policies'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <span style={{
                              backgroundColor: getRoleStatus(role) === 'Admin' ? '#dc2626' : getRoleStatus(role) === 'New' ? '#dbeafe' : '#fef3c7',
                              color: getRoleStatus(role) === 'Admin' ? 'white' : getRoleStatus(role) === 'New' ? '#1e40af' : '#92400e',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '9999px',
                              fontSize: '0.75rem',
                              fontWeight: '500'
                            }}>
                              {getRoleStatus(role)}
                            </span>
                          </div>
                        </label>
                      ))}
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
