import { DirectusClient } from "./DirectusClient";
import type { ImportLogEntry } from "../types";

interface FileItem {
  id: string;
  // storage: string;
  filename_disk: string;
  filename_download: string;
  title?: string;
  type: string;
  folder?: string | null;
  // uploaded_by?: string;
  // uploaded_on?: string;
  // modified_by?: string;
  // modified_on?: string;
  charset?: string;
  filesize: number;
  width?: number;
  height?: number;
  duration?: number;
  embed?: string;
  description?: string;
  location?: string;
  tags?: string[];
  metadata?: any;
}

interface FileImportResult {
  success: boolean;
  message: string;
  importedFiles?: Array<{
    originalId: string;
    newId?: string;
    status: 'success' | 'error' | 'skipped';
    action?: 'created' | 'updated' | 'skipped';
    error?: {
      message: string;
      status?: number;
      details?: any;
    };
  }>;
  importLog?: ImportLogEntry[];
  error?: any;
}

/**
 * Get all files from source Directus instance
 */
export async function getFiles(
  sourceUrl: string,
  sourceToken: string,
  options?: {
    limit?: number;
    folder?: string | null;
  }
): Promise<{
  success: boolean;
  files?: FileItem[];
  total?: number;
  error?: any;
}> {
  try {
    const client = new DirectusClient(sourceUrl, sourceToken);
    
    const params: any = {
      limit: options?.limit || -1,
      fields: '*',
    };
    
    // Filter by folder if specified
    if (options?.folder !== undefined) {
      params.filter = {
        folder: options.folder === null ? { _null: true } : { _eq: options.folder }
      };
    }
    
    const response = await client.get('/files', { params });
    const files = response.data || [];
    
    return {
      success: true,
      files,
      total: files.length,
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
 * Get all folders from source Directus instance
 */
export async function getFolders(
  sourceUrl: string,
  sourceToken: string
): Promise<{
  success: boolean;
  folders?: any[];
  error?: any;
}> {
  try {
    const client = new DirectusClient(sourceUrl, sourceToken);
    const response = await client.get('/folders', { params: { limit: -1 } });
    
    return {
      success: true,
      folders: response.data || [],
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
 * Import folders from source to target (preserving hierarchy)
 */
export async function importFolders(
  sourceUrl: string,
  sourceToken: string,
  targetUrl: string,
  targetToken: string,
  selectedFolderIds?: string[] // Optional: if provided, only migrate these folders
): Promise<{
  success: boolean;
  message: string;
  folderMapping?: Map<string, string>; // source ID -> target ID
  error?: any;
}> {
  try {
    const sourceClient = new DirectusClient(sourceUrl, sourceToken);
    const targetClient = new DirectusClient(targetUrl, targetToken);

    // Get all folders from source
    const sourceFoldersResponse = await sourceClient.get('/folders', { params: { limit: -1 } });
    let sourceFolders = sourceFoldersResponse.data || [];

    // Filter folders if specific ones are selected
    if (selectedFolderIds && selectedFolderIds.length > 0) {
      // Include selected folders and their parent folders (to maintain hierarchy)
      const foldersToMigrate = new Set<string>(selectedFolderIds);
      
      // Add parent folders to maintain hierarchy
      selectedFolderIds.forEach(folderId => {
        const folder = sourceFolders.find((f: any) => f.id === folderId);
        if (folder) {
          let currentFolder = folder;
          while (currentFolder.parent) {
            foldersToMigrate.add(currentFolder.parent);
            currentFolder = sourceFolders.find((f: any) => f.id === currentFolder.parent);
            if (!currentFolder) break;
          }
        }
      });

      sourceFolders = sourceFolders.filter((f: any) => foldersToMigrate.has(f.id));
    }

    if (sourceFolders.length === 0) {
      return {
        success: true,
        message: 'No folders to migrate',
        folderMapping: new Map(),
      };
    }

    // Get existing folders from target
    const targetFoldersResponse = await targetClient.get('/folders', { params: { limit: -1 } });
    const targetFolders = targetFoldersResponse.data || [];
    
    // Create a map of existing folders by ID for fast lookup
    const existingFoldersById = new Map<string, any>();
    targetFolders.forEach((folder: any) => {
      existingFoldersById.set(folder.id, folder);
    });

    const folderMapping = new Map<string, string>();
    let createdCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Sort folders by hierarchy (root folders first)
    const sortedFolders = [...sourceFolders].sort((a, b) => {
      if (!a.parent && b.parent) return -1;
      if (a.parent && !b.parent) return 1;
      return 0;
    });

    // Import folders in order
    for (const sourceFolder of sortedFolders) {
      try {
        // Check if folder already exists by ID
        const existingFolder = existingFoldersById.get(sourceFolder.id);
        
        if (existingFolder) {
          // Folder with same ID already exists in target
          console.log(`[Folder ${sourceFolder.id}] Already exists with name "${existingFolder.name}", skipping...`);
          folderMapping.set(sourceFolder.id, existingFolder.id);
          skippedCount++;
          continue;
        }

        // Folder doesn't exist, create it with original ID
        const folderData: any = {
          id: sourceFolder.id, // Preserve original ID
          name: sourceFolder.name,
        };

        // Keep parent folder ID (should already exist from previous iteration)
        if (sourceFolder.parent) {
          folderData.parent = sourceFolder.parent;
        }

        console.log(`[Folder ${sourceFolder.id}] Creating with name "${sourceFolder.name}"...`);
        
        const createResponse = await targetClient.post('/folders', folderData);
        const newFolderId = createResponse.data?.id;
        
        if (newFolderId) {
          folderMapping.set(sourceFolder.id, newFolderId);
          existingFoldersById.set(newFolderId, createResponse.data);
          createdCount++;
          console.log(`[Folder ${sourceFolder.id}] ✓ Created successfully`);
        }

      } catch (error: any) {
        errorCount++;
        console.error(`[Folder ${sourceFolder.id}] ✗ Failed to create:`, {
          name: sourceFolder.name,
          error: error.message,
          status: error.response?.status,
          details: error.response?.data
        });
        // Continue with other folders
      }
    }

    const messageParts = [`Created ${createdCount} folders`];
    if (skippedCount > 0) {
      messageParts.push(`${skippedCount} already existed`);
    }
    if (errorCount > 0) {
      messageParts.push(`${errorCount} failed`);
    }

    return {
      success: true,
      message: messageParts.join(', '),
      folderMapping,
    };

  } catch (error: any) {
    return {
      success: false,
      message: `Failed to migrate folders: ${error.message}`,
      error: {
        message: error.message,
        status: error.response?.status,
        details: error.response?.data,
      },
    };
  }
}

/**
 * Import file from source to target using Directus /files/import endpoint
 * According to Directus API docs: POST /files/import with {url, data}
 * Target server downloads file directly from source URL (server-to-server)
 */
export async function importFile(
  sourceUrl: string,
  sourceToken: string,
  targetUrl: string,
  targetToken: string,
  fileId: string,
  options?: {
    targetFolderId?: string | null;
    preserveId?: boolean;
  }
): Promise<{
  success: boolean;
  fileId?: string;
  action?: 'created' | 'updated' | 'skipped';
  error?: any;
}> {
  const importLog: ImportLogEntry[] = [];
  
  const logStep = (step: string, details: Record<string, unknown>) => {
    importLog.push({
      timestamp: new Date().toISOString(),
      step,
      details,
    });
  };

  try {
    const sourceClient = new DirectusClient(sourceUrl, sourceToken);
    const targetClient = new DirectusClient(targetUrl, targetToken);

    // Step 1: Get file metadata from source
    logStep('fetch_file_metadata', { fileId });
    const fileMetaResponse = await sourceClient.get(`/files/${fileId}`);
    const fileMeta: FileItem = fileMetaResponse.data;
    
    if (!fileMeta) {
      throw new Error(`File ${fileId} not found on source`);
    }

    console.log(`[File ${fileId}] Fetched metadata:`, {
      filename: fileMeta.filename_download,
      type: fileMeta.type,
      size: fileMeta.filesize,
      folder: fileMeta.folder
    });

    // Step 2: Check if file already exists in target by ID (since we preserve IDs)
    let fileExists = false;
    let existingFile: any = undefined;
    
    try {
      // Check by ID first
      const checkResponse = await targetClient.get(`/files/${fileId}`);
      
      if (checkResponse?.data) {
        fileExists = true;
        existingFile = checkResponse.data;
      }
      
      logStep('file_exists_check', { 
        fileId, 
        exists: fileExists, 
        existingFilename: existingFile?.filename_download 
      });
    } catch (err: any) {
      // If 404, file doesn't exist (which is fine)
      if (err.response?.status === 404) {
        fileExists = false;
        logStep('file_exists_check', { fileId, exists: false });
      } else {
        // Other errors, log but continue
        fileExists = false;
        logStep('file_exists_check_error', { error: err.message, status: err.response?.status });
      }
    }

    // If file exists, skip it
    if (fileExists) {
      console.log(`[File ${fileId}] Already exists in target with filename "${existingFile.filename_download}", skipping...`);
      logStep('file_skipped', { fileId, reason: 'already_exists', existingFilename: existingFile.filename_download });
      
      return {
        success: true,
        fileId: existingFile.id,
        action: 'skipped',
      };
    }

    // Step 3: Import file using /files/import endpoint (per Directus API docs)
    // Construct source asset URL (without access_token, will use Authorization header)
    const sourceAssetUrl = `${sourceUrl}/assets/${fileId}`;
    
    console.log(`[File ${fileId}] Importing from URL: ${sourceAssetUrl}`);
    logStep('import_start', { fileId, filename: fileMeta.filename_download });
    
    // Prepare import request body according to API spec
    const importPayload: any = {
      url: sourceAssetUrl,
    };
    
    // Build complete metadata from source file
    const metadata: any = {};
    
    // Preserve ID from source (if enabled)
    if (options?.preserveId && fileMeta.id) {
      metadata.id = fileMeta.id;
    }
    
    // Basic metadata
    if (fileMeta.title) {
      metadata.title = fileMeta.title;
    }
    
    if (fileMeta.description) {
      metadata.description = fileMeta.description;
    }
    
    // Storage and file info
    // if (fileMeta.storage) {
    //   metadata.storage = fileMeta.storage;
    // }
    
    if (fileMeta.filename_disk) {
      metadata.filename_disk = fileMeta.filename_disk;
    }
    
    if (fileMeta.filename_download) {
      metadata.filename_download = fileMeta.filename_download;
    }
    
    if (fileMeta.type) {
      metadata.type = fileMeta.type;
    }
    
    if (fileMeta.charset) {
      metadata.charset = fileMeta.charset;
    }
    
    // Folder - keep original from source
    if (fileMeta.folder !== undefined) {
      metadata.folder = fileMeta.folder;
    }
    
    // Tags
    if (fileMeta.tags && fileMeta.tags.length > 0) {
      metadata.tags = fileMeta.tags;
    }
    
    // Media dimensions
    if (fileMeta.width !== undefined) {
      metadata.width = fileMeta.width;
    }
    
    if (fileMeta.height !== undefined) {
      metadata.height = fileMeta.height;
    }
    
    if (fileMeta.duration !== undefined) {
      metadata.duration = fileMeta.duration;
    }
    
    // Location and embed
    if (fileMeta.location) {
      metadata.location = fileMeta.location;
    }
    
    if (fileMeta.embed) {
      metadata.embed = fileMeta.embed;
    }
    
    // Custom metadata
    if (fileMeta.metadata && Object.keys(fileMeta.metadata).length > 0) {
      metadata.metadata = fileMeta.metadata;
    }
    
    // User tracking (keep original user IDs if exist)
    // if (fileMeta.uploaded_by) {
    //   metadata.uploaded_by = fileMeta.uploaded_by;
    // }
    
    // if (fileMeta.modified_by) {
    //   metadata.modified_by = fileMeta.modified_by;
    // }
    
    // // Timestamps (keep original timestamps)
    // if (fileMeta.uploaded_on) {
    //   metadata.uploaded_on = fileMeta.uploaded_on;
    // }
    
    // if (fileMeta.modified_on) {
    //   metadata.modified_on = fileMeta.modified_on;
    // }
    
    // Filesize (should be preserved)
    if (fileMeta.filesize !== undefined) {
      metadata.filesize = fileMeta.filesize;
    }
    
    // Add metadata to import payload
    if (Object.keys(metadata).length > 0) {
      importPayload.data = metadata;
    }

    console.log(`[File ${fileId}] Request payload:`, {
      url: sourceAssetUrl,
      data: metadata
    });

    // POST /files/import - Target downloads from source
    const importResponse = await targetClient.post('/files/import', importPayload);

    const importedFileId = importResponse.data?.id;
    
    if (!importedFileId) {
      throw new Error('Import succeeded but no file ID returned');
    }
    
    console.log(`[File ${fileId}] ✓ Import successful! New ID: ${importedFileId}`);
    logStep('import_success', { 
      sourceId: fileId, 
      targetId: importedFileId,
      filename: fileMeta.filename_download 
    });

    return {
      success: true,
      fileId: importedFileId,
      action: 'created',
    };

  } catch (error: any) {
    const errorDetails = {
      fileId,
      error: error.message,
      status: error.response?.status,
      details: error.response?.data,
    };
    
    logStep('import_failed', errorDetails);
    console.error(`[File ${fileId}] ✗ Import failed:`, errorDetails);
    
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
 * Import multiple files from source to target
 * Process: For each file -> Download from source -> Upload to target
 */
export async function importFiles(
  sourceUrl: string,
  sourceToken: string,
  targetUrl: string,
  targetToken: string,
  fileIds: string[],
  options?: {
    folderMapping?: Map<string, string>; // Map source folder IDs to target folder IDs
    preserveId?: boolean;
    onProgress?: (current: number, total: number) => void;
  }
): Promise<FileImportResult> {
  const importLog: ImportLogEntry[] = [];
  
  const logStep = (step: string, details: Record<string, unknown>) => {
    importLog.push({
      timestamp: new Date().toISOString(),
      step,
      details,
    });
  };

  try {
    logStep('import_files_start', {
      sourceUrl,
      targetUrl,
      fileCount: fileIds.length,
    });

    const importedFiles: Array<{
      originalId: string;
      newId?: string;
      status: 'success' | 'error' | 'skipped';
      action?: 'created' | 'updated' | 'skipped';
      error?: any;
    }> = [];

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    const sourceClient = new DirectusClient(sourceUrl, sourceToken);

    for (let i = 0; i < fileIds.length; i++) {
      const fileId = fileIds[i];
      
      if (options?.onProgress) {
        options.onProgress(i + 1, fileIds.length);
      }

      // Get file metadata to determine folder
      let targetFolderId: string | null | undefined = undefined;
      try {
        const fileMetaResponse = await sourceClient.get(`/files/${fileId}`);
        const fileMeta = fileMetaResponse.data;
        
        // Map source folder ID to target folder ID
        if (fileMeta?.folder && options?.folderMapping) {
          targetFolderId = options.folderMapping.get(fileMeta.folder) || null;
        } else if (fileMeta?.folder === null) {
          targetFolderId = null;
        }
      } catch (err) {
        // Continue without folder mapping if metadata fetch fails
        console.warn(`[File ${fileId}] Could not fetch metadata for folder mapping:`, err);
      }

      try {
        console.log(`\n=== Processing file ${i + 1}/${fileIds.length}: ${fileId} ===`);
        
        const result = await importFile(
          sourceUrl,
          sourceToken,
          targetUrl,
          targetToken,
          fileId,
          {
            targetFolderId,
            preserveId: options?.preserveId,
          }
        );

        if (result.success) {
          if (result.action === 'skipped') {
            skippedCount++;
            console.log(`[File ${fileId}] Skipped (already exists)`);
            importedFiles.push({
              originalId: fileId,
              newId: result.fileId,
              status: 'skipped',
              action: 'skipped',
            });
          } else {
            successCount++;
            console.log(`[File ${fileId}] Success! Action: ${result.action}`);
            importedFiles.push({
              originalId: fileId,
              newId: result.fileId,
              status: 'success',
              action: result.action,
            });
          }
        } else {
          errorCount++;
          console.error(`[File ${fileId}] Failed:`, result.error);
          importedFiles.push({
            originalId: fileId,
            status: 'error',
            error: result.error,
          });
        }
      } catch (err: any) {
        errorCount++;
        console.error(`[File ${fileId}] Exception:`, err);
        importedFiles.push({
          originalId: fileId,
          status: 'error',
          error: {
            message: err.message,
            stack: err.stack,
          },
        });
      }

      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    logStep('import_files_complete', {
      total: fileIds.length,
      successCount,
      errorCount,
      skippedCount,
    });

    return {
      success: true,
      message: `Imported ${successCount} files (${skippedCount} skipped, ${errorCount} failed)`,
      importedFiles,
      importLog,
    };

  } catch (error: any) {
    logStep('fatal_error', {
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
