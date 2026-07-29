import React, { useState, useEffect, useRef } from 'react';
import {
  Radio, Plus, Trash2, CheckCircle2, ExternalLink,
  Eye, EyeOff, Loader2, Send, ChevronRight, ChevronLeft,
  X, BadgeCheck, QrCode, AlertTriangle
} from 'lucide-react';

const PLATFORMS = {
  twitter: {
    label: 'Twitter / X',
    emoji: '𝕏',
    bg: 'bg-neutral-800',
    border: 'border-neutral-600/40',
    authType: 'oauth2',
    tagline: 'Giriş sayfası açılır, kullanıcı adı+şifreni gir.',
  },
  telegram: {
    label: 'Telegram',
    emoji: '✈️',
    bg: 'bg-sky-500',
    border: 'border-sky-500/40',
    authType: 'qr',
    tagline: 'Telegram mobil uygulama ile QR kodu tara.',
  },
  whatsapp: {
    label: 'WhatsApp',
    emoji: '💬',
    bg: 'bg-emerald-600',
    border: 'border-emerald-500/40',
    authType: 'token',
    tagline: 'Meta Business Cloud API ile mesaj gönder.',
  },
  discord: {
    label: 'Discord',
    emoji: '🎮',
    bg: 'bg-indigo-600',
    border: 'border-indigo-500/40',
    authType: 'webhook',
    tagline: 'Webhook URL ile kanala mesaj gönder.',
  },
  linkedin: {
    label: 'LinkedIn',
    emoji: 'in',
    bg: 'bg-blue-700',
    border: 'border-blue-500/40',
    authType: 'token',
    tagline: 'API Access Token ile paylaşım yap.',
  },
};

