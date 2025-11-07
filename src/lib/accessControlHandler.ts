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
    
    const [rolesResponse, policiesResponse, permissionsResponse, accessResponse] = await Promise.all([
      client.get('/roles', { params: { limit: -1 } }),
      client.get('/policies', { params: { limit: -1 } }),
      client.get('/permissions', { params: { limit: -1 } }),
      client.get('/access', { params: { limit: -1 } }).catch(() => ({ data: [] }))
    ]);

    const roles = rolesResponse.data || rolesResponse || [];
    const policies = policiesResponse.data || policiesResponse || [];
    const permissions = permissionsResponse.data || permissionsResponse || [];
    const accessRelations = accessResponse.data || accessResponse || [];

    const rolesWithPolicies = roles.map((role: any) => {
      const rolePolicies = accessRelations
        .filter((access: any) => access.role === role.id)
        .map((access: any) => access.policy);
      
      return {
        ...role,
        policies: rolePolicies
      };
    });

    return {
      success: true,
      roles: rolesWithPolicies,
      policies,
      permissions
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to fetch access control data'
    };
  }
}

export function analyzeAccessControlData(
  roles: DirectusRole[],
  policies: DirectusPolicy[],
  permissions: DirectusPermission[]
): AccessControlAnalysis {
  const adminRoles = roles.filter(role => role.admin_access).map(role => role.id);
  const customRoles = roles.filter(role => !role.admin_access).map(role => role.id);

  const adminPolicies = policies.filter(policy => policy.admin_access).map(policy => policy.id);
  const customPolicies = policies.filter(policy => !policy.admin_access).map(policy => policy.id);

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

    const [targetRolesRes, targetPoliciesRes, targetPermissionsRes] = await Promise.all([
      client.get('/roles').catch(() => ({ data: [] })),
      client.get('/policies').catch(() => ({ data: [] })),
      client.get('/permissions').catch(() => ({ data: [] }))
    ]);

    const existingRoles = targetRolesRes.data || [];
    const existingPolicies = targetPoliciesRes.data || [];
    const existingPermissions = targetPermissionsRes.data || [];

    for (const role of sourceRoles) {
      try {
        if (options?.roles?.skipAdminRoles && role.admin_access) {
          continue;
        }

        const { users, policies, ...cleanRole } = role; 
        const existingRole = existingRoles.find((r: any) => r.id === role.id);
        
        let response;
        let importedId;
        
        if (existingRole && options?.roles?.preserveIds) {
          const { id, ...roleToUpdate } = cleanRole; 
          response = await client.patch(`/roles/${role.id}`, roleToUpdate);
          importedId = role.id; 
        } else {
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
      } catch (error: any) {
        importedRoles.push({
          originalId: role.id,
          newId: '',
          name: role.name,
          status: 'error',
          error: error.message
        });
      }
    }

    for (const policy of sourcePolicies) {
      try {
        if (options?.policies?.skipAdminPolicies && policy.admin_access) {
          continue;
        }

        const { users, roles, permissions, ...cleanPolicy } = policy;
        
        const existingPolicy = existingPolicies.find((p: any) => p.id === policy.id);
        
        let response;
        let importedId;
        
        if (existingPolicy && options?.policies?.preserveIds) {
          const { id, ...policyToUpdate } = {
            ...cleanPolicy,
            ip_access: policy.ip_access || null
          };
          response = await client.patch(`/policies/${policy.id}`, policyToUpdate);
          importedId = policy.id; 
        } else {
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
      } catch (error: any) {
        importedPolicies.push({
          originalId: policy.id,
          newId: '',
          name: policy.name,
          status: 'error',
          error: error.message
        });
      }
    }

    let successfulPermissions = 0;
    
    for (const permission of sourcePermissions) {
      try {
        if (options?.permissions?.skipInvalidPermissions && !permission.policy) {
          continue;
        }

        if (permission.policy) {
          const policyExists = existingPolicies.some((p: any) => p.id === permission.policy) ||
                              importedPolicies.some(p => p.originalId === permission.policy && p.status === 'success');
          
          if (!policyExists) {
            importedPermissions.push({
              originalId: permission.id,
              newId: 0,
              collection: permission.collection,
              action: permission.action,
              status: 'skipped',
              error: `Policy ${permission.policy} not found in target`
            });
            continue;
          }
        }

        const existingPermission = existingPermissions.find((p: any) => 
          p.collection === permission.collection &&
          p.action === permission.action &&
          p.policy === permission.policy
        );
        
        let response;
        let importedId;
        
        if (existingPermission) {
          const cleanPermission = {
            policy: permission.policy,
            collection: permission.collection,
            action: permission.action,
            permissions: permission.permissions || null,
            validation: permission.validation || null,
            presets: permission.presets || null,
            fields: permission.fields || null
          };
          
          response = await client.patch(`/permissions/${existingPermission.id}`, cleanPermission);
          importedId = existingPermission.id; 
        } else {
          const permissionToImport = {
            policy: permission.policy,
            collection: permission.collection,
            action: permission.action,
            permissions: permission.permissions || null,
            validation: permission.validation || null,
            presets: permission.presets || null,
            fields: permission.fields || null
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
      } catch (error: any) {
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

    const importedAccess: any[] = [];
    let successfulAccess = 0;
    
    const targetAccessRes = await client.get('/access').catch(() => ({ data: [] }));
    const existingAccess = targetAccessRes.data || [];
    
    for (const role of sourceRoles) {
      if (!role.policies || !Array.isArray(role.policies) || role.policies.length === 0) {
        continue;
      }
      
      for (const policyId of role.policies) {
        try {
          const existingRelation = existingAccess.find((a: any) => 
            a.role === role.id && a.policy === policyId
          );
          
          if (existingRelation) {
            successfulAccess++; 
            continue;
          }
          
          const policyImported = importedPolicies.find(p => p.originalId === policyId && p.status === 'success');
          const policyExistsInTarget = existingPolicies.some((p: any) => p.id === policyId);
          
          if (!policyImported && !policyExistsInTarget) {
            continue;
          }
          
          const accessData = {
            role: role.id,
            policy: policyId,
            sort: null
          };
          
          const response = await client.post('/access', accessData);
          
          importedAccess.push({
            role: role.id,
            policy: policyId,
            status: 'success'
          });
          
          successfulAccess++;
        } catch (error: any) {
          importedAccess.push({
            role: role.id,
            policy: policyId,
            status: 'error',
            error: error.message
          });
        }
      }
    }

    const successfulRoles = importedRoles.filter(r => r.status === 'success').length;
    const successfulPolicies = importedPolicies.filter(p => p.status === 'success').length;

    return {
      success: true,
      message: `Successfully imported ${successfulRoles} roles, ${successfulPolicies} policies, ${successfulPermissions} permissions, and ${successfulAccess} access relationships`,
      importedRoles,
      importedPolicies,
      importedPermissions
    };

  } catch (error: any) {
    return {
      success: false,
      message: `Access control migration failed: ${error.message}`
    };
  }
}
