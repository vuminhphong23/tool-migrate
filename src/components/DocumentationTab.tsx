import React, { useState } from 'react';

interface DocumentationTabProps {
  isVisible: boolean;
  onClose: () => void;
}

export function DocumentationTab({ isVisible, onClose }: DocumentationTabProps) {
  const [activeSection, setActiveSection] = useState('permissions');

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
        maxWidth: '90vw',
        maxHeight: '90vh',
        overflow: 'auto',
        position: 'relative',
        width: '1200px'
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'none',
            border: 'none',
            fontSize: '1.5rem',
            cursor: 'pointer'
          }}
        >
          ×
        </button>

        <h2 style={{ marginBottom: '1.5rem' }}>📚 API Documentation</h2>

        {/* Navigation */}
        <div style={{ 
          display: 'flex', 
          gap: '1rem', 
          marginBottom: '2rem',
          borderBottom: '1px solid #e5e7eb',
          paddingBottom: '1rem'
        }}>
          {['permissions', 'roles', 'policies', 'examples'].map(section => (
            <button
              key={section}
              onClick={() => setActiveSection(section)}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: activeSection === section ? '#3b82f6' : '#f3f4f6',
                color: activeSection === section ? 'white' : '#374151',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                textTransform: 'capitalize'
              }}
            >
              {section}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ fontSize: '0.875rem', lineHeight: '1.5' }}>
          {activeSection === 'permissions' && (
            <div>
              <h3>🔐 Permissions API</h3>
              
              <div style={{ marginBottom: '2rem' }}>
                <h4>📖 Read Operations</h4>
                <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '6px', marginBottom: '1rem' }}>
                  <strong>GET /permissions</strong> - List all permissions
                  <br />
                  <strong>GET /permissions/{'{id}'}</strong> - Get single permission
                  <br />
                  <em>Parameters:</em> fields, limit, offset, meta, sort, filter, search, page
                </div>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h4>✏️ Write Operations</h4>
                <div style={{ backgroundColor: '#f0f9ff', padding: '1rem', borderRadius: '6px', marginBottom: '1rem' }}>
                  <strong>POST /permissions</strong> - Create new permission
                  <br />
                  <strong>PATCH /permissions/{'{id}'}</strong> - Update single permission
                  <br />
                  <strong>PATCH /permissions</strong> - Bulk update permissions
                </div>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h4>📝 Permission Structure</h4>
                
                <div style={{ marginBottom: '1rem' }}>
                  <strong>POST /permissions (Create):</strong>
                  <pre style={{ 
                    backgroundColor: '#1f2937', 
                    color: '#f9fafb', 
                    padding: '1rem', 
                    borderRadius: '6px',
                    overflow: 'auto',
                    fontSize: '0.75rem'
                  }}>
{`{
  "collection": "customers",        // string
  "role": 3,                       // integer (not UUID!)
  "read": "full",                  // "none" | "mine" | "role" | "full"
  "create": "none",                // "none" | "full"
  "update": "mine",                // "none" | "mine" | "role" | "full"
  "delete": "role",                // "none" | "mine" | "role" | "full"
  "comment": "create",             // "none" | "create" | "update" | "full"
  "explain": "update",             // "none" | "create" | "update" | "always"
  "status": "*",                   // string
  "read_field_blacklist": ["field1"], // array of strings
  "write_field_blacklist": ["field2"], // array of strings
  "status_blacklist": ["draft"]    // array of strings
}`}
                  </pre>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <strong>PATCH /permissions/{'{id}'} (Update):</strong>
                  <pre style={{ 
                    backgroundColor: '#7c2d12', 
                    color: '#f9fafb', 
                    padding: '1rem', 
                    borderRadius: '6px',
                    overflow: 'auto',
                    fontSize: '0.75rem'
                  }}>
{`{
  "collection": {...},             // object (different!)
  "role": {...},                   // object (not integer!)
  "read": "full",                  // same as POST
  "create": "none",                // same as POST
  "update": "mine",                // same as POST
  "delete": "role",                // same as POST
  "comment": "create",             // "none" | "create" | "update" (no "full"!)
  "explain": "update",             // same as POST
  "status": {...},                 // object (different!)
  "read_field_blacklist": {...},   // object (different!)
  "write_field_blacklist": {...},  // object (different!)
  "status_blacklist": {...}        // object (different!)
}`}
                  </pre>
                </div>
              </div>

              <div style={{ backgroundColor: '#fef2f2', padding: '1rem', borderRadius: '6px' }}>
                <strong>⚠️ Key Differences from Modern Directus:</strong>
                <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                  <li><strong>Role-based</strong> (not policy-based)</li>
                  <li><strong>Role ID is integer</strong> (not UUID string)</li>
                  <li><strong>CRUD-based permissions</strong> (not action-based)</li>
                  <li><strong>Different field structure</strong></li>
                </ul>
              </div>
            </div>
          )}

          {activeSection === 'roles' && (
            <div>
              <h3>👥 Roles API</h3>
              
              <div style={{ marginBottom: '2rem' }}>
                <h4>📖 Read Operations</h4>
                <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '6px', marginBottom: '1rem' }}>
                  <strong>GET /roles</strong> - List all roles
                  <br />
                  <strong>GET /roles/{'{id}'}</strong> - Get single role (UUID parameter)
                  <br />
                  <em>Parameters:</em> fields, limit, offset, meta, sort, filter, search, page
                </div>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h4>✏️ Write Operations</h4>
                <div style={{ backgroundColor: '#f0f9ff', padding: '1rem', borderRadius: '6px', marginBottom: '1rem' }}>
                  <strong>POST /roles</strong> - Create new role
                  <br />
                  <strong>PATCH /roles/{'{id}'}</strong> - Update single role (UUID)
                  <br />
                  <strong>PATCH /roles</strong> - Bulk update roles
                  <br />
                  <strong>DELETE /roles/{'{id}'}</strong> - Delete single role
                </div>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h4>📝 Role Structure</h4>
                <pre style={{ 
                  backgroundColor: '#1f2937', 
                  color: '#f9fafb', 
                  padding: '1rem', 
                  borderRadius: '6px',
                  overflow: 'auto',
                  fontSize: '0.75rem'
                }}>
{`{
  "name": "Content Editor",           // string (required)
  "description": "Can edit content",  // string (optional)
  "enforce_tfa": false,              // boolean
  "external_id": null,               // string (SCIM)
  "ip_access": ["192.168.1.0/24"],   // array of IP ranges
  "module_listing": null             // string (custom nav)
}`}
                </pre>
              </div>

              <div style={{ backgroundColor: '#ecfdf5', padding: '1rem', borderRadius: '6px' }}>
                <strong>✅ Key Insights:</strong>
                <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                  <li><strong>Role ID is UUID</strong> (consistent with modern Directus)</li>
                  <li><strong>Simple structure</strong> - just metadata, no permissions</li>
                  <li><strong>Permissions link to roles</strong> via integer role ID</li>
                  <li><strong>No policies</strong> - direct role-permission relationship</li>
                </ul>
              </div>
            </div>
          )}

          {activeSection === 'policies' && (
            <div>
              <h3>📋 Policies API</h3>
              
              <div style={{ marginBottom: '2rem' }}>
                <h4>📖 Read Operations</h4>
                <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '6px', marginBottom: '1rem' }}>
                  <strong>GET /policies</strong> - List all policies
                  <br />
                  <strong>GET /policies/{'{id}'}</strong> - Get single policy (UUID parameter)
                  <br />
                  <em>Parameters:</em> fields, limit, offset, meta, sort, filter, search, page
                </div>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h4>✏️ Write Operations</h4>
                <div style={{ backgroundColor: '#f0f9ff', padding: '1rem', borderRadius: '6px', marginBottom: '1rem' }}>
                  <strong>POST /policies</strong> - Create new policy
                  <br />
                  <strong>PATCH /policies/{'{id}'}</strong> - Update single policy (UUID)
                  <br />
                  <strong>PATCH /policies</strong> - Bulk update policies
                  <br />
                  <strong>DELETE /policies/{'{id}'}</strong> - Delete single policy
                </div>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h4>📝 Policy Structure</h4>
                <pre style={{ 
                  backgroundColor: '#1f2937', 
                  color: '#f9fafb', 
                  padding: '1rem', 
                  borderRadius: '6px',
                  overflow: 'auto',
                  fontSize: '0.75rem'
                }}>
{`{
  "id": "22640672-eef0-4ee9-ab04-591f3afb288",
  "name": "Admin",                    // string (required)
  "icon": "supervised_user_circle",   // string (optional)
  "description": null,                // string (optional)
  "ip_access": null,                  // CSV of IP addresses
  "enforce_tfa": false,               // boolean
  "admin_access": true,               // boolean (grants full access)
  "app_access": true,                 // boolean (Data Studio access)
  "users": ["user-uuid"],             // array of user UUIDs
  "roles": ["role-uuid"],             // array of role UUIDs  
  "permissions": ["perm-uuid"]        // array of permission UUIDs
}`}
                </pre>
              </div>

              <div style={{ backgroundColor: '#dcfce7', padding: '1rem', borderRadius: '6px' }}>
                <strong>🎉 MODERN DIRECTUS CONFIRMED!</strong>
                <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                  <li><strong>Policy-based system</strong> ✅</li>
                  <li><strong>UUID identifiers</strong> ✅</li>
                  <li><strong>Modern permission structure</strong> ✅</li>
                  <li><strong>No data transformation needed</strong> ✅</li>
                </ul>
              </div>
            </div>
          )}

          {activeSection === 'examples' && (
            <div>
              <h3>🔧 Migration Examples</h3>
              
              <div style={{ marginBottom: '2rem' }}>
                <h4>Data Transformation</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <strong>From (Modern Directus):</strong>
                    <pre style={{ 
                      backgroundColor: '#dc2626', 
                      color: 'white', 
                      padding: '0.75rem', 
                      borderRadius: '4px',
                      fontSize: '0.7rem'
                    }}>
{`{
  "id": "uuid-123",
  "policy": "policy-uuid",
  "collection": "users",
  "action": "read",
  "permissions": {...},
  "fields": ["*"]
}`}
                    </pre>
                  </div>
                  <div>
                    <strong>To (Legacy Directus):</strong>
                    <pre style={{ 
                      backgroundColor: '#059669', 
                      color: 'white', 
                      padding: '0.75rem', 
                      borderRadius: '4px',
                      fontSize: '0.7rem'
                    }}>
{`{
  "role": 3,
  "collection": "users",
  "read": "full",
  "create": "none",
  "update": "none",
  "delete": "none"
}`}
                    </pre>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h4>API Call Examples</h4>
                <pre style={{ 
                  backgroundColor: '#1f2937', 
                  color: '#f9fafb', 
                  padding: '1rem', 
                  borderRadius: '6px',
                  fontSize: '0.75rem'
                }}>
{`// Create Permission
POST /permissions
{
  "collection": "articles",
  "role": 2,
  "read": "full",
  "create": "full",
  "update": "mine",
  "delete": "none"
}

// Update Permission  
PATCH /permissions/123
{
  "read": "role",
  "update": "role"
}

// Bulk Update
PATCH /permissions
{
  "keys": ["123", "124", "125"],
  "data": {
    "read": "full"
  }
}`}
                </pre>
              </div>

              <div style={{ backgroundColor: '#ecfdf5', padding: '1rem', borderRadius: '6px' }}>
                <strong>✅ CONFIRMED WORKING:</strong>
                <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                  <li><strong>❌ Plan A:</strong> /items/directus_* = 403 Forbidden</li>
                  <li><strong>✅ Plan B:</strong> Direct endpoints /roles, /policies, /permissions = SUCCESS</li>
                  <li><strong>Strategy:</strong> PATCH first, then POST if 404</li>
                  <li><strong>Data loaded:</strong> 16 roles, 19 policies, 4996 permissions</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
