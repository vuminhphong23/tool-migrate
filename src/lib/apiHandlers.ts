import { createDirectus, readItems, rest, staticToken, readRelations } from "@directus/sdk";
import { DirectusClient } from "./DirectusClient";
import type { ImportLogEntry } from "../types";

interface Translation {
  languages_code: string;
  title: string | { value: string };
  body: string | { value: string } | null;
  [key: string]: any;
}

interface BaseItem {
  id: number | string;
  title?: string;
  status: number | string;
  date?: string;
  date_created?: string;
  counter?: number;
  url?: string;
  path?: string;
  sort?: number;
  client?: any;
  site?: any;
  services?: any;
  body?: any;
  image?: string | null;
  audio?: string | null;
  video?: string | string[] | null;
  videoFiles?: (string | { id: string })[];
  media?: Array<{
    url: string;
    filename: string;
    type: string;
    type_short: string;
    id: number;
    description: string;
    field_name: string;
  }>;
  translations?: Translation[];
}

interface ImportedItem {
  originalId: string | number;
  newId?: string | number;
  status: 'success' | 'error';
  action?: 'created' | 'updated';
  data?: any;
  error?: {
    message: string;
    status?: number;
    details?: any;
  };
}

interface ImportResult {
  success: boolean;
  message: string;
  importedItems?: ImportedItem[];
  error?: any;
  importLog?: ImportLogEntry[];
}

interface ValidationResult {
  success: boolean;
  message: string;
  serverInfo?: {
    version: string;
    project: string;
  };
  error?: any;
}

/**
 * Validates a Directus admin token against a target server
 */
export async function validateDirectusToken(
  selectedDomain: string,
  adminToken: string,
): Promise<ValidationResult> {
  const validationLog: any[] = [];

  const logStep = (step: string, details: any) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      step,
      details,
    };
    validationLog.push(logEntry);
  };

  try {
    logStep("request_received", {
      selectedDomain,
      hasToken: !!adminToken,
    });

    if (!selectedDomain || !adminToken) {
      const error = {
        hasSelectedDomain: !!selectedDomain,
        hasAdminToken: !!adminToken,
      };
      logStep("validation_error", error);
      return {
        success: false,
        message: "Missing required parameters: selectedDomain and adminToken",
        error: { validationLog },
      };
    }

    // Create DirectusClient for validation
    const client = new DirectusClient(selectedDomain, adminToken);

    // Test connection by trying to read users (requires admin access)
    logStep("token_validation_start", {});
    try {
      const testResult = await client.get("/users", { params: { limit: 1 } });

      logStep("token_validation_success", {
        hasAccess: true,
        userCount: testResult?.data?.length || 0,
      });

      return {
        success: true,
        message: "Token validation successful",
        serverInfo: undefined,
      };
    } catch (tokenError: any) {
      logStep("token_validation_failed", {
        error: tokenError.message,
        status: tokenError.response?.status,
        details: tokenError.response?.data,
      });
      return {
        success: false,
        message: "Invalid admin token or insufficient permissions",
        error: {
          message: tokenError.message,
          status: tokenError.response?.status,
          details: tokenError.response?.data,
          validationLog,
        },
      };
    }
  } catch (error: any) {
    logStep("fatal_error", {
      message: error.message,
      stack: error.stack,
    });
    return {
      success: false,
      message: `Token validation failed: ${error.message}`,
      error: {
        message: error.message,
        status: error.response?.status,
        details: error.response?.data,
        validationLog,
      },
    };
  }
}

/**
 * Tests API access to a specific collection
 */
export async function testCollectionAccess(
  selectedDomain: string,
  adminToken: string,
  collectionName: string,
): Promise<{
  success: boolean;
  message: string;
  error?: any;
}> {
  try {
    const normalizedToken = adminToken.replace(/^Bearer\s+/i, "");
    const sourceDirectus = createDirectus(selectedDomain)
      .with(staticToken(normalizedToken))
      .with(rest());

    try {
      const testResult = await sourceDirectus.request(
        (readItems as any)(collectionName, { limit: 1 }),
      );

      return {
        success: true,
        message: `Successfully accessed collection '${collectionName}'`,
      };
    } catch (sdkError: any) {

      // Try to check if collection exists
      try {
        const collectionsResult = await sourceDirectus.request(
          (readItems as any)("directus_collections", { limit: -1 }),
        );

        const collectionExists =
          Array.isArray(collectionsResult) &&
          collectionsResult.some((col: any) => col.collection === collectionName);

        if (!collectionExists) {
          return {
            success: false,
            message: `Collection '${collectionName}' does not exist on the server`,
            error: {
              message: "Collection not found",
              status: 404,
            },
          };
        }

        return {
          success: false,
          message: `Collection '${collectionName}' exists but you don't have permission to access it`,
          error: {
            message: sdkError.message,
            status: sdkError.response?.status || 403,
            details: sdkError.response?.data,
          },
        };
      } catch (collectionsError: any) {
        return {
          success: false,
          message: `Cannot access collections list: ${collectionsError.message}`,
          error: {
            message: collectionsError.message,
            status: collectionsError.response?.status,
            details: collectionsError.response?.data,
          },
        };
      }
    }
  } catch (error: any) {

    return {
      success: false,
      message: `Failed to access collection '${collectionName}': ${error.message}`,
      error: {
        message: error.message,
        status: error.response?.status,
        details: error.response?.data,
      },
    };
  }
}

