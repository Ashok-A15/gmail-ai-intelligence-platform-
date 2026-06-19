'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, Save, ShieldAlert, CheckCircle, ArrowRight, Database, Key, Globe } from 'lucide-react';

export default function SetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Record<string, boolean>>({});
  const [configured, setConfigured] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form fields
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [nvidiaKey, setNvidiaKey] = useState('');
  const [googleId, setGoogleId] = useState('');
  const [googleSecret, setGoogleSecret] = useState('');

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        setStatus(data.status || {});
        setConfigured(data.configured || false);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load config status:', err);
        setLoading(false);
      });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const payload: Record<string, string> = {};
    if (supabaseUrl) payload['NEXT_PUBLIC_SUPABASE_URL'] = supabaseUrl;
    if (supabaseKey) payload['SUPABASE_SERVICE_ROLE_KEY'] = supabaseKey;
    if (geminiKey) payload['GEMINI_API_KEY'] = geminiKey;
    if (nvidiaKey) payload['NVIDIA_API_KEY'] = nvidiaKey;
    if (googleId) payload['GOOGLE_CLIENT_ID'] = googleId;
    if (googleSecret) payload['GOOGLE_CLIENT_SECRET'] = googleSecret;

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success) {
        setMessage({ type: 'success', text: 'Configuration saved successfully!' });
        setConfigured(true);
        // Refresh status
        const statusRes = await fetch('/api/config');
        const statusData = await statusRes.json();
        setStatus(statusData.status || {});
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save configuration.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'An unexpected error occurred.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="setup-container loading">
        <div className="spinner"></div>
        <p>Checking environment configuration...</p>
      </div>
    );
  }

  return (
    <div className="setup-container">
      <div className="setup-card glass">
        <header className="setup-header">
          <div className="setup-icon-wrapper">
            <Settings className="setup-icon spin-hover" />
          </div>
          <h1>Platform Configuration</h1>
          <p className="subtitle">
            Configure your AI keys, database credentials, and Google OAuth settings to initialize the Gmail Intelligence Platform.
          </p>
        </header>

        {configured && (
          <div className="status-banner success-banner glass">
            <CheckCircle className="banner-icon" />
            <div className="banner-content">
              <h3>System Fully Configured</h3>
              <p>All required environment variables are set. You are ready to authenticate with Gmail.</p>
            </div>
            <button className="primary-btn dashboard-btn" onClick={() => router.push('/')}>
              Go to Dashboard <ArrowRight size={16} />
            </button>
          </div>
        )}

        {!configured && (
          <div className="status-banner warning-banner glass">
            <ShieldAlert className="banner-icon" />
            <div className="banner-content">
              <h3>Configuration Incomplete</h3>
              <p>Please enter the missing credentials below to enable syncing, summarization, and agent capabilities.</p>
            </div>
          </div>
        )}

        {message && (
          <div className={`alert-box ${message.type === 'success' ? 'alert-success' : 'alert-error'} glass`}>
            <p>{message.text}</p>
          </div>
        )}

        <form onSubmit={handleSave} className="setup-form">
          {/* Section: Supabase */}
          <div className="form-section">
            <h2 className="section-title">
              <Database size={18} /> Supabase Database Settings
            </h2>
            <div className="form-grid">
              <div className="form-group">
                <label>
                  Supabase URL
                  {status['NEXT_PUBLIC_SUPABASE_URL'] && <span className="badge configured">Configured</span>}
                </label>
                <input
                  type="text"
                  placeholder="https://your-project.supabase.co"
                  value={supabaseUrl}
                  onChange={e => setSupabaseUrl(e.target.value)}
                  className="input-field"
                />
              </div>
              <div className="form-group">
                <label>
                  Supabase Service Role Key
                  {status['SUPABASE_SERVICE_ROLE_KEY'] && <span className="badge configured">Configured</span>}
                </label>
                <input
                  type="password"
                  placeholder="eyJhbGciOi..."
                  value={supabaseKey}
                  onChange={e => setSupabaseKey(e.target.value)}
                  className="input-field"
                />
                <span className="field-hint">Service role key is required to bypass Row Level Security for syncing.</span>
              </div>
            </div>
          </div>

          {/* Section: AI Credentials */}
          <div className="form-section">
            <h2 className="section-title">
              <Key size={18} /> AI Model Credentials
            </h2>
            <div className="form-grid">
              <div className="form-group">
                <label>
                  Google Gemini API Key
                  {status['GEMINI_API_KEY'] && <span className="badge configured">Configured</span>}
                </label>
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  value={geminiKey}
                  onChange={e => setGeminiKey(e.target.value)}
                  className="input-field"
                />
                <span className="field-hint">Used as primary AI model for email summarization, drafting, and chat agent.</span>
              </div>
              <div className="form-group">
                <label>
                  NVIDIA NIM API Key
                  {status['NVIDIA_API_KEY'] && <span className="badge configured">Configured</span>}
                </label>
                <input
                  type="password"
                  placeholder="nvapi-..."
                  value={nvidiaKey}
                  onChange={e => setNvidiaKey(e.target.value)}
                  className="input-field"
                />
                <span className="field-hint">Used as secondary AI model for categorization and newsletter deduplication.</span>
              </div>
            </div>
          </div>

          {/* Section: Google OAuth */}
          <div className="form-section">
            <h2 className="section-title">
              <Globe size={18} /> Google OAuth 2.0 Credentials
            </h2>
            <div className="form-grid">
              <div className="form-group">
                <label>
                  Google Client ID
                  {status['GOOGLE_CLIENT_ID'] && <span className="badge configured">Configured</span>}
                </label>
                <input
                  type="text"
                  placeholder="123456789-abc.apps.googleusercontent.com"
                  value={googleId}
                  onChange={e => setGoogleId(e.target.value)}
                  className="input-field"
                />
              </div>
              <div className="form-group">
                <label>
                  Google Client Secret
                  {status['GOOGLE_CLIENT_SECRET'] && <span className="badge configured">Configured</span>}
                </label>
                <input
                  type="password"
                  placeholder="GOCSPX-..."
                  value={googleSecret}
                  onChange={e => setGoogleSecret(e.target.value)}
                  className="input-field"
                />
                <span className="field-hint">
                  Make sure to add `http://localhost:3000/api/auth/callback` to Google Console Authorized Redirect URIs.
                </span>
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" disabled={saving} className="primary-btn save-btn">
              {saving ? (
                <>
                  <span className="spinner small-spinner"></span> Saving Configuration...
                </>
              ) : (
                <>
                  <Save size={18} /> Save Settings
                </>
              )}
            </button>
            {configured && (
              <button type="button" onClick={() => router.push('/')} className="secondary-btn">
                Dashboard <ArrowRight size={16} style={{ marginLeft: '4px' }} />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
