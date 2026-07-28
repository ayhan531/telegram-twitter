import React, { useState } from 'react';
import { 
  Radio, Plus, Trash2, CheckCircle2, AlertCircle, 
  Cloud, MessageSquare, Twitter, Linkedin, Copy, 
  BadgeCheck, Eye, EyeOff, ExternalLink, Loader2,
  Send
} from 'lucide-react';

const PLATFORM_CONFIG = {
  telegram: {
    label: 'Telegram Bot',
    color: 'bg-sky-500',
    icon: '✈️',
    description: 'BotFather\'dan aldığınız Bot Token ile Telegram kanalı veya grubuna bağlanır.',
    fields: [
      { key: 'botToken', label: 'Bot Token (BotFather\'dan alın)', placeholder: '7123456789:AAGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', secret: true },
      { key: 'chatId', label: 'Chat ID veya Channel Username', placeholder: '-100123456789 ya da @kanaladi', secret: false },
    ],
    docsUrl: 'https://core.telegram.org/bots#how-do-i-create-a-bot',
    guide: '1. Telegram\'da @BotFather\'a mesaj atın\n2. /newbot komutunu gönderin\n3. Bot adı ve kullanıcı adı belirleyin\n4. Aldığınız tokeni buraya girin\n5. Botu kanalınıza/grubunuza Admin olarak ekleyin\n6. Chat ID almak için @userinfobot\'a kanalı forward edin',
  },
  twitter: {
    label: 'Twitter / X',
    color: 'bg-neutral-800',
    icon: '𝕏',
    description: 'Twitter Developer Portal\'dan API v2 kimlik bilgilerinizi girin. Tweet atabilmek için Elevated Access gerekir.',
    fields: [
      { key: 'apiKey', label: 'API Key (Consumer Key)', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxx', secret: true },
      { key: 'apiSecret', label: 'API Secret (Consumer Secret)', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', secret: true },
      { key: 'accessToken', label: 'Access Token', placeholder: '000000000-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', secret: true },
      { key: 'accessTokenSecret', label: 'Access Token Secret', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', secret: true },
      { key: 'username', label: 'Twitter Kullanıcı Adı', placeholder: '@kullanici_adi', secret: false },
      { key: 'isVerified', label: 'Mavi Tik (X Premium / 25.000 karakter)', type: 'checkbox', secret: false },
    ],
    docsUrl: 'https://developer.twitter.com/en/portal/dashboard',
    guide: '1. developer.twitter.com adresine gidin\n2. Proje & App oluşturun\n3. "Keys and Tokens" bölümünden tüm bilgileri kopyalayın\n4. Tweet atmak için Free Tier yeterlidir (aylık 1500 tweet limiti)',
  },
  whatsapp: {
    label: 'WhatsApp Business API',
    color: 'bg-emerald-600',
    icon: '💬',
    description: 'Meta Business\'tan WhatsApp Cloud API erişimi ile gerçek mesaj gönderilir.',
    fields: [
      { key: 'accessToken', label: 'Permanent Access Token (Meta Business)', placeholder: 'EAAxxxxxxxxxxxxxxxxxxxxxxxxx', secret: true },
      { key: 'phoneNumberId', label: 'Phone Number ID', placeholder: '1234567890', secret: false },
      { key: 'recipientPhone', label: 'Mesaj Gönderilecek Telefon Numarası', placeholder: '+905321234567', secret: false },
    ],
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
    guide: '1. Meta Business hesabı açın\n2. developers.facebook.com/apps adresine gidin\n3. WhatsApp ürününü ekleyin\n4. Phone Number ID ve Access Token\'ı kopyalayın',
  },
  linkedin: {
    label: 'LinkedIn',
    color: 'bg-blue-700',
    icon: 'in',
    description: 'LinkedIn API ile organizasyon veya kişisel profilinizde paylaşım yapılır.',
    fields: [
      { key: 'accessToken', label: 'OAuth2 Access Token', placeholder: 'AQxxxxxxxxxxxxxxxxxxxxxxxx', secret: true },
      { key: 'authorUrn', label: 'Person veya Organization URN', placeholder: 'urn:li:person:xxxxxxxxxx veya urn:li:organization:xxxxxxxx', secret: false },
    ],
    docsUrl: 'https://www.linkedin.com/developers/apps',
    guide: '1. linkedin.com/developers/apps adresine gidin\n2. Yeni uygulama oluşturun\n3. "Share on LinkedIn" ve "Sign In with LinkedIn" izinlerini ekleyin\n4. OAuth2 token ile yetkili erişim alın',
  },
  discord: {
    label: 'Discord Webhook',
    color: 'bg-indigo-600',
    icon: '🎮',
    description: 'Discord kanalınıza Webhook URL ekleyerek doğrudan mesaj gönderebilirsiniz.',
    fields: [
      { key: 'webhookUrl', label: 'Discord Webhook URL', placeholder: 'https://discord.com/api/webhooks/xxxxxx/yyyyyy', secret: true },
      { key: 'username', label: 'Bot Görüntü Adı (Opsiyonel)', placeholder: 'OmniSync Bot', secret: false },
    ],
    docsUrl: 'https://discord.com/developers/docs/resources/webhook',
    guide: '1. Discord kanalına sağ tıklayın\n2. Kanal Ayarları > Entegrasyonlar > Webhook\n3. "Yeni Webhook" oluşturun\n4. URL\'yi kopyalayın ve buraya yapıştırın',
  },
};

export default function AccountManager({ accounts, setAccounts, onShowToast }) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState('telegram');
  const [formFields, setFormFields] = useState({});
  const [accName, setAccName] = useState('');
  const [showSecrets, setShowSecrets] = useState({});
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  const openAddModal = (platform) => {
    setSelectedPlatform(platform);
    setFormFields({});
    setAccName('');
    setVerifyResult(null);
    setIsAddModalOpen(true);
  };

  const handleVerify = async () => {
    setIsVerifying(true);
    setVerifyResult(null);

    try {
      if (selectedPlatform === 'telegram') {
        const res = await fetch('/api/telegram/test-bot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ botToken: formFields.botToken })
        });
        const data = await res.json();
        if (data.success) {
          setVerifyResult({ ok: true, message: `✅ Bot doğrulandı: ${data.botInfo.name} (${data.botInfo.username})` });
        } else {
          setVerifyResult({ ok: false, message: `❌ Hata: ${data.error}` });
        }
      } else if (selectedPlatform === 'discord') {
        const res = await fetch('/api/discord/test-webhook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ webhookUrl: formFields.webhookUrl })
        });
        const data = await res.json();
        setVerifyResult({ ok: data.success, message: data.success ? '✅ Discord Webhook test mesajı gönderildi!' : `❌ ${data.error}` });
      } else {
        setVerifyResult({ ok: true, message: '✅ Bilgiler kaydedildi. Gerçek API denemesi gönderimde yapılacaktır.' });
      }
    } catch (err) {
      setVerifyResult({ ok: false, message: `❌ Sunucu hatası: ${err.message}` });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!accName) {
      onShowToast('Hesap adı boş olamaz!', 'error');
      return;
    }

    const newAcc = {
      id: `acc-${Date.now()}`,
      platform: selectedPlatform,
      name: accName,
      username: formFields.username || formFields.chatId || '',
      type: selectedPlatform === 'telegram' ? 'channel' : 'account',
      status: 'connected',
      isVerified: formFields.isVerified ?? false,
      credentials: { ...formFields },
      avatarColor: {
        telegram: 'bg-sky-500',
        twitter: 'bg-neutral-700',
        whatsapp: 'bg-emerald-600',
        linkedin: 'bg-blue-700',
        discord: 'bg-indigo-600'
      }[selectedPlatform] || 'bg-indigo-600'
    };

    setAccounts(prev => [...prev, newAcc]);
    setIsAddModalOpen(false);
    onShowToast(`${PLATFORM_CONFIG[selectedPlatform].label} hesabı başarıyla eklendi!`, 'success');
  };

  const handleDelete = (id) => {
    setAccounts(prev => prev.filter(a => a.id !== id));
    onShowToast('Hesap kaldırıldı.', 'info');
  };

  const config = PLATFORM_CONFIG[selectedPlatform];

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="p-5 rounded-2xl glass-panel border border-slate-800">
        <h2 className="text-lg font-bold text-white flex items-center space-x-2">
          <Radio className="text-sky-400" size={20} />
          <span>Hesap & API Bağlantıları</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Mesaj gönderebilmek için her platformun gerçek API anahtarlarını buradan girin. Girilen bilgilerle gerçek mesaj gönderimi yapılır.
        </p>
      </div>

      {/* Platform Add Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Object.entries(PLATFORM_CONFIG).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => openAddModal(key)}
            className="p-4 rounded-xl glass-card border border-slate-800 hover:border-indigo-500/50 text-center space-y-2 transition group"
          >
            <div className={`w-10 h-10 rounded-xl ${cfg.color} text-white text-sm font-bold flex items-center justify-center mx-auto shadow-md`}>
              {cfg.icon}
            </div>
            <p className="text-xs font-semibold text-slate-300 group-hover:text-white">{cfg.label}</p>
            <p className="text-[10px] text-indigo-400 font-semibold">+ Bağla</p>
          </button>
        ))}
      </div>

      {/* Connected Accounts List */}
      {accounts.length === 0 ? (
        <div className="p-10 text-center rounded-2xl glass-panel border border-slate-800 space-y-3">
          <Radio size={32} className="mx-auto text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-300">Henüz Bağlı Hesap Yok</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            Yukarıdan bir platform seçerek API bilgilerinizi girin. Bot token, access token veya webhook URL'nizi ekleyin. Gerçek mesaj gönderimi için gereklidir.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map(acc => {
            const cfg = PLATFORM_CONFIG[acc.platform];
            return (
              <div key={acc.id} className="p-4 rounded-2xl glass-panel border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-xl ${acc.avatarColor} text-white text-sm font-bold flex items-center justify-center shadow-md`}>
                      {cfg?.icon}
                    </div>
                    <div>
                      <div className="flex items-center space-x-1">
                        <h3 className="font-bold text-sm text-white">{acc.name}</h3>
                        {acc.platform === 'twitter' && acc.isVerified && (
                          <BadgeCheck size={14} className="text-sky-400" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">{acc.username || acc.credentials?.chatId || acc.credentials?.phoneNumberId}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(acc.id)}
                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800">
                  <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-slate-900 border border-slate-800 text-slate-300">
                    {cfg?.label}
                  </span>
                  <span className="flex items-center space-x-1 text-emerald-400 text-[11px] font-semibold">
                    <CheckCircle2 size={12} />
                    <span>API Bilgileri Kayıtlı</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Render Deploy Card */}
      <div className="p-5 rounded-2xl bg-indigo-950/30 border border-indigo-800/30 text-xs space-y-2">
        <div className="flex items-center space-x-2">
          <Cloud size={18} className="text-indigo-400" />
          <p className="font-bold text-indigo-200">Önemli Not: API Bilgileri Güvenliği</p>
        </div>
        <p className="text-slate-400 leading-relaxed">
          Girdiğiniz API anahtarları yalnızca tarayıcınızın yerel depolama alanında (LocalStorage) tutulur. Render.com'a deploy ettiğinizde güvenli backend depolama için Environment Variables kullanmanız önerilir.
        </p>
      </div>

      {/* Add Account Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl my-8">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-3">
                <div className={`w-9 h-9 rounded-xl ${config.color} text-white text-sm font-bold flex items-center justify-center`}>
                  {config.icon}
                </div>
                <h3 className="text-base font-bold text-white">{config.label} Bağlantısı</h3>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            {/* Description */}
            <p className="text-xs text-slate-400 leading-relaxed">{config.description}</p>

            {/* Docs Link */}
            <a
              href={config.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1 text-[11px] text-indigo-400 hover:underline"
            >
              <ExternalLink size={12} />
              <span>Resmi Kurulum Dökümanı</span>
            </a>

            {/* Guide */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 whitespace-pre-wrap leading-relaxed">
              {config.guide}
            </div>

            {/* Form */}
            <form onSubmit={handleSave} className="space-y-3 text-xs">

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Hesap Tanımlayıcı Adı</label>
                <input
                  type="text"
                  required
                  value={accName}
                  onChange={e => setAccName(e.target.value)}
                  placeholder={`Örn: Benim ${config.label} Hesabım`}
                  className="w-full px-3 py-2 rounded-xl glass-input text-white"
                />
              </div>

              {config.fields.map(field => (
                <div key={field.key}>
                  <label className="block font-semibold text-slate-300 mb-1">{field.label}</label>
                  {field.type === 'checkbox' ? (
                    <div className="flex items-center space-x-2 p-3 rounded-xl bg-sky-950/30 border border-sky-500/30">
                      <input
                        type="checkbox"
                        checked={formFields[field.key] ?? false}
                        onChange={e => setFormFields(prev => ({ ...prev, [field.key]: e.target.checked }))}
                        className="w-4 h-4 accent-sky-500"
                      />
                      <span className="text-sky-300 font-semibold text-[11px]">Mavi Tik / X Premium aktif (25.000 karakter limiti, bölünme olmaz)</span>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type={field.secret && !showSecrets[field.key] ? 'password' : 'text'}
                        value={formFields[field.key] || ''}
                        onChange={e => setFormFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                        className="w-full px-3 py-2 rounded-xl glass-input text-white pr-9"
                      />
                      {field.secret && (
                        <button
                          type="button"
                          onClick={() => setShowSecrets(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                          className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
                        >
                          {showSecrets[field.key] ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Live Verify Button */}
              {(selectedPlatform === 'telegram' || selectedPlatform === 'discord') && (
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={isVerifying}
                  className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center justify-center space-x-2 transition"
                >
                  {isVerifying ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  <span>{isVerifying ? 'Test Ediliyor...' : 'Bağlantıyı Canlı Test Et'}</span>
                </button>
              )}

              {/* Verify Result */}
              {verifyResult && (
                <div className={`p-3 rounded-xl text-xs font-semibold ${verifyResult.ok ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/30' : 'bg-rose-950/40 text-rose-300 border border-rose-500/30'}`}>
                  {verifyResult.message}
                </div>
              )}

              {/* Save Button */}
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md"
                >
                  Hesabı Kaydet
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
