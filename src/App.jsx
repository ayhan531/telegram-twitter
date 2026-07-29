import React, { useState, useEffect, useRef } from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import SyncRules from './components/SyncRules';
import PostComposer from './components/PostComposer';
import Scheduler from './components/Scheduler';
import HashtagManager from './components/HashtagManager';
import AccountManager from './components/AccountManager';
import WebhookTester from './components/WebhookTester';
import ActivityLogs from './components/ActivityLogs';

import { 
  INITIAL_ACCOUNTS, 
  INITIAL_SYNC_RULES, 
  INITIAL_SCHEDULED_POSTS, 
  INITIAL_HASHTAG_PRESETS, 
  INITIAL_LOGS,
  getStoredData,
  saveStoredData
} from './data/mockData';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Persistent States
  const [accounts, setAccounts] = useState(() => getStoredData('accounts', INITIAL_ACCOUNTS));
  const [rules, setRules] = useState(() => getStoredData('rules', INITIAL_SYNC_RULES));
  const [scheduledPosts, setScheduledPosts] = useState(() => getStoredData('scheduled_posts', INITIAL_SCHEDULED_POSTS));
  const [hashtagPresets, setHashtagPresets] = useState(() => getStoredData('hashtags', INITIAL_HASHTAG_PRESETS));
  const [logs, setLogs] = useState(() => getStoredData('logs', INITIAL_LOGS));

  // Toast notification state
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' });

  // Sync to local storage
  useEffect(() => { saveStoredData('accounts', accounts); }, [accounts]);
  useEffect(() => { saveStoredData('rules', rules); }, [rules]);
  useEffect(() => { saveStoredData('scheduled_posts', scheduledPosts); }, [scheduledPosts]);
  useEffect(() => { saveStoredData('hashtags', hashtagPresets); }, [hashtagPresets]);
  useEffect(() => { saveStoredData('logs', logs); }, [logs]);

  // Auto-connect Twitter if Environment Variables are set on Render
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(d => {
        if (d.autoTwitterAccount) {
          setAccounts(prev => {
            if (prev.some(a => a.id === d.autoTwitterAccount.id || a.username === d.autoTwitterAccount.username)) {
              return prev;
            }
            return [...prev, d.autoTwitterAccount];
          });
        }
      })
      .catch(() => {});
  }, []);

  // ─── n8n-style auto-automation: the moment a Telegram account AND at least
  // one target account (Twitter, WhatsApp, Discord...) are both connected,
  // automatically create/update a "connect everything" sync rule so the user
  // never has to configure anything by hand — just log in and it runs.
  const autoRuleSignature = useRef('');
  useEffect(() => {
    const telegramAccounts = accounts.filter(a => a.platform === 'telegram');
    const targetAccounts = accounts.filter(a => a.platform !== 'telegram');
    if (telegramAccounts.length === 0 || targetAccounts.length === 0) return;

    const signature = JSON.stringify({
      tg: telegramAccounts.map(a => a.id),
      targets: targetAccounts.map(a => a.id),
    });
    if (signature === autoRuleSignature.current) return;
    autoRuleSignature.current = signature;

    telegramAccounts.forEach(tgAcc => {
      const sourceAccountId = tgAcc.credentials?.accountId || tgAcc.id;
      const autoRuleId = `auto-${sourceAccountId}`;
      const existing = rules.find(r => r.id === autoRuleId);

      const rule = {
        id: autoRuleId,
        title: `Otomatik: ${tgAcc.name} → Bağlı Hesaplar`,
        sourceAccountId,
        sourceChannelId: existing?.sourceChannelId || '',
        allowedSenders: existing?.allowedSenders || '',
        targetIds: targetAccounts.map(a => a.id),
        targetAccounts,
        autoHashtags: existing?.autoHashtags || '',
        bannedKeywords: existing?.bannedKeywords || '',
        forwardMedia: existing?.forwardMedia ?? false,
        enabled: existing?.enabled ?? true,
      };

      fetch('/api/sync/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      }).catch(() => {});

      setRules(prev => {
        const idx = prev.findIndex(r => r.id === autoRuleId);
        if (idx >= 0) { const n = [...prev]; n[idx] = rule; return n; }
        return [...prev, rule];
      });

      if (!existing) {
        showToast('⚡ Otomasyon kuruldu! Artık Telegram mesajların otomatik paylaşılacak.', 'success');
      }
    });
  }, [accounts]);

  const showToast = (message, type = 'info') => {
    setToast({ visible: true, message, type });
    setTimeout(() => {
      setToast({ visible: false, message: '', type: 'info' });
    }, 3500);
  };

  // ─── Poll the server's sync audit trail so failed/filtered auto-posts
  // (Telegram message came in but the tweet didn't go out) are actually
  // visible somewhere, instead of only ever showing up in server console logs.
  const seenSyncLogIds = useRef(new Set(logs.filter(l => l.id?.startsWith('synclog-')).map(l => l.id)));
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch('/api/sync/logs');
        const d = await r.json();
        if (cancelled || !d.success || !d.logs?.length) return;

        const fresh = d.logs.filter(l => !seenSyncLogIds.current.has(l.id));
        if (!fresh.length) return;
        fresh.forEach(l => seenSyncLogIds.current.add(l.id));

        setLogs(prev => [...fresh, ...prev].slice(0, 300));

        // Surface only the newest failure/filter as a toast to avoid spamming
        const problem = fresh.find(l => l.status === 'error' || l.status === 'filtered');
        if (problem) {
          showToast(
            problem.status === 'error'
              ? `❌ Otomatik gönderim başarısız: ${problem.details || problem.source}`
              : `⚠️ Mesaj filtrelendi, paylaşılmadı: ${problem.details || ''}`,
            'error'
          );
        }
      } catch (_) { /* server may be waking up on free tier, ignore */ }
    };
    poll();
    const interval = setInterval(poll, 8000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const handleOpenQuickCompose = () => {
    setActiveTab('composer');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans antialiased">
      
      {/* Toast Popup Notification */}
      {toast.visible && (
        <div className={`
          fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-lg border text-xs sm:text-sm font-semibold flex items-center space-x-2 transition-all animate-bounce
          ${toast.type === 'success' ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200' : ''}
          ${toast.type === 'error' ? 'bg-rose-950/90 border-rose-500/50 text-rose-200' : ''}
          ${toast.type === 'info' ? 'bg-indigo-950/90 border-indigo-500/50 text-indigo-200' : ''}
        `}>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Navbar */}
      <Navbar 
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        onOpenQuickCompose={handleOpenQuickCompose}
        accountCount={accounts.length}
        activeRulesCount={rules.filter(r => r.active).length}
      />

      {/* Main Container Layout */}
      <div className="flex-1 flex max-w-[1600px] w-full mx-auto">
        
        {/* Navigation Sidebar */}
        <Sidebar 
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          mobileMenuOpen={mobileMenuOpen}
          setMobileMenuOpen={setMobileMenuOpen}
        />

        {/* Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0 overflow-y-auto">
          {activeTab === 'dashboard' && (
            <Dashboard 
              accounts={accounts}
              rules={rules}
              setRules={setRules}
              scheduledPosts={scheduledPosts}
              logs={logs}
              setActiveTab={setActiveTab}
              onOpenQuickCompose={handleOpenQuickCompose}
            />
          )}

          {activeTab === 'sync-rules' && (
            <SyncRules 
              accounts={accounts}
              rules={rules}
              setRules={setRules}
              onShowToast={showToast}
            />
          )}

          {activeTab === 'composer' && (
            <PostComposer 
              accounts={accounts}
              rules={rules}
              scheduledPosts={scheduledPosts}
              setScheduledPosts={setScheduledPosts}
              logs={logs}
              setLogs={setLogs}
              hashtagPresets={hashtagPresets}
              onShowToast={showToast}
            />
          )}

          {activeTab === 'scheduler' && (
            <Scheduler 
              accounts={accounts}
              scheduledPosts={scheduledPosts}
              setScheduledPosts={setScheduledPosts}
              logs={logs}
              setLogs={setLogs}
              onOpenQuickCompose={handleOpenQuickCompose}
              onShowToast={showToast}
            />
          )}

          {activeTab === 'hashtags' && (
            <HashtagManager 
              hashtagPresets={hashtagPresets}
              setHashtagPresets={setHashtagPresets}
              onShowToast={showToast}
            />
          )}

          {activeTab === 'accounts' && (
            <AccountManager 
              accounts={accounts}
              setAccounts={setAccounts}
              onShowToast={showToast}
            />
          )}

          {activeTab === 'webhook-tester' && (
            <WebhookTester 
              accounts={accounts}
              rules={rules}
              logs={logs}
              setLogs={setLogs}
              onShowToast={showToast}
            />
          )}

          {activeTab === 'logs' && (
            <ActivityLogs 
              logs={logs}
              setLogs={setLogs}
              onShowToast={showToast}
            />
          )}
        </main>

      </div>

    </div>
  );
}