/**
 * Tests API access to multiple collections
 */
export async function testMultipleCollections(
  selectedDomain: string,
  adminToken: string,
): Promise<{
  success: boolean;
  results: Record<string, { success: boolean; message: string; error?: any }>;
}> {
  const testCollections = ["news", "client", "invoice", "page"];
  const results: Record<string, { success: boolean; message: string; error?: any }> = {};

  for (const collection of testCollections) {
    const result = await testCollectionAccess(selectedDomain, adminToken, collection);
    results[collection] = result;

    // Add a small delay between tests
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const successCount = Object.values(results).filter((r) => r.success).length;

  return {
    success: successCount > 0,
    results,
  };
}

/**
 * Imports data from another Directus instance
 */
export async function importFromDirectus(
  sourceUrl: string,
  sourceToken: string,
  targetUrl: string,
  targetToken: string,
  collectionName: string,
  options?: {
    limit?: number;
    titleFilter?: string;
    onProgress?: (current: number, total: number) => void;
    selectedFields?: string[]; // Only migrate selected fields
    forceUpdate?: boolean; // Force update even if item exists
  }
): Promise<ImportResult> {
  const importLog: ImportLogEntry[] = [];

  const logStep = (step: string, details: Record<string, unknown>) => {
    const logEntry: ImportLogEntry = {
      timestamp: new Date().toISOString(),
      step,
      details,
    };
    importLog.push(logEntry);
  };

  try {
    logStep("import_start", {
      sourceUrl,
      targetUrl,
      collectionName,
      hasSourceToken: !!sourceToken,
      hasTargetToken: !!targetToken,
    });

    // Validate tokens first
    const sourceValidation = await validateDirectusToken(sourceUrl, sourceToken);
    if (!sourceValidation.success) {
      logStep("source_token_validation_failed", sourceValidation.error);
      return {
        success: false,
        message: "Source token validation failed",
        error: sourceValidation.error,
        importLog,
      };
    }

    const targetValidation = await validateDirectusToken(targetUrl, targetToken);
    if (!targetValidation.success) {
      logStep("target_token_validation_failed", targetValidation.error);
      return {
        success: false,
        message: "Target token validation failed",
        error: targetValidation.error,
        importLog,
      };
    }

    logStep("token_validation_success", { 
      sourceInfo: sourceValidation.serverInfo,
      targetInfo: targetValidation.serverInfo 
    });

    // Create clients
    const normalizedSourceToken = sourceToken.replace(/^Bearer\s+/i, "");
    const sourceDirectus = createDirectus(sourceUrl)
      .with(staticToken(normalizedSourceToken))
      .with(rest());

    const targetClient = new DirectusClient(targetUrl, targetToken);

    // Ensure target folder exists (name: collectionName) and get its ID
    const targetFolderName = collectionName;
    let targetFolderId: string | null = null;
    try {
      const findFolderRes = await targetClient.get("/folders", {
        params: {
          limit: 1,
          filter: { name: { _eq: targetFolderName } },
        },
      });
      const existingFolder = findFolderRes?.data?.[0];
      if (existingFolder?.id) {
        targetFolderId = existingFolder.id;
      } else {
        const createFolderRes = await targetClient.post("/folders", {
          name: targetFolderName,
          parent: null,
        });
        targetFolderId = createFolderRes?.data?.id || null;
      }
      logStep("target_folder_ready", { name: targetFolderName, id: targetFolderId });
    } catch (folderErr: any) {
      logStep("target_folder_error", { name: targetFolderName, error: folderErr.message });
    }

    // Fetch data from source server
    logStep("fetch_data_start", { collectionName, titleFilter: options?.titleFilter });
    const fetchLimit = typeof options?.limit === "number" && options.limit > 0 ? options.limit : -1;
    
    // Build query parameters
    const queryParams: any = { limit: fetchLimit };
    
    // Note: titleFilter is intentionally NOT applied here to avoid filtering issues
    // with collections that don't have a 'translations' field structure.
    // The filter was causing empty results for collections like 'searchsg_performance_metrics'
    // If filtering is needed, it should be implemented per-collection based on schema
    if (options?.titleFilter && options.titleFilter.trim()) {
      logStep("title_filter_skipped", { 
        filter: options.titleFilter.trim(), 
        reason: "Generic filter not applied to avoid schema mismatch issues" 
      });
    }
    
    const response = await sourceDirectus.request(
      (readItems as any)(collectionName, queryParams),
    );

    // Ensure sourceItems is always an array
    const sourceItems = Array.isArray(response) ? response : [];

    logStep("fetch_data_success", {
      itemCount: sourceItems.length,
      collectionName,
    });

    if (sourceItems.length === 0) {
      logStep("collection_empty", { collectionName });
      return {
        success: true,
        message: `Collection '${collectionName}' is empty on the source server`,
        importedItems: [],
        importLog,
      };
    }

    // Import items to target server
    logStep("import_items_start", {
      itemCount: sourceItems.length,
      collectionName,
    });

    const importedItems: ImportedItem[] = [];
    let successCount = 0;
    let errorCount = 0;

    const itemsToImport = typeof options?.limit === "number" && options.limit > 0 
      ? sourceItems.slice(0, options.limit) 
      : sourceItems;

    const totalItems = itemsToImport.length;
    
    for (let i = 0; i < itemsToImport.length; i++) {
      const item = itemsToImport[i];
      
      // Report progress
      if (options?.onProgress) {
        options.onProgress(i + 1, totalItems);
      }
      
      try {
        // Remove system fields
        const { id, date_created, date_updated, user_created, user_updated, ...cleanItem } = item;

        // Prepare item to import
        let itemToImport: Record<string, any> = {};
        
        if (options?.selectedFields && options.selectedFields.length > 0) {
          // Only migrate selected fields - user has full control
          options.selectedFields.forEach(field => {
            if (field in cleanItem) {
              itemToImport[field] = cleanItem[field];
            }
          });
        } else {
          // Migrate all fields (user didn't select specific fields)
          itemToImport = { ...cleanItem };
        }

        let importResponse: any | null = null;
        let action: "created" | "updated" = "created";
        const sourceIdStr = String(id);

        // Step 1: Check if item already exists in target
        let itemExists = false;
        try {
          const checkResponse = await targetClient.get(`/items/${collectionName}/${sourceIdStr}`);
          itemExists = !!checkResponse?.data;
          logStep("item_exists_check", { 
            sourceId: sourceIdStr, 
            collectionName, 
            exists: itemExists 
          });
        } catch (checkErr: any) {
          // Item doesn't exist (404) or other error
          itemExists = false;
        }

        // Step 2: Update or Create based on existence
        if (itemExists) {
          // Item exists - UPDATE it
          try {
            logStep("item_update_start", { sourceId: sourceIdStr, collectionName });
            importResponse = await targetClient.patch(
              `/items/${collectionName}/${sourceIdStr}`,
              itemToImport,
            );
            action = "updated";
          } catch (updateErr: any) {
            // Update failed - log detailed error
            logStep("item_update_failed", { 
              sourceId: sourceIdStr, 
              collectionName,
              error: updateErr?.message,
              status: updateErr?.response?.status,
              details: updateErr?.response?.data
            });
            throw updateErr;
          }
        } else {
          // Item doesn't exist - CREATE it
          try {
            logStep("item_create_with_id_start", { sourceId: sourceIdStr, collectionName });
            const payloadWithId = { id: sourceIdStr, ...itemToImport };
            importResponse = await targetClient.post(`/items/${collectionName}`, payloadWithId);
            action = "created";
          } catch (createErr: any) {
            // Create failed - log detailed error
            logStep("item_create_failed", { 
              sourceId: sourceIdStr, 
              collectionName,
              error: createErr?.message,
              status: createErr?.response?.status,
              details: createErr?.response?.data
            });
            
            // Only log 403 errors to console (permission issues)
            if (createErr?.response?.status === 403) {
              console.error(`\n❌ 403 FORBIDDEN - Cannot create ${collectionName} item ${sourceIdStr}`);
              console.error(`📋 Full error response:`, JSON.stringify(createErr?.response?.data, null, 2));
              console.error(`🔗 Request URL:`, createErr?.config?.url);
              console.error(`📦 Payload:`, JSON.stringify(itemToImport, null, 2));
              
              const errorMsg = createErr?.response?.data?.errors?.[0];
              if (errorMsg?.extensions?.collection) {
                console.error(`\n💡 Missing READ permission on: "${errorMsg.extensions.collection}"`);
              } else if (errorMsg?.message) {
                console.error(`\n💡 Error: ${errorMsg.message}`);
              }
              
              console.error(`\n🔍 Check: Flows, Hooks, or Database permissions\n`);
            }
            
            throw createErr;
          }
        }

        importedItems.push({
          originalId: id,
          newId: importResponse.data?.id,
          status: "success",
          action,
          data: importResponse.data,
        });
        successCount++;

        logStep(action === "updated" ? "item_updated" : "item_imported", {
          originalId: id,
          newId: importResponse.data?.id,
          collectionName,
        });

      } catch (itemError: any) {
        errorCount++;
        importedItems.push({
          originalId: item.id,
          status: "error",
          error: {
            message: itemError.message,
            status: itemError.response?.status,
            details: itemError.response?.data,
          },
        });

        logStep("item_import_failed", {
          originalId: item.id,
          error: itemError.message,
          collectionName,
        });
      }
    }

    logStep("import_complete", {
      totalItems: sourceItems.length,
      successCount,
      errorCount,
      collectionName,
    });
      
    return {
      success: true,
      message: `Successfully imported ${successCount} items from ${collectionName} (${errorCount} failed)`,
      importedItems,
      importLog,
    };
  } catch (error: any) {
    logStep("fatal_error", {
      message: error.message,
      stack: error.stack,
    });
    return {
      success: false,
      message: `Import failed: ${error.message}`,
      error: {
        message: error.message,
        status: error.response?.status,
        details: error.response?.data,
      },
      importLog,
    };
  }
}

/**
 * Preview items from a collection before importing
 */
export async function previewCollectionItems(
  sourceUrl: string,
  sourceToken: string,
  collectionName: string,
  options?: {
    limit?: number;
    offset?: number;
  }
): Promise<{
  success: boolean;
  items?: any[];
  total?: number;
  error?: any;
}> {
  try {
    const normalizedToken = sourceToken.replace(/^Bearer\s+/i, "");
    const sourceDirectus = createDirectus(sourceUrl)
      .with(staticToken(normalizedToken))
      .with(rest());

    // Use provided limit or default to 100
    // limit: -1 means fetch all items (no limit)
    const limit = options?.limit !== undefined ? options.limit : 100;
    const offset = options?.offset || 0;

    const response: any = await sourceDirectus.request(
      (readItems as any)(collectionName, { 
        limit, 
        offset,
        meta: 'total_count'
      }),
    );

    // Handle both array response and object with data property
    const items = Array.isArray(response) ? response : (response?.data || []);
    const total = response?.meta?.total_count || items.length;

    return {
      success: true,
      items,
      total,
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.message,
        status: error.response?.status,
        details: error.response?.data,
      },
    };
  }
}

