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
import { installFetchInterceptor, setUnauthorizedHandler, setPassword } from './api';

installFetchInterceptor();

function LoginGate({ onSuccess }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!pw.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      // Parolayı önce kaydediyoruz ki araya giren katman başlığa ekleyebilsin.
      setPassword(pw);
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      }).then(x => x.json());
      if (!r.success) throw new Error(r.error || 'Parola hatalı.');
      onSuccess();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4 shadow-2xl">
        <div className="text-center space-y-1">
          <div className="text-4xl">🔐</div>
          <h1 className="text-lg font-bold text-white">OmniSync</h1>
          <p className="text-xs text-slate-400">Devam etmek için uygulama parolanı gir.</p>
        </div>
        <input
          type="password"
          autoFocus
          value={pw}
          onChange={e => setPw(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          placeholder="••••••••"
          className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm focus:border-sky-500 outline-none"
        />
        {error && (
          <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300">{error}</div>
        )}
        <button onClick={submit} disabled={busy || !pw.trim()}
          className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-xs">
          {busy ? 'Kontrol ediliyor...' : 'Giriş Yap'}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('accounts');

  // Hesaplar ve kurallar sunucuda yaşıyor: hangi tarayıcıdan, hangi cihazdan
  // ya da hangi Google hesabından girersen gir aynı listeyi görürsün.
  // localStorage yalnızca eski kayıtları bir kez taşımak için okunuyor.
  const [accounts, setAccounts] = useState(INITIAL_ACCOUNTS);
  const [rules, setRules]       = useState(INITIAL_SYNC_RULES);
  const [loaded, setLoaded]     = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [unprotected, setUnprotected] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Toast notification state
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' });

  useEffect(() => { setUnauthorizedHandler(() => setNeedsLogin(true)); }, []);

  useEffect(() => {
    (async () => {
      try {
        // Sunucu korumalıysa ve elimizde geçerli parola yoksa önce giriş iste.
        const auth = await fetch('/api/auth/status').then(r => r.json()).catch(() => ({}));
        setUnprotected(auth.protected === false);
        if (auth.protected) {
          const probe = await fetch('/api/accounts');
          if (probe.status === 401) { setNeedsLogin(true); setLoaded(true); return; }
        }

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
  }, [reloadKey]);

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

  if (needsLogin) {
    return <LoginGate onSuccess={() => { setNeedsLogin(false); setReloadKey(k => k + 1); }} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans antialiased">

      {/* Sunucu korumasızsa bunu görmezden gelinemeyecek şekilde söyle:
          burada canlı X çerezleri ve Telegram oturumları duruyor. */}
      {unprotected && (
        <div className="bg-amber-950/80 border-b border-amber-500/40 px-4 py-2 text-[11px] text-amber-200 text-center">
          ⚠️ Bu uygulama parolasız açık. Adresi bilen herkes bağlı hesaplarını yönetebilir ve
          onlar adına paylaşım yapabilir. Render → Environment → <code className="font-mono">APP_PASSWORD</code> ekleyip
          servisi yeniden dağıt.
        </div>
      )}

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
