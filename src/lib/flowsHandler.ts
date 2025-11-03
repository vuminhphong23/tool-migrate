import { DirectusClient } from './DirectusClient';
import type { ImportLogEntry } from '../types';

// Directus Flow Types
export interface DirectusFlow {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  description: string | null;
  status: 'active' | 'inactive';
  trigger: string | null;
  accountability: 'all' | '$trigger' | '$full' | null;
  options: Record<string, any> | null;
  operation: string | null; // Root operation ID
  date_created: string;
  user_created: string | null;
  date_updated?: string;
  user_updated?: string | null;
}

export interface DirectusOperation {
  id: string;
  name: string | null;
  key: string; // Operation type
  type: string;
  position_x: number;
  position_y: number;
  options: Record<string, any> | null;
  resolve: string | null; // Next operation on success
  reject: string | null;  // Next operation on failure
  flow: string; // Parent flow ID
  date_created: string;
  user_created: string | null;
  date_updated?: string;
  user_updated?: string | null;
}

export interface FlowDependencyGraph {
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

export interface FlowMigrationOptions {
  preserveIds?: boolean;
  validateReferences?: boolean;
  transformOptions?: boolean;
  conflictResolution?: 'skip' | 'overwrite' | 'rename';
  environmentMapping?: {
    collections?: Record<string, string>;
    users?: Record<string, string>;
    roles?: Record<string, string>;
    baseUrl?: string;
  };
}

export interface FlowValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  missingReferences: {
    type: 'collection' | 'user' | 'role' | 'operation' | 'flow';
    id: string;
    context: string;
  }[];
}

export interface FlowImportResult {
  success: boolean;
  message: string;
  importedFlows?: {
    originalId: string;
    newId: string;
    name: string;
    status: 'success' | 'error';
    error?: string;
  }[];
  importedOperations?: {
    originalId: string;
    newId: string;
    flowId: string;
    status: 'success' | 'error';
    error?: string;
  }[];
  validationResults?: FlowValidationResult;
  importLog?: ImportLogEntry[];
}

/**
 * Get all flows from a Directus instance
 */
export async function getFlowsFromDirectus(
  baseUrl: string,
  token: string
): Promise<{
  success: boolean;
  flows?: DirectusFlow[];
  operations?: DirectusOperation[];
  error?: any;
}> {
  try {
    const client = new DirectusClient(baseUrl, token);

    // Fetch flows
    const flowsResponse = await client.get('/flows', {
      params: { limit: -1 }
    });
    const flows = flowsResponse.data || [];

    // Fetch operations
    const operationsResponse = await client.get('/operations', {
      params: { limit: -1 }
    });
    const operations = operationsResponse.data || [];

    return {
      success: true,
      flows,
      operations
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.message,
        status: error.response?.status,
        details: error.response?.data
      }
    };
  }
}

/**
 * Build dependency graph for flows and operations
 */
export function buildFlowDependencyGraph(
  flows: DirectusFlow[],
  operations: DirectusOperation[]
): FlowDependencyGraph {
  const dependencies = flows.map(flow => {
    // Find all operations for this flow
    const flowOperations = operations.filter(op => op.flow === flow.id);
    
    // Build reference chain
    const references = flowOperations.map(op => ({
      operationId: op.id,
      resolveId: op.resolve || undefined,
      rejectId: op.reject || undefined
    }));

    return {
      flowId: flow.id,
      operationIds: flowOperations.map(op => op.id),
      references
    };
  });

  return {
    flows,
    operations,
    dependencies
  };
}

/**
 * Validate flow migration before execution
 */
