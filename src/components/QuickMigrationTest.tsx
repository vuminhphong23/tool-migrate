import React, { useState } from 'react'
import { DirectusClient } from '../lib/DirectusClient'

interface QuickMigrationTestProps {
  sourceUrl: string
  sourceToken?: string
  sourceEmail?: string
  sourcePassword?: string
  sourceAuthType: 'token' | 'login'
  targetUrl: string
  targetToken?: string
  targetEmail?: string
  targetPassword?: string
  targetAuthType: 'token' | 'login'
}

export function QuickMigrationTest(props: QuickMigrationTestProps) {
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const addResult = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info', data?: any) => {
    setResults(prev => [...prev, {
      timestamp: new Date().toISOString(),
      message,
      type,
      data
    }])
  }

  const getClient = async (isSource: boolean): Promise<DirectusClient> => {
    const url = isSource ? props.sourceUrl : props.targetUrl
    const authType = isSource ? props.sourceAuthType : props.targetAuthType
    const token = isSource ? props.sourceToken : props.targetToken
    const email = isSource ? props.sourceEmail : props.targetEmail
    const password = isSource ? props.sourcePassword : props.targetPassword

    if (authType === 'token' && token) {
      return new DirectusClient(url, token)
    } else if (authType === 'login' && email && password) {
      return await DirectusClient.createWithLogin(url, email, password)
    } else {
      throw new Error(`Invalid ${isSource ? 'source' : 'target'} authentication configuration`)
    }
  }

  const testSimplePolicyMigration = async () => {
    setLoading(true)
    setResults([])
    
    try {
      addResult('🚀 Starting Simple Policy Migration Test...')
      
      // Step 1: Get clients
      addResult('📡 Connecting to source and target...')
      const sourceClient = await getClient(true)
      const targetClient = await getClient(false)
      addResult('✅ Connected to both instances')

      // Step 2: Get source policies
      addResult('📥 Fetching source policies...')
      const sourcePoliciesResponse = await sourceClient.get('/policies?limit=5')
      const sourcePolicies = sourcePoliciesResponse.data || sourcePoliciesResponse || []
      addResult(`📊 Found ${sourcePolicies.length} source policies`, 'info', sourcePolicies)

      if (sourcePolicies.length === 0) {
        addResult('⚠️ No policies found in source instance', 'warning')
        return
      }

      // Step 3: Test with first non-admin policy
      const testPolicy = sourcePolicies.find((p: any) => !p.admin_access) || sourcePolicies[0]
      addResult(`🎯 Testing with policy: ${testPolicy.name}`, 'info', testPolicy)

      // Step 4: Create simplified policy structure
      const simplifiedPolicy = {
        id: `test-${Date.now()}`,
        name: `[TEST] ${testPolicy.name}`,
        icon: testPolicy.icon || 'policy',
        description: `Test migration of ${testPolicy.name}`,
        admin_access: false,
        app_access: true,
        enforce_tfa: false
        // Skip complex fields: ip_access, permissions, roles, users
      }

      addResult('🔧 Created simplified policy structure:', 'info', simplifiedPolicy)

      // Step 5: Try to create policy in target
      addResult('📤 Attempting to create policy in target...')
      try {
        const createResponse = await targetClient.post('/policies', simplifiedPolicy)
        addResult('✅ SUCCESS: Policy created successfully!', 'success', createResponse)
        
        // Step 6: Try to update the policy
        addResult('🔄 Testing policy update...')
        const updateData = { ...simplifiedPolicy, description: 'Updated description' }
        const updateResponse = await targetClient.patch(`/policies/${simplifiedPolicy.id}`, updateData)
        addResult('✅ SUCCESS: Policy updated successfully!', 'success', updateResponse)
        
        // Step 7: Clean up - delete test policy
        addResult('🧹 Cleaning up test policy...')
        await targetClient.delete(`/policies/${simplifiedPolicy.id}`)
        addResult('✅ Test policy cleaned up')
        
      } catch (createError: any) {
        addResult('❌ FAILED: Could not create policy', 'error', {
          message: createError.message,
          status: createError.response?.status,
          data: createError.response?.data
        })
      }

    } catch (error: any) {
      addResult('💥 Migration test failed', 'error', {
        message: error.message,
        stack: error.stack
      })
    } finally {
      setLoading(false)
    }
  }

  const testFullPolicyMigration = async () => {
    setLoading(true)
    setResults([])
    
    try {
      addResult('🚀 Starting Full Policy Migration Test...')
      
      const sourceClient = await getClient(true)
      const targetClient = await getClient(false)
      
      const sourcePoliciesResponse = await sourceClient.get('/policies?limit=3')
      const sourcePolicies = sourcePoliciesResponse.data || sourcePoliciesResponse || []
      
      if (sourcePolicies.length === 0) {
        addResult('⚠️ No policies found', 'warning')
        return
      }

      const testPolicy = sourcePolicies.find((p: any) => !p.admin_access) || sourcePolicies[0]
      
      // Full structure with all fields
      const { date_created, user_created, date_updated, user_updated, ...cleanPolicy } = testPolicy
      const fullPolicy = {
        ...cleanPolicy,
        id: `test-full-${Date.now()}`,
        name: `[TEST FULL] ${testPolicy.name}`,
        ip_access: cleanPolicy.ip_access || null,
        enforce_tfa: cleanPolicy.enforce_tfa || false,
        admin_access: false, // Force to false for safety
        app_access: cleanPolicy.app_access || true,
        permissions: cleanPolicy.permissions || [],
        roles: cleanPolicy.roles || [],
        users: cleanPolicy.users || []
      }

      addResult('🔧 Created full policy structure:', 'info', fullPolicy)
      
      try {
        const createResponse = await targetClient.post('/policies', fullPolicy)
        addResult('✅ SUCCESS: Full policy created!', 'success', createResponse)
        
        // Clean up
        await targetClient.delete(`/policies/${fullPolicy.id}`)
        addResult('✅ Test policy cleaned up')
        
      } catch (createError: any) {
        addResult('❌ FAILED: Full policy creation failed', 'error', {
          message: createError.message,
          status: createError.response?.status,
          data: createError.response?.data
        })
      }

    } catch (error: any) {
      addResult('💥 Full migration test failed', 'error', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ 
      border: '2px solid #ef4444', 
      borderRadius: '8px', 
      padding: '1rem', 
      margin: '1rem 0',
      backgroundColor: '#fef2f2'
    }}>
      <h3 style={{ color: '#dc2626', margin: '0 0 1rem 0' }}>🧪 Quick Migration Test</h3>
      
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          onClick={testSimplePolicyMigration}
          disabled={loading}
          style={{
            backgroundColor: '#10b981',
            color: 'white',
            padding: '0.5rem 1rem',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1
          }}
        >
          {loading ? 'Testing...' : 'Test Simple Policy'}
        </button>
        
        <button
          onClick={testFullPolicyMigration}
          disabled={loading}
          style={{
            backgroundColor: '#f59e0b',
            color: 'white',
            padding: '0.5rem 1rem',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1
          }}
        >
          {loading ? 'Testing...' : 'Test Full Policy'}
        </button>
      </div>

      <div style={{ 
        maxHeight: '400px', 
        overflowY: 'auto',
        backgroundColor: '#000',
        color: '#00ff00',
        padding: '1rem',
        borderRadius: '4px',
        fontFamily: 'monospace',
        fontSize: '0.875rem'
      }}>
        {results.length === 0 && (
          <div style={{ color: '#888' }}>Click a test button to start...</div>
        )}
        
        {results.map((result, index) => (
          <div key={index} style={{ 
            marginBottom: '0.5rem',
            color: result.type === 'error' ? '#ff6b6b' : 
                   result.type === 'success' ? '#51cf66' :
                   result.type === 'warning' ? '#ffd43b' : '#00ff00'
          }}>
            <span style={{ color: '#888' }}>[{new Date(result.timestamp).toLocaleTimeString()}]</span> {result.message}
            {result.data && (
              <pre style={{ 
                marginLeft: '1rem', 
                fontSize: '0.75rem', 
                color: '#ccc',
                whiteSpace: 'pre-wrap',
                maxHeight: '100px',
                overflow: 'auto'
              }}>
                {typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
