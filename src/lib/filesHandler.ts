import { DirectusClient } from "./DirectusClient";
import type { ImportLogEntry } from "../types";

interface FileItem {
  id: string;
  filename_disk: string;
  filename_download: string;
  title?: string;
  type: string;
  folder?: string | null;
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

export async function importFolders(
  sourceUrl: string,
  sourceToken: string,
  targetUrl: string,
  targetToken: string,
  selectedFolderIds?: string[] 
): Promise<{
  success: boolean;
  message: string;
  folderMapping?: Map<string, string>;
  error?: any;
}> {
  try {
    const sourceClient = new DirectusClient(sourceUrl, sourceToken);
    const targetClient = new DirectusClient(targetUrl, targetToken);

    const sourceFoldersResponse = await sourceClient.get('/folders', { params: { limit: -1 } });
    let sourceFolders = sourceFoldersResponse.data || [];

    if (selectedFolderIds && selectedFolderIds.length > 0) {
      const foldersToMigrate = new Set<string>(selectedFolderIds);
      
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

    const targetFoldersResponse = await targetClient.get('/folders', { params: { limit: -1 } });
    const targetFolders = targetFoldersResponse.data || [];
    
    const existingFoldersById = new Map<string, any>();
    targetFolders.forEach((folder: any) => {
      existingFoldersById.set(folder.id, folder);
    });

    const folderMapping = new Map<string, string>();
    let createdCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    const sortedFolders = [...sourceFolders].sort((a, b) => {
      if (!a.parent && b.parent) return -1;
      if (a.parent && !b.parent) return 1;
      return 0;
    });

    for (const sourceFolder of sortedFolders) {
      try {
        const existingFolder = existingFoldersById.get(sourceFolder.id);
        
        if (existingFolder) {
          folderMapping.set(sourceFolder.id, existingFolder.id);
          skippedCount++;
          continue;
        }

        const folderData: any = {
          id: sourceFolder.id,
          name: sourceFolder.name,
        };

        if (sourceFolder.parent) {
          folderData.parent = sourceFolder.parent;
        }

        const createResponse = await targetClient.post('/folders', folderData);
        const newFolderId = createResponse.data?.id;
        
        if (newFolderId) {
          folderMapping.set(sourceFolder.id, newFolderId);
          existingFoldersById.set(newFolderId, createResponse.data);
          createdCount++;
        }

      } catch (error: any) {
        errorCount++;
        console.error(`[Folder ${sourceFolder.id}] ✗ Failed to create:`, {
          name: sourceFolder.name,
          error: error.message,
          status: error.response?.status,
          details: error.response?.data
        });
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

    logStep('fetch_file_metadata', { fileId });
    const fileMetaResponse = await sourceClient.get(`/files/${fileId}`);
    const fileMeta: FileItem = fileMetaResponse.data;
    
    if (!fileMeta) {
      throw new Error(`File ${fileId} not found on source`);
    }

    let fileExists = false;
    let existingFile: any = undefined;
    
    try {
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
      if (err.response?.status === 404) {
        fileExists = false;
        logStep('file_exists_check', { fileId, exists: false });
      } else {
        fileExists = false;
        logStep('file_exists_check_error', { error: err.message, status: err.response?.status });
      }
    }

    if (fileExists) {
      logStep('file_skipped', { fileId, reason: 'already_exists', existingFilename: existingFile.filename_download });
      
      return {
        success: true,
        fileId: existingFile.id,
        action: 'skipped',
      };
    }

    const sourceAssetUrl = `${sourceUrl}/assets/${fileId}`;
    
    logStep('import_start', { fileId, filename: fileMeta.filename_download });
    
    const importPayload: any = {
      url: sourceAssetUrl,
    };
    
    const metadata: any = {};
    
    if (options?.preserveId && fileMeta.id) {
      metadata.id = fileMeta.id;
    }
    
    if (fileMeta.title) {
      metadata.title = fileMeta.title;
    }
    
    if (fileMeta.description) {
      metadata.description = fileMeta.description;
    }
    
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
    
    if (fileMeta.folder !== undefined) {
      metadata.folder = fileMeta.folder;
    }
    
    if (fileMeta.tags && fileMeta.tags.length > 0) {
      metadata.tags = fileMeta.tags;
    }
    
    if (fileMeta.width !== undefined) {
      metadata.width = fileMeta.width;
    }
    
    if (fileMeta.height !== undefined) {
      metadata.height = fileMeta.height;
    }
    
    if (fileMeta.duration !== undefined) {
      metadata.duration = fileMeta.duration;
    }
    
    if (fileMeta.location) {
      metadata.location = fileMeta.location;
    }
    
    if (fileMeta.embed) {
      metadata.embed = fileMeta.embed;
    }
    
    if (fileMeta.metadata && Object.keys(fileMeta.metadata).length > 0) {
      metadata.metadata = fileMeta.metadata;
    }
    
    if (fileMeta.filesize !== undefined) {
      metadata.filesize = fileMeta.filesize;
    }
    
    if (Object.keys(metadata).length > 0) {
      importPayload.data = metadata;
    }

    const importResponse = await targetClient.post('/files/import', importPayload);

    const importedFileId = importResponse.data?.id;
    
    if (!importedFileId) {
      throw new Error('Import succeeded but no file ID returned');
    }
    
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

export async function importFiles(
  sourceUrl: string,
  sourceToken: string,
  targetUrl: string,
  targetToken: string,
  fileIds: string[],
  options?: {
    folderMapping?: Map<string, string>; 
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

      let targetFolderId: string | null | undefined = undefined;
      try {
        const fileMetaResponse = await sourceClient.get(`/files/${fileId}`);
        const fileMeta = fileMetaResponse.data;
        
        if (fileMeta?.folder && options?.folderMapping) {
          targetFolderId = options.folderMapping.get(fileMeta.folder) || null;
        } else if (fileMeta?.folder === null) {
          targetFolderId = null;
        }
      } catch (err) {
        console.warn(`[File ${fileId}] Could not fetch metadata for folder mapping:`, err);
      }

      try {
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
            importedFiles.push({
              originalId: fileId,
              newId: result.fileId,
              status: 'skipped',
              action: 'skipped',
            });
          } else {
            successCount++;
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