export function validateFlowMigration(
  flows: DirectusFlow[],
  operations: DirectusOperation[],
  options?: FlowMigrationOptions
): FlowValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const missingReferences: FlowValidationResult['missingReferences'] = [];

  // Validate flow-operation relationships
  for (const flow of flows) {
    if (flow.operation) {
      const rootOperation = operations.find(op => op.id === flow.operation);
      if (!rootOperation) {
        errors.push(`Flow "${flow.name}" references missing root operation: ${flow.operation}`);
        missingReferences.push({
          type: 'operation',
          id: flow.operation,
          context: `Flow "${flow.name}" root operation`
        });
      }
    }
  }

  // Validate operation references
  for (const operation of operations) {
    // Check resolve reference
    if (operation.resolve) {
      const resolveOperation = operations.find(op => op.id === operation.resolve);
      if (!resolveOperation) {
        errors.push(`Operation "${operation.name || operation.id}" references missing resolve operation: ${operation.resolve}`);
        missingReferences.push({
          type: 'operation',
          id: operation.resolve,
          context: `Operation "${operation.name || operation.id}" resolve`
        });
      }
    }

    // Check reject reference
    if (operation.reject) {
      const rejectOperation = operations.find(op => op.id === operation.reject);
      if (!rejectOperation) {
        errors.push(`Operation "${operation.name || operation.id}" references missing reject operation: ${operation.reject}`);
        missingReferences.push({
          type: 'operation',
          id: operation.reject,
          context: `Operation "${operation.name || operation.id}" reject`
        });
      }
    }

    // Check flow reference
    const parentFlow = flows.find(flow => flow.id === operation.flow);
    if (!parentFlow) {
      errors.push(`Operation "${operation.name || operation.id}" references missing flow: ${operation.flow}`);
      missingReferences.push({
        type: 'flow',
        id: operation.flow,
        context: `Operation "${operation.name || operation.id}" parent flow`
      });
    }
  }

  // Detect circular references
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function detectCircularReference(operationId: string): boolean {
    if (recursionStack.has(operationId)) {
      return true; // Circular reference detected
    }
    
    if (visited.has(operationId)) {
      return false; // Already processed
    }

    visited.add(operationId);
    recursionStack.add(operationId);

    const operation = operations.find(op => op.id === operationId);
    if (operation) {
      if (operation.resolve && detectCircularReference(operation.resolve)) {
        errors.push(`Circular reference detected in operation chain starting from: ${operationId}`);
        return true;
      }
      if (operation.reject && detectCircularReference(operation.reject)) {
        errors.push(`Circular reference detected in operation chain starting from: ${operationId}`);
        return true;
      }
    }

    recursionStack.delete(operationId);
    return false;
  }

  // Check for circular references starting from root operations
  for (const flow of flows) {
    if (flow.operation) {
      detectCircularReference(flow.operation);
    }
  }

  // Validate environment-specific options
  if (options?.transformOptions && options.environmentMapping) {
    for (const operation of operations) {
      if (operation.options) {
        // Check collection references
        if (operation.options.collection && options.environmentMapping.collections) {
          const targetCollection = options.environmentMapping.collections[operation.options.collection];
          if (!targetCollection) {
            warnings.push(`Operation "${operation.name || operation.id}" references unmapped collection: ${operation.options.collection}`);
          }
        }

        // Check user references
        if (operation.options.user && options.environmentMapping.users) {
          const targetUser = options.environmentMapping.users[operation.options.user];
          if (!targetUser) {
            warnings.push(`Operation "${operation.name || operation.id}" references unmapped user: ${operation.options.user}`);
          }
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    missingReferences
  };
}

/**
 * Transform operation options for target environment
 */
export function transformOperationOptions(
  operation: DirectusOperation,
  environmentMapping: FlowMigrationOptions['environmentMapping'] = {}
): DirectusOperation {
  if (!operation.options || !environmentMapping) {
    return operation;
  }

  const transformedOptions = { ...operation.options };

  // Transform collection references
  if (transformedOptions.collection && environmentMapping.collections) {
    const mappedCollection = environmentMapping.collections[transformedOptions.collection];
    if (mappedCollection) {
      transformedOptions.collection = mappedCollection;
    }
  }

  // Transform user references
  if (transformedOptions.user && environmentMapping.users) {
    const mappedUser = environmentMapping.users[transformedOptions.user];
    if (mappedUser) {
      transformedOptions.user = mappedUser;
    }
  }

  // Transform role references
  if (transformedOptions.role && environmentMapping.roles) {
    const mappedRole = environmentMapping.roles[transformedOptions.role];
    if (mappedRole) {
      transformedOptions.role = mappedRole;
    }
  }

  // Transform URL references
  if (environmentMapping.baseUrl) {
    const urlFields = ['url', 'webhook_url', 'endpoint', 'callback_url'];
    for (const field of urlFields) {
      if (transformedOptions[field] && typeof transformedOptions[field] === 'string') {
        // Replace any localhost or development URLs with target base URL
        transformedOptions[field] = transformedOptions[field].replace(
          /https?:\/\/localhost(:\d+)?/g,
          environmentMapping.baseUrl
        );
      }
    }
  }

  return {
    ...operation,
    options: transformedOptions
  };
}

/**
 * Import flows and operations to target Directus instance
 */
export async function importFlowsToDirectus(
  sourceFlows: DirectusFlow[],
  sourceOperations: DirectusOperation[],
  targetUrl: string,
  targetToken: string,
  options: FlowMigrationOptions = {}
): Promise<FlowImportResult> {
  const importLog: ImportLogEntry[] = [];
  const importedFlows: FlowImportResult['importedFlows'] = [];
  const importedOperations: FlowImportResult['importedOperations'] = [];

  const logStep = (step: string, details: Record<string, unknown>) => {
    const logEntry: ImportLogEntry = {
      timestamp: new Date().toISOString(),
      step,
      details
    };
    importLog.push(logEntry);
  };

  try {
    logStep('flow_migration_start', {
      flowCount: sourceFlows.length,
      operationCount: sourceOperations.length,
      options
    });

    // Validate before migration
    const validationResult = validateFlowMigration(sourceFlows, sourceOperations, options);
    if (!validationResult.isValid && !options.validateReferences) {
      logStep('validation_failed', { errors: validationResult.errors });
      return {
        success: false,
        message: `Flow validation failed: ${validationResult.errors.join(', ')}`,
        validationResults: validationResult,
        importLog
      };
    }

    const client = new DirectusClient(targetUrl, targetToken);

    // Create ID mapping if not preserving IDs
    const idMapping: Record<string, string> = {};
    
    if (!options.preserveIds) {
      // Generate new UUIDs for all flows and operations
      sourceFlows.forEach(flow => {
        idMapping[flow.id] = crypto.randomUUID();
      });
      sourceOperations.forEach(operation => {
        idMapping[operation.id] = crypto.randomUUID();
      });
    }

    // Import each flow as a complete unit (flow + operations together)
    // This is the correct approach according to Directus API
    for (const sourceFlow of sourceFlows) {
      try {
        const flowId = options.preserveIds ? sourceFlow.id : idMapping[sourceFlow.id];
        const { date_created, user_created, date_updated, user_updated, ...cleanFlow } = sourceFlow;
        
        // Get all operations for this flow
        const flowOperations = sourceOperations.filter(op => op.flow === sourceFlow.id);
        
        // Build operations array WITHOUT resolve/reject first (to avoid circular reference issues)
        const operations = flowOperations.map(sourceOp => {
          const operationId = options.preserveIds ? sourceOp.id : idMapping[sourceOp.id];
          
          const { date_created, user_created, date_updated, user_updated, resolve, reject, ...cleanOp } = sourceOp;
          
          return {
            ...cleanOp,
            id: options.preserveIds ? operationId : undefined,
            flow: flowId,
            resolve: null, // Will be set after all operations are created
            reject: null   // Will be set after all operations are created
          };
        });
        
        // Determine root operation
        const rootOperationId = sourceFlow.operation ? 
          (options.preserveIds ? sourceFlow.operation : idMapping[sourceFlow.operation]) : 
          null;
        
        // Build complete flow with operations
        const flowWithOperations = {
          ...cleanFlow,
          id: options.preserveIds ? flowId : undefined,
          operation: rootOperationId,
          operations: operations
        };
        
        // Try to import the complete flow
        let importResponse;
        try {
          // Try POST first (create new flow with operations)
          importResponse = await client.post('/flows', flowWithOperations);
          logStep('flow_created', { originalId: sourceFlow.id, newId: flowId, name: sourceFlow.name });
          
          importedFlows?.push({
            originalId: sourceFlow.id,
            newId: flowId,
            name: sourceFlow.name,
            status: 'success'
          });
          
          // Mark all operations as imported
          flowOperations.forEach(op => {
            const opId = options.preserveIds ? op.id : idMapping[op.id];
            importedOperations?.push({
              originalId: op.id,
              newId: opId,
              flowId: flowId,
              status: 'success'
            });
          });
          
          // Now update resolve/reject references for all operations
          for (const sourceOp of flowOperations) {
            if (sourceOp.resolve || sourceOp.reject) {
              try {
                const opId = options.preserveIds ? sourceOp.id : idMapping[sourceOp.id];
                const resolveId = sourceOp.resolve ? (options.preserveIds ? sourceOp.resolve : idMapping[sourceOp.resolve]) : null;
                const rejectId = sourceOp.reject ? (options.preserveIds ? sourceOp.reject : idMapping[sourceOp.reject]) : null;
                
                await client.patch(`/operations/${opId}`, {
                  resolve: resolveId,
                  reject: rejectId
                });
                
              } catch (refError: any) {
              }
            }
          }
          
        } catch (createError: any) {
          
          // If POST fails, try PATCH (update existing)
          const { id, operations: ops, ...flowUpdateData } = flowWithOperations;
          
          try {
            await client.patch(`/flows/${flowId}`, flowUpdateData);
            logStep('flow_updated', { originalId: sourceFlow.id, newId: flowId, name: sourceFlow.name });
            
            importedFlows?.push({
              originalId: sourceFlow.id,
              newId: flowId,
              name: sourceFlow.name,
              status: 'success'
            });
            
            // Update operations individually
            for (const operation of operations) {
              try {
                const opId = operation.id || idMapping[sourceOperations.find(o => o.flow === sourceFlow.id && o.key === operation.key)?.id || ''];
                const { id: _, ...opData } = operation;
                
                await client.patch(`/operations/${opId}`, opData);
                
                importedOperations?.push({
                  originalId: sourceOperations.find(o => o.id === opId)?.id || opId,
                  newId: opId,
                  flowId: flowId,
                  status: 'success'
                });
              } catch (opError: any) {
                importedOperations?.push({
                  originalId: operation.id || '',
                  newId: '',
                  flowId: flowId,
                  status: 'error',
                  error: opError.message
                });
              }
            }
            
          } catch (updateError: any) {
            throw updateError;
          }
        }

      } catch (error: any) {
        logStep('flow_import_failed', { flowId: sourceFlow.id, error: error.message });
        
        importedFlows?.push({
          originalId: sourceFlow.id,
          newId: '',
          name: sourceFlow.name,
          status: 'error',
          error: error.message
        });
      }
    }  

    const successfulFlows = importedFlows?.filter(f => f.status === 'success').length || 0;
    const successfulOperations = importedOperations?.filter(o => o.status === 'success').length || 0;

    logStep('flow_migration_complete', {
      successfulFlows,
      successfulOperations,
      totalFlows: sourceFlows.length,
      totalOperations: sourceOperations.length
    });

    return {
      success: true,
      message: `Successfully imported ${successfulFlows}/${sourceFlows.length} flows and ${successfulOperations}/${sourceOperations.length} operations`,
      importedFlows,
      importedOperations,
      validationResults: validationResult,
      importLog
    };

  } catch (error: any) {
    logStep('flow_migration_fatal_error', { error: error.message });
    return {
      success: false,
      message: `Flow migration failed: ${error.message}`,
      importLog
    };
  }
}