/**
 * Import only selected items by their IDs
 */
export async function importSelectedItems(
  sourceUrl: string,
  sourceToken: string,
  targetUrl: string,
  targetToken: string,
  collectionName: string,
  selectedIds: (string | number)[],
  options?: {
    selectedFields?: string[];  // Only migrate selected fields
    onProgress?: (current: number, total: number) => void;
  }
): Promise<ImportResult> {
  const importLog: ImportLogEntry[] = [];

  const logStep = (step: string, details: Record<string, unknown>) => {
    const logEntry: ImportLogEntry = {
      timestamp: new Date().toISOString(),
      step,
      details,
    };
    importLog.push(logEntry);
  };

  try {
    logStep("import_selected_start", {
      sourceUrl,
      targetUrl,
      collectionName,
      selectedCount: selectedIds.length,
    });

    // Create clients
    const normalizedSourceToken = sourceToken.replace(/^Bearer\s+/i, "");
    const sourceDirectus = createDirectus(sourceUrl)
      .with(staticToken(normalizedSourceToken))
      .with(rest());

    const targetClient = new DirectusClient(targetUrl, targetToken);

    // Fetch selected items from source
    const sourceItems: any[] = [];
    for (const id of selectedIds) {
      try {
        const item: any = await sourceDirectus.request(
          (readItems as any)(collectionName, { 
            filter: { id: { _eq: id } },
            limit: 1 
          }),
        );
        const itemData = Array.isArray(item) ? item[0] : item?.data?.[0];
        if (itemData) {
          sourceItems.push(itemData);
        }
      } catch (err: any) {
        logStep("fetch_item_failed", { id, error: err.message });
      }
    }

    logStep("fetch_selected_complete", {
      requested: selectedIds.length,
      fetched: sourceItems.length,
    });

    // Import items
    const importedItems: ImportedItem[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < sourceItems.length; i++) {
      const item = sourceItems[i];
      
      if (options?.onProgress) {
        options.onProgress(i + 1, sourceItems.length);
      }
      
      try {
        const { id, date_created, date_updated, user_created, user_updated, ...cleanItem } = item;

        // Prepare item to import
        let itemToImport: Record<string, any> = {};
        
        if (options?.selectedFields && options.selectedFields.length > 0) {
          // Only migrate selected fields - user has full control
          options.selectedFields.forEach(field => {
            if (field in cleanItem) {
              itemToImport[field] = cleanItem[field];
            }
          });
        } else {
          // Migrate all fields (user didn't select specific fields)
          itemToImport = { ...cleanItem };
        }

        let importResponse: any | null = null;
        let action: "created" | "updated" = "created";
        const sourceIdStr = String(id);

        // Check if exists
        let itemExists = false;
        try {
          const checkResponse = await targetClient.get(`/items/${collectionName}/${sourceIdStr}`);
          itemExists = !!checkResponse?.data;
        } catch (checkErr: any) {
          itemExists = false;
        }

        // Update or Create
        if (itemExists) {
          importResponse = await targetClient.patch(
            `/items/${collectionName}/${sourceIdStr}`,
            itemToImport,
          );
          action = "updated";
        } else {
          // Create with explicit ID only - no fallback
          const payloadWithId = { id: sourceIdStr, ...itemToImport };
          importResponse = await targetClient.post(`/items/${collectionName}`, payloadWithId);
          action = "created";
        }

        importedItems.push({
          originalId: id,
          newId: importResponse.data?.id,
          status: "success",
          action,
          data: importResponse.data,
        });
        successCount++;

      } catch (itemError: any) {
        errorCount++;
        importedItems.push({
          originalId: item.id,
          status: "error",
          error: {
            message: itemError.message,
            status: itemError.response?.status,
            details: itemError.response?.data,
          },
        });
      }
    }

    logStep("import_selected_complete", {
      totalItems: sourceItems.length,
      successCount,
      errorCount,
    });
      
    return {
      success: true,
      message: `Successfully imported ${successCount} selected items from ${collectionName} (${errorCount} failed)`,
      importedItems,
      importLog,
    };
  } catch (error: any) {
    logStep("fatal_error", {
      message: error.message,
      stack: error.stack,
    });
    return {
      success: false,
      message: `Import failed: ${error.message}`,
      error: {
        message: error.message,
        status: error.response?.status,
        details: error.response?.data,
      },
      importLog,
    };
  }
}

