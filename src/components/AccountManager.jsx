import React, { useState } from 'react';
import {
  Radio, Plus, Trash2, CheckCircle2, ExternalLink, Eye, EyeOff,
  Loader2, Send, ChevronRight, ChevronLeft, BadgeCheck, X, MessageSquare
} from 'lucide-react';

// ─── Platform definitions ────────────────────────────────────────────────────
const PLATFORMS = {
  telegram: {
    label: 'Telegram',
    emoji: '✈️',
    bg: 'bg-sky-500',
    border: 'border-sky-500/50',
    description: 'Telegram kanalın veya grubuna bot üzerinden mesaj gönder.',
    steps: [
      {
        title: '1. Bot Oluştur',
        body: 'Telegram\'da @BotFather hesabına mesaj at ve /newbot yaz. Sonra bot adı ve @kullanıcı_adı gir. Sana uzun bir token (örn: 7123...:AAG...) verecek.'
      },
      {
        title: '2. Botu Kanala Ekle',
        body: 'Kanalına veya grubuna gir → Üyeler → Yönetici Ekle → Oluşturduğun botu ekle ve "Mesaj Gönder" iznini ver.'
      },
      {
        title: '3. Chat ID Al',
        body: 'Kanalın kullanıcı adını @kanaladi şeklinde doğrudan girebilirsin. Özel kanallar için @userinfobot\'a kanaldan bir mesaj ilet, sana -100... ile başlayan Chat ID verecek.'
      }
    ],
    docsUrl: 'https://core.telegram.org/bots#how-do-i-create-a-bot',
    fields: [
      { key: 'botToken', label: 'Bot Token', placeholder: '7123456789:AAGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', secret: true, help: '@BotFather\'dan aldığın token' },
      { key: 'chatId', label: 'Chat ID veya @kanaladi', placeholder: '-100123456789 ya da @kanaladi', secret: false, help: 'Kanalın Chat ID\'si veya @kullanıcı_adı' }
    ]
  },
  twitter: {
    label: 'Twitter / X',
    emoji: '𝕏',
    bg: 'bg-neutral-800',
    border: 'border-neutral-600/50',
    description: 'Twitter API v2 ile tweet at. Ücretsiz plan ile aylık 1500 tweet hakkın var.',
    steps: [
      {
        title: '1. Developer Hesabı Aç',
        body: 'developer.twitter.com adresine git → "Sign Up" → Twitter hesabınla giriş yap → Kullanım amacını anlatan kısa bir metin yaz (İngilizce). Onay birkaç dakika içinde gelir.'
      },
      {
        title: '2. Uygulama Oluştur',
        body: 'Dashboard\'dan "Add App" seç → İsim ver → "Keys and tokens" bölümüne git.'
      },
      {
        title: '3. 4 Anahtarı Kopyala',
        body: '"Keys and Tokens" sayfasından şunları kopyala:\n• API Key (Consumer Key)\n• API Secret\n• Access Token\n• Access Token Secret\n\nNot: "Regenerate" butonuna basarsan eski token geçersiz olur.'
      }
    ],
    docsUrl: 'https://developer.twitter.com/en/portal/dashboard',
    fields: [
      { key: 'apiKey', label: 'API Key (Consumer Key)', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxx', secret: true, help: 'developer.twitter.com → Keys and tokens' },
      { key: 'apiSecret', label: 'API Secret', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', secret: true, help: 'developer.twitter.com → Keys and tokens' },
      { key: 'accessToken', label: 'Access Token', placeholder: '0000000-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', secret: true, help: 'developer.twitter.com → Keys and tokens' },
      { key: 'accessTokenSecret', label: 'Access Token Secret', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', secret: true, help: 'developer.twitter.com → Keys and tokens' },
      { key: 'username', label: 'Twitter Kullanıcı Adın', placeholder: '@kullanici_adin', secret: false, help: 'Sadece görüntü için' },
      { key: 'isVerified', label: 'Mavi Tik (X Premium) var → 25.000 karakter, bölünmez', type: 'checkbox', secret: false }
    ]
  },
  whatsapp: {
    label: 'WhatsApp',
    emoji: '💬',
    bg: 'bg-emerald-600',
    border: 'border-emerald-500/50',
    description: 'Meta Business Cloud API ile gerçek WhatsApp mesajı gönder.',
    steps: [
      {
        title: '1. Meta Business Hesabı',
        body: 'business.facebook.com adresine git → Hesap oluştur veya mevcut hesabınla giriş yap.'
      },
      {
        title: '2. Uygulamayı Kur',
        body: 'developers.facebook.com/apps → "Uygulama Oluştur" → "Business" seç → WhatsApp ürünü ekle → "Başlarken" bölümüne git.'
      },
      {
        title: '3. Bilgileri Al',
        body: '"Başlarken" (Getting Started) sayfasında:\n• Phone Number ID → direkt kopyala\n• Access Token → "Geçici token oluştur" butonuna bas (test için 24 saat geçerli)\n• Alıcı numarayı +90 ile birlikte yaz (test için önce onaylı numara eklemelisin)'
      }
    ],
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
    fields: [
      { key: 'accessToken', label: 'Access Token', placeholder: 'EAAxxxxxxxxxxxxxxxxxxxxxxxxx', secret: true, help: 'Meta → WhatsApp → Getting Started bölümünden al' },
      { key: 'phoneNumberId', label: 'Phone Number ID', placeholder: '123456789012345', secret: false, help: 'Meta → WhatsApp → Getting Started sayfasında yazar' },
      { key: 'recipientPhone', label: 'Gönderilecek Telefon (+90...)', placeholder: '+905321234567', secret: false, help: 'Uluslararası format: +90 ile başlayacak' }
    ]
  },
  discord: {
    label: 'Discord',
    emoji: '🎮',
    bg: 'bg-indigo-600',
    border: 'border-indigo-500/50',
    description: 'Discord kanalına Webhook ile mesaj gönder. En kolay entegrasyon.',
    steps: [
      {
        title: '1. Webhook Oluştur',
        body: 'Discord\'da mesaj atmak istediğin kanala sağ tıkla → "Kanal Ayarları" → "Entegrasyonlar" sekmesi → "Webhook\'lar" → "Yeni Webhook" butonuna bas.'
      },
      {
        title: '2. URL\'yi Kopyala',
        body: 'Oluşan webhook\'a tıkla → "Webhook URL\'sini Kopyala" butonuna bas. URL https://discord.com/api/webhooks/... şeklinde başlamalı.'
      },
      { title: '3. Bitti!', body: 'URL\'yi aşağıya yapıştır, "Bağlantıyı Test Et" butonuna bas. Discord kanalına test mesajı gelecek.' }
    ],
    docsUrl: 'https://discord.com/developers/docs/resources/webhook',
    fields: [
      { key: 'webhookUrl', label: 'Webhook URL', placeholder: 'https://discord.com/api/webhooks/1234567890/xxxxxxxx', secret: true, help: 'Kanal Ayarları → Entegrasyonlar → Webhook URL\'sini Kopyala' },
      { key: 'username', label: 'Bot Görüntü Adı (isteğe bağlı)', placeholder: 'OmniSync', secret: false }
    ]
  },
  linkedin: {
    label: 'LinkedIn',
    emoji: 'in',
    bg: 'bg-blue-700',
    border: 'border-blue-500/50',
    description: 'LinkedIn\'de profil veya şirket sayfana paylaşım yap.',
    steps: [
      {
        title: '1. LinkedIn App Oluştur',
        body: 'linkedin.com/developers/apps → "Create App" → Uygulama adı, LinkedIn sayfan ve logo gir.'
      },
      {
        title: '2. Yetki Ekle',
        body: '"Products" sekmesinden "Share on LinkedIn" ve "Sign In with LinkedIn using OpenID Connect" ürünlerini ekle. Onay anında veya birkaç saatte gelir.'
      },
      {
        title: '3. Access Token Al',
        body: '"Auth" sekmesinden OAuth 2.0 akışı başlat veya LinkedIn token üretici (linkedin.com/developers/tools/oauth) kullan.\nPerson URN için: api.linkedin.com/v2/userinfo adresini token ile çağır, sub alanında gelir.'
      }
    ],
    docsUrl: 'https://www.linkedin.com/developers/apps',
    fields: [
      { key: 'accessToken', label: 'OAuth 2.0 Access Token', placeholder: 'AQxxxxxxxxxxxxxxxxxxxxxxxx', secret: true, help: 'LinkedIn Developer Portal → Auth bölümünden al' },
      { key: 'authorUrn', label: 'Person veya Organization URN', placeholder: 'urn:li:person:xxxxxxxxx', secret: false, help: 'Profil için urn:li:person:xxx, şirket için urn:li:organization:xxx' }
    ]
  }
};

// ─── Main Component ──────────────────────────────────────────────────────────
export default function AccountManager({ accounts, setAccounts, onShowToast }) {
  const [wizardStep, setWizardStep] = useState(0); // 0=closed, 1=pick platform, 2=guide+form
  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [accName, setAccName] = useState('');
  const [formFields, setFormFields] = useState({});
  const [showSecrets, setShowSecrets] = useState({});
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  const openWizard = () => { setWizardStep(1); setSelectedPlatform(null); setFormFields({}); setAccName(''); setVerifyResult(null); };
  const closeWizard = () => setWizardStep(0);

  const pickPlatform = (key) => {
    setSelectedPlatform(key);
    setFormFields({});
    setAccName(`Benim ${PLATFORMS[key].label} Hesabım`);
    setVerifyResult(null);
    setShowSecrets({});
    setWizardStep(2);
  };

  const handleVerify = async () => {
    setIsVerifying(true);
    setVerifyResult(null);
    try {
      if (selectedPlatform === 'telegram') {
        if (!formFields.botToken) { setVerifyResult({ ok: false, msg: 'Bot Token girilmedi.' }); return; }
        const r = await fetch('/api/telegram/test-bot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botToken: formFields.botToken }) });
        const d = await r.json();
        setVerifyResult(d.success ? { ok: true, msg: `✅ Bot doğrulandı! Adı: ${d.botInfo.name} (${d.botInfo.username})` } : { ok: false, msg: `❌ ${d.error}` });
      } else if (selectedPlatform === 'discord') {
        if (!formFields.webhookUrl) { setVerifyResult({ ok: false, msg: 'Webhook URL girilmedi.' }); return; }
        const r = await fetch('/api/discord/test-webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ webhookUrl: formFields.webhookUrl }) });
        const d = await r.json();
        setVerifyResult(d.success ? { ok: true, msg: '✅ Discord\'a test mesajı gönderildi, kanalını kontrol et!' } : { ok: false, msg: `❌ ${d.error}` });
      } else {
        setVerifyResult({ ok: true, msg: '✅ Bilgiler kaydedilecek. Gerçek test ilk gönderimde yapılır.' });
      }
    } catch (e) {
      setVerifyResult({ ok: false, msg: `❌ ${e.message}` });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!accName.trim()) { onShowToast('Hesap adı boş olamaz!', 'error'); return; }

    const cfg = PLATFORMS[selectedPlatform];
    const newAcc = {
      id: `acc-${Date.now()}`,
      platform: selectedPlatform,
      name: accName.trim(),
      username: formFields.username || formFields.chatId || formFields.phoneNumberId || '',
      isVerified: !!formFields.isVerified,
      credentials: { ...formFields },
      avatarColor: cfg.bg
    };
    setAccounts(prev => [...prev, newAcc]);
    onShowToast(`${cfg.label} hesabı eklendi!`, 'success');
    closeWizard();
  };

  const cfg = selectedPlatform ? PLATFORMS[selectedPlatform] : null;

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="p-5 rounded-2xl glass-panel border border-slate-800 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <Radio className="text-sky-400" size={20} />
            <span>Bağlı Hesaplar</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Telegram, Twitter, WhatsApp ve diğer hesaplarınızın API bilgilerini girin. Gerçek mesaj gönderimi için gerekli.
          </p>
        </div>
        <button
          onClick={openWizard}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition flex items-center space-x-2"
        >
          <Plus size={16} />
          <span>Yeni Hesap Bağla</span>
        </button>
      </div>

      {/* ── Accounts List ── */}
      {accounts.length === 0 ? (
        <div className="p-12 text-center rounded-2xl glass-panel border border-slate-800 border-dashed space-y-4">
          <div className="text-5xl">🔗</div>
          <h3 className="text-sm font-bold text-slate-200">Henüz Hesap Bağlanmadı</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            Yukarıdaki <strong className="text-white">"Yeni Hesap Bağla"</strong> butonuna tıkla. Hangi platformu kullanmak istediğini seç, adım adım ne yapman gerektiği anlatılacak.
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
                        {acc.platform === 'twitter' && acc.isVerified && <BadgeCheck size={14} className="text-sky-400" />}
                      </div>
                      <p className="text-[11px] text-slate-400">{c?.label} · {acc.username || 'Bağlı'}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => { setAccounts(prev => prev.filter(a => a.id !== acc.id)); onShowToast('Hesap silindi.', 'info'); }}
                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 border border-rose-500/20 transition"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="flex items-center space-x-1 text-[11px] text-emerald-400">
                  <CheckCircle2 size={13} />
                  <span>API Bilgileri Kaydedildi</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          WIZARD MODAL
          ════════════════════════════════════════════════════════════ */}
      {wizardStep > 0 && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl my-8">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white">
                  {wizardStep === 1 ? 'Hangi platformu bağlamak istiyorsun?' : `${cfg.label} Bağlantısı`}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {wizardStep === 1 ? 'Adım adım kurulum yapacağız, merak etme.' : cfg.description}
                </p>
              </div>
              <button onClick={closeWizard} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
                <X size={18} />
              </button>
            </div>

            {/* ── Step 1: Platform Selection ── */}
            {wizardStep === 1 && (
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Object.entries(PLATFORMS).map(([key, c]) => (
                  <button
                    key={key}
                    onClick={() => pickPlatform(key)}
                    className="flex items-center space-x-4 p-4 rounded-xl border border-slate-800 hover:border-indigo-500/60 bg-slate-800/40 hover:bg-slate-800 text-left transition group"
                  >
                    <div className={`w-12 h-12 rounded-xl ${c.bg} text-white font-bold flex items-center justify-center text-lg shadow-md shrink-0`}>
                      {c.emoji}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-white">{c.label}</p>
                      <p className="text-[11px] text-slate-400 leading-snug mt-0.5">{c.description}</p>
                    </div>
                    <ChevronRight size={16} className="text-slate-500 group-hover:text-indigo-400 ml-auto shrink-0 transition" />
                  </button>
                ))}
              </div>
            )}

            {/* ── Step 2: Guide + Form ── */}
            {wizardStep === 2 && cfg && (
              <form onSubmit={handleSave}>
                <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">

                  {/* Step-by-step guide */}
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-indigo-300 uppercase tracking-wider">Nasıl Yapılır? (Adım Adım)</p>
                    {cfg.steps.map((step, i) => (
                      <div key={i} className="flex space-x-3">
                        <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-white">{step.title}</p>
                          <p className="text-[11px] text-slate-400 leading-relaxed whitespace-pre-line mt-0.5">{step.body}</p>
                        </div>
                      </div>
                    ))}
                    <a href={cfg.docsUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1 text-[11px] text-indigo-400 hover:underline"
                    >
                      <ExternalLink size={12} />
                      <span>Resmi Döküman →</span>
                    </a>
                  </div>

                  <div className="border-t border-slate-800 pt-4 space-y-3">
                    <p className="text-xs font-bold text-slate-200">Bilgileri Gir</p>

                    {/* Account name */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">Bu Hesaba Bir İsim Ver</label>
                      <input
                        type="text"
                        value={accName}
                        onChange={e => setAccName(e.target.value)}
                        placeholder={`Örn: Benim ${cfg.label} Kanalım`}
                        className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs"
                      />
                    </div>

                    {/* Dynamic fields */}
                    {cfg.fields.map(field => (
                      <div key={field.key}>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">{field.label}</label>
                        {field.help && <p className="text-[10px] text-slate-500 mb-1">{field.help}</p>}
                        {field.type === 'checkbox' ? (
                          <label className="flex items-center space-x-2 p-3 rounded-xl bg-sky-950/30 border border-sky-500/30 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!formFields[field.key]}
                              onChange={e => setFormFields(p => ({ ...p, [field.key]: e.target.checked }))}
                              className="w-4 h-4 accent-sky-500"
                            />
                            <span className="text-[11px] text-sky-200 font-semibold">{field.label}</span>
                          </label>
                        ) : (
                          <div className="relative">
                            <input
                              type={field.secret && !showSecrets[field.key] ? 'password' : 'text'}
                              value={formFields[field.key] || ''}
                              onChange={e => setFormFields(p => ({ ...p, [field.key]: e.target.value }))}
                              placeholder={field.placeholder}
                              className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs pr-10"
                            />
                            {field.secret && (
                              <button type="button"
                                onClick={() => setShowSecrets(p => ({ ...p, [field.key]: !p[field.key] }))}
                                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                              >
                                {showSecrets[field.key] ? <EyeOff size={15} /> : <Eye size={15} />}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Test button (only for Telegram and Discord) */}
                    {(selectedPlatform === 'telegram' || selectedPlatform === 'discord') && (
                      <button type="button" onClick={handleVerify} disabled={isVerifying}
                        className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center space-x-2 transition disabled:opacity-50"
                      >
                        {isVerifying ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        <span>{isVerifying ? 'Test ediliyor...' : '🔌 Bağlantıyı Canlı Test Et'}</span>
                      </button>
                    )}

                    {/* Verify result */}
                    {verifyResult && (
                      <div className={`p-3 rounded-xl text-xs font-semibold ${verifyResult.ok ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/30' : 'bg-rose-950/40 text-rose-300 border border-rose-500/30'}`}>
                        {verifyResult.msg}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer buttons */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800">
                  <button type="button" onClick={() => setWizardStep(1)}
                    className="flex items-center space-x-1 text-xs text-slate-400 hover:text-white transition"
                  >
                    <ChevronLeft size={16} />
                    <span>Geri</span>
                  </button>
                  <div className="flex space-x-2">
                    <button type="button" onClick={closeWizard}
                      className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 transition"
                    >
                      İptal
                    </button>
                    <button type="submit"
                      className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition"
                    >
                      Hesabı Kaydet ✓
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
