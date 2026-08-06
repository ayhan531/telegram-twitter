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

  // Hesaplar ve kurallar sunucuda yaşıyor: hangi tarayıcıdan, hangi cihazdan
  // ya da hangi Google hesabından girersen gir aynı listeyi görürsün.
  // localStorage yalnızca eski kayıtları bir kez taşımak için okunuyor.
  const [accounts, setAccounts] = useState(INITIAL_ACCOUNTS);
  const [rules, setRules]       = useState(INITIAL_SYNC_RULES);
  const [loaded, setLoaded]     = useState(false);

  // Toast notification state
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' });

  useEffect(() => {
    (async () => {
      try {
        // Tarayıcıda kalmış eski hesaplar varsa önce sunucuya taşı.
        const legacy = getStoredData('accounts', []);
        if (Array.isArray(legacy) && legacy.length) {
          const r = await fetch('/api/accounts/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accounts: legacy }),
          }).then(x => x.json());
          if (r.success) {
            saveStoredData('accounts', []); // taşındı, bir daha gönderme
            if (r.added) showToast(`${r.added} hesap sunucuya taşındı.`, 'success');
          }
        }

        const [accRes, ruleRes, cfg] = await Promise.all([
          fetch('/api/accounts').then(r => r.json()).catch(() => ({})),
          fetch('/api/sync/rules').then(r => r.json()).catch(() => ({})),
          fetch('/api/config').then(r => r.json()).catch(() => ({})),
        ]);

        let list = accRes.accounts || [];
        // Ortam değişkeniyle tanımlı Twitter hesabı varsa listeye kat.
        if (cfg.autoTwitterAccount && !list.some(a => a.username === cfg.autoTwitterAccount.username)) {
          list = [...list, cfg.autoTwitterAccount];
        }
        setAccounts(list);
        setRules(ruleRes.rules || []);
      } catch (e) {
        showToast('Sunucudan veriler yüklenemedi: ' + e.message, 'error');
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Kurallar sunucuya SyncRules içinden zaten yazılıyor; burada yalnızca
  // yerel bir yedek tutuyoruz ki çevrimdışıyken de bir şey görünsün.
  useEffect(() => { if (loaded) saveStoredData('rules', rules); }, [rules, loaded]);

  // Hesap ekleme/çıkarma sunucu üzerinden yürüyor; sunucunun döndürdüğü liste
  // tek doğru kaynak olduğu için yereldeki durumu onunla değiştiriyoruz.
  const upsertAccount = async (acc) => {
    try {
      const r = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(acc),
      }).then(x => x.json());
      if (!r.success) throw new Error(r.error);
      setAccounts(r.accounts);
    } catch (e) {
      showToast('Hesap kaydedilemedi: ' + e.message, 'error');
    }
  };

  const removeAccountById = async (id) => {
    try {
      const r = await fetch(`/api/accounts/${id}`, { method: 'DELETE' }).then(x => x.json());
      if (!r.success) throw new Error(r.error);
      setAccounts(r.accounts);
    } catch (e) {
      showToast('Hesap kaldırılamadı: ' + e.message, 'error');
    }
  };

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
              upsertAccount={upsertAccount}
              removeAccountById={removeAccountById}
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