/**
 * Gets all collections from a Directus instance
 */
export async function getAllCollections(
  baseUrl: string,
  token: string,
  excludePatterns?: string[],
): Promise<{
  success: boolean;
  collections?: any[];
  error?: any;
}> {
  try {
    const client = new DirectusClient(baseUrl, token);
    const response = await client.get("/collections");
    const allCollections = response.data || [];

    console.log('📦 getAllCollections - All collections from API:', allCollections.length);
    console.log('  System collections:', allCollections.filter((c: any) => c.collection?.startsWith('directus_')).length);
    console.log('  Custom collections:', allCollections.filter((c: any) => !c.collection?.startsWith('directus_')).length);

    // Return ALL collections - no filtering
    // User can toggle system collections visibility in UI
    return {
      success: true,
      collections: allCollections,
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.message,
        status: error.response?.status,
        details: error.response?.data,
      },
    };
  }
}

/**
 * Get all relations from source Directus instance
 */
export async function getRelations(
  sourceUrl: string,
  sourceToken: string
): Promise<{
  success: boolean;
  relations?: any[];
  error?: any;
}> {
  try {
    const normalizedToken = sourceToken.replace(/^Bearer\s+/i, "");
    const sourceDirectus = createDirectus(sourceUrl)
      .with(staticToken(normalizedToken))
      .with(rest());

    const relations: any = await sourceDirectus.request(readRelations());

    return {
      success: true,
      relations: Array.isArray(relations) ? relations : [],
    };
  } catch (error: any) {
    return {
      success: false,
      error: {
        message: error.message,
        status: error.response?.status,
        details: error.response?.data,
      },
    };
  }
}
