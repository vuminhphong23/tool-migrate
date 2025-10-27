# Directus Flows & Operations Migration Analysis

## 📋 **Current State Analysis**

### **Tool hiện tại:**
- ✅ **Support basic collections** - news, client, invoice, page, etc.
- ✅ **Exclude system collections** - including `_operations` (line 575 in apiHandlers.ts)
- ✅ **ID preservation** - try PATCH by ID, fallback to POST with explicit ID
- ✅ **File handling** - single-file fields, checksum/size reuse
- ✅ **Translation support** - deep writes with `deep=true`
- ❌ **NO Flows support** - directus_flows excluded
- ❌ **NO Operations support** - directus_operations excluded

### **Code Structure:**
```typescript
// Current exclude patterns (apiHandlers.ts:571-584)
const defaultExcludePatterns = [
  "_translations",
  "_languages", 
  "_extensions",
  "_operations",    // ← Operations bị exclude
  "_shares",
  "_fields",
  "_migrations",
  "_versions",
  "_notifications",
  "_sessions",
  "_sync_id",
  "directus_",      // ← Flows bị exclude (directus_flows)
];
```

---

## 🔍 **Directus Flows & Operations Deep Dive**

### **1. Flows Architecture**

#### **DirectusFlow Structure:**
```typescript
type DirectusFlow = {
  id: string;                    // UUID
  name: string;                  // Display name
  icon: string | null;           // Icon identifier
  color: string | null;          // Color code
  description: string | null;    // Documentation
  status: 'active' | 'inactive'; // Enable/disable
  trigger: string | null;        // Trigger type (manual, webhook, schedule, etc.)
  accountability: 'all' | '$trigger' | '$full' | null;
  options: Record<string, any> | null;  // Trigger-specific config
  operation: string | null;      // Root operation ID
  date_created: string;
  user_created: string | null;
}
```

#### **DirectusOperation Structure:**
```typescript
type DirectusOperation = {
  id: string;                    // UUID
  name: string | null;           // Display name
  key: string;                   // Operation type (condition, transform, etc.)
  type: string;                  // Operation category
  position_x: number;            // Visual position X
  position_y: number;            // Visual position Y
  options: Record<string, any> | null;  // Operation-specific config
  resolve: string | null;        // Next operation on success
  reject: string | null;         // Next operation on failure
  flow: string;                  // Parent flow ID
  date_created: string;
  user_created: string | null;
}
```

### **2. Flow-Operation Relationships**

#### **Hierarchy:**
```
Flow (1) → Root Operation (1)
  ↓
Operations (N) → Child Operations (N)
  ↓
Resolve/Reject → Next Operations (N)
```

#### **Dependency Chain:**
1. **Flow** defines trigger và root operation
2. **Root Operation** là entry point
3. **Child Operations** linked via `resolve`/`reject` fields
4. **Operation Options** chứa business logic

#### **Example Flow:**
```json
{
  "flow": {
    "id": "flow-123",
    "name": "User Registration Flow",
    "trigger": "event",
    "operation": "op-start-123"
  },
  "operations": [
    {
      "id": "op-start-123",
      "key": "condition",
      "resolve": "op-send-email-456",
      "reject": "op-log-error-789",
      "options": { "filter": { "status": { "_eq": "active" } } }
    },
    {
      "id": "op-send-email-456", 
      "key": "mail",
      "resolve": null,
      "options": { "to": "{{user.email}}", "template": "welcome" }
    }
  ]
}
```

---

## 🚧 **Migration Challenges**

### **1. Dependency Resolution**
- **Operations reference each other** via `resolve`/`reject` IDs
- **Flow references root operation** via `operation` field
- **Circular dependencies** possible
- **Missing operations** break entire flow

### **2. ID Management**
- **UUIDs must be preserved** for references to work
- **Target conflicts** if IDs already exist
- **Partial migrations** leave broken references

### **3. Environment Differences**
- **Different operation types** available
- **Different trigger configurations**
- **Different user/role IDs** in options
- **Different collection names** in filters

### **4. Complex Options**
- **Dynamic references** to collections, users, roles
- **Environment-specific URLs** in webhooks
- **Hardcoded values** need transformation
- **Template variables** may not exist

---

## 🎯 **Migration Strategy**

### **Phase 1: Basic Flow Export/Import**

