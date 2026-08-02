import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import AccountManager from './components/AccountManager';
import SyncRules from './components/SyncRules';
import ActivityLogs from './components/ActivityLogs';

import { 
  INITIAL_ACCOUNTS, 
  INITIAL_SYNC_RULES, 
  getStoredData,
  saveStoredData
} from './data/mockData';

export default function App() {
  const [activeTab, setActiveTab] = useState('accounts');

  // Persistent States
  const [accounts, setAccounts] = useState(() => getStoredData('accounts', INITIAL_ACCOUNTS));
  const [rules, setRules]       = useState(() => getStoredData('rules', INITIAL_SYNC_RULES));

  // Toast notification state
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' });

  // Sync to local storage
  useEffect(() => { saveStoredData('accounts', accounts); }, [accounts]);
  useEffect(() => { saveStoredData('rules', rules); }, [rules]);

  // Auto-load Twitter account if Environment Variables exist on server
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

  const showToast = (message, type = 'info') => {
    setToast({ visible: true, message, type });
    setTimeout(() => {
      setToast({ visible: false, message: '', type: 'info' });
    }, 3500);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans antialiased">
      
      {/* Toast Popup Notification */}
      {toast.visible && (
        <div className={`
          fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-lg border text-xs sm:text-sm font-bold flex items-center space-x-2 transition-all animate-bounce
          ${toast.type === 'success' ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-200' : ''}
          ${toast.type === 'error' ? 'bg-rose-950/95 border-rose-500/50 text-rose-200' : ''}
          ${toast.type === 'info' ? 'bg-indigo-950/95 border-indigo-500/50 text-indigo-200' : ''}
        `}>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Navbar */}
      <Navbar 
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        accountCount={accounts.length}
        activeRulesCount={rules.filter(r => r.enabled !== false).length}
      />

      {/* Main Container Layout */}
      <div className="flex-1 flex max-w-[1500px] w-full mx-auto">
        
        {/* Navigation Sidebar */}
        <Sidebar 
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />

        {/* Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0 overflow-y-auto">
          {activeTab === 'accounts' && (
            <AccountManager 
              accounts={accounts}
              setAccounts={setAccounts}
              onShowToast={showToast}
            />
          )}

          {activeTab === 'rules' && (
            <SyncRules 
              accounts={accounts}
              rules={rules}
              setRules={setRules}
              onShowToast={showToast}
            />
          )}

          {activeTab === 'logs' && (
            <ActivityLogs />
          )}
        </main>
      </div>

    </div>
  );
}
