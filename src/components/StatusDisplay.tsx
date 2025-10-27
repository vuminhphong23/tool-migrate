import React from 'react'
import type { OperationStatus } from '../types'

interface StatusDisplayProps {
  status: OperationStatus | null
  onDismiss: () => void
}

export function StatusDisplay({ status, onDismiss }: StatusDisplayProps) {
  if (!status) return null

  return (
    <div className={`status-message ${status.type}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, paddingRight: '1rem' }}>
          <strong>
            {status.type === 'success' && '✅ Success'}
            {status.type === 'error' && '❌ Error'}
            {status.type === 'warning' && '⚠️ Warning'}
            {status.type === 'info' && 'ℹ️ Info'}
          </strong>
          <div style={{ marginTop: '0.25rem' }}>
            {status.message}
          </div>
        </div>
        
        <button
          onClick={onDismiss}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '1.25rem',
            cursor: 'pointer',
            padding: '0',
            color: 'inherit',
            opacity: 0.7
          }}
          title="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )
}