#### **1.1 Enable Flows in Collection List**
```typescript
// Update apiHandlers.ts exclude patterns
const defaultExcludePatterns = [
  "_translations",
  "_languages", 
  "_extensions",
  // "_operations",     // ← Remove this
  "_shares",
  "_fields",
  "_migrations",
  "_versions",
  "_notifications",
  "_sessions",
  "_sync_id",
  // "directus_",       // ← Make this more specific
  "directus_activity",
  "directus_collections",
  "directus_fields",
  "directus_files",
  "directus_folders",
  "directus_permissions",
  "directus_presets",
  "directus_relations",
  "directus_revisions",
  "directus_roles",
  "directus_sessions",
  "directus_settings",
  "directus_users",
  "directus_webhooks",
  // Keep directus_flows and directus_operations available
];
```

#### **1.2 Create Flow-specific Import Logic**
```typescript
export async function importFlowsFromDirectus(
  sourceUrl: string,
  sourceToken: string,
  targetUrl: string,
  targetToken: string,
  options?: {
    preserveIds?: boolean;
    validateReferences?: boolean;
    transformOptions?: boolean;
  }
): Promise<ImportResult> {
  // 1. Export flows with operations
  // 2. Validate dependencies
  // 3. Transform environment-specific data
  // 4. Import in correct order
}
```

### **Phase 2: Dependency-Aware Migration**

#### **2.1 Flow Dependency Graph**
```typescript
interface FlowDependencyGraph {
  flows: DirectusFlow[];
  operations: DirectusOperation[];
  dependencies: {
    flowId: string;
    operationIds: string[];
    references: {
      operationId: string;
      resolveId?: string;
      rejectId?: string;
    }[];
  }[];
}

function buildDependencyGraph(flows: DirectusFlow[], operations: DirectusOperation[]): FlowDependencyGraph {
  // Build complete dependency tree
  // Detect circular references
  // Determine import order
}
```

#### **2.2 Smart ID Mapping**
```typescript
interface IdMappingStrategy {
  preserveOriginal: boolean;
  generateNew: boolean;
  conflictResolution: 'skip' | 'overwrite' | 'rename';
  mapping: Record<string, string>; // oldId -> newId
}

function createIdMapping(
  sourceFlows: DirectusFlow[],
  sourceOperations: DirectusOperation[],
  targetFlows: DirectusFlow[],
  targetOperations: DirectusOperation[],
  strategy: IdMappingStrategy
): Record<string, string> {
  // Create mapping table for all IDs
  // Handle conflicts based on strategy
  // Update all references
}
```

### **Phase 3: Environment Transformation**

#### **3.1 Options Transformer**
```typescript
interface EnvironmentContext {
  sourceUrl: string;
  targetUrl: string;
  collectionMapping: Record<string, string>;
  userMapping: Record<string, string>;
  roleMapping: Record<string, string>;
}

function transformOperationOptions(
  operation: DirectusOperation,
  context: EnvironmentContext
): DirectusOperation {
  const transformedOptions = { ...operation.options };
  
  // Transform collection references
  if (transformedOptions.collection) {
    transformedOptions.collection = context.collectionMapping[transformedOptions.collection] || transformedOptions.collection;
  }
  
  // Transform user references
  if (transformedOptions.user) {
    transformedOptions.user = context.userMapping[transformedOptions.user] || transformedOptions.user;
  }
  
  // Transform URLs
  if (transformedOptions.url && transformedOptions.url.includes(context.sourceUrl)) {
    transformedOptions.url = transformedOptions.url.replace(context.sourceUrl, context.targetUrl);
  }
  
  return {
    ...operation,
    options: transformedOptions
  };
}
```

#### **3.2 Validation Engine**
```typescript
interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  missingReferences: {
    type: 'collection' | 'user' | 'role' | 'operation';
    id: string;
    context: string;
  }[];
}

function validateFlowMigration(
  flows: DirectusFlow[],
  operations: DirectusOperation[],
  targetContext: EnvironmentContext
): ValidationResult {
  // Validate all references exist in target
  // Check operation type compatibility
  // Verify trigger configurations
  // Validate option schemas
}
```

### **Phase 4: Advanced Features**

#### **4.1 Flow Templates**
```typescript
interface FlowTemplate {
  name: string;
  description: string;
  category: string;
  flows: DirectusFlow[];
  operations: DirectusOperation[];
  requiredCollections: string[];
  optionalCollections: string[];
  configurationSchema: Record<string, any>;
}

function createFlowTemplate(flows: DirectusFlow[], operations: DirectusOperation[]): FlowTemplate {
  // Extract reusable flow patterns
  // Parameterize environment-specific values
  // Generate configuration schema
}
```

