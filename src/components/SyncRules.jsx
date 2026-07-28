import React, { useState } from 'react';
import { 
  Repeat, 
  Plus, 
  Trash2, 
  Check, 
  ArrowRight, 
  SlidersHorizontal, 
  UserCheck, 
  Radio, 
  CheckSquare, 
  Square, 
  ImageIcon, 
  BadgeCheck,
  Users
} from 'lucide-react';

export default function SyncRules({ accounts, rules, setRules, onShowToast }) {
  
  const [editingRule, setEditingRule] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [formState, setFormState] = useState({
    title: '',
    sourceId: accounts[0]?.id || '',
    allowedSenders: '', // Empty = Everyone, or comma separated User IDs / Usernames
    targetIds: [],
    autoHashtags: '',
    forwardMedia: true,
    respectBlueTick: true,
    bannedKeywords: '',
  });

  const handleOpenCreateModal = () => {
    if (accounts.length === 0) {
      onShowToast('Kural eklemeden önce en az 1 Telegram kanalı ve 1 Hedef hesap bağlamalısınız!', 'error');
      return;
    }
    setEditingRule(null);
    setFormState({
      title: 'Otomatik Çapraz Paylaşım Kuralı',
      sourceId: accounts[0]?.id || '',
      allowedSenders: '', // Empty = All users allowed
      targetIds: accounts.filter(a => a.id !== accounts[0]?.id).map(a => a.id),
      autoHashtags: '',
      forwardMedia: true,
      respectBlueTick: true,
      bannedKeywords: '',
    });
    setIsModalOpen(true);
  };

  const handleEditRule = (rule) => {
    setEditingRule(rule);
    setFormState({
      title: rule.title,
      sourceId: rule.sourceId,
      allowedSenders: rule.options?.allowedSenders || '',
      targetIds: [...rule.targetIds],
      autoHashtags: rule.options?.autoHashtags || '',
      forwardMedia: rule.options?.forwardMedia ?? true,
      respectBlueTick: rule.options?.respectBlueTick ?? true,
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
      onShowToast('Lütfen bir kaynak kanal ve en az bir hedef hesap seçin!', 'error');
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
          allowedSenders: formState.allowedSenders.trim(),
          autoHashtags: formState.autoHashtags.trim(),
          forwardMedia: formState.forwardMedia,
          respectBlueTick: formState.respectBlueTick,
          bannedKeywords: bannedArr,
        }
      } : r));
      onShowToast('Kural güncellendi!', 'success');
    } else {
      const newRule = {
        id: `rule-${Date.now()}`,
        title: formState.title || 'Otomatik Çapraz Paylaşım Kuralı',
        active: true,
        sourceId: formState.sourceId,
        targetIds: formState.targetIds,
        options: {
          allowedSenders: formState.allowedSenders.trim(),
          autoHashtags: formState.autoHashtags.trim(),
          forwardMedia: formState.forwardMedia,
          respectBlueTick: formState.respectBlueTick,
          bannedKeywords: bannedArr,
        },
        totalSyncedCount: 0,
        lastSyncTime: 'Aktif'
      };
      setRules(prev => [newRule, ...prev]);
      onShowToast('Yeni çapraz paylaşım kuralı eklendi!', 'success');
    }

    setIsModalOpen(false);
  };

  const handleDeleteRule = (id) => {
    setRules(prev => prev.filter(r => r.id !== id));
    onShowToast('Kural silindi.', 'info');
  };

  const toggleRuleActive = (id) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, active: !r.active } : r));
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="p-5 rounded-2xl glass-panel border border-slate-800 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <Repeat className="text-indigo-400" size={20} />
            <span>Otomatik Çapraz Paylaşım Kuralları</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Telegram kanallarınızdaki belirli kişilerin veya herkesin attığı mesajları hedef Twitter, WhatsApp ve Telegram hesaplarınıza aktarın.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition flex items-center space-x-1.5"
        >
          <Plus size={16} />
          <span>Yeni Kural Ekle</span>
        </button>
      </div>

      {/* Rules List */}
      {rules.length === 0 ? (
        <div className="p-12 text-center rounded-2xl glass-panel border border-slate-800 space-y-3">
          <Repeat size={36} className="mx-auto text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-200">Henüz Çapraz Paylaşım Kuralı Eklemediniz</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Telegram kanalınızdan mesaj atan kişilerin içeriklerini diğer Twitter veya sosyal medya hesaplarınıza otomatik yönlendirmek için kural oluşturun.
          </p>
          <button
            onClick={handleOpenCreateModal}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold"
          >
            + İlk Kuralı Oluştur
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {rules.map((rule) => {
            const sourceAcc = accounts.find(a => a.id === rule.sourceId);
            const targetAccs = accounts.filter(a => rule.targetIds.includes(a.id));
            const sendersText = rule.options?.allowedSenders ? rule.options.allowedSenders : 'Herkes (Kısıtlama Yok)';

            return (
              <div key={rule.id} className="p-5 rounded-2xl glass-panel border border-slate-800 space-y-4">
                
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => toggleRuleActive(rule.id)}
                      className={`w-10 h-5 rounded-full p-0.5 transition-colors ${rule.active ? 'bg-emerald-500' : 'bg-slate-700'}`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${rule.active ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                    <div>
                      <h3 className="font-bold text-sm text-white">{rule.title}</h3>
                      <p className="text-[11px] text-slate-400">Aktarılan Mesaj: {rule.totalSyncedCount} Adet</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleEditRule(rule)}
                      className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700"
                    >
                      Düzenle
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Details summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">KAYNAK KANAL</span>
                    <p className="font-semibold text-white mt-0.5">{sourceAcc ? sourceAcc.name : 'Seçilmedi'}</p>
                    <p className="text-[11px] text-sky-400">{sourceAcc?.username || sourceAcc?.chatId}</p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">MESAJ ATAN KİŞİ FİLTRESİ</span>
                    <p className="font-semibold text-indigo-300 mt-0.5 flex items-center space-x-1">
                      <UserCheck size={14} />
                      <span>{sendersText}</span>
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">HEDEF HESAPLAR ({targetAccs.length})</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {targetAccs.map(t => (
                        <span key={t.id} className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[11px] border border-slate-700">
                          {t.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">
                {editingRule ? 'Kuralı Düzenle' : 'Yeni Çapraz Paylaşım Kuralı'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400">✕</button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Kural Adı</label>
                <input 
                  type="text"
                  required
                  value={formState.title}
                  onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                  placeholder="Örn: Telegram Kanaldan Twitter Hesabıma Otomatik Aktarım"
                  className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs"
                />
              </div>

              {/* Source Telegram Account */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">1. Kaynak Telegram Kanalı / Grubu</label>
                <select
                  value={formState.sourceId}
                  onChange={(e) => setFormState({ ...formState, sourceId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs"
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      [{acc.platform.toUpperCase()}] {acc.name} ({acc.username || acc.chatId})
                    </option>
                  ))}
                </select>
              </div>

              {/* Allowed Senders Filter */}
              <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/30 space-y-1.5">
                <label className="font-bold text-indigo-300 flex items-center space-x-1">
                  <Users size={14} />
                  <span>2. Mesaj Atan Kişi Filtresi (User ID / Kullanıcı Adı)</span>
                </label>
                <input 
                  type="text"
                  value={formState.allowedSenders}
                  onChange={(e) => setFormState({ ...formState, allowedSenders: e.target.value })}
                  placeholder="Örn: 123456789, @admin, @cem (Boş bırakırsanız HERKESİN mesajı aktarılır)"
                  className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs"
                />
                <p className="text-[10px] text-slate-400">
                  💡 Boş bırakırsanız gruptan veya kanaldan atılan tüm mesajlar iletilir. Sadece belirli yöneticilerin attıklarını aktarmak için ID veya kullanıcı adı yazın.
                </p>
              </div>

              {/* Targets */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">3. Hedef Hesaplar (Mesajın Gönderileceği Yerin Tamamı)</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {accounts.filter(a => a.id !== formState.sourceId).map(acc => {
                    const isSelected = formState.targetIds.includes(acc.id);
                    return (
                      <div 
                        key={acc.id}
                        onClick={() => toggleTargetId(acc.id)}
                        className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between transition ${
                          isSelected ? 'bg-indigo-600/20 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          {isSelected ? <CheckSquare size={16} className="text-indigo-400" /> : <Square size={16} />}
                          <span className="font-medium">{acc.name}</span>
                        </div>
                        <span className="text-[10px] uppercase font-bold text-slate-400">{acc.platform}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Hashtag & Options */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Otomatik Eklenen Hashtagler</label>
                  <input 
                    type="text"
                    value={formState.autoHashtags}
                    onChange={(e) => setFormState({ ...formState, autoHashtags: e.target.value })}
                    placeholder="#Teknoloji #Haber"
                    className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-slate-300">Görsel Medyayı Da İlet</span>
                  <input 
                    type="checkbox"
                    checked={formState.forwardMedia}
                    onChange={(e) => setFormState({ ...formState, forwardMedia: e.target.checked })}
                    className="w-4 h-4 accent-indigo-600 rounded"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold shadow-md"
                >
                  {editingRule ? 'Kaydet' : 'Kuralı Oluştur'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
