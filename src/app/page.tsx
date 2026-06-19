'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Inbox,
  Mail,
  Send,
  RefreshCw,
  MessageSquare,
  Sparkles,
  Search,
  Settings,
  ChevronRight,
  User,
  LogOut,
  AlertCircle,
  FileText,
  Trash2,
  ExternalLink,
  ChevronLeft,
  X,
  ArrowRight
} from 'lucide-react';

interface Thread {
  id: string;
  subject: string;
  category: string;
  summary: string;
  last_updated_at: string;
}

interface Email {
  id: string;
  from_name: string;
  from_email: string;
  to_name: string;
  to_email: string;
  subject: string;
  body_text: string;
  body_html: string;
  snippet: string;
  date: string;
  category: string;
  summary: string;
  is_read: boolean;
  is_sent: boolean;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{ thread_id: string; subject: string; sender: string; date: string }>;
}

export default function Dashboard() {
  const router = useRouter();
  
  // Configuration / Auth States
  const [configChecked, setConfigChecked] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);
  
  // Dashboard Core States
  const [activeCategory, setActiveCategory] = useState('Inbox');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [filteredThreads, setFilteredThreads] = useState<Thread[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<{ thread: Thread; emails: Email[] } | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  
  // AI Composer States
  const [replyPrompt, setReplyPrompt] = useState('');
  const [replyDraft, setReplyDraft] = useState('');
  const [generatingReply, setGeneratingReply] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  
  // AI Chat States
  const [chatOpen, setChatOpen] = useState(true);
  const [chatQuery, setChatQuery] = useState('');
  const [chatMessages, setChatMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hello! I am your AI Gmail Assistant. I have indexed all of your synchronized emails. You can ask me questions about specific senders, projects, job applications, tech news, or request summaries. How can I help you today?"
    }
  ]);
  const [sendingChat, setSendingChat] = useState(false);
  
  // Global Action States
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // 1. Initial configuration check
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        if (!data.configured) {
          router.push('/setup');
        } else {
          setConfigChecked(true);
          // Check if cookie exists by checking if we can fetch user profile
          checkAuthStatus();
        }
      })
      .catch(err => {
        console.error('Config check failed:', err);
        setErrorMsg('Failed to verify system configuration.');
      });
  }, [router]);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const checkAuthStatus = () => {
    // Basic test fetch to see if cookie is active
    fetch('/api/threads')
      .then(res => {
        if (res.status === 401) {
          setUserEmail(null);
        } else {
          // Parse cookie or response header to get email
          // Since we set a cookie, we can query a profile route or inspect our local cookies
          const cookieMatch = document.cookie.match(/user_email=([^;]+)/);
          if (cookieMatch) {
            setUserEmail(decodeURIComponent(cookieMatch[1]));
            loadThreads();
          } else {
            // Check fallback
            setUserEmail(null);
          }
        }
      })
      .catch(() => setUserEmail(null));
  };

  // 2. Load Threads from DB
  const loadThreads = (category = activeCategory) => {
    setLoadingThreads(true);
    setErrorMsg(null);
    fetch(`/api/threads?category=${encodeURIComponent(category)}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setErrorMsg(data.error);
        } else {
          setThreads(data.threads || []);
          setFilteredThreads(data.threads || []);
        }
        setLoadingThreads(false);
      })
      .catch(err => {
        console.error('Load threads failed:', err);
        setErrorMsg('Failed to load threads from database.');
        setLoadingThreads(false);
      });
  };

  // 3. Load Thread Detail
  const loadThreadDetail = (id: string) => {
    setLoadingDetail(true);
    setSelectedThreadId(id);
    setReplyDraft('');
    setReplyPrompt('');
    
    fetch(`/api/threads/${id}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setErrorMsg(data.error);
        } else {
          setSelectedThread(data);
        }
        setLoadingDetail(false);
      })
      .catch(err => {
        console.error('Load thread detail failed:', err);
        setErrorMsg('Failed to retrieve thread details.');
        setLoadingDetail(false);
      });
  };

  // Filter threads by search bar query
  useEffect(() => {
    if (!searchQuery) {
      setFilteredThreads(threads);
    } else {
      const q = searchQuery.toLowerCase();
      const filtered = threads.filter(t => 
        t.subject?.toLowerCase().includes(q) || 
        t.summary?.toLowerCase().includes(q)
      );
      setFilteredThreads(filtered);
    }
  }, [searchQuery, threads]);

  // Handle category change
  const handleCategoryChange = (category: string) => {
    setActiveCategory(category);
    loadThreads(category);
    setSelectedThreadId(null);
    setSelectedThread(null);
  };

  // 4. Connect Gmail / Google OAuth Redirect
  const handleConnectGmail = async () => {
    setOauthLoading(true);
    try {
      const res = await fetch('/api/auth/url');
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setErrorMsg(data.error || 'Failed to initialize OAuth.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'OAuth error occurred.');
    } finally {
      setOauthLoading(false);
    }
  };

  // 5. Trigger Inbox Sync
  const handleSyncInbox = async () => {
    setSyncing(true);
    setSyncStatus('Querying Gmail API and retrieving new threads...');
    setErrorMsg(null);
    
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();
      
      if (data.error) {
        setErrorMsg(data.error);
      } else {
        setSyncStatus(`Sync finished! Processed ${data.threadsSynced} threads and ${data.emailsSynced} emails.`);
        loadThreads(activeCategory);
        if (selectedThreadId) {
          loadThreadDetail(selectedThreadId);
        }
        // Fade status after 4 seconds
        setTimeout(() => setSyncStatus(null), 4000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Sync operation failed.');
    } finally {
      setSyncing(false);
    }
  };

  // 6. Generate AI Reply
  const handleGenerateReply = async () => {
    if (!selectedThreadId || !replyPrompt) return;
    setGeneratingReply(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/threads/${selectedThreadId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: replyPrompt })
      });
      const data = await res.json();
      
      if (data.error) {
        setErrorMsg(data.error);
      } else {
        setReplyDraft(data.body || '');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to generate AI reply.');
    } finally {
      setGeneratingReply(false);
    }
  };

  // 7. Send Email (New or Reply)
  const handleSendEmail = async () => {
    if (!selectedThread || !replyDraft) return;
    
    // Determine recipient - send reply to the sender of the last received email
    const emails = selectedThread.emails;
    const lastReceived = [...emails].reverse().find(e => !e.is_sent);
    const recipient = lastReceived ? lastReceived.from_email : (emails[0]?.to_email || '');
    
    if (!recipient) {
      setErrorMsg('Could not resolve recipient email address.');
      return;
    }

    setSendingEmail(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipient,
          subject: selectedThread.thread.subject,
          body: replyDraft,
          threadId: selectedThread.thread.id
        })
      });
      const data = await res.json();

      if (data.error) {
        setErrorMsg(data.error);
      } else {
        setReplyDraft('');
        setReplyPrompt('');
        // Reload details to show newly sent message
        loadThreadDetail(selectedThread.thread.id);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send email.');
    } finally {
      setSendingEmail(false);
    }
  };

  // 8. Chat Agent Submit
  const handleChatSubmit = async (e?: React.FormEvent, promptOverride?: string) => {
    if (e) e.preventDefault();
    const queryToSend = promptOverride || chatQuery;
    if (!queryToSend.trim()) return;

    const userMessage: Message = { role: 'user', content: queryToSend };
    setChatMessages(prev => [...prev, userMessage]);
    if (!promptOverride) setChatQuery('');
    setSendingChat(true);

    // Form history list from existing messages
    const historyPayload = chatMessages
      .slice(-6) // Send last 6 messages as context
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryToSend, history: historyPayload })
      });
      const data = await res.json();

      if (data.error) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error}` }]);
      } else {
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: data.text || 'No response returned.',
          sources: data.sources || []
        }]);
      }
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Network error: ${err.message}` }]);
    } finally {
      setSendingChat(false);
    }
  };

  const handleLogout = () => {
    // Clear user email cookie by setting expiry in past
    document.cookie = 'user_email=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    setUserEmail(null);
    setSelectedThread(null);
    setSelectedThreadId(null);
    setThreads([]);
    setFilteredThreads([]);
  };

  // Markdown Formatter Helper
  const renderMarkdown = (text: string) => {
    if (!text) return '';
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // Bold Headers **text**
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Code blocks `code`
    html = html.replace(/`(.*?)`/g, '<code style="background: rgba(255,255,255,0.08); padding: 2px 4px; border-radius: 4px; font-family: monospace;">$1</code>');
    
    // Bullet Points
    html = html.split('\n').map(line => {
      if (line.trim().startsWith('- ')) {
        return `<li style="margin-left: 15px; list-style-type: disc; margin-bottom: 4px;">${line.trim().substring(2)}</li>`;
      }
      if (line.trim().startsWith('* ')) {
        return `<li style="margin-left: 15px; list-style-type: disc; margin-bottom: 4px;">${line.trim().substring(2)}</li>`;
      }
      return line;
    }).join('\n');
    
    // Line breaks
    html = html.replace(/\n\n/g, '<br/><br/>');
    html = html.replace(/\n/g, '<br/>');
    
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  };

  if (!configChecked) {
    return (
      <div className="setup-container loading">
        <div className="spinner"></div>
        <p>Loading Gmail Intelligence Platform...</p>
      </div>
    );
  }

  // Welcome Screen (If not authenticated)
  if (!userEmail) {
    return (
      <div className="setup-container">
        <div className="setup-card glass" style={{ maxWidth: '600px', textAlign: 'center' }}>
          <header className="setup-header" style={{ marginBottom: '25px' }}>
            <div className="setup-icon-wrapper" style={{ background: 'rgba(99, 102, 241, 0.12)' }}>
              <Mail className="setup-icon pulse-glow" style={{ color: 'var(--color-primary)' }} />
            </div>
            <h1 style={{ fontFamily: 'var(--font-title)', fontSize: '32px', fontWeight: '800' }}>
              Gmail Intelligence Platform
            </h1>
            <p className="subtitle" style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>
              An AI-powered dashboard that categorizes your inbox, generates thread summaries, drafts contextual replies, and lets you query your email knowledge base securely.
            </p>
          </header>

          {errorMsg && (
            <div className="alert-box alert-error glass" style={{ textAlign: 'left' }}>
              <AlertCircle size={16} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
              <span>{errorMsg}</span>
            </div>
          )}

          <div style={{ margin: '30px 0' }}>
            <button
              onClick={handleConnectGmail}
              disabled={oauthLoading}
              className="primary-btn"
              style={{ width: '100%', padding: '14px 20px', fontSize: '16px' }}
            >
              {oauthLoading ? (
                <>
                  <span className="spinner small-spinner"></span> Connecting...
                </>
              ) : (
                <>
                  Connect with Gmail Account <ArrowRight size={18} style={{ marginLeft: '8px' }} />
                </>
              )}
            </button>
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
            <button
              onClick={() => router.push('/setup')}
              className="secondary-btn"
              style={{ fontSize: '13px' }}
            >
              <Settings size={14} style={{ marginRight: '6px' }} /> Configure API Keys / Setup
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard Interface (When authenticated)
  return (
    <div className="dashboard-container">
      
      {/* 1. SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <Sparkles className="brand-icon" size={20} />
          <h2>Gmail Intelligence</h2>
        </div>

        <nav className="sidebar-menu">
          <div className="menu-section-title">Email Views</div>
          
          {[
            { name: 'Inbox', icon: Inbox },
            { name: 'Work / Professional', icon: Mail },
            { name: 'Personal', icon: Mail },
            { name: 'Newsletters', icon: FileText },
            { name: 'Job / Recruitment', icon: Sparkles },
            { name: 'Finance', icon: Mail },
            { name: 'Notifications', icon: Mail },
          ].map(item => {
            const Icon = item.icon;
            const isActive = activeCategory === item.name;
            return (
              <div
                key={item.name}
                onClick={() => handleCategoryChange(item.name)}
                className={`menu-item ${isActive ? 'active' : ''}`}
              >
                <div className="menu-item-left">
                  <Icon size={16} />
                  <span>{item.name}</span>
                </div>
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="oauth-status-container">
            <span style={{ color: 'var(--text-secondary)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '170px' }}>
              {userEmail}
            </span>
            <div className="status-indicator">
              <span className="status-dot connected"></span>
              <span style={{ fontSize: '10px', color: 'var(--color-success)', fontWeight: '600' }}>LIVE</span>
            </div>
          </div>

          <button
            onClick={handleSyncInbox}
            disabled={syncing}
            className="primary-btn sync-btn"
          >
            {syncing ? (
              <>
                <RefreshCw size={14} className="spin-hover" style={{ animation: 'spin 1.5s linear infinite', marginRight: '6px' }} /> Syncing...
              </>
            ) : (
              <>
                <RefreshCw size={14} style={{ marginRight: '6px' }} /> Sync Inbox
              </>
            )}
          </button>

          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button
              onClick={() => router.push('/setup')}
              className="secondary-btn"
              style={{ flexGrow: 1, padding: '8px', fontSize: '12px' }}
              title="Settings"
            >
              <Settings size={14} /> Settings
            </button>
            <button
              onClick={handleLogout}
              className="secondary-btn"
              style={{ padding: '8px', color: 'var(--color-error)' }}
              title="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <div className="main-content">
        
        {/* HEADER BAR */}
        <header className="header">
          <div className="header-left">
            <h1>{activeCategory} Threads</h1>
          </div>
          
          <div className="header-right">
            {syncStatus && (
              <div className="alert-box alert-success glass" style={{ margin: 0, padding: '8px 16px', fontSize: '12px' }}>
                {syncStatus}
              </div>
            )}
            {errorMsg && (
              <div className="alert-box alert-error glass" style={{ margin: 0, padding: '8px 16px', fontSize: '12px' }}>
                {errorMsg}
                <button onClick={() => setErrorMsg(null)} style={{ background: 'none', border: 'none', color: '#fff', marginLeft: '8px', cursor: 'pointer' }}>×</button>
              </div>
            )}
            
            <button
              onClick={() => setChatOpen(!chatOpen)}
              className={`secondary-btn ${chatOpen ? 'active' : ''}`}
              style={{ border: chatOpen ? '1px solid var(--color-primary)' : '' }}
            >
              <MessageSquare size={16} style={{ marginRight: '6px' }} /> AI Assistant
            </button>
          </div>
        </header>

        {/* DASHBOARD GRID */}
        <div className={`dashboard-body ${chatOpen ? 'with-chat' : ''}`}>
          
          {/* COLUMN 1: THREAD LIST */}
          <div className="thread-list-container">
            <div className="search-bar-wrapper">
              <div className="search-input-wrapper">
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search threads..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="search-input"
                />
              </div>
            </div>

            <div className="thread-list">
              {loadingThreads ? (
                <div className="empty-state">
                  <div className="spinner" style={{ marginBottom: '10px' }}></div>
                  <p>Loading database threads...</p>
                </div>
              ) : filteredThreads.length === 0 ? (
                <div className="empty-state">
                  <Mail className="empty-icon" />
                  <h3>No threads found</h3>
                  <p>Try searching or sync your inbox to fetch new emails.</p>
                </div>
              ) : (
                filteredThreads.map(t => {
                  const isActive = selectedThreadId === t.id;
                  const dateFormatted = t.last_updated_at 
                    ? new Date(t.last_updated_at).toLocaleDateString()
                    : '';
                  
                  // Category class translation
                  const getTagClass = (cat: string) => {
                    const normalized = cat?.toLowerCase() || '';
                    if (normalized.includes('newsletter')) return 'tag-newsletters';
                    if (normalized.includes('recruit') || normalized.includes('job')) return 'tag-recruitment';
                    if (normalized.includes('finance')) return 'tag-finance';
                    if (normalized.includes('notification')) return 'tag-notifications';
                    if (normalized.includes('personal')) return 'tag-personal';
                    return 'tag-work';
                  };

                  return (
                    <div
                      key={t.id}
                      onClick={() => loadThreadDetail(t.id)}
                      className={`thread-item glass ${isActive ? 'active' : ''}`}
                    >
                      <div className="thread-item-header">
                        <span className={`category-tag ${getTagClass(t.category)}`}>
                          {t.category || 'Work'}
                        </span>
                        <span className="thread-date">{dateFormatted}</span>
                      </div>
                      <h4 className="thread-subject">{t.subject || '(No Subject)'}</h4>
                      <p className="thread-snippet">{t.summary || 'Click to view conversation summaries...'}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* COLUMN 2: THREAD DETAIL & REPLY COMPOSER */}
          <div className="thread-detail-container">
            {loadingDetail ? (
              <div className="empty-state">
                <div className="spinner" style={{ marginBottom: '10px' }}></div>
                <p>Retrieving full conversation flow and AI summaries...</p>
              </div>
            ) : !selectedThread ? (
              <div className="empty-state">
                <Mail className="empty-icon" />
                <h3>No thread selected</h3>
                <p>Select a thread from the list to view its full email timeline, individual summaries, and draft AI replies.</p>
              </div>
            ) : (
              <>
                <div className="thread-detail-header">
                  <div className="thread-detail-title">
                    <h2>{selectedThread.thread.subject || '(No Subject)'}</h2>
                    <span className="badge configured" style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--color-primary)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                      Thread ID: {selectedThread.thread.id}
                    </span>
                  </div>

                  {selectedThread.thread.summary && (
                    <div className="thread-summary-box glass">
                      <div className="summary-title">
                        <Sparkles size={13} style={{ color: 'var(--color-secondary)' }} /> Thread AI Summary
                      </div>
                      <p className="summary-content">{selectedThread.thread.summary}</p>
                    </div>
                  )}
                </div>

                <div className="thread-emails-list">
                  {selectedThread.emails.map((email) => {
                    const dateStr = new Date(email.date).toLocaleString();
                    const isOutgoing = email.is_sent || email.from_email === userEmail;

                    return (
                      <div
                        key={email.id}
                        className="email-card glass"
                        style={{ borderLeft: isOutgoing ? '3px solid var(--color-primary)' : '1px solid var(--border-color)' }}
                      >
                        <div className="email-card-header">
                          <div className="email-sender-info">
                            <span className="email-from-name">{email.from_name || email.from_email}</span>
                            <span className="email-from-address">
                              From: {email.from_email} &bull; To: {email.to_email}
                            </span>
                          </div>
                          <div className="email-meta-info">
                            <div>{dateStr}</div>
                            {email.is_sent && <span style={{ color: 'var(--color-primary)', fontWeight: '600', fontSize: '10px' }}>OUTGOING</span>}
                          </div>
                        </div>

                        {email.summary && (
                          <div className="email-card-summary">
                            <strong>Summary:</strong> {email.summary}
                          </div>
                        )}

                        <div className="email-card-body">
                          {email.body_text || email.snippet}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* AI Reply / Compose Box */}
                <div className="reply-pane glass">
                  <div className="ai-composer-prompt-row">
                    <input
                      type="text"
                      placeholder="Prompt AI to reply (e.g., 'Say that I am interested and available on Tuesday at 4pm')..."
                      value={replyPrompt}
                      onChange={e => setReplyPrompt(e.target.value)}
                      className="composer-input"
                    />
                    <button
                      onClick={handleGenerateReply}
                      disabled={generatingReply || !replyPrompt}
                      className="primary-btn"
                    >
                      {generatingReply ? (
                        <>
                          <span className="spinner small-spinner"></span> Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles size={14} style={{ marginRight: '6px' }} /> Generate Reply
                        </>
                      )}
                    </button>
                  </div>

                  {replyDraft && (
                    <div className="draft-editor-box">
                      <textarea
                        value={replyDraft}
                        onChange={e => setReplyDraft(e.target.value)}
                        className="draft-textarea"
                      />
                      <div className="composer-actions">
                        <button
                          onClick={() => { setReplyDraft(''); setReplyPrompt(''); }}
                          className="secondary-btn"
                          style={{ color: 'var(--color-error)' }}
                        >
                          Discard
                        </button>
                        <button
                          onClick={handleSendEmail}
                          disabled={sendingEmail}
                          className="primary-btn"
                        >
                          {sendingEmail ? (
                            <>
                              <span className="spinner small-spinner"></span> Sending...
                            </>
                          ) : (
                            <>
                              <Send size={14} style={{ marginRight: '6px' }} /> Send Reply
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* COLUMN 3: CHAT PANEL */}
          {chatOpen && (
            <div className="chat-panel glass">
              <div className="chat-header">
                <MessageSquare size={16} className="brand-icon" />
                <h3>Email AI Agent</h3>
              </div>

              <div className="chat-history">
                {chatMessages.map((m, idx) => (
                  <div key={idx} className={`chat-message ${m.role}`}>
                    {m.role === 'assistant' ? renderMarkdown(m.content) : m.content}
                    
                    {m.role === 'assistant' && m.sources && m.sources.length > 0 && (
                      <div className="chat-sources">
                        <div className="sources-label">Attributed Sources:</div>
                        {m.sources.map((s, sidx) => (
                          <div
                            key={sidx}
                            onClick={() => loadThreadDetail(s.thread_id)}
                            className="source-item"
                            title={`Click to view: ${s.subject}`}
                          >
                            &bull; {s.sender} - "{s.subject}" ({s.date})
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {sendingChat && (
                  <div className="chat-message assistant">
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <span className="spinner small-spinner" style={{ borderTopColor: 'var(--color-secondary)' }}></span> Synthesizing answer...
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="chat-history-shortcuts" style={{ padding: '0 20px', display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                <button 
                  onClick={() => handleChatSubmit(undefined, "List all tech news from newsletters from the past 4 days - deduplicating where the same story appears across multiple sources")}
                  className="secondary-btn"
                  style={{ fontSize: '10px', padding: '4px 8px', background: 'rgba(255,255,255,0.02)' }}
                  disabled={sendingChat}
                >
                  Tech News (4 days)
                </button>
                <button 
                  onClick={() => handleChatSubmit(undefined, "List all emails from Acme Corp this month and summarize them")}
                  className="secondary-btn"
                  style={{ fontSize: '10px', padding: '4px 8px', background: 'rgba(255,255,255,0.02)' }}
                  disabled={sendingChat}
                >
                  Acme Corp Mails
                </button>
                <button 
                  onClick={() => handleChatSubmit(undefined, "List all job application rejections or recruitment interview updates.")}
                  className="secondary-btn"
                  style={{ fontSize: '10px', padding: '4px 8px', background: 'rgba(255,255,255,0.02)' }}
                  disabled={sendingChat}
                >
                  Job Offers/Rejections
                </button>
              </div>

              <form onSubmit={handleChatSubmit} className="chat-input-wrapper">
                <input
                  type="text"
                  placeholder="Ask the agent about your emails..."
                  value={chatQuery}
                  onChange={e => setChatQuery(e.target.value)}
                  className="chat-input"
                  disabled={sendingChat}
                />
                <button
                  type="submit"
                  disabled={sendingChat || !chatQuery}
                  className="primary-btn"
                  style={{ padding: '10px', borderRadius: '8px' }}
                >
                  <Send size={14} />
                </button>
              </form>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
