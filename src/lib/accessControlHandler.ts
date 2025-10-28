/**
 * Access Control Handler - Simplified version for roles, policies, and permissions migration
 */

import { DirectusClient } from './DirectusClient'

export interface DirectusRole {
  id: string;
  name: string;
  icon: string;
  description: string | null;
  admin_access: boolean;
  app_access: boolean;
  enforce_tfa: boolean;
  policies?: string[];
  users?: string[];
}

export interface DirectusPolicy {
  id: string;
  name: string;
  icon: string;
  description: string | null;
  ip_access?: string;
  enforce_tfa: boolean;
  admin_access: boolean;
  app_access: boolean;
  permissions?: number[];
  roles?: string[];
  users?: string[];
}

export interface DirectusPermission {
  id: number;
  policy: string | null;
  collection: string;
  action: string;
  permissions: Record<string, any> | null;
  validation: Record<string, any> | null;
  presets: Record<string, any> | null;
  fields: string[] | null;
}

export interface AccessControlMigrationOptions {
  roles?: {
    preserveIds?: boolean;
    skipAdminRoles?: boolean;
  };
  policies?: {
    preserveIds?: boolean;
    skipAdminPolicies?: boolean;
  };
  permissions?: {
    validateCollections?: boolean;
    skipInvalidPermissions?: boolean;
  };
}

export interface AccessControlAnalysis {
  roles: {
    count: number;
    adminRoles: string[];
    customRoles: string[];
  };
  policies: {
    count: number;
    adminPolicies: string[];
    customPolicies: string[];
  };
  permissions: {
    count: number;
    byCollection: Record<string, number>;
  };
}

/**
 * Fetch access control data from Directus instance
 */
export async function fetchAccessControlData(
  baseUrl: string,
  token: string
): Promise<{
  success: boolean;
  roles?: DirectusRole[];
  policies?: DirectusPolicy[];
  permissions?: DirectusPermission[];
  error?: any;
}> {
  try {
    const client = new DirectusClient(baseUrl, token);

    console.log('🔍 Fetching access control data...');
    
    const [rolesResponse, policiesResponse, permissionsResponse] = await Promise.all([
      client.get('/roles', { params: { limit: -1 } }),
      client.get('/policies', { params: { limit: -1 } }),
      client.get('/permissions', { params: { limit: -1 } })
    ]);

    const roles = rolesResponse.data || rolesResponse || [];
    const policies = policiesResponse.data || policiesResponse || [];
    const permissions = permissionsResponse.data || permissionsResponse || [];

    console.log(`✅ Fetched ${roles.length} roles, ${policies.length} policies, ${permissions.length} permissions`);

    return {
      success: true,
      roles,
      policies,
      permissions
    };
  } catch (error: any) {
    console.error('❌ Failed to fetch access control data:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch access control data'
    };
  }
}

/**
 * Analyze access control data
 */
export function analyzeAccessControlData(
  roles: DirectusRole[],
  policies: DirectusPolicy[],
  permissions: DirectusPermission[]
): AccessControlAnalysis {
  // Analyze roles
  const adminRoles = roles.filter(role => role.admin_access).map(role => role.id);
  const customRoles = roles.filter(role => !role.admin_access).map(role => role.id);

  // Analyze policies
  const adminPolicies = policies.filter(policy => policy.admin_access).map(policy => policy.id);
  const customPolicies = policies.filter(policy => !policy.admin_access).map(policy => policy.id);

  // Analyze permissions by collection
  const byCollection: Record<string, number> = {};
  permissions.forEach(permission => {
    byCollection[permission.collection] = (byCollection[permission.collection] || 0) + 1;
  });

  return {
    roles: {
      count: roles.length,
      adminRoles,
      customRoles
    },
    policies: {
      count: policies.length,
      adminPolicies,
      customPolicies
    },
    permissions: {
      count: permissions.length,
      byCollection
    }
  };
}

/**
 * Import access control data to target instance
 */
