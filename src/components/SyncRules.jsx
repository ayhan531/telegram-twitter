import React, { useState } from 'react';
import { 
  Repeat, 
  Plus, 
  Trash2, 
  Check, 
  ArrowRight, 
  SlidersHorizontal, 
  AlertCircle, 
  Sparkles,
  MessageSquare,
  Twitter,
  Linkedin,
  Radio,
  CheckSquare,
  Square,
  ImageIcon,
  BadgeCheck
} from 'lucide-react';

export default function SyncRules({ accounts, rules, setRules, onShowToast }) {
  
  const [editingRule, setEditingRule] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [formState, setFormState] = useState({
    title: '',
    sourceId: accounts[0]?.id || '',
    targetIds: [],
    autoHashtags: '#Teknoloji #Gündem',
    forwardMedia: true,
    respectBlueTick: true,
    characterLimitTwitter: 280,
    autoThreadTwitter: true,
    appendSourceLink: true,
    sourceLinkText: '💬 Telegram\'da Oku: https://t.me/tech_news_tr',
    bannedKeywords: 'spam, reklam123',
  });

  const handleOpenCreateModal = () => {
    setEditingRule(null);
    setFormState({
      title: 'Yeni Çapraz Paylaşım Kuralı',
      sourceId: accounts[0]?.id || '',
      targetIds: [accounts[2]?.id, accounts[3]?.id].filter(Boolean),
      autoHashtags: '#Teknoloji #Yazılım',
      forwardMedia: true,
      respectBlueTick: true,
      characterLimitTwitter: 280,
      autoThreadTwitter: true,
      appendSourceLink: true,
      sourceLinkText: '💬 Telegram\'da Oku: https://t.me/tech_news_tr',
      bannedKeywords: 'spam, illegal',
    });
    setIsModalOpen(true);
  };

  const handleEditRule = (rule) => {
    setEditingRule(rule);
    setFormState({
      title: rule.title,
      sourceId: rule.sourceId,
      targetIds: [...rule.targetIds],
      autoHashtags: rule.options?.autoHashtags || '',
      forwardMedia: rule.options?.forwardMedia ?? true,
      respectBlueTick: rule.options?.respectBlueTick ?? true,
      characterLimitTwitter: rule.options?.characterLimitTwitter || 280,
      autoThreadTwitter: rule.options?.autoThreadTwitter ?? true,
      appendSourceLink: rule.options?.appendSourceLink ?? true,
      sourceLinkText: rule.options?.sourceLinkText || '',
      bannedKeywords: (rule.options?.bannedKeywords || []).join(', '),
    });
    setIsModalOpen(true);
  };

  const toggleTargetId = (id) => {
    setFormState(prev => {
      const exists = prev.targetIds.includes(id);
      return {
        ...prev,
        targetIds: exists ? prev.targetIds.filter(t => t !== id) : [...prev.targetIds, id]
      };
    });
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!formState.sourceId || formState.targetIds.length === 0) {
      onShowToast('Lütfen bir kaynak ve en az bir hedef platform seçin!', 'error');
      return;
    }

    const bannedArr = formState.bannedKeywords
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (editingRule) {
      setRules(prev => prev.map(r => r.id === editingRule.id ? {
        ...r,
        title: formState.title,
        sourceId: formState.sourceId,
        targetIds: formState.targetIds,
        options: {
          ...r.options,
          autoHashtags: formState.autoHashtags,
          forwardMedia: formState.forwardMedia,
          respectBlueTick: formState.respectBlueTick,
          characterLimitTwitter: Number(formState.characterLimitTwitter),
          autoThreadTwitter: formState.autoThreadTwitter,
          appendSourceLink: formState.appendSourceLink,
          sourceLinkText: formState.sourceLinkText,
          bannedKeywords: bannedArr,
        }
      } : r));
      onShowToast('Kural başarıyla güncellendi!', 'success');
    } else {
      const newRule = {
        id: `rule-${Date.now()}`,
        title: formState.title || 'Yeni Çapraz Paylaşım Kuralı',
        active: true,
        sourceId: formState.sourceId,
        targetIds: formState.targetIds,
        options: {
          autoHashtags: formState.autoHashtags,
          forwardMedia: formState.forwardMedia,
          respectBlueTick: formState.respectBlueTick,
          characterLimitTwitter: Number(formState.characterLimitTwitter),
          autoThreadTwitter: formState.autoThreadTwitter,
          appendSourceLink: formState.appendSourceLink,
          sourceLinkText: formState.sourceLinkText,
          bannedKeywords: bannedArr,
          replacementRules: []
        },
        totalSyncedCount: 0,
        lastSyncTime: 'Yeni Oluşturuldu'
      };
      setRules(prev => [newRule, ...prev]);
      onShowToast('Yeni senkronizasyon kuralı eklendi!', 'success');
    }

    setIsModalOpen(false);
  };

  const handleDeleteRule = (id) => {
    if (confirm('Bu kuralı silmek istediğinize emin misiniz?')) {
      setRules(prev => prev.filter(r => r.id !== id));
      onShowToast('Kural silindi.', 'info');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl glass-panel border border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Repeat className="text-indigo-400" />
            <span>Çapraz Paylaşım Kuralları (Görsel & Mavi Tik Yönetimi)</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Telegram kanalınızdan çekilen mesajların görsellerini de aktarın ve Twitter Mavi Tik hesaplarınızda 25.000 karakter desteği ile bölünmeden iletilmesini sağlayın.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-500 hover:from-indigo-500 hover:to-sky-400 text-white text-xs sm:text-sm font-semibold shadow-md transition self-start sm:self-auto"
        >
          <Plus size={16} />
          <span>Yeni Kural Oluştur</span>
        </button>
      </div>

      {/* Rules Grid */}
      <div className="space-y-4">
        {rules.map((rule) => {
          const sourceAcc = accounts.find(a => a.id === rule.sourceId);
          const targetAccs = accounts.filter(a => rule.targetIds.includes(a.id));

          return (
            <div key={rule.id} className="p-5 rounded-2xl glass-panel border border-slate-800 hover:border-indigo-500/40 transition space-y-4">
              
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full ${rule.active ? 'bg-emerald-400 shadow-lg shadow-emerald-500/50' : 'bg-slate-600'}`} />
                  <div>
                    <h3 className="font-bold text-base text-white">{rule.title}</h3>
                    <p className="text-xs text-slate-400">Son Senkron: {rule.lastSyncTime} • Toplam {rule.totalSyncedCount} İleti</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 self-end md:self-auto">
                  <button
                    onClick={() => handleEditRule(rule)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
                  >
                    Düzenle
                  </button>

                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Source -> Targets Visual Mapping */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center text-xs">
                <div className="md:col-span-5 p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center font-bold">
                    <Radio size={16} />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-sky-400 uppercase">KAYNAK KANAL</span>
                    <p className="font-semibold text-white">{sourceAcc ? sourceAcc.name : 'Silinmiş Hesap'}</p>
                    <p className="text-[11px] text-slate-400">{sourceAcc?.username || sourceAcc?.phone}</p>
                  </div>
                </div>

                <div className="md:col-span-2 flex justify-center text-indigo-400">
                  <div className="flex items-center space-x-1 px-2 py-1 rounded bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold">
                    <ArrowRight size={14} />
                    <span>ÇAPRAZ AKTAR</span>
                  </div>
                </div>

                <div className="md:col-span-5 p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase">HEDEF SOSYAL MEDYA HESAPLARI</span>
                  <div className="flex flex-wrap gap-1.5">
                    {targetAccs.map(t => (
                      <span key={t.id} className="px-2 py-1 rounded bg-slate-800 text-slate-200 border border-slate-700 text-[11px] font-medium flex items-center space-x-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        <span>{t.name}</span>
                        {t.platform === 'twitter' && t.isVerified && <BadgeCheck size={12} className="text-sky-400 ml-0.5" />}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Options summary */}
              <div className="flex flex-wrap gap-2 text-[11px] pt-1">
                {rule.options?.forwardMedia && (
                  <span className="px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-medium flex items-center space-x-1">
                    <ImageIcon size={13} />
                    <span>Görsel Medya İletimi: Aktif</span>
                  </span>
                )}
                {rule.options?.respectBlueTick && (
                  <span className="px-2.5 py-1 rounded-md bg-sky-500/10 text-sky-300 border border-sky-500/20 font-medium flex items-center space-x-1">
                    <BadgeCheck size={13} className="text-sky-400" />
                    <span>Mavi Tik (25k Limit) Desteği: Aktif</span>
                  </span>
                )}
                {rule.options?.autoHashtags && (
                  <span className="px-2.5 py-1 rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-medium">
                    🏷️ Hashtagler: {rule.options.autoHashtags}
                  </span>
                )}
              </div>

            </div>
          );
        })}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 my-8 shadow-2xl">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <SlidersHorizontal className="text-indigo-400" />
                <span>{editingRule ? 'Kuralı Düzenle' : 'Yeni Çapraz Paylaşım Kuralı'}</span>
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400">✕</button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs sm:text-sm">
              
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Kural Tanımlayıcı Adı</label>
                <input 
                  type="text"
                  required
                  value={formState.title}
                  onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">KAYNAK KANAL / GRUP</label>
                <select
                  value={formState.sourceId}
                  onChange={(e) => setFormState({ ...formState, sourceId: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white"
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      [{acc.platform.toUpperCase()}] {acc.name} ({acc.username || acc.phone})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">HEDEF PLATFORMLAR</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {accounts.filter(a => a.id !== formState.sourceId).map(acc => {
                    const isSelected = formState.targetIds.includes(acc.id);
                    return (
                      <div 
                        key={acc.id}
                        onClick={() => toggleTargetId(acc.id)}
                        className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between transition ${
                          isSelected ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-slate-950/60 border-slate-800 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          {isSelected ? <CheckSquare size={16} className="text-indigo-400" /> : <Square size={16} />}
                          <span className="font-medium text-xs">{acc.name}</span>
                        </div>
                        <span className="text-[10px] uppercase font-bold text-slate-400">{acc.platform}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Advanced Toggles */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                <h4 className="font-bold text-indigo-400 text-xs uppercase tracking-wider flex items-center space-x-1">
                  <Sparkles size={14} />
                  <span>İçerik, Medya & Mavi Tik Ayarları</span>
                </h4>

                <div className="flex items-center justify-between pt-1">
                  <div>
                    <label className="font-semibold text-slate-200 text-xs flex items-center space-x-1">
                      <ImageIcon size={14} className="text-emerald-400" />
                      <span>Görsel Medya İletimi</span>
                    </label>
                    <p className="text-[10px] text-slate-400">Telegram/WhatsApp'taki fotoğrafları diğer kanallara aynen aktarır</p>
                  </div>
                  <input 
                    type="checkbox"
                    checked={formState.forwardMedia}
                    onChange={(e) => setFormState({ ...formState, forwardMedia: e.target.checked })}
                    className="w-4 h-4 accent-emerald-500 rounded"
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                  <div>
                    <label className="font-semibold text-slate-200 text-xs flex items-center space-x-1">
                      <BadgeCheck size={14} className="text-sky-400" />
                      <span>Twitter Mavi Tik (25.000 Karakter) Desteği</span>
                    </label>
                    <p className="text-[10px] text-slate-400">Mavi tikli hesaplarda metin 280 karakteri aşsa dahi gereksiz yere bölme yapmaz</p>
                  </div>
                  <input 
                    type="checkbox"
                    checked={formState.respectBlueTick}
                    onChange={(e) => setFormState({ ...formState, respectBlueTick: e.target.checked })}
                    className="w-4 h-4 accent-sky-500 rounded"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  İptal
                </button>

                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold shadow-lg"
                >
                  {editingRule ? 'Kaydet' : 'Oluştur'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
