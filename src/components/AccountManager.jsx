import React, { useState, useEffect, useRef } from 'react';
import {
  Radio, Plus, Trash2, CheckCircle2, ExternalLink,
  Eye, EyeOff, Loader2, Send, ChevronRight, ChevronLeft,
  X, BadgeCheck, RefreshCw, QrCode, Twitter
} from 'lucide-react';

// ─── Platform metadata ───────────────────────────────────────────────────────
const PLATFORMS = {
  twitter: {
    label: 'Twitter / X',
    emoji: '𝕏',
    bg: 'bg-neutral-800',
    border: 'border-neutral-600/40',
    authType: 'oauth2',          // Full OAuth 2.0 popup
    description: 'Twitter hesabına giriş yap → Otomatik yetki al → Tweet at.',
  },
  telegram: {
    label: 'Telegram',
    emoji: '✈️',
    bg: 'bg-sky-500',
    border: 'border-sky-500/40',
    authType: 'qr',             // QR code via gramjs
    description: 'my.telegram.org\'dan 2 sayı al → QR kodu tara → Bağlandı.',
  },
  whatsapp: {
    label: 'WhatsApp',
    emoji: '💬',
    bg: 'bg-emerald-600',
    border: 'border-emerald-500/40',
    authType: 'token',
    description: 'Meta Business Cloud API ile gerçek mesaj gönder.',
  },
  discord: {
    label: 'Discord',
    emoji: '🎮',
    bg: 'bg-indigo-600',
    border: 'border-indigo-500/40',
    authType: 'token',
    description: 'Discord kanalına Webhook URL ile mesaj gönder.',
  },
  linkedin: {
    label: 'LinkedIn',
    emoji: 'in',
    bg: 'bg-blue-700',
    border: 'border-blue-500/40',
    authType: 'token',
    description: 'LinkedIn API ile profil veya şirket sayfanda paylaşım yap.',
  },
};

// ─── Token field definitions for manual platforms ─────────────────────────
const TOKEN_FIELDS = {
  whatsapp: [
    { key: 'accessToken', label: 'Access Token', placeholder: 'EAAxxxxxxxxx', secret: true, help: 'Meta → WhatsApp → Getting Started bölümünden al' },
    { key: 'phoneNumberId', label: 'Phone Number ID', placeholder: '123456789', secret: false, help: 'Meta → WhatsApp → Getting Started sayfasında yazar' },
    { key: 'recipientPhone', label: 'Gönderilecek Telefon (+90...)', placeholder: '+905321234567', secret: false },
  ],
  discord: [
    { key: 'webhookUrl', label: 'Webhook URL', placeholder: 'https://discord.com/api/webhooks/...', secret: true, help: 'Kanal Ayarları → Entegrasyonlar → Webhook URL\'sini Kopyala' },
    { key: 'username', label: 'Bot Görüntü Adı (isteğe bağlı)', placeholder: 'OmniSync', secret: false },
  ],
  linkedin: [
    { key: 'accessToken', label: 'OAuth2 Access Token', placeholder: 'AQxxxxxxxxxxxxxxxx', secret: true, help: 'linkedin.com/developers/tools/oauth aracıyla al' },
    { key: 'authorUrn', label: 'Person veya Organization URN', placeholder: 'urn:li:person:xxxxxxxxx', secret: false },
  ],
};

