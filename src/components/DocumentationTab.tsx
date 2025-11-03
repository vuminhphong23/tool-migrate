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
          gap: '0.5rem', 
          marginBottom: '2rem',
          borderBottom: '1px solid #e5e7eb',
          paddingBottom: '1rem',
          flexWrap: 'wrap'
        }}>
          {['server', 'collections', 'roles', 'policies', 'permissions', 'access', 'flows', 'operations', 'schema'].map(section => (
            <button
              key={section}
              onClick={() => setActiveSection(section)}
              style={{
                padding: '0.5rem 0.75rem',
                backgroundColor: activeSection === section ? '#3b82f6' : '#f3f4f6',
                color: activeSection === section ? 'white' : '#374151',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                textTransform: 'capitalize',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}
            >
              {section}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ fontSize: '0.875rem', lineHeight: '1.5' }}>
          {activeSection === 'server' && (
            <div>
              <h3>🖥️ Server API</h3>
              
              <div style={{ marginBottom: '2rem' }}>
                <h4>📖 Server Information</h4>
                <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '6px', marginBottom: '1rem' }}>
                  <strong>GET /server/info</strong> - Get server information
                  <br />
                  <em>Returns:</em> Directus version, project info, database info
                </div>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h4>📝 Response Structure</h4>
                <pre style={{ 
                  backgroundColor: '#1f2937', 
                  color: '#f9fafb', 
                  padding: '1rem', 
                  borderRadius: '6px',
                  overflow: 'auto',
                  fontSize: '0.75rem'
                }}>
{`{
  "data": {
    "directus": {
      "version": "10.x.x"
    },
    "project": {
      "project_name": "My Project",
      "project_descriptor": "Description",
      "project_logo": null,
      "project_color": "#6644FF",
      "default_language": "en-US",
      "public_foreground": null,
      "public_background": null,
      "public_note": null,
      "custom_css": null
    },
    "database": {
      "vendor": "postgres",
      "version": "14.x"
    }
  }
}`}
                </pre>
              </div>

              <div style={{ backgroundColor: '#ecfdf5', padding: '1rem', borderRadius: '6px' }}>
                <strong>✅ Usage:</strong>
                <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                  <li><strong>Connection testing</strong> - Verify server is reachable</li>
                  <li><strong>Version checking</strong> - Ensure compatibility</li>
                  <li><strong>No authentication required</strong> - Public endpoint</li>
                </ul>
              </div>
            </div>
          )}

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

          {activeSection === 'collections' && (
            <div>
              <h3>📦 Collections API</h3>
              
              <div style={{ marginBottom: '2rem' }}>
                <h4>📖 Read Operations</h4>
                <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '6px', marginBottom: '1rem' }}>
                  <strong>GET /collections</strong> - List all collections
                  <br />
                  <em>Returns:</em> Array of collection metadata
                </div>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h4>📝 Response Structure</h4>
                <pre style={{ 
                  backgroundColor: '#1f2937', 
                  color: '#f9fafb', 
                  padding: '1rem', 
                  borderRadius: '6px',
                  overflow: 'auto',
                  fontSize: '0.75rem'
                }}>
{`{
  "data": [
    {
      "collection": "articles",
      "meta": {
        "collection": "articles",
        "icon": "article",
        "note": null,
        "display_template": null,
        "hidden": false,
        "singleton": false,
        "translations": null,
        "archive_field": "status",
        "archive_value": "archived",
        "unarchive_value": "draft",
        "sort_field": "sort"
      },
      "schema": {
        "name": "articles",
        "comment": null
      }
    }
  ]
}`}
                </pre>
              </div>

              <div style={{ backgroundColor: '#ecfdf5', padding: '1rem', borderRadius: '6px' }}>
                <strong>✅ Usage:</strong>
                <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                  <li><strong>Schema discovery</strong> - List available collections</li>
                  <li><strong>Filtering</strong> - Exclude system collections (directus_*)</li>
                  <li><strong>Migration planning</strong> - Identify collections to migrate</li>
                </ul>
              </div>
            </div>
          )}

          {activeSection === 'access' && (
            <div>
              <h3>🔗 Access API (Role-Policy Relationships)</h3>
              
              <div style={{ marginBottom: '2rem' }}>
                <h4>📖 Read Operations</h4>
                <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '6px', marginBottom: '1rem' }}>
                  <strong>GET /access</strong> - List all role-policy relationships
                  <br />
                  <em>Parameters:</em> fields, limit, offset, meta, sort, filter
                </div>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h4>✏️ Write Operations</h4>
                <div style={{ backgroundColor: '#f0f9ff', padding: '1rem', borderRadius: '6px', marginBottom: '1rem' }}>
                  <strong>POST /access</strong> - Create role-policy relationship
                </div>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h4>📝 Access Structure</h4>
                <pre style={{ 
                  backgroundColor: '#1f2937', 
                  color: '#f9fafb', 
                  padding: '1rem', 
                  borderRadius: '6px',
                  overflow: 'auto',
                  fontSize: '0.75rem'
                }}>
{`// POST /access (Create relationship)
{
  "role": "role-uuid",      // UUID of role
  "policy": "policy-uuid",  // UUID of policy
  "sort": null              // Optional sort order
}

// Response
{
  "data": {
    "id": 123,              // Auto-generated ID
    "role": "role-uuid",
    "policy": "policy-uuid",
    "sort": null
  }
}`}
                </pre>
              </div>

              <div style={{ backgroundColor: '#fef3c7', padding: '1rem', borderRadius: '6px' }}>
                <strong>⚠️ Important:</strong>
                <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                  <li><strong>Junction table</strong> - Links roles to policies (many-to-many)</li>
                  <li><strong>Check duplicates</strong> - Verify relationship doesn't exist before creating</li>
                  <li><strong>Required for access control</strong> - Roles need policies to have permissions</li>
                </ul>
              </div>
            </div>
          )}

          {activeSection === 'flows' && (
            <div>
              <h3>🔄 Flows API</h3>
              
              <div style={{ marginBottom: '2rem' }}>
                <h4>📖 Read Operations</h4>
                <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '6px', marginBottom: '1rem' }}>
                  <strong>GET /flows</strong> - List all flows
                  <br />
                  <em>Parameters:</em> fields, limit, offset, meta, sort, filter
                </div>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h4>✏️ Write Operations</h4>
                <div style={{ backgroundColor: '#f0f9ff', padding: '1rem', borderRadius: '6px', marginBottom: '1rem' }}>
                  <strong>POST /flows</strong> - Create new flow (with operations)
                  <br />
                  <strong>PATCH /flows/{'{id}'}</strong> - Update existing flow
                </div>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h4>📝 Flow Structure</h4>
                <pre style={{ 
                  backgroundColor: '#1f2937', 
                  color: '#f9fafb', 
                  padding: '1rem', 
                  borderRadius: '6px',
                  overflow: 'auto',
                  fontSize: '0.75rem'
                }}>
{`{
  "id": "flow-uuid",
  "name": "My Flow",
  "icon": "bolt",
  "color": "#6644FF",
  "description": "Flow description",
  "status": "active",           // "active" | "inactive"
  "trigger": "manual",          // "manual" | "event" | "webhook" | "schedule"
  "accountability": "all",      // "all" | "activity"
  "options": {
    "collections": ["articles"],
    "location": "item"
  },
  "operation": "operation-uuid", // Root operation UUID
  "operations": [...]            // Array of operations (nested)
}`}
                </pre>
              </div>

              <div style={{ backgroundColor: '#ecfdf5', padding: '1rem', borderRadius: '6px' }}>
                <strong>✅ Key Features:</strong>
                <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                  <li><strong>Automation</strong> - Trigger workflows on events</li>
                  <li><strong>Operations tree</strong> - Linked via operation field</li>
                  <li><strong>Preserve IDs</strong> - Important for operation references</li>
                </ul>
              </div>
            </div>
          )}

          {activeSection === 'operations' && (
            <div>
              <h3>⚙️ Operations API</h3>
              
              <div style={{ marginBottom: '2rem' }}>
                <h4>📖 Read Operations</h4>
                <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '6px', marginBottom: '1rem' }}>
                  <strong>GET /operations</strong> - List all operations
                  <br />
                  <em>Parameters:</em> fields, limit, offset, meta, sort, filter
                </div>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h4>✏️ Write Operations</h4>
                <div style={{ backgroundColor: '#f0f9ff', padding: '1rem', borderRadius: '6px', marginBottom: '1rem' }}>
                  <strong>PATCH /operations/{'{id}'}</strong> - Update operation (for references)
                </div>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h4>📝 Operation Structure</h4>
                <pre style={{ 
                  backgroundColor: '#1f2937', 
                  color: '#f9fafb', 
                  padding: '1rem', 
                  borderRadius: '6px',
                  overflow: 'auto',
                  fontSize: '0.75rem'
                }}>
{`{
  "id": "operation-uuid",
  "name": "Send Email",
  "key": "send_email",
  "type": "mail",              // Operation type
  "position_x": 10,
  "position_y": 20,
  "options": {                 // Type-specific options
    "to": "user@example.com",
    "subject": "Hello",
    "body": "Message"
  },
  "resolve": "next-op-uuid",   // Success path
  "reject": "error-op-uuid",   // Error path
  "flow": "flow-uuid",         // Parent flow
  "date_created": "2024-01-01",
  "user_created": "user-uuid"
}`}
                </pre>
              </div>

              <div style={{ backgroundColor: '#fef2f2', padding: '1rem', borderRadius: '6px' }}>
                <strong>⚠️ Migration Notes:</strong>
                <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                  <li><strong>Reference updates</strong> - Update resolve/reject after creating operations</li>
                  <li><strong>Dependency order</strong> - Create operations in correct sequence</li>
                  <li><strong>ID mapping</strong> - Track old ID → new ID for references</li>
                </ul>
              </div>
            </div>
          )}

          {activeSection === 'schema' && (
            <div>
              <h3>🏗️ Schema API</h3>
              
              <div style={{ marginBottom: '2rem' }}>
                <h4>📖 Read Operations</h4>
                <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '6px', marginBottom: '1rem' }}>
                  <strong>GET /schema/snapshot</strong> - Get complete schema snapshot
                  <br />
                  <em>Returns:</em> Collections, fields, and relationships
                </div>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h4>✏️ Write Operations</h4>
                <div style={{ backgroundColor: '#f0f9ff', padding: '1rem', borderRadius: '6px', marginBottom: '1rem' }}>
                  <strong>POST /schema/diff?force=true</strong> - Compare schemas
                  <br />
                  <strong>POST /schema/apply?force=true</strong> - Apply schema changes
                </div>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h4>📝 Schema Workflow</h4>
                <pre style={{ 
                  backgroundColor: '#1f2937', 
                  color: '#f9fafb', 
                  padding: '1rem', 
                  borderRadius: '6px',
                  overflow: 'auto',
                  fontSize: '0.75rem'
                }}>
{`// 1. Get snapshot from source
GET /schema/snapshot
→ Returns: { collections: {...}, fields: {...}, relations: {...} }

// 2. Compare with target (send snapshot as body)
POST /schema/diff?force=true
Body: { collections: [...], fields: [...], relations: [...] }
→ Returns: { diff: [...], hash: "..." }

// 3. Apply changes to target (send diff as body)
POST /schema/apply?force=true
Body: { diff: [...], hash: "..." }
→ Creates/updates collections, fields, relations`}
                </pre>
              </div>

              <div style={{ backgroundColor: '#fef3c7', padding: '1rem', borderRadius: '6px' }}>
                <strong>⚠️ CRITICAL:</strong>
                <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                  <li><strong>Run BEFORE data migration</strong> - Ensures collections exist</li>
                  <li><strong>Filter system collections</strong> - Exclude directus_* collections</li>
                  <li><strong>Convert format</strong> - Object → Array for diff/apply</li>
                  <li><strong>Use force=true</strong> - Required parameter</li>
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
