import React, { useState } from 'react';
import { 
  Radio, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Cloud, 
  Smartphone, 
  MessageSquare, 
  Twitter, 
  Linkedin, 
  Copy, 
  ExternalLink,
  ShieldCheck,
  BadgeCheck
} from 'lucide-react';

export default function AccountManager({ 
  accounts, 
  setAccounts, 
  onShowToast 
}) {
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newAccPlatform, setNewAccPlatform] = useState('telegram');
  const [newAccName, setNewAccName] = useState('');
  const [newAccUsername, setNewAccUsername] = useState('');
  const [isVerified, setIsVerified] = useState(true);
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');

  const toggleVerified = (accId) => {
    setAccounts(prev => prev.map(a => a.id === accId ? { ...a, isVerified: !a.isVerified } : a));
    onShowToast('Mavi Tik (X Premium) durumu güncellendi!', 'info');
  };

  const handleAddAccount = (e) => {
    e.preventDefault();
    if (!newAccName) {
      onShowToast('Lütfen bir hesap adı girin!', 'error');
      return;
    }

    const newAcc = {
      id: `acc-${Date.now()}`,
      platform: newAccPlatform,
      name: newAccName,
      username: newAccUsername || `@${newAccName.toLowerCase().replace(/\s+/g, '_')}`,
      type: newAccPlatform === 'telegram' ? 'channel' : 'account',
      status: 'connected',
      isVerified: newAccPlatform === 'twitter' ? isVerified : false,
      botToken: botToken || 'sample_bot_token',
      chatId: chatId || '-100123456789',
      subscribers: 'Mevcut',
      avatarColor: 'bg-indigo-600'
    };

    setAccounts(prev => [...prev, newAcc]);
    setIsAddModalOpen(false);
    setNewAccName('');
    setNewAccUsername('');
    onShowToast('Yeni sosyal medya hesabı bağlandı!', 'success');
  };

  const handleDeleteAccount = (id) => {
    if (confirm('Bu hesabı kaldırmak istediğinize emin misiniz?')) {
      setAccounts(prev => prev.filter(a => a.id !== id));
      onShowToast('Hesap silindi.', 'info');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    onShowToast('Panoya kopyalandı!', 'success');
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="p-6 rounded-2xl glass-panel border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Radio className="text-sky-400" />
            <span>Hesaplar & API Entegrasyon Ayarları</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Telegram Bot Token, Chat ID, Twitter Mavi Tik (25.000 Karakter) ve WhatsApp Cloud API entegrasyonlarınızı yönetin.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-500 hover:from-indigo-500 hover:to-sky-400 text-white text-xs sm:text-sm font-semibold shadow-md transition self-start sm:self-auto"
        >
          <Plus size={16} />
          <span>Yeni Hesap / Kanal Bağla</span>
        </button>
      </div>

      {/* Connected Accounts List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map(acc => (
          <div key={acc.id} className="p-4 rounded-2xl glass-panel border border-slate-800 hover:border-indigo-500/40 transition space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`w-10 h-10 rounded-xl ${acc.avatarColor || 'bg-indigo-600'} text-white flex items-center justify-center font-bold text-sm shadow-md`}>
                  {acc.platform === 'telegram' && <MessageSquare size={20} />}
                  {acc.platform === 'twitter' && <Twitter size={20} />}
                  {acc.platform === 'whatsapp' && <MessageSquare size={20} />}
                  {acc.platform === 'linkedin' && <Linkedin size={20} />}
                </div>
                <div>
                  <div className="flex items-center space-x-1">
                    <h3 className="font-bold text-sm text-white line-clamp-1">{acc.name}</h3>
                    {acc.platform === 'twitter' && acc.isVerified && (
                      <BadgeCheck size={16} className="text-sky-400 shrink-0" title="Mavi Tik / X Premium (25.000 Karakter)" />
                    )}
                  </div>
                  <p className="text-xs text-slate-400">{acc.username || acc.phone}</p>
                </div>
              </div>

              <button
                onClick={() => handleDeleteAccount(acc.id)}
                className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition"
              >
                <Trash2 size={15} />
              </button>
            </div>

            {/* Twitter Mavi Tik Toggle option */}
            {acc.platform === 'twitter' && (
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-1.5">
                  <BadgeCheck size={14} className={acc.isVerified ? 'text-sky-400' : 'text-slate-500'} />
                  <span className="text-slate-300 font-medium">Mavi Tik (25k Limiti)</span>
                </div>
                <button
                  type="button"
                  onClick={() => toggleVerified(acc.id)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    acc.isVerified ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {acc.isVerified ? 'Aktif (25.000)' : 'Pasif (280)'}
                </button>
              </div>
            )}

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-slate-900 border border-slate-800 text-slate-300">
                {acc.platform}
              </span>

              <span className="flex items-center text-emerald-400 text-[11px] font-semibold">
                <CheckCircle2 size={13} className="mr-1" /> Bağlı & Aktif
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Render Deployment Guide */}
      <div className="p-6 rounded-2xl glass-panel border border-indigo-800/40 bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-950 space-y-4">
        <div className="flex items-center space-x-2 text-indigo-300">
          <Cloud size={22} className="text-indigo-400 animate-pulse" />
          <h3 className="text-base font-bold text-white">Render.com Mobil & Bulut Kurulum Rehberi</h3>
        </div>

        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
          Bu projeyi Render.com üzerinde ücretsiz Web Service olarak yayınlayabilir, böylece bilgisayarınız kapalıyken dahi akıllı telefonunuzdan tüm sosyal medya çapraz paylaşımlarınızı 7/24 yönetebilirsiniz.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold">1. GitHub'a Yükleyin</span>
            <p className="text-slate-400 leading-relaxed">
              Masaüstündeki projenizi GitHub reponuza <code className="text-indigo-300">git push</code> yaparak gönderin.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold">2. Render'da Web Service Açın</span>
            <p className="text-slate-400 leading-relaxed">
              Render Dashboard'a gidin, yeni Web Service seçin ve reponuzu bağlayın.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">3. Telefondan Bağlanın</span>
            <p className="text-slate-400 leading-relaxed">
              Render'ın size vereceği <code className="text-emerald-300">https://app.onrender.com</code> linkini telefonunuzun tarayıcısında açın!
            </p>
          </div>
        </div>
      </div>

      {/* Add Account Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Yeni Sosyal Medya Hesabı Ekle</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400">✕</button>
            </div>

            <form onSubmit={handleAddAccount} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Platform Seçin</label>
                <select 
                  value={newAccPlatform}
                  onChange={(e) => setNewAccPlatform(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
                >
                  <option value="telegram">Telegram (Kanal / Grup)</option>
                  <option value="twitter">Twitter / X (Mavi Tik / Standard)</option>
                  <option value="whatsapp">WhatsApp (VIP Duyuru Kanalı)</option>
                  <option value="linkedin">LinkedIn (Şirket / Profil)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Kanal / Hesap Adı</label>
                <input 
                  type="text"
                  required
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  placeholder="Örn: Teknoloji Duyuru Kanalım"
                  className="w-full px-3 py-2 rounded-xl glass-input text-white"
                />
              </div>

              {newAccPlatform === 'twitter' && (
                <div className="p-3 rounded-xl bg-sky-950/30 border border-sky-500/30 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-sky-300">Twitter Mavi Tik (X Premium)</p>
                    <p className="text-[10px] text-slate-400">25.000 Karakter Limiti (Gereksiz Bölme Yapmaz)</p>
                  </div>
                  <input 
                    type="checkbox"
                    checked={isVerified}
                    onChange={(e) => setIsVerified(e.target.checked)}
                    className="w-4 h-4 accent-sky-500 rounded"
                  />
                </div>
              )}

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
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold shadow-md"
                >
                  Hesabı Bağla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