// ── Twitter: just one button, no inputs ─────────────────────────────────────
function TwitterPanel({ onSave, onCancel }) {
  const [status, setStatus] = useState('idle'); // idle | waiting | done | error
  const [errorMsg, setErrorMsg] = useState('');
  const [serverReady, setServerReady] = useState(null); // null=loading, true, false

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(d => setServerReady(d.twitterReady))
      .catch(() => setServerReady(false));
  }, []);

  // Listen for OAuth callback from popup
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'TWITTER_AUTH_SUCCESS') {
        try {
          const payload = JSON.parse(e.data.payload);
          setStatus('done');
          onSave({
            platform: 'twitter',
            name: payload.name || payload.username || 'Twitter Hesabı',
            username: `@${payload.username}`,
            isVerified: false,
            credentials: {
              accessToken: payload.accessToken,
              refreshToken: payload.refreshToken,
              clientId: payload.clientId,
              username: payload.username,
            },
          });
        } catch (err) {
          setStatus('error');
          setErrorMsg('Token parse hatası: ' + err.message);
        }
      } else if (e.data?.type === 'TWITTER_AUTH_ERROR') {
        setStatus('error');
        setErrorMsg(e.data.error || 'Twitter yetkilendirme başarısız.');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onSave]);

  const startLogin = () => {
    setStatus('waiting');
    setErrorMsg('');
    const w = 600, h = 700;
    const left = window.screenX + (window.innerWidth - w) / 2;
    const top = window.screenY + (window.innerHeight - h) / 2;
    const popup = window.open('/api/twitter/oauth/start', 'twitter_login',
      `width=${w},height=${h},left=${left},top=${top},toolbar=0,menubar=0`);
    if (!popup || popup.closed) {
      setStatus('error');
      setErrorMsg('Popup engellendi! Tarayıcı ayarlarından bu site için popup\'lara izin verin, sonra tekrar deneyin.');
    }
  };

  if (serverReady === null) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-indigo-400" />
      </div>
    );
  }

  if (!serverReady) {
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/30 space-y-2">
          <div className="flex items-center space-x-2 text-amber-300 font-bold text-sm">
            <AlertTriangle size={16} />
            <span>Sunucu Yapılandırması Gerekli (Bir Kez)</span>
          </div>
          <p className="text-xs text-amber-200/80 leading-relaxed">
            Twitter girişi için Render'da iki ortam değişkeni ayarlamanız gerekiyor. Bu sadece bir kez yapılır. Sonrasında kullanıcılar sadece butona basarak giriş yapar.
          </p>
        </div>

        <div className="space-y-3 text-xs">
          {[
            { n: 1, t: 'Twitter Developer Portal', b: 'developer.twitter.com adresine git → Free hesap aç (Twitter hesabınla giriş yap).' },
            { n: 2, t: 'Uygulama Oluştur', b: '"+ Add App" → İsim ver → "Keys and tokens" bölümüne git.\nSettings → "User authentication settings" → OAuth 2.0 → Enable\nType: "Web App"\nCallback URL: https://telegram-twitter.onrender.com/api/twitter/callback\nWebsite URL: https://telegram-twitter.onrender.com' },
            { n: 3, t: 'Render\'a Ekle', b: 'Render Dashboard → telegram-twitter servisi → "Environment" sekmesi → şu iki değişkeni ekle:\n\nTWITTER_CLIENT_ID = (Client ID\'yi yapıştır)\nTWITTER_CLIENT_SECRET = (Client Secret\'ı yapıştır)\n\nArdından servisi yeniden başlat.' },
            { n: 4, t: 'Bitti!', b: 'Bundan sonra bu sayfaya geldiğinde sadece "Twitter ile Giriş Yap" butonunu göreceksin. Client ID falan sormayacak.' },
          ].map(s => (
            <div key={s.n} className="flex space-x-3">
              <div className="w-5 h-5 rounded-full bg-neutral-700 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{s.n}</div>
              <div>
                <p className="font-semibold text-white">{s.t}</p>
                <p className="text-slate-400 whitespace-pre-line leading-relaxed mt-0.5">{s.b}</p>
              </div>
            </div>
          ))}
          <a href="https://developer.twitter.com/en/portal" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center space-x-1 text-[11px] text-sky-400 hover:underline mt-1">
            <ExternalLink size={11} /><span>developer.twitter.com →</span>
          </a>
        </div>
      </div>
    );
  }

  // Server is ready → show login button
  return (
    <div className="flex flex-col items-center space-y-5 py-4">
      <div className="w-20 h-20 rounded-2xl bg-neutral-800 border border-neutral-700 flex items-center justify-center text-4xl font-black text-white shadow-xl">
        𝕏
      </div>
      <div className="text-center space-y-1">
        <p className="text-base font-bold text-white">Twitter Hesabına Giriş Yap</p>
        <p className="text-xs text-slate-400">Butona bastığında Twitter giriş sayfası açılır.</p>
        <p className="text-xs text-slate-400">Kullanıcı adın ve şifreni Twitter'da gir → İzin ver → Bitti.</p>
      </div>

      {errorMsg && (
        <div className="w-full p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300 text-center">{errorMsg}</div>
      )}

      {status === 'idle' || status === 'error' ? (
        <button onClick={startLogin}
          className="w-full max-w-xs py-3.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-white text-base font-bold flex items-center justify-center space-x-3 transition shadow-lg">
          <span className="text-xl font-black">𝕏</span>
          <span>Twitter ile Giriş Yap</span>
        </button>
      ) : status === 'waiting' ? (
        <div className="flex flex-col items-center space-y-3">
          <div className="w-full max-w-xs py-3.5 rounded-xl bg-neutral-900 border border-neutral-700 text-slate-300 text-sm font-semibold flex items-center justify-center space-x-2">
            <Loader2 size={16} className="animate-spin" />
            <span>Twitter sayfasında giriş bekleniyor...</span>
          </div>
          <p className="text-[11px] text-slate-500">Açılan pencerede Twitter bilgilerini gir ve izin ver.</p>
        </div>
      ) : (
        <div className="flex items-center space-x-2 text-emerald-400 font-bold text-sm">
          <CheckCircle2 size={18} />
          <span>Twitter hesabı başarıyla bağlandı!</span>
        </div>
      )}
    </div>
  );
}