export async function importAccessControlData(
  sourceRoles: DirectusRole[],
  sourcePolicies: DirectusPolicy[],
  sourcePermissions: DirectusPermission[],
  targetUrl: string,
  targetToken: string,
  options?: AccessControlMigrationOptions
): Promise<{
  success: boolean;
  message: string;
  importedRoles?: any[];
  importedPolicies?: any[];
  importedPermissions?: any[];
}> {
  try {
    const client = new DirectusClient(targetUrl, targetToken);
    
    const importedRoles: any[] = [];
    const importedPolicies: any[] = [];
    const importedPermissions: any[] = [];

    console.log('🚀 Starting access control migration...');

    // Load existing data from target for comparison
    console.log('📋 Loading existing target data...');
    const [targetRolesRes, targetPoliciesRes, targetPermissionsRes] = await Promise.all([
      client.get('/roles').catch(() => ({ data: [] })),
      client.get('/policies').catch(() => ({ data: [] })),
      client.get('/permissions').catch(() => ({ data: [] }))
    ]);

    const existingRoles = targetRolesRes.data || [];
    const existingPolicies = targetPoliciesRes.data || [];
    const existingPermissions = targetPermissionsRes.data || [];

    // Step 1: Import Roles
    console.log('📋 Importing roles...');
    for (const role of sourceRoles) {
      try {
        if (options?.roles?.skipAdminRoles && role.admin_access) {
          console.log(`⏭️ Skipping admin role: ${role.name}`);
          continue;
        }

        const { users, ...cleanRole } = role; // Keep policies, remove only users
        
        // Check if role already exists in target
        const existingRole = existingRoles.find((r: any) => r.id === role.id);
        
        let response;
        let importedId;
        
        if (existingRole && options?.roles?.preserveIds) {
          // Role exists and we want to preserve IDs -> PATCH
          console.log(`🔄 Updating existing role: ${role.name} (${role.id})`);
          const { id, ...roleToUpdate } = cleanRole; // Remove ID from body for PATCH
          response = await client.patch(`/roles/${role.id}`, roleToUpdate);
          importedId = role.id; // Keep original ID
        } else {
          // Role doesn't exist or we don't preserve IDs -> POST
          console.log(`➕ Creating new role: ${role.name}`);
          const roleToImport = {
            ...cleanRole,
            id: options?.roles?.preserveIds ? role.id : undefined
          };
          response = await client.post('/roles', roleToImport);
          importedId = response.data?.id || response.id || role.id;
        }
        
        importedRoles.push({
          originalId: role.id,
          newId: importedId,
          name: role.name,
          status: 'success'
        });

        console.log(`✅ Imported role: ${role.name} (${role.id} → ${importedId})`);
      } catch (error: any) {
        console.error(`❌ Failed to import role ${role.name}:`, error.message);
        importedRoles.push({
          originalId: role.id,
          newId: '',
          name: role.name,
          status: 'error',
          error: error.message
        });
      }
    }

    // Step 2: Import Policies
    console.log('🔐 Importing policies...');
    for (const policy of sourcePolicies) {
      try {
        if (options?.policies?.skipAdminPolicies && policy.admin_access) {
          console.log(`⏭️ Skipping admin policy: ${policy.name}`);
          continue;
        }

        const { users, ...cleanPolicy } = policy; // Keep permissions and roles relationships, remove only users
        
        // Check if policy already exists in target
        const existingPolicy = existingPolicies.find((p: any) => p.id === policy.id);
        
        let response;
        let importedId;
        
        if (existingPolicy && options?.policies?.preserveIds) {
          // Policy exists and we want to preserve IDs -> PATCH
          console.log(`🔄 Updating existing policy: ${policy.name} (${policy.id})`);
          const { id, ...policyToUpdate } = {
            ...cleanPolicy,
            ip_access: policy.ip_access || null
          };
          response = await client.patch(`/policies/${policy.id}`, policyToUpdate);
          importedId = policy.id; // Keep original ID
        } else {
          // Policy doesn't exist or we don't preserve IDs -> POST
          console.log(`➕ Creating new policy: ${policy.name}`);
          const policyToImport = {
            ...cleanPolicy,
            id: options?.policies?.preserveIds ? policy.id : undefined,
            ip_access: policy.ip_access || null
          };
          response = await client.post('/policies', policyToImport);
          importedId = response.data?.id || response.id || policy.id;
        }
        
        importedPolicies.push({
          originalId: policy.id,
          newId: importedId,
          name: policy.name,
          status: 'success'
        });

        console.log(`✅ Imported policy: ${policy.name} (${policy.id} → ${importedId})`);
      } catch (error: any) {
        console.error(`❌ Failed to import policy ${policy.name}:`, error.message);
        importedPolicies.push({
          originalId: policy.id,
          newId: '',
          name: policy.name,
          status: 'error',
          error: error.message
        });
      }
    }

    // Step 3: Import Permissions (simplified - create new IDs)
    console.log('🔑 Importing permissions...');
    let successfulPermissions = 0;
    
    for (const permission of sourcePermissions) {
      try {
        if (options?.permissions?.skipInvalidPermissions && !permission.policy) {
          console.log(`⏭️ Skipping permission without policy: ${permission.collection}.${permission.action}`);
          continue;
        }

        // Check if permission already exists in target (by collection + action + policy)
        const existingPermission = existingPermissions.find((p: any) => 
          p.collection === permission.collection &&
          p.action === permission.action &&
          p.policy === permission.policy
        );
        
        let response;
        let importedId;
        
        if (existingPermission) {
          // Permission exists -> PATCH
          console.log(`🔄 Updating existing permission: ${permission.collection}.${permission.action} (${existingPermission.id})`);
          const { id, ...permissionToUpdate } = permission;
          response = await client.patch(`/permissions/${existingPermission.id}`, permissionToUpdate);
          importedId = existingPermission.id; // Keep existing ID
        } else {
          // Permission doesn't exist -> POST
          console.log(`➕ Creating new permission: ${permission.collection}.${permission.action}`);
          const { id, ...cleanPermission } = permission;
          const permissionToImport = {
            ...cleanPermission,
            // Note: We create new permission IDs to avoid conflicts
          };
          response = await client.post('/permissions', permissionToImport);
          importedId = response.data?.id || response.id;
        }
        
        importedPermissions.push({
          originalId: permission.id,
          newId: importedId,
          collection: permission.collection,
          action: permission.action,
          status: 'success'
        });

        successfulPermissions++;
        
        if (successfulPermissions % 10 === 0) {
          console.log(`📊 Imported ${successfulPermissions}/${sourcePermissions.length} permissions...`);
        }
      } catch (error: any) {
        console.error(`❌ Failed to import permission ${permission.collection}.${permission.action}:`, error.message);
        importedPermissions.push({
          originalId: permission.id,
          newId: 0,
          collection: permission.collection,
          action: permission.action,
          status: 'error',
          error: error.message
        });
      }
    }

    const successfulRoles = importedRoles.filter(r => r.status === 'success').length;
    const successfulPolicies = importedPolicies.filter(p => p.status === 'success').length;

    console.log('🎉 Access control migration completed!');
    console.log(`📊 Results: ${successfulRoles}/${sourceRoles.length} roles, ${successfulPolicies}/${sourcePolicies.length} policies, ${successfulPermissions}/${sourcePermissions.length} permissions`);

    return {
      success: true,
      message: `Successfully imported ${successfulRoles} roles, ${successfulPolicies} policies, and ${successfulPermissions} permissions`,
      importedRoles,
      importedPolicies,
      importedPermissions
    };

  } catch (error: any) {
    console.error('💥 Access control migration failed:', error);
    return {
      success: false,
      message: `Access control migration failed: ${error.message}`
    };
  }
}
