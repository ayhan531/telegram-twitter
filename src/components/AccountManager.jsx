import React, { useState, useEffect, useRef } from 'react';
import {
  Radio, Plus, Trash2, CheckCircle2, ExternalLink,
  Eye, EyeOff, Loader2, QrCode, AlertCircle, Info, RefreshCw, Key, ShieldCheck
} from 'lucide-react';

export default function AccountManager({ accounts, setAccounts, onShowToast }) {
  const [activeModal, setActiveModal] = useState(null); // 'telegram' | 'twitter' | null
  const [twTab, setTwTab] = useState('auto_login'); // 'auto_login' (Default & Easy) | 'auth_token' | 'api_keys'

  // ── Twitter Auto Login State ──
  const [twUsername, setTwUsername] = useState('');
  const [twPassword, setTwPassword] = useState('');
  const [twEmail,    setTwEmail]    = useState('');

  // ── Twitter Token / API Keys State ──
  const [authToken,         setAuthToken]         = useState('');
  const [ctToken,           setCtToken]           = useState('');
  const [twidToken,         setTwidToken]         = useState('');
  const [cookieJson,        setCookieJson]        = useState('');
  const [consumerKey,       setConsumerKey]       = useState('');
  const [consumerSecret,    setConsumerSecret]    = useState('');
  const [accessToken,       setAccessToken]       = useState('');
  const [accessTokenSecret, setAccessTokenSecret] = useState('');
  const [twStatus,          setTwStatus]          = useState('idle'); // idle | loading | done | error
  const [twError,           setTwError]           = useState('');
  const [showSecrets,       setShowSecrets]       = useState({ cs: false, ats: false, pass: false });

  // ── Telegram QR State ──
  const [tgStep,      setTgStep]      = useState('idle');
  const [qrDataUrl,   setQrDataUrl]   = useState('');
  const [sessionId,   setSessionId]   = useState('');
  const [tgError,     setTgError]     = useState('');
  const [tgUser,      setTgUser]      = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    return () => clearInterval(pollRef.current);
  }, []);

  const handleVerifyTwitter = async () => {
    setTwStatus('loading');
    setTwError('');

    try {
      if (twTab === 'auto_login') {
        if (!twUsername.trim() || !twPassword.trim()) {
          throw new Error('Lütfen Twitter kullanıcı adınızı ve şifrenizi girin.');
        }

        const res = await fetch('/api/twitter/free-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: twUsername.trim(),
            password: twPassword.trim(),
            email: twEmail.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        const username = `@${data.user?.username || twUsername.replace(/^@/, '')}`;
        const newAccount = {
          id: `acc-tw-${Date.now()}`,
          platform: 'twitter',
          name: data.user?.name || username,
          username,
          status: 'connected',
          avatarColor: 'bg-neutral-800',
          credentials: {
            cookies: data.cookies,
            username: twUsername.trim(),
          },
        };

        setAccounts(prev => [...prev.filter(a => a.username !== username), newAccount]);
        onShowToast(`Twitter hesabı (${username}) otomatik giriş ile bağlandı! 🎉`, 'success');
        setTimeout(() => setActiveModal(null), 1200);

      } else if (twTab === 'auth_token' || twTab === 'cookie_json') {
        const cookiesArray = [];
        if (authToken.trim()) cookiesArray.push(`auth_token=${authToken.trim()}`);
        if (ctToken.trim()) cookiesArray.push(`ct0=${ctToken.trim()}`);
        if (twidToken.trim()) cookiesArray.push(`twid=${twidToken.trim()}`);

        const payload = twTab === 'cookie_json'
          ? { cookieJson: cookieJson.trim() }
          : { cookies: cookiesArray, authToken: authToken.trim(), ct0: ctToken.trim(), twid: twidToken.trim() };

        if (twTab === 'auth_token' && !authToken.trim()) {
          throw new Error('Lütfen x.com hesabınızdan aldığınız auth_token değerini girin.');
        }
        if (twTab === 'auth_token' && !ctToken.trim()) {
          throw new Error('Lütfen ct0 değerini de girin. X, ct0 olmadan gönderimi reddediyor.');
        }
        if (twTab === 'cookie_json' && !cookieJson.trim()) {
          throw new Error('Lütfen Cookie-Editor eklentisinden kopyaladığınız JSON çerez metnini yapıştırın.');
        }

        const res = await fetch('/api/twitter/cookie-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        const username = `@${data.user?.username || 'twitter'}`;
        const newAccount = {
          id: `acc-tw-${Date.now()}`,
          platform: 'twitter',
          name: data.user?.name || data.user?.username || 'Twitter Hesabı',
          username,
          status: 'connected',
          avatarColor: 'bg-neutral-800',
          credentials: {
            cookies: data.cookies || cookiesArray,
            authToken: authToken.trim() || null,
          },
        };

        setAccounts(prev => [...prev.filter(a => a.username !== username), newAccount]);
        onShowToast(`Twitter hesabı (${username}) bağlandı! 🎉`, 'success');
        setTimeout(() => setActiveModal(null), 1200);

      } else {
        // API Keys mode
        if (!consumerKey.trim() || !consumerSecret.trim() || !accessToken.trim() || !accessTokenSecret.trim()) {
          throw new Error('Lütfen tüm 4 Twitter API anahtarını doldurun.');
        }

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

        const username = `@${data.user?.username || 'twitter'}`;
        const newAccount = {
          id: `acc-tw-${Date.now()}`,
          platform: 'twitter',
          name: data.user?.name || data.user?.username || 'Twitter Hesabı',
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

        setAccounts(prev => [...prev.filter(a => a.username !== username), newAccount]);
        onShowToast(`Twitter hesabı (${username}) bağlandı!`, 'success');
        setTimeout(() => setActiveModal(null), 1200);
      }
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
            Telegram kanallarından gelen mesajları ücretsiz ve sınırsız otomatik tweet atmak için hesaplarını bağla.
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
                Telegram hesabını bağlayarak yönettiğin veya üye olduğun kanalları, sohbet gruplarını anında dinlemeye başla.
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
                  <p className="text-xs text-slate-400">Ücretsiz & Sınırsız Tweet</p>
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
                      <div className="flex items-center space-x-1.5">
                        <p className="text-xs font-bold text-white">{acc.name}</p>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-300 border border-emerald-500/30 font-bold">
                          {acc.credentials?.authToken ? 'XActions Sınırsız' : 'API Key'}
                        </span>
                      </div>
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
                Developer portal şifreleriyle uğraşmadan, <strong>XActions yöntemi (auth_token)</strong> ile %100 ücretsiz ve kota sınırı olmadan hesabını bağla!
              </p>
            )}
          </div>

          <button onClick={() => setActiveModal('twitter')}
            className="w-full py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-white font-bold text-xs shadow-md transition flex items-center justify-center space-x-2">
            <span className="font-black text-sm">𝕏</span>
            <span>{twitterAccounts.length > 0 ? 'Twitter Hesabını Değiştir / Yenile' : '𝕏 Twitter Bağla (Sınırsız & Ücretsiz)'}</span>
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
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 my-8 space-y-5 max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center space-x-2">
                <span className="text-lg">𝕏</span>
                <span>Twitter Hesabı Bağla</span>
              </h3>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white text-sm font-bold">✕</button>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-4 gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800 text-[10px]">
              <button
                onClick={() => setTwTab('auto_login')}
                className={`py-2 rounded-lg font-bold transition flex items-center justify-center space-x-1 ${
                  twTab === 'auto_login'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}>
                <span>🚀 Otomatik Giriş</span>
              </button>
              <button
                onClick={() => setTwTab('auth_token')}
                className={`py-2 rounded-lg font-bold transition flex items-center justify-center space-x-1 ${
                  twTab === 'auth_token'
                    ? 'bg-sky-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}>
                <ShieldCheck size={12} />
                <span>auth_token</span>
              </button>
              <button
                onClick={() => setTwTab('cookie_json')}
                className={`py-2 rounded-lg font-bold transition flex items-center justify-center space-x-1 ${
                  twTab === 'cookie_json'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}>
                <span>x-use JSON</span>
              </button>
              <button
                onClick={() => setTwTab('api_keys')}
                className={`py-2 rounded-lg font-bold transition flex items-center justify-center space-x-1 ${
                  twTab === 'api_keys'
                    ? 'bg-slate-800 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}>
                <Key size={12} />
                <span>API Keys</span>
              </button>
            </div>

            {/* MODE 1: Direct Auto Login (Username + Password) */}
            {twTab === 'auto_login' && (
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/40 text-xs text-red-200 space-y-1.5 leading-relaxed">
                  <p className="font-bold text-red-300 flex items-center space-x-1 text-sm">
                    <span>⛔ Bu Yöntem Artık Çalışmıyor</span>
                  </p>
                  <p>
                    X, sunucu üzerinden kullanıcı adı/şifre ile girişte kullanılan akışı kapattı.
                    Bu sekme hangi bilgiyi girerseniz girin başarısız olur.
                  </p>
                  <button type="button" onClick={() => setTwTab('auth_token')} className="mt-1 text-sky-400 font-bold underline block">
                    ➜ Çerez Yöntemine Geç (Ücretsiz, Sınırsız, Kalıcı)
                  </button>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Twitter Kullanıcı Adı (veya E-posta / Telefon)</label>
                  <input type="text" value={twUsername} onChange={e => setTwUsername(e.target.value)} placeholder="@kullaniciadi veya e-posta"
                    className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs font-mono border-emerald-500/30 focus:border-emerald-500" />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Twitter Şifresi</label>
                  <div className="relative">
                    <input type={showSecrets.pass ? 'text' : 'password'} value={twPassword} onChange={e => setTwPassword(e.target.value)} placeholder="Şifreniz"
                      className="w-full px-3 py-2 pr-9 rounded-xl glass-input text-white text-xs font-mono border-emerald-500/30 focus:border-emerald-500" />
                    <button type="button" onClick={() => setShowSecrets(p => ({ ...p, pass: !p.pass }))} className="absolute right-3 top-2.5 text-slate-400 hover:text-white">
                      {showSecrets.pass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 block mb-0.5">E-posta Adresi (İsteğe Bağlı)</label>
                  <p className="text-[10px] text-slate-500 mb-1">Twitter yeni sunucudan girişte şüpheli işlem tespiti için ek e-posta doğrulaması isterse kullanılır.</p>
                  <input type="email" value={twEmail} onChange={e => setTwEmail(e.target.value)} placeholder="ornek@gmail.com (İsteğe bağlı)"
                    className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs font-mono" />
                </div>
              </div>
            )}

            {/* MODE 2: XActions auth_token (Unlimited & Easy) */}
            {twTab === 'auth_token' && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-sky-950/30 border border-sky-500/30 text-xs text-sky-200 space-y-2 leading-relaxed">
                  <p className="font-bold text-sky-300 flex items-center space-x-1.5 text-sm">
                    <span>⚡ Çerez Yöntemi (Ücretsiz &amp; Sınırsız)</span>
                  </p>
                  <p>
                    <strong>x.com</strong>'da oturumunuz açıkken <strong>F12</strong> → <strong>Application</strong> →
                    <strong> Cookies</strong> → <code className="bg-sky-950 px-1 py-0.5 rounded text-sky-300 font-bold">https://x.com</code> yolunu
                    açın ve aşağıdaki değerleri <strong>aynı anda</strong> kopyalayın.
                  </p>
                  <p className="text-sky-300/80">
                    Bu üçlü aynı oturuma ait olmalıdır. Çıkış yaparsanız üçü birden geçersiz olur —
                    sekmeyi açık bırakın, çerezler yıllarca geçerli kalır.
                  </p>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    1. auth_token Değeri
                  </label>
                  <input
                    type="text"
                    value={authToken}
                    onChange={e => setAuthToken(e.target.value)}
                    placeholder="1cccdb429a6cb3f0f289469d1eccafbf77ed087d"
                    className="w-full px-3.5 py-2.5 rounded-xl glass-input text-white text-xs font-mono border-sky-500/30 focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    2. ct0 Değeri (auth_token'ın Hemen Altındaki Satır) — Zorunlu
                  </label>
                  <input
                    type="text"
                    value={ctToken}
                    onChange={e => setCtToken(e.target.value)}
                    placeholder="92b3367cba18ca166ac14c1af0b7c2f2d3596fc45bc56..."
                    className="w-full px-3.5 py-2.5 rounded-xl glass-input text-white text-xs font-mono border-sky-500/30 focus:border-sky-500"
                  />
                  <p className="text-[10px] text-amber-300/80 mt-1.5 leading-relaxed">
                    ct0, X'in CSRF doğrulama değeridir ve oturuma bağlıdır. Uydurulamaz —
                    auth_token ile aynı çerez listesinden kopyalanmalıdır.
                  </p>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    3. twid Değeri (İsteğe Bağlı)
                  </label>
                  <input
                    type="text"
                    value={twidToken}
                    onChange={e => setTwidToken(e.target.value)}
                    placeholder='u%3D1550123456789012345'
                    className="w-full px-3.5 py-2.5 rounded-xl glass-input text-white text-xs font-mono border-sky-500/30 focus:border-sky-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                    Hesap kimliğinizi taşır. Boş bırakırsanız sunucu bunu doğrulama sırasında
                    kendisi tespit eder — yalnızca sorun yaşarsanız doldurun.
                  </p>
                </div>
              </div>
            )}

            {/* MODE 2: x-use Cookie-Editor JSON */}
            {twTab === 'cookie_json' && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-sky-950/30 border border-sky-500/30 text-xs text-sky-200 space-y-2 leading-relaxed">
                  <p className="font-bold text-sky-300 flex items-center space-x-1.5 text-sm">
                    <span>🍪 x-use Yöntemi (Cookie-Editor JSON Aktarımı)</span>
                  </p>
                  <p><strong>x-use</strong> projesinin kullandığı tarayıcı çerez aktarım yöntemi. Chrome/Edge <i>Cookie-Editor</i> eklentisinden **Export JSON** diyerek aldığınız çerez metnini doğrudan buraya yapıştırabilirsiniz.</p>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">
                    Cookie-Editor JSON Çerez Metni
                  </label>
                  <textarea
                    rows={5}
                    value={cookieJson}
                    onChange={e => setCookieJson(e.target.value)}
                    placeholder='[{"domain":".x.com","name":"auth_token","value":"..."}, ...]'
                    className="w-full px-3.5 py-2.5 rounded-xl glass-input text-white text-xs font-mono border-sky-500/30 focus:border-sky-500"
                  />
                </div>
              </div>
            )}

            {/* MODE 2: Official Developer API Keys */}
            {twTab === 'api_keys' && (
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-slate-300 space-y-1 leading-relaxed">
                  <p className="font-bold text-white flex items-center space-x-1">
                    <Info size={14} className="text-sky-400" />
                    <span>Developer Portal API Anahtarları</span>
                  </p>
                  <p><a href="https://developer.twitter.com" target="_blank" rel="noopener noreferrer" className="text-sky-400 underline">developer.twitter.com</a> adresindeki App'inizden 4 anahtarı girin (Ayda maks 1.500 tweet).</p>
                </div>

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
            )}

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
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center space-x-2 transition shadow-md">
                {twStatus === 'loading' ? <Loader2 size={15} className="animate-spin text-white" /> : <ShieldCheck size={16} />}
                <span>
                  {twStatus === 'loading'
                    ? 'Doğrulanıyor...'
                    : twTab === 'auto_login'
                    ? '🚀 Otomatik Giriş Yap & Bağla'
                    : twTab === 'auth_token'
                    ? '⚡ Token ile Bağla'
                    : twTab === 'cookie_json'
                    ? '🍪 JSON ile Bağla'
                    : '🔌 API Keys ile Bağla'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
