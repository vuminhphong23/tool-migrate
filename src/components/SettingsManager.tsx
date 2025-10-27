import React, { useState } from 'react'

interface ConnectionSettings {
  name: string
  sourceEnvironment: string
  sourceUrl: string
  sourceToken: string
  targetEnvironment: string
  targetUrl: string
  targetToken: string
  createdAt: string
}

interface SettingsManagerProps {
  currentSettings: {
    sourceEnvironment: string
    sourceUrl: string
    sourceToken: string
    targetEnvironment: string
    targetUrl: string
    targetToken: string
  }
  onLoadSettings: (settings: Omit<ConnectionSettings, 'name' | 'createdAt'>) => void
  onClearAll: () => void
}

export function SettingsManager({ currentSettings, onLoadSettings, onClearAll }: SettingsManagerProps) {
  const [showSettings, setShowSettings] = useState(false)
  const [presetName, setPresetName] = useState('')

  // Get saved presets from localStorage
  const getSavedPresets = (): ConnectionSettings[] => {
    try {
      const saved = localStorage.getItem('directus-migration-presets')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  }

  const [savedPresets, setSavedPresets] = useState<ConnectionSettings[]>(getSavedPresets())

  // Save current settings as a preset
  const saveCurrentAsPreset = () => {
    if (!presetName.trim()) {
      alert('Please enter a preset name')
      return
    }

    if (!currentSettings.sourceUrl || !currentSettings.targetUrl) {
      alert('Please fill in at least the URLs before saving')
      return
    }

    const newPreset: ConnectionSettings = {
      name: presetName.trim(),
      sourceEnvironment: currentSettings.sourceEnvironment,
      sourceUrl: currentSettings.sourceUrl,
      sourceToken: currentSettings.sourceToken,
      targetEnvironment: currentSettings.targetEnvironment,
      targetUrl: currentSettings.targetUrl,
      targetToken: currentSettings.targetToken,
      createdAt: new Date().toISOString()
    }

    const updatedPresets = [...savedPresets, newPreset]
    localStorage.setItem('directus-migration-presets', JSON.stringify(updatedPresets))
    setSavedPresets(updatedPresets)
    setPresetName('')
    alert(`Preset "${newPreset.name}" saved successfully!`)
  }

  // Load a preset
  const loadPreset = (preset: ConnectionSettings) => {
    onLoadSettings({
      sourceEnvironment: preset.sourceEnvironment,
      sourceUrl: preset.sourceUrl,
      sourceToken: preset.sourceToken,
      targetEnvironment: preset.targetEnvironment,
      targetUrl: preset.targetUrl,
      targetToken: preset.targetToken
    })
    setShowSettings(false)
  }

  // Delete a preset
  const deletePreset = (index: number) => {
    if (confirm('Are you sure you want to delete this preset?')) {
      const updatedPresets = savedPresets.filter((_, i) => i !== index)
      localStorage.setItem('directus-migration-presets', JSON.stringify(updatedPresets))
      setSavedPresets(updatedPresets)
    }
  }

  // Clear all data
  const clearAllData = () => {
    if (confirm('This will clear all saved presets and current settings. Are you sure?')) {
      localStorage.removeItem('directus-migration-presets')
      localStorage.removeItem('sourceEnvironment')
      localStorage.removeItem('sourceUrl')
      localStorage.removeItem('sourceToken')
      localStorage.removeItem('targetEnvironment')
      localStorage.removeItem('targetUrl')
      localStorage.removeItem('targetToken')
      setSavedPresets([])
      onClearAll()
      alert('All settings cleared!')
    }
  }

  // Export settings to JSON file
  const exportSettings = () => {
    const dataToExport = {
      presets: savedPresets,
      exportedAt: new Date().toISOString(),
      version: '1.0.0'
    }

    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `directus-migration-settings-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Import settings from JSON file
  const importSettings = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string)
        if (imported.presets && Array.isArray(imported.presets)) {
          const updatedPresets = [...savedPresets, ...imported.presets]
          localStorage.setItem('directus-migration-presets', JSON.stringify(updatedPresets))
          setSavedPresets(updatedPresets)
          alert(`Imported ${imported.presets.length} presets successfully!`)
        } else {
          alert('Invalid settings file format')
        }
      } catch {
        alert('Error reading settings file')
      }
    }
    reader.readAsText(file)
    event.target.value = '' // Reset input
  }

  if (!showSettings) {
    return (
      <div style={{ marginBottom: '1rem' }}>
        <button
          onClick={() => setShowSettings(true)}
          style={{
            backgroundColor: '#6b7280',
            color: 'white',
            padding: '0.5rem 1rem',
            fontSize: '0.875rem'
          }}
        >
          ⚙️ Manage Settings ({savedPresets.length} saved)
        </button>
      </div>
    )
  }

  return (
    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      padding: '1rem',
      marginBottom: '1rem',
      backgroundColor: '#f9fafb'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0 }}>⚙️ Settings Manager</h3>
        <button
          onClick={() => setShowSettings(false)}
          style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}
        >
          ×
        </button>
      </div>

      {/* Save Current Settings */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>💾 Save Current Settings</h4>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'end' }}>
          <div style={{ flex: 1 }}>
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Enter preset name (e.g., 'Production to Staging')"
              style={{ width: '100%' }}
            />
          </div>
          <button
            onClick={saveCurrentAsPreset}
            disabled={!presetName.trim()}
            style={{ backgroundColor: '#10b981', color: 'white' }}
          >
            Save Preset
          </button>
        </div>
      </div>

      {/* Saved Presets */}
      {savedPresets.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>📋 Saved Presets</h4>
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {savedPresets.map((preset, index) => (
              <div
                key={index}
                style={{
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  padding: '0.75rem',
                  marginBottom: '0.5rem',
                  backgroundColor: 'white'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>
                      {preset.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {preset.sourceEnvironment} ({preset.sourceUrl}) → {preset.targetEnvironment} ({preset.targetUrl})
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                      Saved: {new Date(preset.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button
                      onClick={() => loadPreset(preset)}
                      style={{
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.75rem'
                      }}
                    >
                      Load
                    </button>
                    <button
                      onClick={() => deletePreset(index)}
                      style={{
                        backgroundColor: '#ef4444',
                        color: 'white',
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.75rem'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Import/Export */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>📤📥 Import/Export</h4>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={exportSettings}
            disabled={savedPresets.length === 0}
            style={{ backgroundColor: '#8b5cf6', color: 'white' }}
          >
            Export Settings
          </button>
          <label style={{
            backgroundColor: '#f59e0b',
            color: 'white',
            padding: '0.6em 1.2em',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '1em',
            fontWeight: '500'
          }}>
            Import Settings
            <input
              type="file"
              accept=".json"
              onChange={importSettings}
              style={{ display: 'none' }}
            />
          </label>
        </div>
      </div>

      {/* Danger Zone */}
      <div style={{
        borderTop: '1px solid #e5e7eb',
        paddingTop: '1rem'
      }}>
        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', color: '#dc2626' }}>⚠️ Danger Zone</h4>
        <button
          onClick={clearAllData}
          style={{
            backgroundColor: '#dc2626',
            color: 'white',
            fontSize: '0.875rem'
          }}
        >
          Clear All Settings & Presets
        </button>
      </div>
    </div>
  )
}
