import React, { useState, useEffect } from 'react'

export function SettingsDialog({ open, onClose }) {
  const [providerUrl, setProviderUrl] = useState('http://localhost:1234/v1')
  const [apiKey, setApiKey] = useState('')
  const [modelId, setModelId] = useState('')
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (!open) return
    setStatus('Loading...')
    window.electronAPI.frostGetSettings().then((s) => {
      if (s) {
        setProviderUrl(s.providerUrl || 'http://localhost:1234/v1')
        setApiKey(s.apiKey || '')
        setModelId(s.modelId || '')
      }
      setStatus('')
    })
  }, [open])

  const fetchModels = async () => {
    setLoading(true)
    setModels([])
    setTestResult('')
    const list = await window.electronAPI.frostListModels(providerUrl, apiKey)
    if (list.length === 0) {
      setTestResult('No models found. Check the URL and try again.')
    }
    setModels(list)
    setLoading(false)
  }

  const save = async () => {
    setSaving(true)
    setStatus('Saving...')
    await window.electronAPI.frostSaveSettings({ providerUrl, apiKey, modelId })
    setSaving(false)
    setStatus('Saved!')
    setTimeout(() => { setStatus(''); onClose() }, 1000)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-background p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold">Frost Settings</h2>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Provider URL</label>
            <input
              className="w-full rounded-lg border border-border/30 bg-surface-1 px-3 py-2 text-sm outline-none focus:border-primary/30"
              value={providerUrl}
              onChange={e => setProviderUrl(e.target.value)}
              placeholder="http://localhost:1234/v1"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">API Key (optional)</label>
            <input
              className="w-full rounded-lg border border-border/30 bg-surface-1 px-3 py-2 text-sm outline-none focus:border-primary/30"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-..."
              type="password"
            />
          </div>

          <button
            className="w-full rounded-lg bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/80 disabled:opacity-50"
            onClick={fetchModels}
            disabled={loading || !providerUrl.trim()}
          >
            {loading ? 'Loading...' : 'List Models'}
          </button>

          {models.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Select Model</label>
              <select
                className="w-full rounded-lg border border-border/30 bg-surface-1 px-3 py-2 text-sm outline-none"
                value={modelId}
                onChange={e => setModelId(e.target.value)}
              >
                <option value="">-- Select --</option>
                {models.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          {testResult && (
            <p className="text-xs text-muted-foreground">{testResult}</p>
          )}

          {status && (
            <p className="text-xs text-primary">{status}</p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            className="rounded-lg border border-border/30 px-4 py-2 text-sm hover:bg-surface-1"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            onClick={save}
            disabled={saving || !modelId}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
