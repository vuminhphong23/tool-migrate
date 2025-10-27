import React, { useState, useEffect } from 'react'
import { ConnectionForm } from './components/ConnectionForm'
import { CollectionList } from './components/CollectionList'
import { StatusDisplay } from './components/StatusDisplay'
import { SettingsManager } from './components/SettingsManager'
import { validateDirectusToken, getAllCollections } from './lib/apiHandlers'
import { testDirectusConnection, savePresetConfiguration } from './lib/connectionTest'
import { DirectusClient } from './lib/DirectusClient'
import type { OperationStatus, Collection } from './types'

function App() {
  const [sourceEnvironment, setSourceEnvironment] = useState<string>(localStorage.getItem('sourceEnvironment') || '')
  const [sourceUrl, setSourceUrl] = useState<string>(localStorage.getItem('sourceUrl') || '')
  const [sourceToken, setSourceToken] = useState<string>(localStorage.getItem('sourceToken') || '')
  const [targetEnvironment, setTargetEnvironment] = useState<string>(localStorage.getItem('targetEnvironment') || '')
  const [targetUrl, setTargetUrl] = useState<string>(localStorage.getItem('targetUrl') || '')
  const [targetToken, setTargetToken] = useState<string>(localStorage.getItem('targetToken') || '')
  
  const [isConnected, setIsConnected] = useState<boolean>(false)
  const [collections, setCollections] = useState<Collection[]>([])
  const [operationStatus, setOperationStatus] = useState<OperationStatus | null>(null)
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [testResults, setTestResults] = useState<{
    source?: { success: boolean; message: string; loading: boolean }
    target?: { success: boolean; message: string; loading: boolean }
  }>({})

  // Save credentials to localStorage when they change
  useEffect(() => {
    localStorage.setItem('sourceEnvironment', sourceEnvironment)
    localStorage.setItem('sourceUrl', sourceUrl)
    localStorage.setItem('sourceToken', sourceToken)
    localStorage.setItem('targetEnvironment', targetEnvironment)
    localStorage.setItem('targetUrl', targetUrl)
    localStorage.setItem('targetToken', targetToken)
  }, [sourceEnvironment, sourceUrl, sourceToken, targetEnvironment, targetUrl, targetToken])

  const setLoadingState = (key: string, state: boolean) => {
    setLoading(prev => ({ ...prev, [key]: state }))
  }

  const handleConnect = async () => {
    if (!sourceUrl || !sourceToken || !targetUrl || !targetToken) {
      setOperationStatus({
        type: 'error',
        message: 'Please fill in all connection details'
      })
      return
    }

    setLoadingState('connect', true)
    setOperationStatus({ type: 'info', message: 'Connecting to Directus instances...' })

    try {
      // Test both connections
      const [sourceTestResult, targetTestResult] = await Promise.all([
        testDirectusConnection(sourceUrl, sourceToken),
        testDirectusConnection(targetUrl, targetToken)
      ])

      if (!sourceTestResult.success) {
        throw new Error(`Source connection failed: ${sourceTestResult.message}`)
      }

      if (!targetTestResult.success) {
        throw new Error(`Target connection failed: ${targetTestResult.message}`)
      }

      // Create clients for data fetching
      const sourceClient = new DirectusClient(sourceUrl, sourceToken)
      const targetClient = new DirectusClient(targetUrl, targetToken)

      // Get collections from both instances
      const [sourceCollectionsResult, targetCollectionsResult] = await Promise.all([
        getAllCollections(sourceUrl, sourceToken),
        getAllCollections(targetUrl, targetToken)
      ])

      const sourceCollections = sourceCollectionsResult.success ? sourceCollectionsResult.collections || [] : []
      const targetCollections = targetCollectionsResult.success ? targetCollectionsResult.collections || [] : []

      // Combine and deduplicate collections
      const allCollections = [...sourceCollections, ...targetCollections]
        .filter((collection, index, self) => 
          index === self.findIndex(c => c.collection === collection.collection)
        )

      setCollections(allCollections)
      setIsConnected(true)
      setOperationStatus({
        type: 'success',
        message: `Successfully connected! Found ${allCollections.length} collections.`
      })

    } catch (error: any) {
      setOperationStatus({
        type: 'error',
        message: error.message || 'Failed to connect to Directus instances'
      })
    } finally {
      setLoadingState('connect', false)
    }
  }

  const handleDisconnect = () => {
    setIsConnected(false)
    setCollections([])
    setOperationStatus(null)
  }

  const handleLoadSettings = (settings: {
    sourceEnvironment: string
    sourceUrl: string
    sourceToken: string
    targetEnvironment: string
    targetUrl: string
    targetToken: string
  }) => {
    setSourceEnvironment(settings.sourceEnvironment)
    setSourceUrl(settings.sourceUrl)
    setSourceToken(settings.sourceToken)
    setTargetEnvironment(settings.targetEnvironment)
    setTargetUrl(settings.targetUrl)
    setTargetToken(settings.targetToken)
  }

  const handleClearAll = () => {
    setSourceEnvironment('')
    setSourceUrl('')
    setSourceToken('')
    setTargetEnvironment('')
    setTargetUrl('')
    setTargetToken('')
    setIsConnected(false)
    setCollections([])
    setOperationStatus(null)
  }

  const handleStatusUpdate = (status: OperationStatus | null) => {
    setOperationStatus(status)
  }

  const handleTestConnection = async (type: 'source' | 'target') => {
    const url = type === 'source' ? sourceUrl : targetUrl
    const token = type === 'source' ? sourceToken : targetToken

    if (!url || !token) {
      setOperationStatus({
        type: 'error',
        message: `Please fill in ${type} URL and token before testing`
      })
      return
    }

    // Set loading state
    setTestResults(prev => ({
      ...prev,
      [type]: { success: false, message: '', loading: true }
    }))

    try {
      const result = await testDirectusConnection(url, token)
      
      setTestResults(prev => ({
        ...prev,
        [type]: { 
          success: result.success, 
          message: result.message, 
          loading: false 
        }
      }))

      // Also show in main status
      setOperationStatus({
        type: result.success ? 'success' : 'error',
        message: `${type.charAt(0).toUpperCase() + type.slice(1)}: ${result.message}`
      })
    } catch (error: any) {
      setTestResults(prev => ({
        ...prev,
        [type]: { 
          success: false, 
          message: `Test failed: ${error.message}`, 
          loading: false 
        }
      }))
    }
  }

  const handleSavePreset = async (type: 'source' | 'target') => {
    const environment = type === 'source' ? sourceEnvironment : targetEnvironment
    const url = type === 'source' ? sourceUrl : targetUrl
    const token = type === 'source' ? sourceToken : targetToken

    if (!environment || !url || !token) {
      setOperationStatus({
        type: 'error',
        message: `Please fill in ${type} environment name, URL and token before saving`
      })
      return
    }

    const result = savePresetConfiguration({
      name: `${environment}-${type}`,
      environment,
      url,
      token,
      type
    })

    setOperationStatus({
      type: result.success ? 'success' : 'error',
      message: result.message
    })

    // Refresh the form to show new preset in dropdown
    if (result.success) {
      // Force re-render by updating a state
      setSourceEnvironment(prev => prev)
    }
  }

  return (
    <div className="container">
      <header style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1>Optical Migration Tool</h1>
        <p>Transfer data between Optical instances</p>
      </header>

      {!isConnected ? (
        <div>
          <SettingsManager
            currentSettings={{
              sourceEnvironment,
              sourceUrl,
              sourceToken,
              targetEnvironment,
              targetUrl,
              targetToken
            }}
            onLoadSettings={handleLoadSettings}
            onClearAll={handleClearAll}
          />
          
          <ConnectionForm
            sourceEnvironment={sourceEnvironment}
            sourceUrl={sourceUrl}
            sourceToken={sourceToken}
            targetEnvironment={targetEnvironment}
            targetUrl={targetUrl}
            targetToken={targetToken}
            onSourceEnvironmentChange={setSourceEnvironment}
            onSourceUrlChange={setSourceUrl}
            onSourceTokenChange={setSourceToken}
            onTargetEnvironmentChange={setTargetEnvironment}
            onTargetUrlChange={setTargetUrl}
            onTargetTokenChange={setTargetToken}
            onConnect={handleConnect}
            onTestConnection={handleTestConnection}
            onSavePreset={handleSavePreset}
            loading={loading.connect}
            testResults={testResults}
          />
        </div>
      ) : (
        <div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            marginBottom: '2rem',
            padding: '1.5rem',
            backgroundColor: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0'
          }}>
            <div>
              <h2 style={{ margin: 0, color: '#1e293b' }}>Connected Successfully</h2>
              <p style={{ margin: '0.5rem 0 0 0', color: '#64748b' }}>
                Source: {sourceUrl} | Target: {targetUrl}
              </p>
            </div>
            <button
              onClick={handleDisconnect}
              style={{
                backgroundColor: '#ef4444',
                color: 'white',
                padding: '0.75rem 1.5rem',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}
            >
              Disconnect
            </button>
          </div>

          <CollectionList
            collections={collections}
            sourceUrl={sourceUrl}
            sourceToken={sourceToken}
            targetUrl={targetUrl}
            targetToken={targetToken}
            onStatusUpdate={handleStatusUpdate}
            loading={loading}
            setLoading={setLoadingState}
          />
        </div>
      )}

      <StatusDisplay status={operationStatus} onDismiss={() => setOperationStatus(null)} />
    </div>
  )
}

export default App
