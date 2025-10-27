import { createDirectus, readItems, rest, staticToken } from "@directus/sdk";
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
    console.log(`[${step}]`, details);
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

    console.log("Making API request to:", `${selectedDomain}/items/${collectionName}?limit=1`);

    try {
      const testResult = await sourceDirectus.request(
        (readItems as any)(collectionName, { limit: 1 }),
      );

      console.log("Collection access test successful:", {
        collection: collectionName,
        resultType: typeof testResult,
        isArray: Array.isArray(testResult),
        length: Array.isArray(testResult) ? testResult.length : "N/A",
      });

      return {
        success: true,
        message: `Successfully accessed collection '${collectionName}'`,
      };
    } catch (sdkError: any) {
      console.log("SDK method failed:", sdkError.message);

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
    console.error("Collection access test failed:", {
      collectionName,
      error: error.message,
      status: error.response?.status,
      details: error.response?.data,
      url: selectedDomain,
    });

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
    console.log(`Testing collection: ${collection}`);
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
    console.log(`[${step}]`, details);
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
    
    if (options?.titleFilter && options.titleFilter.trim()) {
      queryParams.filter = {
        translations: {
          title: {
            _contains: options.titleFilter.trim()
          }
        }
      };
      logStep("title_filter_applied", { 
        filter: options.titleFilter.trim(), 
        approach: "translations.title only" 
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
      logStep("collection_empty", { collectionName, titleFilter: options?.titleFilter });
      const filterMessage = options?.titleFilter && options.titleFilter.trim() ? ` with title filter '${options.titleFilter.trim()}'` : '';
      return {
        success: true,
        message: `Collection '${collectionName}'${filterMessage} is empty on the source server`,
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

    for (const item of itemsToImport) {
      try {
        // Remove system fields that shouldn't be imported
        const { id, date_created, date_updated, user_created, user_updated, ...cleanItem } = item;

        // Try to import with same ID first, then fallback to creating new
        let importResponse: any | null = null;
        let action: "created" | "updated" = "created";

        const sourceIdStr = String(id);

        try {
          // Try update by same ID
          logStep("item_update_by_id_start", { sourceId: sourceIdStr, collectionName });
          importResponse = await targetClient.patch(
            `/items/${collectionName}/${sourceIdStr}`,
            cleanItem,
          );
          action = "updated";
        } catch (updateByIdErr: any) {
          // If update fails, try to create with explicit ID
          try {
            logStep("item_create_with_explicit_id_start", { sourceId: sourceIdStr, collectionName });
            const payloadWithId = { id: sourceIdStr, ...cleanItem };
            importResponse = await targetClient.post(`/items/${collectionName}?upsert=1&keys=id`, payloadWithId);
            action = "created";
          } catch (createWithIdErr: any) {
            logStep("item_create_with_id_failed_fallback_plain_create", { 
              sourceId: sourceIdStr, 
              collectionName, 
              error: createWithIdErr?.message 
            });
            importResponse = await targetClient.post(`/items/${collectionName}`, cleanItem);
            action = "created";
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
      titleFilter: options?.titleFilter,
    });

    const filterMessage = options?.titleFilter && options.titleFilter.trim() 
      ? ` (filtered by title: '${options.titleFilter.trim()}')` 
      : '';
      
    return {
      success: true,
      message: `Successfully imported ${successCount} items from ${collectionName}${filterMessage} (${errorCount} failed)`,
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
    const defaultExcludePatterns = [
      "_translations",
      "_languages", 
      "_extensions",
      // "_operations",     // Enable operations for flows
      "_shares",
      "_fields",
      "_migrations",
      "_versions",
      "_notifications",
      "_sessions",
      "_sync_id",
      // Make directus_ exclusion more specific to allow flows and operations
      "directus_activity",
      "directus_collections",
      "directus_dashboards",
      "directus_fields",
      "directus_files",
      "directus_folders",
      "directus_migrations",
      "directus_notifications",
      "directus_panels",
      // "directus_permissions",  // Enable for access control migration
      "directus_presets",
      // "directus_policies",     // Enable for access control migration
      "directus_relations",
      "directus_revisions",
      // "directus_roles",        // Enable for access control migration
      "directus_sessions",
      "directus_settings",
      "directus_shares",
      "directus_translations",
      "directus_users",
      "directus_versions",
      "directus_webhooks",
      // Allow directus_flows, directus_operations, directus_roles, directus_policies, directus_permissions
    ];

    const patternsToExclude = excludePatterns || defaultExcludePatterns;
    const client = new DirectusClient(baseUrl, token);

    const response = await client.get("/collections");
    const allCollections = response.data || [];

    // Filter out system collections and folders
    const filteredCollections = allCollections.filter((collection: any) => {
      const isExcluded = patternsToExclude.some((pattern: string) =>
        collection.collection.includes(pattern),
      );
      const isFolder = collection.meta?.is_folder;
      return !isExcluded && !isFolder;
    });

    return {
      success: true,
      collections: filteredCollections,
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
