import React from 'react'

interface ConnectionFormProps {
  sourceEnvironment: string
  sourceUrl: string
  sourceToken: string
  targetEnvironment: string
  targetUrl: string
  targetToken: string
  onSourceEnvironmentChange: (value: string) => void
  onSourceUrlChange: (value: string) => void
  onSourceTokenChange: (value: string) => void
  onTargetEnvironmentChange: (value: string) => void
  onTargetUrlChange: (value: string) => void
  onTargetTokenChange: (value: string) => void
  onConnect: () => void
  onTestConnection: (type: 'source' | 'target') => void
  onSavePreset: (type: 'source' | 'target') => void
  loading: boolean
  testResults: {
    source?: { success: boolean; message: string; loading: boolean }
    target?: { success: boolean; message: string; loading: boolean }
  }
}

export function ConnectionForm({
  sourceEnvironment,
  sourceUrl,
  sourceToken,
  targetEnvironment,
  targetUrl,
  targetToken,
  onSourceEnvironmentChange,
  onSourceUrlChange,
  onSourceTokenChange,
  onTargetEnvironmentChange,
  onTargetUrlChange,
  onTargetTokenChange,
  onConnect,
  onTestConnection,
  onSavePreset,
  loading,
  testResults
}: ConnectionFormProps) {

  const getSavedPresets = (): any[] => {
    try {
      const saved = localStorage.getItem('directus-migration-presets')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  }

  const savedPresets = getSavedPresets()

  const getEnvironments = (type: 'source' | 'target'): string[] => {
    const environments: string[] = []
    savedPresets.forEach((preset: any) => {
      const env = type === 'source' ? preset.sourceEnvironment : preset.targetEnvironment
      if (typeof env === 'string' && env.trim().length > 0) {
        environments.push(env)
      }
    })
    return [...new Set(environments)]
  }

  const sourceEnvironments = getEnvironments('source')
  const targetEnvironments = getEnvironments('target')

  const loadPresetByEnvironment = (environment: string, type: 'source' | 'target') => {
    const preset = savedPresets.find((p: any) => 
      type === 'source' ? p.sourceEnvironment === environment : p.targetEnvironment === environment
    )
    
    if (preset) {
      if (type === 'source') {
        onSourceEnvironmentChange(preset.sourceEnvironment || '')
        onSourceUrlChange(preset.sourceUrl || '')
        onSourceTokenChange(preset.sourceToken || '')
      } else {
        onTargetEnvironmentChange(preset.targetEnvironment || '')
        onTargetUrlChange(preset.targetUrl || '')
        onTargetTokenChange(preset.targetToken || '')
      }
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onConnect()
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gap: '2rem',
        marginBottom: '2rem'
      }}>
        {/* Source Configuration */}
        <div style={{ 
          padding: '1.5rem', 
          border: '2px solid #3b82f6', 
          borderRadius: '8px',
          backgroundColor: '#eff6ff'
        }}>
          <h3 style={{ margin: '0 0 1rem 0', color: '#1e40af' }}>📤 Source Instance</h3>
          
          <div className="form-group">
            <label htmlFor="sourceEnvironment">Environment Name:</label>
            <input
              id="sourceEnvironment"
              list="sourceEnvironmentList"
              type="text"
              value={sourceEnvironment}
              onChange={(e) => {
                onSourceEnvironmentChange(e.target.value)
                if (e.target.value && sourceEnvironments.includes(e.target.value)) {
                  loadPresetByEnvironment(e.target.value, 'source')
                }
              }}
              placeholder="e.g., Production, Staging, Dev"
              disabled={loading}
            />
            <datalist id="sourceEnvironmentList">
              {sourceEnvironments.map(env => (
                <option key={env} value={env} />
              ))}
            </datalist>
          </div>

          <div className="form-group">
            <label htmlFor="sourceUrl">Directus URL:</label>
            <input
              id="sourceUrl"
              type="url"
              value={sourceUrl}
              onChange={(e) => onSourceUrlChange(e.target.value)}
              placeholder="https://your-directus-instance.com"
              disabled={loading}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="sourceToken">Bearer Token:</label>
            <div style={{ position: 'relative' }}>
              <input
                id="sourceToken"
                type="password"
                value={sourceToken}
                onChange={(e) => onSourceTokenChange(e.target.value)}
                placeholder="Enter admin token"
                disabled={loading}
                required
                style={{ paddingRight: '2.5rem' }}
              />
              <button
                type="button"
                onClick={() => {
                  const input = document.getElementById('sourceToken') as HTMLInputElement
                  input.type = input.type === 'password' ? 'text' : 'password'
                }}
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                👁️
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button
              type="button"
              onClick={() => onTestConnection('source')}
              disabled={loading || testResults.source?.loading || !sourceUrl || !sourceToken}
              style={{
                backgroundColor: testResults.source?.success ? '#10b981' : '#3b82f6',
                color: 'white',
                padding: '0.5rem 1rem',
                border: 'none',
                borderRadius: '4px',
                cursor: loading || testResults.source?.loading ? 'not-allowed' : 'pointer',
                opacity: loading || testResults.source?.loading || !sourceUrl || !sourceToken ? 0.6 : 1,
                fontSize: '0.875rem'
              }}
            >
              {testResults.source?.loading ? 'Testing...' : 
               testResults.source?.success ? '✅ Connected' : 'Test Connection'}
            </button>

            <button
              type="button"
              onClick={() => onSavePreset('source')}
              disabled={loading || !sourceEnvironment || !sourceUrl || !sourceToken}
              style={{
                backgroundColor: '#6b7280',
                color: 'white',
                padding: '0.5rem 1rem',
                border: 'none',
                borderRadius: '4px',
                cursor: loading || !sourceEnvironment || !sourceUrl || !sourceToken ? 'not-allowed' : 'pointer',
                opacity: loading || !sourceEnvironment || !sourceUrl || !sourceToken ? 0.6 : 1,
                fontSize: '0.875rem'
              }}
            >
              Save
            </button>
          </div>

          {testResults.source && (
            <div style={{
              marginTop: '0.5rem',
              padding: '0.5rem',
              borderRadius: '4px',
              fontSize: '0.875rem',
              backgroundColor: testResults.source.success ? '#d1fae5' : '#fee2e2',
              color: testResults.source.success ? '#065f46' : '#dc2626'
            }}>
              {testResults.source.message}
            </div>
          )}
        </div>

        {/* Target Configuration */}
        <div style={{ 
          padding: '1.5rem', 
          border: '2px solid #10b981', 
          borderRadius: '8px',
          backgroundColor: '#ecfdf5'
        }}>
          <h3 style={{ margin: '0 0 1rem 0', color: '#047857' }}>📥 Target Instance</h3>
          
          <div className="form-group">
            <label htmlFor="targetEnvironment">Environment Name:</label>
            <input
              id="targetEnvironment"
              list="targetEnvironmentList"
              type="text"
              value={targetEnvironment}
              onChange={(e) => {
                onTargetEnvironmentChange(e.target.value)
                if (e.target.value && targetEnvironments.includes(e.target.value)) {
                  loadPresetByEnvironment(e.target.value, 'target')
                }
              }}
              placeholder="e.g., Production, Staging, Dev"
              disabled={loading}
            />
            <datalist id="targetEnvironmentList">
              {targetEnvironments.map(env => (
                <option key={env} value={env} />
              ))}
            </datalist>
          </div>

          <div className="form-group">
            <label htmlFor="targetUrl">Directus URL:</label>
            <input
              id="targetUrl"
              type="url"
              value={targetUrl}
              onChange={(e) => onTargetUrlChange(e.target.value)}
              placeholder="https://your-target-directus.com"
              disabled={loading}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="targetToken">Bearer Token:</label>
            <div style={{ position: 'relative' }}>
              <input
                id="targetToken"
                type="password"
                value={targetToken}
                onChange={(e) => onTargetTokenChange(e.target.value)}
                placeholder="Enter admin token"
                disabled={loading}
                required
                style={{ paddingRight: '2.5rem' }}
              />
              <button
                type="button"
                onClick={() => {
                  const input = document.getElementById('targetToken') as HTMLInputElement
                  input.type = input.type === 'password' ? 'text' : 'password'
                }}
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                👁️
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button
              type="button"
              onClick={() => onTestConnection('target')}
              disabled={loading || testResults.target?.loading || !targetUrl || !targetToken}
              style={{
                backgroundColor: testResults.target?.success ? '#10b981' : '#3b82f6',
                color: 'white',
                padding: '0.5rem 1rem',
                border: 'none',
                borderRadius: '4px',
                cursor: loading || testResults.target?.loading ? 'not-allowed' : 'pointer',
                opacity: loading || testResults.target?.loading || !targetUrl || !targetToken ? 0.6 : 1,
                fontSize: '0.875rem'
              }}
            >
              {testResults.target?.loading ? 'Testing...' : 
               testResults.target?.success ? '✅ Connected' : 'Test Connection'}
            </button>

            <button
              type="button"
              onClick={() => onSavePreset('target')}
              disabled={loading || !targetEnvironment || !targetUrl || !targetToken}
              style={{
                backgroundColor: '#6b7280',
                color: 'white',
                padding: '0.5rem 1rem',
                border: 'none',
                borderRadius: '4px',
                cursor: loading || !targetEnvironment || !targetUrl || !targetToken ? 'not-allowed' : 'pointer',
                opacity: loading || !targetEnvironment || !targetUrl || !targetToken ? 0.6 : 1,
                fontSize: '0.875rem'
              }}
            >
              Save
            </button>
          </div>

          {testResults.target && (
            <div style={{
              marginTop: '0.5rem',
              padding: '0.5rem',
              borderRadius: '4px',
              fontSize: '0.875rem',
              backgroundColor: testResults.target.success ? '#d1fae5' : '#fee2e2',
              color: testResults.target.success ? '#065f46' : '#dc2626'
            }}>
              {testResults.target.message}
            </div>
          )}
        </div>
      </div>

      {/* Connect Button */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <button
          type="submit"
          disabled={loading || !sourceUrl || !targetUrl || !sourceToken || !targetToken}
          style={{
            backgroundColor: '#059669',
            color: 'white',
            padding: '1rem 2rem',
            border: 'none',
            borderRadius: '8px',
            cursor: loading || !sourceUrl || !targetUrl || !sourceToken || !targetToken ? 'not-allowed' : 'pointer',
            fontSize: '1rem',
            fontWeight: '600',
            opacity: loading || !sourceUrl || !targetUrl || !sourceToken || !targetToken ? 0.6 : 1
          }}
        >
          {loading ? 'Connecting...' : 'Connect to target instance'}
        </button>
      </div>

      <div style={{ 
        marginTop: '1.5rem', 
        padding: '1rem', 
        backgroundColor: '#fffbeb', 
        borderRadius: '8px',
        fontSize: '0.875rem',
        color: '#92400e'
      }}>
        <strong>💡 Tip:</strong> Save setting to reuse later.
      </div>
    </form>
  )
}
