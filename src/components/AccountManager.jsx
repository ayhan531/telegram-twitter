import React, { useState, useEffect, useRef } from 'react';
import {
  Radio, Plus, Trash2, CheckCircle2, ExternalLink,
  Eye, EyeOff, Loader2, QrCode, AlertCircle, Info, RefreshCw
} from 'lucide-react';

export default function AccountManager({ accounts, setAccounts, onShowToast }) {
  const [activeModal, setActiveModal] = useState(null); // 'telegram' | 'twitter' | null

  // ── Twitter Form State ──
  const [consumerKey,       setConsumerKey]       = useState('');
  const [consumerSecret,    setConsumerSecret]    = useState('');
  const [accessToken,       setAccessToken]       = useState('');
  const [accessTokenSecret, setAccessTokenSecret] = useState('');
  const [twStatus,          setTwStatus]          = useState('idle'); // idle | loading | done | error
  const [twError,           setTwError]           = useState('');
  const [showSecrets,       setShowSecrets]       = useState({ cs: false, ats: false });

  // ── Telegram QR State ──
  const [tgStep,      setTgStep]      = useState('idle'); // idle | loading | qr | done | error
  const [qrDataUrl,   setQrDataUrl]   = useState('');
  const [sessionId,   setSessionId]   = useState('');
  const [tgError,     setTgError]     = useState('');
  const [tgUser,      setTgUser]      = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    return () => clearInterval(pollRef.current);
  }, []);

  // ── Twitter Verification ──
  const handleVerifyTwitter = async () => {
    if (!consumerKey.trim() || !consumerSecret.trim() || !accessToken.trim() || !accessTokenSecret.trim()) {
      setTwError('Lütfen tüm 4 Twitter API anahtarını girin.');
      return;
    }
    setTwStatus('loading');
    setTwError('');

    try {
      const res = await fetch('/api/twitter/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consumerKey: consumerKey.trim(),
          consumerSecret: consumerSecret.trim(),
          accessToken: accessToken.trim(),
          accessTokenSecret: accessTokenSecret.trim(),
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setTwStatus('done');
      const accountName = data.user?.name || data.user?.username || 'Twitter Hesabı';
      const username = `@${data.user?.username || 'twitter'}`;

      const newAccount = {
        id: `acc-tw-${Date.now()}`,
        platform: 'twitter',
        name: accountName,
        username,
        status: 'connected',
        avatarColor: 'bg-neutral-800',
        credentials: {
          consumerKey: consumerKey.trim(),
          consumerSecret: consumerSecret.trim(),
          accessToken: accessToken.trim(),
          accessTokenSecret: accessTokenSecret.trim(),
        },
      };

      setAccounts(prev => [...prev.filter(a => a.platform !== 'twitter'), newAccount]);
      onShowToast(`Twitter hesabı (${username}) başarıyla bağlandı!`, 'success');
      setTimeout(() => setActiveModal(null), 1200);
    } catch (err) {
      setTwStatus('error');
      setTwError(err.message);
    }
  };

  // ── Telegram QR Start & Poll ──
  const startTelegramQR = async () => {
    setTgStep('loading');
    setTgError('');
    try {
      const res = await fetch('/api/telegram/qr/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setSessionId(data.sessionId);
      setQrDataUrl(data.qrDataUrl || '');
      setTgStep('qr');
      startPollingTelegram(data.sessionId);
    } catch (err) {
      setTgStep('error');
      setTgError(err.message);
    }
  };

  const startPollingTelegram = (sid) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/telegram/qr/poll?sessionId=${sid}`);
        const data = await res.json();
        if (data.qrDataUrl) setQrDataUrl(data.qrDataUrl);
        if (data.status === 'authorized') {
          clearInterval(pollRef.current);
          setTgUser(data.user);
          setTgStep('done');

          const accountId = `tg-${data.user?.id || Date.now()}`;
          const accountName = `${data.user?.firstName || ''} ${data.user?.lastName || ''}`.trim() || 'Telegram';
          const username = data.user?.username ? `@${data.user.username}` : data.user?.phone || 'Telegram';

          // Store session on server
          fetch('/api/telegram/session/store', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accountId,
              accountName,
              sessionString: data.sessionString,
            }),
          }).then(() =>
            fetch('/api/telegram/session/start-listener', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ accountId }),
            })
          ).catch(console.error);

          const newAccount = {
            id: accountId,
            platform: 'telegram',
            name: accountName,
            username,
            status: 'connected',
            avatarColor: 'bg-sky-600',
            credentials: {
              sessionString: data.sessionString,
              userId: data.user?.id,
              accountId,
            },
          };

          setAccounts(prev => [...prev.filter(a => a.platform !== 'telegram'), newAccount]);
          onShowToast(`Telegram hesabı (${accountName}) bağlandı!`, 'success');
          setTimeout(() => setActiveModal(null), 1200);
        } else if (data.status === 'error') {
          clearInterval(pollRef.current);
          setTgStep('error');
          setTgError(data.error || 'Bağlantı hatası.');
        }
      } catch (_) {}
    }, 2000);
  };

  const removeAccount = (id) => {
    setAccounts(prev => prev.filter(a => a.id !== id));
    onShowToast('Hesap kaldırıldı.', 'info');
  };

  const telegramAccounts = accounts.filter(a => a.platform === 'telegram');
  const twitterAccounts  = accounts.filter(a => a.platform === 'twitter');

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="p-6 rounded-2xl glass-panel border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Radio className="text-sky-400" size={22} />
            <span>Hesap Bağlantıları</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Telegram kanalından gelen mesajları otomatik tweet atmak için Telegram ve Twitter hesaplarını bağla.
          </p>
        </div>
      </div>

      {/* Main Connection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* 1. TELEGRAM CARD */}
        <div className="p-6 rounded-2xl glass-panel border border-sky-500/30 bg-sky-950/10 flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-xl bg-sky-500 text-white font-bold flex items-center justify-center text-2xl shadow-lg">✈️</div>
                <div>
                  <h3 className="font-bold text-base text-white">Telegram Hesabı</h3>
                  <p className="text-xs text-slate-400">Kanalları dinlemek için bağla</p>
                </div>
              </div>
              {telegramAccounts.length > 0 ? (
                <span className="px-3 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center space-x-1">
                  <CheckCircle2 size={13} /><span>Bağlı ({telegramAccounts.length})</span>
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-xs font-semibold">
                  Bağlı Değil
                </span>
              )}
            </div>

            {telegramAccounts.length > 0 ? (
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                {telegramAccounts.map(acc => (
                  <div key={acc.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-white">{acc.name}</p>
                      <p className="text-[11px] text-sky-400">{acc.username}</p>
                    </div>
                    <button onClick={() => removeAccount(acc.id)} className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-950/40 border border-rose-500/20">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 leading-relaxed">
                Telegram hesabını bağlayarak yönettiğin tüm kanalları, sohbet gruplarını ve özel mesajları anında yakalayabilirsin.
              </p>
            )}
          </div>

          <button onClick={() => { setActiveModal('telegram'); startTelegramQR(); }}
            className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-md transition flex items-center justify-center space-x-2">
            <QrCode size={16} />
            <span>{telegramAccounts.length > 0 ? 'Telegram Hesabını Yeniden Bağla (QR)' : '✈️ Telegram Bağla (1-Tık QR)'}</span>
          </button>
        </div>

        {/* 2. TWITTER CARD */}
        <div className="p-6 rounded-2xl glass-panel border border-neutral-700 bg-neutral-900/40 flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-xl bg-neutral-800 text-white font-black flex items-center justify-center text-2xl border border-neutral-700 shadow-lg">𝕏</div>
                <div>
                  <h3 className="font-bold text-base text-white">Twitter / X Hesabı</h3>
                  <p className="text-xs text-slate-400">Tweet göndermek için bağla</p>
                </div>
              </div>
              {twitterAccounts.length > 0 ? (
                <span className="px-3 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center space-x-1">
                  <CheckCircle2 size={13} /><span>Bağlı ({twitterAccounts.length})</span>
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-xs font-semibold">
                  Bağlı Değil
                </span>
              )}
            </div>

            {twitterAccounts.length > 0 ? (
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                {twitterAccounts.map(acc => (
                  <div key={acc.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-white">{acc.name}</p>
                      <p className="text-[11px] text-sky-400">{acc.username}</p>
                    </div>
                    <button onClick={() => removeAccount(acc.id)} className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-950/40 border border-rose-500/20">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 leading-relaxed">
                Twitter API anahtarlarını girerek kesintisiz ve %100 resmi otomatik tweet akışını başlat.
              </p>
            )}
          </div>

          <button onClick={() => setActiveModal('twitter')}
            className="w-full py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-white font-bold text-xs shadow-md transition flex items-center justify-center space-x-2">
            <span className="font-black text-sm">𝕏</span>
            <span>{twitterAccounts.length > 0 ? 'Twitter Anahtarlarını Güncelle' : '𝕏 Twitter Hesabı Bağla'}</span>
          </button>
        </div>

      </div>

      {/* TELEGRAM MODAL */}
      {activeModal === 'telegram' && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center space-x-2">
                <span>✈️ Telegram Bağlantısı (QR Code)</span>
              </h3>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white text-sm font-bold">✕</button>
            </div>

            {tgStep === 'loading' && (
              <div className="py-12 flex flex-col items-center space-y-3">
                <Loader2 size={36} className="animate-spin text-sky-400" />
                <p className="text-xs text-slate-300 font-semibold">QR Kodu Oluşturuluyor...</p>
              </div>
            )}

            {tgStep === 'qr' && (
              <div className="flex flex-col items-center space-y-4">
                {qrDataUrl ? (
                  <div className="p-4 bg-white rounded-2xl shadow-xl">
                    <img src={qrDataUrl} alt="Telegram QR" className="w-56 h-56" />
                  </div>
                ) : (
                  <div className="w-64 h-64 rounded-2xl bg-slate-800 flex items-center justify-center">
                    <Loader2 size={32} className="animate-spin text-sky-400" />
                  </div>
                )}
                <div className="text-center space-y-1">
                  <p className="text-sm font-bold text-white">Telegram Mobil ile Tara</p>
                  <p className="text-xs text-slate-400">Ayarlar → Cihazlar → Cihaz Bağla</p>
                </div>
                <div className="flex items-center space-x-2 text-xs text-amber-400 animate-pulse">
                  <Loader2 size={13} className="animate-spin" /><span>Taranması bekleniyor...</span>
                </div>
              </div>
            )}

            {tgStep === 'done' && (
              <div className="flex flex-col items-center space-y-3 py-6">
                <div className="w-14 h-14 rounded-full bg-emerald-600 flex items-center justify-center text-2xl shadow-lg text-white">✓</div>
                <p className="font-bold text-white text-base">{tgUser?.firstName} {tgUser?.lastName}</p>
                <div className="flex items-center space-x-1 text-emerald-400 font-bold text-xs">
                  <CheckCircle2 size={14} /><span>Telegram Başarıyla Bağlandı!</span>
                </div>
              </div>
            )}

            {tgStep === 'error' && (
              <div className="space-y-4 py-2">
                <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300 space-y-1">
                  <p className="font-bold flex items-center space-x-1"><AlertCircle size={14} /><span>Hata Oluştu</span></p>
                  <p>{tgError}</p>
                </div>
                <button onClick={() => startTelegramQR()} className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 flex items-center justify-center space-x-2">
                  <RefreshCw size={14} /><span>Tekrar Dene</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TWITTER MODAL */}
      {activeModal === 'twitter' && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 my-8 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center space-x-2">
                <span className="text-lg">𝕏</span>
                <span>Twitter / X API Anahtarları</span>
              </h3>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white text-sm font-bold">✕</button>
            </div>

            {/* Helper Instructions */}
            <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-slate-300 space-y-1.5 leading-relaxed">
              <p className="font-bold text-white flex items-center space-x-1">
                <Info size={14} className="text-sky-400" />
                <span>Anahtarları nereden alacaksın?</span>
              </p>
              <p>1. <a href="https://developer.twitter.com/en/portal/dashboard" target="_blank" rel="noopener noreferrer" className="text-sky-400 underline font-semibold">developer.twitter.com</a> adresine git.</p>
              <p>2. Uygulamanı seç → <strong>Keys and tokens</strong> sekmesine gir.</p>
              <p>3. <strong>Consumer Keys</strong> → API Key & API Secret kopyala.</p>
              <p>4. <strong>Authentication Tokens</strong> → Access Token & Access Token Secret kopyala (yoksa <i>Generate</i> bas).</p>
            </div>

            {/* Inputs */}
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">API Key (Consumer Key)</label>
                <input type="text" value={consumerKey} onChange={e => setConsumerKey(e.target.value)} placeholder="API Key"
                  className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs font-mono" />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">API Key Secret (Consumer Secret)</label>
                <div className="relative">
                  <input type={showSecrets.cs ? 'text' : 'password'} value={consumerSecret} onChange={e => setConsumerSecret(e.target.value)} placeholder="API Key Secret"
                    className="w-full px-3 py-2 pr-9 rounded-xl glass-input text-white text-xs font-mono" />
                  <button type="button" onClick={() => setShowSecrets(p => ({ ...p, cs: !p.cs }))} className="absolute right-3 top-2.5 text-slate-400 hover:text-white">
                    {showSecrets.cs ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Access Token</label>
                <input type="text" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="Access Token"
                  className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs font-mono" />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Access Token Secret</label>
                <div className="relative">
                  <input type={showSecrets.ats ? 'text' : 'password'} value={accessTokenSecret} onChange={e => setAccessTokenSecret(e.target.value)} placeholder="Access Token Secret"
                    className="w-full px-3 py-2 pr-9 rounded-xl glass-input text-white text-xs font-mono" />
                  <button type="button" onClick={() => setShowSecrets(p => ({ ...p, ats: !p.ats }))} className="absolute right-3 top-2.5 text-slate-400 hover:text-white">
                    {showSecrets.ats ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>

            {twError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300 leading-relaxed">
                ❌ {twError}
              </div>
            )}

            <div className="flex space-x-3 pt-2">
              <button onClick={() => setActiveModal(null)} className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700">
                İptal
              </button>
              <button onClick={handleVerifyTwitter} disabled={twStatus === 'loading'}
                className="flex-1 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-white font-bold text-xs flex items-center justify-center space-x-2 transition shadow-md">
                {twStatus === 'loading' ? <Loader2 size={15} className="animate-spin text-sky-400" /> : <span className="font-black text-sm">𝕏</span>}
                <span>{twStatus === 'loading' ? 'Doğrulanıyor...' : '🔌 Bağlantıyı Test Et & Kaydet'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
