import React, { useState, useEffect } from 'react'
import { getFiles, getFolders, importFiles, importFolders } from '../lib/filesHandler'
import type { OperationStatus } from '../types'

interface FilesManagerProps {
  sourceUrl: string
  sourceToken: string
  targetUrl: string
  targetToken: string
  onClose: () => void
  onStatusUpdate: (status: OperationStatus | null) => void
}

export function FilesManager({
  sourceUrl,
  sourceToken,
  targetUrl,
  targetToken,
  onClose,
  onStatusUpdate
}: FilesManagerProps) {
  const [activeTab, setActiveTab] = useState<'folders' | 'files'>('folders')
  const [files, setFiles] = useState<any[]>([])
  const [folders, setFolders] = useState<any[]>([])
  const [targetFolders, setTargetFolders] = useState<any[]>([])
  const [targetFiles, setTargetFiles] = useState<any[]>([]) 
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [selectedFolders, setSelectedFolders] = useState<string[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string | null | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    loadFolders()
    loadTargetFolders()
  }, [])


  useEffect(() => {
    if (activeTab === 'files') {
      loadFiles()
      loadTargetFiles()
    }
  }, [activeTab, selectedFolder])

  const loadFolders = async () => {
    try {
      const result = await getFolders(sourceUrl, sourceToken)
      if (result.success) {
        setFolders(result.folders || [])
      } else {
        onStatusUpdate({
          type: 'error',
          message: `Failed to load folders: ${result.error?.message}`
        })
      }
    } catch (error: any) {
      onStatusUpdate({
        type: 'error',
        message: `Error loading folders: ${error.message}`
      })
    }
  }

  const loadTargetFolders = async () => {
    try {
      const result = await getFolders(targetUrl, targetToken)
      if (result.success) {
        setTargetFolders(result.folders || [])
      }
    } catch (error: any) {
      console.error('Error loading target folders:', error)
    }
  }

  const loadTargetFiles = async () => {
    try {
      const options = selectedFolder === undefined ? {} : { folder: selectedFolder }
      
      const result = await getFiles(targetUrl, targetToken, options)
      if (result.success) {
        setTargetFiles(result.files || [])
      }
    } catch (error: any) {
      console.error('Error loading target files:', error)
    }
  }

  const loadFiles = async () => {
    setLoading(true)
    try {
      const options = selectedFolder === undefined ? {} : { folder: selectedFolder }
      
      const result = await getFiles(sourceUrl, sourceToken, options)
      
      if (result.success) {
        setFiles(result.files || [])
        const folderText = selectedFolder === undefined ? 'all folders' : selectedFolder === null ? 'root folder' : 'selected folder'
        onStatusUpdate({
          type: 'success',
          message: `Loaded ${result.files?.length || 0} files from ${folderText}`
        })
      } else {
        onStatusUpdate({
          type: 'error',
          message: `Failed to load files: ${result.error?.message}`
        })
      }
    } catch (error: any) {
      onStatusUpdate({
        type: 'error',
        message: `Error loading files: ${error.message}`
      })
    } finally {
      setLoading(false)
    }
  }

  const handleImportFolders = async () => {
    if (selectedFolders.length === 0) {
      onStatusUpdate({
        type: 'warning',
        message: 'Please select folders to import'
      })
      return
    }

    setImporting(true)
    setProgress({ current: 0, total: selectedFolders.length })

    try {
      onStatusUpdate({
        type: 'info',
        message: 'Migrating folders...'
      })
      
      const foldersResult = await importFolders(
        sourceUrl,
        sourceToken,
        targetUrl,
        targetToken,
        selectedFolders
      )

      if (foldersResult.success) {
        onStatusUpdate({
          type: 'success',
          message: foldersResult.message
        })
        setSelectedFolders([])
        loadFolders()
        loadTargetFolders() 
      } else {
        onStatusUpdate({
          type: 'error',
          message: foldersResult.message
        })
      }
    } catch (error: any) {
      onStatusUpdate({
        type: 'error',
        message: `Import failed: ${error.message}`
      })
    } finally {
      setImporting(false)
      setProgress({ current: 0, total: 0 })
    }
  }

  const handleImportFiles = async () => {
    if (selectedFiles.length === 0) {
      onStatusUpdate({
        type: 'warning',
        message: 'Please select files to import'
      })
      return
    }

    setImporting(true)
    setProgress({ current: 0, total: selectedFiles.length })

    try {
      onStatusUpdate({
        type: 'info',
        message: 'Step 1/2: Migrating folder structure...'
      })

      const foldersResult = await importFolders(
        sourceUrl,
        sourceToken,
        targetUrl,
        targetToken
      )

      if (!foldersResult.success) {
        throw new Error(`Failed to migrate folders: ${foldersResult.error?.message || 'Unknown error'}`);
      }

      await loadTargetFolders();

      onStatusUpdate({
        type: 'info',
        message: 'Step 2/2: Migrating files...'
      })

      const result = await importFiles(
        sourceUrl,
        sourceToken,
        targetUrl,
        targetToken,
        selectedFiles,
        {
          preserveId: true,
          folderMapping: foldersResult.folderMapping, 
          onProgress: (current, total) => {
            setProgress({ current, total })
          }
        }
      )

      if (result.success) {
        onStatusUpdate({
          type: 'success',
          message: result.message
        })
        setSelectedFiles([])
        loadFiles()
        loadTargetFiles() 
      } else {
        onStatusUpdate({
          type: 'error',
          message: result.message
        })
      }
    } catch (error: any) {
      onStatusUpdate({
        type: 'error',
        message: `Import failed: ${error.message}`
      })
    } finally {
      setImporting(false)
      setProgress({ current: 0, total: 0 })
    }
  }

  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles(prev =>
      prev.includes(fileId)
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    )
  }

  const toggleSelectAll = () => {
    if (selectedFiles.length === filteredFiles.length) {
      setSelectedFiles([])
    } else {
      setSelectedFiles(filteredFiles.map(f => f.id))
    }
  }

  const toggleFolderSelection = (folderId: string) => {
    setSelectedFolders(prev =>
      prev.includes(folderId)
        ? prev.filter(id => id !== folderId)
        : [...prev, folderId]
    )
  }

  const toggleSelectAllFolders = () => {
    if (selectedFolders.length === folders.length) {
      setSelectedFolders([])
    } else {
      setSelectedFolders(folders.map(f => f.id))
    }
  }

  const folderExistsInTarget = (folderId: string): boolean => {
    return targetFolders.some(f => f.id === folderId)
  }

  const fileExistsInTarget = (fileId: string): boolean => {
    return targetFiles.some(f => f.id === fileId)
  }

  const filteredFiles = files.filter(file =>
    file.filename_download?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    file.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    file.id?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

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
      zIndex: 1000,
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        maxWidth: '1200px',
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600', color: '#111827' }}>
              📁 Files Migration
            </h2>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
              {activeTab === 'folders' 
                ? `${folders.length} folders | ${selectedFolders.length} selected`
                : `${files.length} files | ${selectedFiles.length} selected`
              }
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0.5rem'
            }}
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb'
        }}>
          <button
            onClick={() => setActiveTab('folders')}
            style={{
              flex: 1,
              padding: '1rem 1.5rem',
              border: 'none',
              backgroundColor: activeTab === 'folders' ? 'white' : 'transparent',
              borderBottom: activeTab === 'folders' ? '2px solid #3b82f6' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: activeTab === 'folders' ? '#3b82f6' : '#6b7280',
              transition: 'all 0.2s'
            }}
          >
            📁 Folders ({folders.length})
          </button>
          <button
            onClick={() => setActiveTab('files')}
            style={{
              flex: 1,
              padding: '1rem 1.5rem',
              border: 'none',
              backgroundColor: activeTab === 'files' ? 'white' : 'transparent',
              borderBottom: activeTab === 'files' ? '2px solid #3b82f6' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '600',
              color: activeTab === 'files' ? '#3b82f6' : '#6b7280',
              transition: 'all 0.2s'
            }}
          >
            📄 Files ({files.length})
          </button>
        </div>

        {/* Filters - Only for Files Tab */}
        {activeTab === 'files' && (
          <div style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb'
          }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              {/* Folder Filter */}
              <div style={{ flex: '1', minWidth: '200px' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '0.25rem' }}>
                  Folder
                </label>
                <select
                  value={selectedFolder === null ? 'null' : selectedFolder === undefined ? 'all' : selectedFolder}
                  onChange={(e) => {
                    const value = e.target.value
                    setSelectedFolder(value === 'all' ? undefined : value === 'null' ? null : value)
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem'
                  }}
                >
                  <option value="all">All Folders</option>
                  <option value="null">Root (No Folder)</option>
                  {folders.map(folder => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search */}
              <div style={{ flex: '1', minWidth: '200px', marginRight: '1rem' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: '500', color: '#374151', display: 'block', marginBottom: '0.25rem' }}>
                  Search
                </label>
                <input
                  type="text"
                placeholder="Search by name, title, or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem'
                }}
              />
            </div>
          </div>
          </div>
        )}

        {/* Content Area */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem 1.5rem'
        }}>
          {activeTab === 'folders' ? (
            /* Folders List */
            folders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                No folders found
              </div>
            ) : (
              <>
                {/* Select All Folders */}
                <div style={{
                  padding: '0.75rem',
                  backgroundColor: '#f9fafb',
                  borderRadius: '6px',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <input
                    type="checkbox"
                    checked={selectedFolders.length === folders.length && folders.length > 0}
                    onChange={toggleSelectAllFolders}
                    style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
                    Select All ({folders.length} folders)
                  </span>
                </div>

                {/* Folders Grid */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}>
                  {folders.map(folder => (
                    <div
                      key={folder.id}
                      onClick={() => toggleFolderSelection(folder.id)}
                      style={{
                        padding: '1rem',
                        border: selectedFolders.includes(folder.id) ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        backgroundColor: selectedFolders.includes(folder.id) ? '#eff6ff' : 'white',
                        transition: 'all 0.15s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedFolders.includes(folder.id)}
                        onChange={() => {}}
                        style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '2rem' }}>📁</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ 
                          fontWeight: '600', 
                          color: '#111827', 
                          fontSize: '0.9375rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}>
                          {folder.name}
                          {folderExistsInTarget(folder.id) ? (
                            <span style={{
                              fontSize: '0.625rem',
                              padding: '0.125rem 0.5rem',
                              backgroundColor: '#fef3c7',
                              color: '#92400e',
                              borderRadius: '9999px',
                              fontWeight: '600'
                            }}>
                              EXISTS
                            </span>
                          ) : (
                            <span style={{
                              fontSize: '0.625rem',
                              padding: '0.125rem 0.5rem',
                              backgroundColor: '#dbeafe',
                              color: '#1e40af',
                              borderRadius: '9999px',
                              fontWeight: '600'
                            }}>
                              NEW
                            </span>
                          )}
                        </div>
                        {folder.parent && (
                          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                            Parent: {folders.find((f: any) => f.id === folder.parent)?.name || folder.parent}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        ID: {folder.id}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )
          ) : (
            /* Files List */
            loading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                Loading files...
              </div>
            ) : filteredFiles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                No files found
              </div>
            ) : (
            <>
              {/* Select All */}
              <div style={{
                padding: '0.75rem',
                backgroundColor: '#f9fafb',
                borderRadius: '6px',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <input
                  type="checkbox"
                  checked={selectedFiles.length === filteredFiles.length && filteredFiles.length > 0}
                  onChange={toggleSelectAll}
                  style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#374151' }}>
                  Select All ({filteredFiles.length} files)
                </span>
              </div>

              {/* Files Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '1rem'
              }}>
                {filteredFiles.map(file => (
                  <div
                    key={file.id}
                    onClick={() => toggleFileSelection(file.id)}
                    style={{
                      border: selectedFiles.includes(file.id) ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '1rem',
                      cursor: 'pointer',
                      backgroundColor: selectedFiles.includes(file.id) ? '#eff6ff' : 'white',
                      transition: 'all 0.15s'
                    }}
                  >
                    {/* File Preview */}
                    <div style={{
                      width: '100%',
                      height: '120px',
                      backgroundColor: '#f3f4f6',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '0.75rem',
                      overflow: 'hidden'
                    }}>
                      {file.type?.startsWith('image/') ? (
                        <img
                          src={`${sourceUrl}/assets/${file.id}?width=200&height=120&fit=cover`}
                          alt={file.filename_download}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <span style={{ fontSize: '2rem' }}>
                          {file.type?.startsWith('video/') ? '🎥' :
                           file.type?.startsWith('audio/') ? '🎵' :
                           file.type?.includes('pdf') ? '📄' :
                           '📎'}
                        </span>
                      )}
                    </div>

                    {/* File Info */}
                    <div style={{ fontSize: '0.875rem' }}>
                      <div style={{
                        fontWeight: '600',
                        color: '#111827',
                        marginBottom: '0.25rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}>
                        <span style={{ 
                          flex: 1, 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis' 
                        }}>
                          {file.title || file.filename_download}
                        </span>
                        {fileExistsInTarget(file.id) ? (
                          <span style={{
                            fontSize: '0.5rem',
                            padding: '0.125rem 0.375rem',
                            backgroundColor: '#fef3c7',
                            color: '#92400e',
                            borderRadius: '9999px',
                            fontWeight: '600',
                            flexShrink: 0
                          }}>
                            EXISTS
                          </span>
                        ) : (
                          <span style={{
                            fontSize: '0.5rem',
                            padding: '0.125rem 0.375rem',
                            backgroundColor: '#dbeafe',
                            color: '#1e40af',
                            borderRadius: '9999px',
                            fontWeight: '600',
                            flexShrink: 0
                          }}>
                            NEW
                          </span>
                        )}
                      </div>
                      <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                        {formatFileSize(file.filesize)}
                      </div>
                      {file.width && file.height && (
                        <div style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                          {file.width} × {file.height}
                        </div>
                      )}
                    </div>

                    {/* Checkbox */}
                    <div style={{ marginTop: '0.5rem' }}>
                      <input
                        type="checkbox"
                        checked={selectedFiles.includes(file.id)}
                        onChange={() => {}}
                        style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
            )
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            {importing && (
              <span>
                {activeTab === 'folders' ? 'Migrating folders' : 'Migrating files'}... {progress.current} / {progress.total}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={onClose}
              disabled={importing}
              style={{
                backgroundColor: '#f3f4f6',
                color: '#374151',
                padding: '0.625rem 1.25rem',
                border: 'none',
                borderRadius: '6px',
                cursor: importing ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                opacity: importing ? 0.5 : 1
              }}
            >
              Cancel
            </button>
            {activeTab === 'folders' ? (
              <button
                onClick={handleImportFolders}
                disabled={selectedFolders.length === 0 || importing}
                style={{
                  backgroundColor: selectedFolders.length === 0 || importing ? '#9ca3af' : '#10b981',
                  color: 'white',
                  padding: '0.625rem 1.25rem',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: selectedFolders.length === 0 || importing ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
                }}
              >
                {importing ? 'Migrating...' : `Migrate ${selectedFolders.length} Folders`}
              </button>
            ) : (
              <button
                onClick={handleImportFiles}
                disabled={selectedFiles.length === 0 || importing}
                style={{
                  backgroundColor: selectedFiles.length === 0 || importing ? '#9ca3af' : '#10b981',
                  color: 'white',
                  padding: '0.625rem 1.25rem',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: selectedFiles.length === 0 || importing ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
                }}
              >
                {importing ? '⏳ Migrating...' : `🚀 Migrate ${selectedFiles.length} Files`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