// ── Telegram: QR code scan ───────────────────────────────────────────────────
function TelegramPanel({ onSave }) {
  const [step, setStep] = useState('check'); // check | form | loading | qr | done | error
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [showHash, setShowHash] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [user, setUser] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(d => setStep(d.telegramReady ? 'qr_ready' : 'form'))
      .catch(() => setStep('form'));
    return () => clearInterval(pollRef.current);
  }, []);

  const startQR = async (overrideApiId, overrideApiHash) => {
    setStep('loading');
    setErrorMsg('');
    try {
      const res = await fetch('/api/telegram/qr/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiId: overrideApiId || apiId, apiHash: overrideApiHash || apiHash }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setSessionId(data.sessionId);
      setQrDataUrl(data.qrDataUrl || '');
      setStep('qr');
      startPolling(data.sessionId);
    } catch (err) {
      setStep('error');
      setErrorMsg(err.message);
    }
  };

  const startPolling = (sid) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/telegram/qr/poll?sessionId=${sid}`);
        const data = await res.json();
        if (data.qrDataUrl) setQrDataUrl(data.qrDataUrl);
        if (data.status === 'authorized') {
          clearInterval(pollRef.current);
          setUser(data.user);
          setStep('done');
          onSave({
            platform: 'telegram',
            name: `${data.user?.firstName || ''} ${data.user?.lastName || ''}`.trim() || 'Telegram',
            username: data.user?.username ? `@${data.user.username}` : data.user?.phone || '',
            credentials: { sessionString: data.sessionString, userId: data.user?.id },
          });
        } else if (data.status === 'error') {
          clearInterval(pollRef.current);
          setStep('error');
          setErrorMsg(data.error || 'Bağlantı hatası.');
        }
      } catch (_) {}
    }, 2000);
  };

  if (step === 'check') return (
    <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-sky-400" /></div>
  );

  // Server has env vars set → just show QR button
  if (step === 'qr_ready') return (
    <div className="flex flex-col items-center space-y-5 py-4">
      <div className="w-20 h-20 rounded-2xl bg-sky-500 flex items-center justify-center text-4xl shadow-xl">✈️</div>
      <div className="text-center space-y-1">
        <p className="text-base font-bold text-white">Telegram ile Bağlan</p>
        <p className="text-xs text-slate-400">Telegram mobil uygulamandan QR kodu tarayarak giriş yap.</p>
        <p className="text-xs text-slate-400">Ayarlar → Cihazlar → Cihaz Bağla → QR'ı tara</p>
      </div>
      <button onClick={() => startQR()}
        className="w-full max-w-xs py-3.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-base font-bold flex items-center justify-center space-x-3 transition shadow-lg">
        <QrCode size={20} />
        <span>QR Kodu Oluştur</span>
      </button>
    </div>
  );

  // No env vars → show form with guide
  if (step === 'form' || step === 'error') return (
    <div className="space-y-4">
      <div className="p-3.5 rounded-xl bg-sky-950/30 border border-sky-500/20 text-xs text-sky-200 space-y-1 leading-relaxed">
        <p className="font-bold text-sky-300">my.telegram.org'dan 2 dakikada API ID al:</p>
        <p>1. <a href="https://my.telegram.org/apps" target="_blank" rel="noopener noreferrer" className="underline text-sky-400">my.telegram.org/apps</a> adresine git → telefon numaranla giriş yap</p>
        <p>2. "Create application" → herhangi bir isim ver → Oluştur</p>
        <p>3. <strong>App api_id</strong> (rakamlar) ve <strong>App api_hash</strong> (32 karakter)'i kopyala</p>
      </div>
      {errorMsg && <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300 leading-relaxed">{errorMsg}</div>}
      <div>
        <label className="block text-[11px] font-semibold text-slate-300 mb-1">API ID (sadece rakamlar)</label>
        <input type="text" value={apiId} onChange={e => setApiId(e.target.value)} placeholder="12345678"
          className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs" />
      </div>
      <div>
        <label className="block text-[11px] font-semibold text-slate-300 mb-1">API Hash (32 karakter)</label>
        <div className="relative">
          <input type={showHash ? 'text' : 'password'} value={apiHash} onChange={e => setApiHash(e.target.value)}
            placeholder="0123456789abcdef0123456789abcdef"
            className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs pr-10" />
          <button type="button" onClick={() => setShowHash(p => !p)} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white">
            {showHash ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
      <button onClick={() => startQR(apiId, apiHash)}
        className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold flex items-center justify-center space-x-2 transition shadow-md">
        <QrCode size={16} /><span>QR Kodu Oluştur</span>
      </button>
    </div>
  );

  if (step === 'loading') return (
    <div className="flex flex-col items-center space-y-3 py-10">
      <Loader2 size={36} className="animate-spin text-sky-400" />
      <p className="text-sm font-semibold text-white">QR kodu oluşturuluyor...</p>
    </div>
  );

  if (step === 'qr') return (
    <div className="flex flex-col items-center space-y-4">
      {qrDataUrl
        ? <div className="p-4 bg-white rounded-2xl shadow-xl"><img src={qrDataUrl} alt="Telegram QR" className="w-56 h-56" /></div>
        : <div className="w-64 h-64 rounded-2xl bg-slate-800 flex items-center justify-center"><Loader2 size={32} className="animate-spin text-sky-400" /></div>
      }
      <div className="text-center space-y-1">
        <p className="text-sm font-bold text-white">Telegram Mobil ile Tara</p>
        <p className="text-xs text-slate-400">Ayarlar → Cihazlar → Cihaz Bağla</p>
      </div>
      <div className="flex items-center space-x-2 text-xs text-amber-400 animate-pulse">
        <Loader2 size={13} className="animate-spin" /><span>Taranması bekleniyor...</span>
      </div>
    </div>
  );

  if (step === 'done') return (
    <div className="flex flex-col items-center space-y-3 py-8">
      <div className="w-16 h-16 rounded-full bg-sky-500 flex items-center justify-center text-3xl shadow-lg">✈️</div>
      <p className="font-bold text-white text-base">{user?.firstName} {user?.lastName}</p>
      {user?.username && <p className="text-sky-400 text-sm">@{user.username}</p>}
      <div className="flex items-center space-x-2 text-emerald-400 font-bold text-sm">
        <CheckCircle2 size={16} /><span>Telegram başarıyla bağlandı!</span>
      </div>
    </div>
  );
}

// ── Token panel (WhatsApp, Discord, LinkedIn) ────────────────────────────────
const TOKEN_FIELDS = {
  whatsapp: [
    { key: 'accessToken', label: 'Access Token', placeholder: 'EAAxxxxxxxxx', secret: true, help: 'Meta → WhatsApp → Getting Started' },
    { key: 'phoneNumberId', label: 'Phone Number ID', placeholder: '123456789', secret: false },
    { key: 'recipientPhone', label: 'Gönderilecek Telefon (+90...)', placeholder: '+905321234567', secret: false },
  ],
  discord: [
    { key: 'webhookUrl', label: 'Webhook URL', placeholder: 'https://discord.com/api/webhooks/...', secret: true, help: 'Kanal Ayarları → Entegrasyonlar → Webhook' },
    { key: 'username', label: 'Bot Adı (isteğe bağlı)', placeholder: 'OmniSync', secret: false },
  ],
  linkedin: [
    { key: 'accessToken', label: 'OAuth2 Access Token', placeholder: 'AQxxxxxxxxxx', secret: true, help: 'linkedin.com/developers/tools/oauth' },
    { key: 'authorUrn', label: 'Person/Org URN', placeholder: 'urn:li:person:xxxxxxxxx', secret: false },
  ],
};

function TokenPanel({ platform, onSave, onShowToast }) {
  const cfg = PLATFORMS[platform];
  const [accName, setAccName] = useState(`Benim ${cfg.label} Hesabım`);
  const [fields, setFields] = useState({});
  const [showSecrets, setShowSecrets] = useState({});
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  const handleVerify = async () => {
    setIsVerifying(true); setVerifyResult(null);
    try {
      const res = await fetch('/api/discord/test-webhook', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: fields.webhookUrl })
      });
      const d = await res.json();
      setVerifyResult(d.success ? { ok: true, msg: '✅ Discord\'a test mesajı gönderildi!' } : { ok: false, msg: '❌ ' + d.error });
    } catch (e) {
      setVerifyResult({ ok: false, msg: '❌ ' + e.message });
    } finally { setIsVerifying(false); }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[11px] font-semibold text-slate-300 mb-1">Hesap Adı</label>
        <input type="text" value={accName} onChange={e => setAccName(e.target.value)} className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs" />
      </div>
      {(TOKEN_FIELDS[platform] || []).map(f => (
        <div key={f.key}>
          <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">{f.label}</label>
          {f.help && <p className="text-[10px] text-slate-500 mb-1">{f.help}</p>}
          <div className="relative">
            <input type={f.secret && !showSecrets[f.key] ? 'password' : 'text'}
              value={fields[f.key] || ''} onChange={e => setFields(p => ({ ...p, [f.key]: e.target.value }))}
              placeholder={f.placeholder} className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs pr-9" />
            {f.secret && (
              <button type="button" onClick={() => setShowSecrets(p => ({ ...p, [f.key]: !p[f.key] }))} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white">
                {showSecrets[f.key] ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            )}
          </div>
        </div>
      ))}
      {platform === 'discord' && (
        <button onClick={handleVerify} disabled={isVerifying}
          className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center space-x-2 transition">
          {isVerifying ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          <span>{isVerifying ? 'Test ediliyor...' : '🔌 Webhook\'u Test Et'}</span>
        </button>
      )}
      {verifyResult && (
        <div className={`p-3 rounded-xl text-xs font-semibold ${verifyResult.ok ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/30' : 'bg-rose-950/40 text-rose-300 border border-rose-500/30'}`}>
          {verifyResult.msg}
        </div>
      )}
      <button onClick={() => { if (!accName.trim()) { onShowToast('Hesap adı boş!', 'error'); return; } onSave({ platform, name: accName.trim(), username: fields.username || fields.phoneNumberId || '', credentials: { ...fields } }); }}
        className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-md transition">
        Hesabı Kaydet ✓
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AccountManager({ accounts, setAccounts, onShowToast }) {
  const [wizardStep, setWizardStep] = useState(0);
  const [selectedPlatform, setSelectedPlatform] = useState(null);

  const closeWizard = () => setWizardStep(0);
  const pickPlatform = (key) => { setSelectedPlatform(key); setWizardStep(2); };

  const handleSave = (data) => {
    const cfg = PLATFORMS[data.platform];
    setAccounts(prev => [...prev, { id: `acc-${Date.now()}`, status: 'connected', avatarColor: cfg.bg, ...data }]);
    onShowToast(`${cfg.label} hesabı eklendi!`, 'success');
    closeWizard();
  };

  const cfg = selectedPlatform ? PLATFORMS[selectedPlatform] : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-5 rounded-2xl glass-panel border border-slate-800 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <Radio className="text-sky-400" size={20} /><span>Bağlı Hesaplar</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">Twitter → giriş sayfası açılır. Telegram → QR kodu tara. Diğerleri → API token gir.</p>
        </div>
        <button onClick={() => setWizardStep(1)}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition flex items-center space-x-2">
          <Plus size={16} /><span>Hesap Bağla</span>
        </button>
      </div>

      {/* Accounts */}
      {accounts.length === 0 ? (
        <div className="p-12 text-center rounded-2xl glass-panel border border-slate-800 border-dashed space-y-4">
          <div className="text-5xl">🔗</div>
          <h3 className="text-sm font-bold text-slate-200">Henüz Hesap Bağlanmadı</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            Twitter için giriş sayfası açılır, Telegram için QR kodu tara. Çok basit!
          </p>
          <button onClick={() => setWizardStep(1)} className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md">
            + Hesap Bağlamaya Başla
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map(acc => {
            const c = PLATFORMS[acc.platform];
            return (
              <div key={acc.id} className={`p-4 rounded-2xl glass-panel border ${c?.border || 'border-slate-800'} space-y-3`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-11 h-11 rounded-xl ${acc.avatarColor || 'bg-indigo-600'} text-white font-bold flex items-center justify-center text-base shadow-md`}>{c?.emoji}</div>
                    <div>
                      <div className="flex items-center space-x-1">
                        <h3 className="font-bold text-sm text-white">{acc.name}</h3>
                        {acc.platform === 'twitter' && <BadgeCheck size={14} className="text-sky-400" />}
                      </div>
                      <p className="text-[11px] text-slate-400">{c?.label} · {acc.username || 'Bağlı'}</p>
                    </div>
                  </div>
                  <button onClick={() => { setAccounts(prev => prev.filter(a => a.id !== acc.id)); onShowToast('Hesap silindi.', 'info'); }}
                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 border border-rose-500/20 transition">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex items-center space-x-1 text-[11px] text-emerald-400">
                  <CheckCircle2 size={13} /><span>Bağlı</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Wizard Modal */}
      {wizardStep > 0 && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl my-8">

            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                {wizardStep === 2 && cfg && (
                  <div className={`w-9 h-9 rounded-xl ${cfg.bg} text-white font-bold flex items-center justify-center text-base`}>{cfg.emoji}</div>
                )}
                <h3 className="text-base font-bold text-white">
                  {wizardStep === 1 ? 'Platform Seç' : `${cfg?.label} Bağlantısı`}
                </h3>
              </div>
              <button onClick={closeWizard} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"><X size={18} /></button>
            </div>

            {/* Step 1: Pick platform */}
            {wizardStep === 1 && (
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(PLATFORMS).map(([key, c]) => (
                  <button key={key} onClick={() => pickPlatform(key)}
                    className="flex items-center space-x-4 p-4 rounded-xl border border-slate-800 hover:border-indigo-500/60 bg-slate-800/40 hover:bg-slate-800 text-left transition group">
                    <div className={`w-12 h-12 rounded-xl ${c.bg} text-white font-bold flex items-center justify-center text-xl shadow-md shrink-0`}>{c.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-white">{c.label}</p>
                      <p className="text-[11px] text-slate-400 leading-snug mt-0.5">{c.tagline}</p>
                    </div>
                    <ChevronRight size={16} className="text-slate-500 group-hover:text-indigo-400 shrink-0 transition" />
                  </button>
                ))}
              </div>
            )}

            {/* Step 2: Connect */}
            {wizardStep === 2 && (
              <div className="p-6 max-h-[78vh] overflow-y-auto">
                <button onClick={() => setWizardStep(1)} className="flex items-center space-x-1 text-xs text-slate-400 hover:text-white mb-5 transition">
                  <ChevronLeft size={15} /><span>Geri</span>
                </button>
                {cfg?.authType === 'oauth2' && <TwitterPanel onSave={handleSave} onCancel={closeWizard} />}
                {cfg?.authType === 'qr' && <TelegramPanel onSave={handleSave} />}
                {(cfg?.authType === 'token' || cfg?.authType === 'webhook') && (
                  <TokenPanel platform={selectedPlatform} onSave={(d) => { handleSave(d); }} onShowToast={onShowToast} />
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
