import React, { useState } from 'react'
import { DirectusClient } from '../lib/DirectusClient'

interface DebugToolProps {
  sourceUrl: string
  sourceToken?: string
  sourceEmail?: string
  sourcePassword?: string
  sourceAuthType: 'token' | 'login'
}

export function DebugTool({ sourceUrl, sourceToken, sourceEmail, sourcePassword, sourceAuthType }: DebugToolProps) {
  const [results, setResults] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})

  const testEndpoint = async (endpoint: string, method: 'GET' | 'POST' | 'PATCH' = 'GET', body?: any) => {
    const key = `${method}_${endpoint}`
    setLoading(prev => ({ ...prev, [key]: true }))
    
    try {
      let client: DirectusClient
      
      if (sourceAuthType === 'token' && sourceToken) {
        client = new DirectusClient(sourceUrl, sourceToken)
      } else if (sourceAuthType === 'login' && sourceEmail && sourcePassword) {
        client = await DirectusClient.createWithLogin(sourceUrl, sourceEmail, sourcePassword)
      } else {
        throw new Error('Invalid authentication configuration')
      }

      let result
      switch (method) {
        case 'GET':
          result = await client.get(endpoint)
          break
        case 'POST':
          result = await client.post(endpoint, body)
          break
        case 'PATCH':
          result = await client.patch(endpoint, body)
          break
      }

      setResults(prev => ({
        ...prev,
        [key]: {
          success: true,
          data: result,
          timestamp: new Date().toISOString()
        }
      }))
    } catch (error: any) {
      setResults(prev => ({
        ...prev,
        [key]: {
          success: false,
          error: {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
          },
          timestamp: new Date().toISOString()
        }
      }))
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }))
    }
  }

  const testBasicEndpoints = () => {
    testEndpoint('/server/info')
    testEndpoint('/users/me')
    testEndpoint('/roles?limit=5')
    testEndpoint('/policies?limit=5')
    testEndpoint('/permissions?limit=5')
  }

  const testPolicyOperations = () => {
    const testPolicy = {
      id: 'test-policy-' + Date.now(),
      name: 'Test Policy',
      icon: 'policy',
      description: 'Test policy for debugging',
      admin_access: false,
      app_access: true,
      enforce_tfa: false,
      ip_access: null,
      permissions: [],
      roles: [],
      users: []
    }
    
    testEndpoint('/policies', 'POST', testPolicy)
  }

  return (
    <div style={{ 
      border: '2px solid #f59e0b', 
      borderRadius: '8px', 
      padding: '1rem', 
      margin: '1rem 0',
      backgroundColor: '#fffbeb'
    }}>
      <h3 style={{ color: '#92400e', margin: '0 0 1rem 0' }}>🔧 Debug Tool</h3>
      
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          onClick={testBasicEndpoints}
          style={{
            backgroundColor: '#3b82f6',
            color: 'white',
            padding: '0.5rem 1rem',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Test Basic Endpoints
        </button>
        
        <button
          onClick={testPolicyOperations}
          style={{
            backgroundColor: '#10b981',
            color: 'white',
            padding: '0.5rem 1rem',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Test Policy Creation
        </button>
      </div>

      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {Object.entries(results).map(([key, result]) => (
          <div key={key} style={{ 
            marginBottom: '1rem', 
            padding: '0.5rem',
            backgroundColor: result.success ? '#f0f9ff' : '#fef2f2',
            border: `1px solid ${result.success ? '#3b82f6' : '#ef4444'}`,
            borderRadius: '4px'
          }}>
            <div style={{ 
              fontWeight: 'bold', 
              color: result.success ? '#1e40af' : '#dc2626',
              marginBottom: '0.5rem'
            }}>
              {key} {loading[key] ? '(Loading...)' : result.success ? '✅' : '❌'}
            </div>
            
            <pre style={{ 
              fontSize: '0.75rem', 
              margin: 0,
              whiteSpace: 'pre-wrap',
              maxHeight: '200px',
              overflow: 'auto'
            }}>
              {JSON.stringify(result.success ? result.data : result.error, null, 2)}
            </pre>
            
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
              {result.timestamp}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
