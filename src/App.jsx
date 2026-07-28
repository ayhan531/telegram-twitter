import React, { useState, useEffect } from 'react';
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

  const showToast = (message, type = 'info') => {
    setToast({ visible: true, message, type });
    setTimeout(() => {
      setToast({ visible: false, message: '', type: 'info' });
    }, 3500);
  };

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