// ════════════════════════════════════════════════════════════════════════════
// TWITTER OAUTH PANEL
// ════════════════════════════════════════════════════════════════════════════
function TwitterOAuthPanel({ onSave, onCancel }) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [accName, setAccName] = useState('Benim Twitter Hesabım');
  const [showSecret, setShowSecret] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | waiting | done | error
  const [errorMsg, setErrorMsg] = useState('');
  const popupRef = useRef(null);

  // Listen for OAuth callback message from popup
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'TWITTER_AUTH_SUCCESS') {
        try {
          const payload = JSON.parse(e.data.payload);
          setStatus('done');
          onSave({
            platform: 'twitter',
            name: payload.accountName || payload.name || accName,
            username: `@${payload.username}`,
            isVerified: false,
            credentials: {
              accessToken: payload.accessToken,
              refreshToken: payload.refreshToken,
              clientId: payload.clientId,
              clientSecret: payload.clientSecret,
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
  }, [accName, onSave]);

  const startOAuth = async () => {
    if (!clientId || !clientSecret) { setErrorMsg('Client ID ve Client Secret gerekli!'); return; }
    setStatus('waiting');
    setErrorMsg('');
    try {
      const res = await fetch('/api/twitter/oauth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret, accountName: accName }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      // Open Twitter auth in popup
      const w = 600, h = 700;
      const left = window.screenX + (window.innerWidth - w) / 2;
      const top = window.screenY + (window.innerHeight - h) / 2;
      popupRef.current = window.open(data.authUrl, 'twitter_auth', `width=${w},height=${h},left=${left},top=${top}`);

      // If popup was blocked
      if (!popupRef.current || popupRef.current.closed) {
        setStatus('idle');
        setErrorMsg('Popup engellendi! Tarayıcınızın popup engelleyicisini bu site için kapatın, sonra tekrar deneyin.');
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message);
    }
  };

  return (
    <div className="space-y-5">
      {/* Step-by-step guide */}
      <div className="space-y-2.5">
        <p className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">Nasıl Yapılır?</p>
        {[
          { n: 1, t: 'Twitter Developer Portal\'a Git', b: 'developer.twitter.com/en/portal adresine git → "Sign Up for Free Account" → Twitter hesabınla giriş yap.' },
          { n: 2, t: 'Uygulama Oluştur', b: 'Dashboard → "+ Add App" → İsim gir → "Keys and tokens" yerine "Settings" → "User authentication settings" bölümüne git.' },
          { n: 3, t: 'OAuth 2.0 Ayarları', b: '"OAuth 2.0" → Enable → Type: "Web App" → Callback URL olarak:\nhttps://telegram-twitter.onrender.com/api/twitter/callback\nWebsite URL: https://telegram-twitter.onrender.com' },
          { n: 4, t: 'Client ID ve Secret Al', b: '"Keys and tokens" → "OAuth 2.0 Client ID and Client Secret" bölümünden kopyala.' },
        ].map(s => (
          <div key={s.n} className="flex space-x-3">
            <div className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{s.n}</div>
            <div>
              <p className="text-xs font-semibold text-white">{s.t}</p>
              <p className="text-[11px] text-slate-400 whitespace-pre-line leading-relaxed mt-0.5">{s.b}</p>
            </div>
          </div>
        ))}
        <a href="https://developer.twitter.com/en/portal" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center space-x-1 text-[11px] text-indigo-400 hover:underline">
          <ExternalLink size={11} /><span>Twitter Developer Portal →</span>
        </a>
      </div>

      <div className="border-t border-slate-800 pt-4 space-y-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-1">Hesap Adı</label>
          <input type="text" value={accName} onChange={e => setAccName(e.target.value)} className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">Client ID</label>
          <p className="text-[10px] text-slate-500 mb-1">developer.twitter.com → Keys and tokens → OAuth 2.0 Client ID</p>
          <input type="text" value={clientId} onChange={e => setClientId(e.target.value)} placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">Client Secret</label>
          <p className="text-[10px] text-slate-500 mb-1">developer.twitter.com → Keys and tokens → OAuth 2.0 Client Secret</p>
          <div className="relative">
            <input type={showSecret ? 'text' : 'password'} value={clientSecret} onChange={e => setClientSecret(e.target.value)} placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs pr-10" />
            <button type="button" onClick={() => setShowSecret(p => !p)} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white">
              {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {/* Error */}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300">{errorMsg}</div>
        )}

        {/* OAuth Button */}
        {status === 'idle' || status === 'error' ? (
          <button onClick={startOAuth}
            className="w-full py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-white text-sm font-bold flex items-center justify-center space-x-2 transition shadow-md">
            <span className="text-lg font-black">𝕏</span>
            <span>Twitter ile Giriş Yap</span>
          </button>
        ) : status === 'waiting' ? (
          <div className="w-full py-3 rounded-xl bg-neutral-900 border border-neutral-700 text-slate-300 text-sm font-semibold flex items-center justify-center space-x-2">
            <Loader2 size={16} className="animate-spin" />
            <span>Twitter sayfasında izin bekleniyor...</span>
          </div>
        ) : (
          <div className="w-full py-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-sm font-semibold flex items-center justify-center space-x-2">
            <CheckCircle2 size={16} />
            <span>Twitter bağlantısı başarılı! Kaydedildi.</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TELEGRAM QR PANEL
// ════════════════════════════════════════════════════════════════════════════
function TelegramQRPanel({ onSave, onCancel }) {
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [showHash, setShowHash] = useState(false);
  const [accName, setAccName] = useState('Benim Telegram Hesabım');
  const [step, setStep] = useState('form'); // form | loading | qr | done | error
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [user, setUser] = useState(null);
  const pollRef = useRef(null);

  const startQR = async () => {
    if (!apiId || !apiHash) { setErrorMsg('API ID ve API Hash boş olamaz!'); return; }
    setStep('loading');
    setErrorMsg('');
    try {
      const res = await fetch('/api/telegram/qr/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiId, apiHash }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setSessionId(data.sessionId);
      setQrDataUrl(data.qrDataUrl);
      setStep(data.qrDataUrl ? 'qr' : 'loading');
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
        if (data.qrDataUrl && data.qrDataUrl !== qrDataUrl) setQrDataUrl(data.qrDataUrl);
        if (data.status === 'authorized') {
          clearInterval(pollRef.current);
          setUser(data.user);
          setStep('done');
          onSave({
            platform: 'telegram',
            name: accName || `${data.user?.firstName} ${data.user?.lastName}`.trim() || 'Telegram',
            username: data.user?.username ? `@${data.user.username}` : data.user?.phone || '',
            credentials: {
              sessionString: data.sessionString,
              apiId,
              apiHash,
              userId: data.user?.id,
            },
          });
        } else if (data.status === 'error') {
          clearInterval(pollRef.current);
          setStep('error');
          setErrorMsg(data.error || 'Bağlantı hatası.');
        }
      } catch (e) {
        // network blip, continue polling
      }
    }, 2000);
  };

  useEffect(() => () => clearInterval(pollRef.current), []);

  return (
    <div className="space-y-5">
      {/* Guide */}
      <div className="space-y-2.5">
        <p className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">Nasıl Yapılır? (2 Dakikada Bitti)</p>
        {[
          { n: 1, t: 'my.telegram.org\'a Git', b: 'Tarayıcından my.telegram.org adresine git → Telegram telefon numaranla giriş yap.' },
          { n: 2, t: 'Uygulama Oluştur', b: '"API development tools" → "Create new application" → İsim ver → "Create application" butonuna bas.' },
          { n: 3, t: 'API ID ve API Hash\'i Al', b: 'Sayfada "App api_id" ve "App api_hash" yazan değerleri kopyala → Aşağıya yapıştır.' },
          { n: 4, t: 'QR Kodu Tara', b: '"QR Oluştur" butonuna bas → Telegram mobil uygulamanı aç → Ayarlar → Cihazlar → Cihaz Bağla → Kodu tara.' },
        ].map(s => (
          <div key={s.n} className="flex space-x-3">
            <div className="w-5 h-5 rounded-full bg-sky-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{s.n}</div>
            <div>
              <p className="text-xs font-semibold text-white">{s.t}</p>
              <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">{s.b}</p>
            </div>
          </div>
        ))}
        <a href="https://my.telegram.org/apps" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center space-x-1 text-[11px] text-sky-400 hover:underline">
          <ExternalLink size={11} /><span>my.telegram.org/apps →</span>
        </a>
      </div>

      <div className="border-t border-slate-800 pt-4 space-y-3">
        {(step === 'form' || step === 'error') && (
          <>
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Hesap Adı</label>
              <input type="text" value={accName} onChange={e => setAccName(e.target.value)} className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">API ID</label>
              <p className="text-[10px] text-slate-500 mb-1">my.telegram.org → App api_id (sadece rakamlar, örn: 12345678)</p>
              <input type="text" value={apiId} onChange={e => setApiId(e.target.value)} placeholder="12345678" className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">API Hash</label>
              <p className="text-[10px] text-slate-500 mb-1">my.telegram.org → App api_hash (32 karakterli hex)</p>
              <div className="relative">
                <input type={showHash ? 'text' : 'password'} value={apiHash} onChange={e => setApiHash(e.target.value)} placeholder="0123456789abcdef0123456789abcdef" className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs pr-10" />
                <button type="button" onClick={() => setShowHash(p => !p)} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white">
                  {showHash ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            {errorMsg && <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300 leading-relaxed">{errorMsg}</div>}
            <button onClick={startQR}
              className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-bold flex items-center justify-center space-x-2 transition shadow-md">
              <QrCode size={16} />
              <span>QR Kodu Oluştur</span>
            </button>
          </>
        )}

        {step === 'loading' && (
          <div className="flex flex-col items-center space-y-3 py-8">
            <Loader2 size={36} className="animate-spin text-sky-400" />
            <p className="text-sm text-slate-300 font-semibold">QR kodu oluşturuluyor...</p>
            <p className="text-xs text-slate-400">Telegram sunucularına bağlanılıyor</p>
          </div>
        )}

        {step === 'qr' && qrDataUrl && (
          <div className="flex flex-col items-center space-y-4">
            <div className="p-4 bg-white rounded-2xl shadow-xl">
              <img src={qrDataUrl} alt="Telegram QR" className="w-56 h-56" />
            </div>
            <div className="text-center space-y-1.5">
              <p className="text-sm font-bold text-white">Telegram Mobil ile Tara</p>
              <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
                Telegram uygulamasında <strong className="text-white">Ayarlar → Cihazlar → Cihaz Bağla</strong> menüsüne git ve bu QR kodu tara.
              </p>
            </div>
            <div className="flex items-center space-x-2 text-xs text-amber-400">
              <Loader2 size={13} className="animate-spin" />
              <span>Taranması bekleniyor...</span>
            </div>
            <button onClick={() => { clearInterval(pollRef.current); setStep('form'); }}
              className="text-xs text-slate-500 hover:text-slate-300 underline">
              İptal
            </button>
          </div>
        )}

        {step === 'done' && user && (
          <div className="flex flex-col items-center space-y-3 py-6">
            <div className="w-16 h-16 rounded-full bg-sky-500 flex items-center justify-center text-2xl shadow-lg">✈️</div>
            <div className="text-center">
              <p className="font-bold text-white text-base">{user.firstName} {user.lastName}</p>
              {user.username && <p className="text-sky-400 text-sm">@{user.username}</p>}
              {user.phone && <p className="text-slate-400 text-xs">{user.phone}</p>}
            </div>
            <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-sm">
              <CheckCircle2 size={16} />
              <span>Telegram hesabı başarıyla bağlandı!</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// GENERIC TOKEN PANEL (WhatsApp, Discord, LinkedIn)
// ════════════════════════════════════════════════════════════════════════════
function TokenPanel({ platform, onSave, onShowToast }) {
  const [accName, setAccName] = useState(`Benim ${PLATFORMS[platform].label} Hesabım`);
  const [fields, setFields] = useState({});
  const [showSecrets, setShowSecrets] = useState({});
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  const fieldDefs = TOKEN_FIELDS[platform] || [];

  const handleVerify = async () => {
    setIsVerifying(true);
    setVerifyResult(null);
    try {
      if (platform === 'discord') {
        const res = await fetch('/api/discord/test-webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ webhookUrl: fields.webhookUrl }) });
        const d = await res.json();
        setVerifyResult(d.success ? { ok: true, msg: '✅ Discord\'a test mesajı gönderildi! Kanalını kontrol et.' } : { ok: false, msg: '❌ ' + d.error });
      } else {
        setVerifyResult({ ok: true, msg: '✅ Bilgiler kaydedilecek. İlk gönderimde test edilecek.' });
      }
    } catch (e) {
      setVerifyResult({ ok: false, msg: '❌ ' + e.message });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSave = () => {
    if (!accName.trim()) { onShowToast('Hesap adı boş olamaz!', 'error'); return; }
    onSave({ platform, name: accName.trim(), username: fields.username || fields.phoneNumberId || '', credentials: { ...fields } });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[11px] font-semibold text-slate-300 mb-1">Hesap Adı</label>
        <input type="text" value={accName} onChange={e => setAccName(e.target.value)} className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs" />
      </div>
      {fieldDefs.map(f => (
        <div key={f.key}>
          <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">{f.label}</label>
          {f.help && <p className="text-[10px] text-slate-500 mb-1">{f.help}</p>}
          <div className="relative">
            <input
              type={f.secret && !showSecrets[f.key] ? 'password' : 'text'}
              value={fields[f.key] || ''}
              onChange={e => setFields(p => ({ ...p, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs pr-9"
            />
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

      <button onClick={handleSave}
        className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-md transition">
        Hesabı Kaydet ✓
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function AccountManager({ accounts, setAccounts, onShowToast }) {
  const [wizardStep, setWizardStep] = useState(0); // 0=closed, 1=pick, 2=connect
  const [selectedPlatform, setSelectedPlatform] = useState(null);

  const openWizard = () => { setWizardStep(1); setSelectedPlatform(null); };
  const closeWizard = () => setWizardStep(0);

  const pickPlatform = (key) => { setSelectedPlatform(key); setWizardStep(2); };

  const handleSave = (accountData) => {
    const cfg = PLATFORMS[accountData.platform];
    setAccounts(prev => [...prev, {
      id: `acc-${Date.now()}`,
      status: 'connected',
      avatarColor: cfg.bg,
      ...accountData,
    }]);
    onShowToast(`${cfg.label} hesabı eklendi!`, 'success');
    // Keep wizard open only if it was auto-closed by the panel itself
    if (accountData.platform === 'twitter' || accountData.platform === 'telegram') closeWizard();
  };

  const cfg = selectedPlatform ? PLATFORMS[selectedPlatform] : null;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="p-5 rounded-2xl glass-panel border border-slate-800 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <Radio className="text-sky-400" size={20} />
            <span>Bağlı Hesaplar</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Twitter'da tek tıkla OAuth ile giriş yap. Telegram'da QR kodu tara. Diğerleri için API token gir.
          </p>
        </div>
        <button onClick={openWizard}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition flex items-center space-x-2">
          <Plus size={16} /><span>Hesap Bağla</span>
        </button>
      </div>

      {/* Accounts list */}
      {accounts.length === 0 ? (
        <div className="p-12 text-center rounded-2xl glass-panel border border-slate-800 border-dashed space-y-4">
          <div className="text-5xl">🔗</div>
          <h3 className="text-sm font-bold text-slate-200">Henüz Hesap Bağlanmadı</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            <strong className="text-white">"Hesap Bağla"</strong> butonuna tıkla. Twitter için sadece giriş yap, Telegram için QR kodu tara.
          </p>
          <button onClick={openWizard} className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md">
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
                    <div className={`w-11 h-11 rounded-xl ${acc.avatarColor || 'bg-indigo-600'} text-white font-bold flex items-center justify-center text-base shadow-md`}>
                      {c?.emoji}
                    </div>
                    <div>
                      <div className="flex items-center space-x-1">
                        <h3 className="font-bold text-sm text-white">{acc.name}</h3>
                        {acc.platform === 'twitter' && <BadgeCheck size={14} className="text-sky-400" />}
                      </div>
                      <p className="text-[11px] text-slate-400">{c?.label} · {acc.username || 'Bağlı'}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setAccounts(prev => prev.filter(a => a.id !== acc.id)); onShowToast('Hesap silindi.', 'info'); }}
                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 border border-rose-500/20 transition">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex items-center space-x-1 text-[11px] text-emerald-400">
                  <CheckCircle2 size={13} /><span>Bağlı · API Kaydedildi</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── WIZARD MODAL ── */}
      {wizardStep > 0 && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl my-8">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                {wizardStep === 2 && cfg && (
                  <div className={`w-9 h-9 rounded-xl ${cfg.bg} text-white font-bold flex items-center justify-center text-base`}>{cfg.emoji}</div>
                )}
                <div>
                  <h3 className="text-base font-bold text-white">
                    {wizardStep === 1 ? 'Hangi Platformu Bağlamak İstiyorsun?' : `${cfg?.label} Bağlantısı`}
                  </h3>
                  {wizardStep === 2 && cfg && <p className="text-[11px] text-slate-400 mt-0.5">{cfg.description}</p>}
                </div>
              </div>
              <button onClick={closeWizard} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
                <X size={18} />
              </button>
            </div>

            {/* Step 1: Platform picker */}
            {wizardStep === 1 && (
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(PLATFORMS).map(([key, c]) => (
                  <button key={key} onClick={() => pickPlatform(key)}
                    className="flex items-center space-x-4 p-4 rounded-xl border border-slate-800 hover:border-indigo-500/60 bg-slate-800/40 hover:bg-slate-800 text-left transition group">
                    <div className={`w-12 h-12 rounded-xl ${c.bg} text-white font-bold flex items-center justify-center text-xl shadow-md shrink-0`}>{c.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-white">{c.label}</p>
                      <p className="text-[11px] text-slate-400 leading-snug mt-0.5">
                        {c.authType === 'oauth2' ? '🔑 Tek tıkla OAuth giriş' : c.authType === 'qr' ? '📱 QR kod ile tara' : '🔑 API token gir'}
                      </p>
                    </div>
                    <ChevronRight size={16} className="text-slate-500 group-hover:text-indigo-400 shrink-0 transition" />
                  </button>
                ))}
              </div>
            )}

            {/* Step 2: Platform-specific panel */}
            {wizardStep === 2 && cfg && (
              <div className="p-6 max-h-[78vh] overflow-y-auto">
                {/* Back button */}
                <button onClick={() => setWizardStep(1)} className="flex items-center space-x-1 text-xs text-slate-400 hover:text-white mb-4 transition">
                  <ChevronLeft size={15} /><span>Geri</span>
                </button>

                {cfg.authType === 'oauth2' && (
                  <TwitterOAuthPanel
                    onSave={handleSave}
                    onCancel={closeWizard}
                  />
                )}
                {cfg.authType === 'qr' && (
                  <TelegramQRPanel
                    onSave={handleSave}
                    onCancel={closeWizard}
                  />
                )}
                {cfg.authType === 'token' && (
                  <TokenPanel
                    platform={selectedPlatform}
                    onSave={(data) => { handleSave(data); closeWizard(); }}
                    onShowToast={onShowToast}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