#### **4.2 Flow Versioning**
```typescript
interface FlowVersion {
  id: string;
  flowId: string;
  version: string;
  changes: {
    type: 'added' | 'modified' | 'removed';
    target: 'flow' | 'operation';
    targetId: string;
    diff: any;
  }[];
  createdAt: string;
}

function createFlowVersion(
  originalFlows: DirectusFlow[],
  newFlows: DirectusFlow[],
  originalOperations: DirectusOperation[],
  newOperations: DirectusOperation[]
): FlowVersion {
  // Compare flow structures
  // Generate diff
  // Create version record
}
```

---

## 🛠 **Implementation Plan**

### **Week 1-2: Foundation**
- [ ] **Remove Flows/Operations from exclude list**
- [ ] **Add Flows/Operations to collection discovery**
- [ ] **Create basic Flow import/export UI**
- [ ] **Test simple flow migration**

### **Week 3-4: Dependency Management**
- [ ] **Build dependency graph analyzer**
- [ ] **Implement ID mapping system**
- [ ] **Create reference validator**
- [ ] **Test complex flow chains**

### **Week 5-6: Environment Transformation**
- [ ] **Build options transformer**
- [ ] **Add environment context mapping**
- [ ] **Implement validation engine**
- [ ] **Test cross-environment migration**

### **Week 7-8: Advanced Features**
- [ ] **Flow template system**
- [ ] **Version management**
- [ ] **Migration rollback**
- [ ] **Comprehensive testing**

---

## 🎨 **UI/UX Enhancements**

### **Flow Migration Interface**
```typescript
interface FlowMigrationUI {
  flowList: {
    flows: DirectusFlow[];
    selected: string[];
    dependencies: FlowDependencyGraph;
    preview: boolean;
  };
  
  migrationOptions: {
    preserveIds: boolean;
    validateReferences: boolean;
    transformEnvironment: boolean;
    conflictResolution: 'skip' | 'overwrite' | 'rename';
  };
  
  environmentMapping: {
    collections: Record<string, string>;
    users: Record<string, string>;
    roles: Record<string, string>;
    customMappings: Record<string, string>;
  };
  
  validationResults: ValidationResult[];
  migrationProgress: {
    phase: string;
    current: number;
    total: number;
    errors: string[];
  };
}
```

### **Visual Flow Designer**
- **Flow dependency graph** visualization
- **Operation chain** preview
- **Environment differences** highlighting
- **Migration preview** with before/after comparison

---

## 🔒 **Security Considerations**

### **1. Sensitive Data in Options**
- **API keys** in webhook operations
- **Database credentials** in transform operations
- **User tokens** in authentication operations
- **Internal URLs** in service operations

### **2. Permission Validation**
- **Flow execution permissions** in target environment
- **Collection access** for operations
- **User impersonation** capabilities
- **Webhook endpoint** accessibility

### **3. Migration Audit**
- **Log all transformations** applied
- **Track ID mappings** for rollback
- **Record validation failures** for review
- **Monitor execution results** post-migration

---

## 📊 **Success Metrics**

### **Technical Metrics**
- **Migration success rate** (flows working post-migration)
- **Reference integrity** (no broken dependencies)
- **Performance impact** (migration time vs. complexity)
- **Error recovery** (rollback success rate)

### **User Experience Metrics**
- **Migration completion time** (user workflow)
- **Configuration complexity** (steps required)
- **Error comprehension** (user understands issues)
- **Documentation quality** (self-service capability)

---

## 🎯 **Next Steps**

### **Immediate Actions:**
1. **Update exclude patterns** to allow directus_flows and directus_operations
2. **Add Flow/Operation collections** to UI collection list
3. **Create basic Flow export** functionality
4. **Test simple Flow import** with ID preservation

### **Research Required:**
1. **Operation type compatibility** across Directus versions
2. **Trigger configuration** differences between environments
3. **Performance implications** of large flow migrations
4. **Real-world flow patterns** and common use cases

### **Stakeholder Alignment:**
1. **Define migration priorities** (which flows are critical)
2. **Establish validation criteria** (what constitutes success)
3. **Plan rollback procedures** (how to undo migrations)
4. **Document operational procedures** (ongoing maintenance)

---

**Last Updated:** October 23, 2025  
**Status:** Analysis Complete - Ready for Implementation
