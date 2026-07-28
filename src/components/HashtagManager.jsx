import React, { useState } from 'react';
import { 
  Hash, 
  Plus, 
  Trash2, 
  Edit3, 
  SlidersHorizontal, 
  Check, 
  Sparkles,
  Search,
  ShieldAlert
} from 'lucide-react';

export default function HashtagManager({ 
  hashtagPresets, 
  setHashtagPresets, 
  onShowToast 
}) {
  
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetTags, setNewPresetTags] = useState('');
  const [bannedKeywords, setBannedKeywords] = useState('spam, illegal, kumar, dolandırıcı');

  const handleAddPreset = (e) => {
    e.preventDefault();
    if (!newPresetName || !newPresetTags) {
      onShowToast('Lütfen paket adı ve etiketleri girin!', 'error');
      return;
    }

    const tagsArr = newPresetTags
      .split(' ')
      .map(t => t.trim())
      .filter(Boolean)
      .map(t => t.startsWith('#') ? t : `#${t}`);

    const newPreset = {
      id: `h-${Date.now()}`,
      name: newPresetName,
      tags: tagsArr
    };

    setHashtagPresets(prev => [...prev, newPreset]);
    setNewPresetName('');
    setNewPresetTags('');
    onShowToast('Yeni hashtag paketi eklendi!', 'success');
  };

  const handleDeletePreset = (id) => {
    setHashtagPresets(prev => prev.filter(p => p.id !== id));
    onShowToast('Hashtag paketi silindi.', 'info');
  };

  const handleSaveBannedKeywords = () => {
    onShowToast('Yasaklı kelime filtreleri kaydedildi!', 'success');
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="p-6 rounded-2xl glass-panel border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Hash className="text-indigo-400" />
            <span>Hashtag Paketi & Kelime Filtre Yönetimi</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Sosyal medya hesaplarınıza otomatik eklenecek hashtag paketlerini tanımlayın ve spam mesajları engelleyen yasaklı kelime filtrelerini yönetin.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Create New Hashtag Preset (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          
          <div className="p-5 rounded-2xl glass-panel border border-slate-800 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <Plus size={18} className="text-indigo-400" />
              <span>Yeni Hashtag Paketi Ekle</span>
            </h3>

            <form onSubmit={handleAddPreset} className="space-y-3 text-xs sm:text-sm">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Paket Adı</label>
                <input 
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="Örn: Kripto & Ekonomi"
                  className="w-full px-3.5 py-2.5 rounded-xl glass-input text-white text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Hashtagler (Boşlukla ayırın)</label>
                <textarea 
                  rows={3}
                  value={newPresetTags}
                  onChange={(e) => setNewPresetTags(e.target.value)}
                  placeholder="#Kripto #Ekonomi #Borsa #Bitcoin"
                  className="w-full p-3.5 rounded-xl glass-input text-white text-xs resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-600/30 transition"
              >
                + Paketi Kaydet
              </button>
            </form>
          </div>

          {/* Banned Keywords Card */}
          <div className="p-5 rounded-2xl glass-panel border border-slate-800 space-y-3">
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <ShieldAlert size={18} className="text-rose-400" />
              <span>Global Yasaklı Kelime Filtresi</span>
            </h3>
            <p className="text-xs text-slate-400">
              Telegram veya WhatsApp'tan çekilen mesajlarda bu kelimeler bulunursa aktarım otomatik olarak engellenir.
            </p>

            <textarea 
              rows={3}
              value={bannedKeywords}
              onChange={(e) => setBannedKeywords(e.target.value)}
              className="w-full p-3 rounded-xl glass-input text-xs text-white resize-none"
            />

            <button
              onClick={handleSaveBannedKeywords}
              className="w-full py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 font-semibold text-xs transition"
            >
              Filtreleri Güncelle
            </button>
          </div>

        </div>

        {/* Right Column: Existing Hashtag Presets Grid (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-5 rounded-2xl glass-panel border border-slate-800 space-y-4">
            <h3 className="text-base font-bold text-white">Mevcut Hashtag Paketleri ({hashtagPresets.length})</h3>

            <div className="space-y-3">
              {hashtagPresets.map(preset => (
                <div key={preset.id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <h4 className="font-bold text-sm text-indigo-300">{preset.name}</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {preset.tags.map((tag, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-xs font-mono">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeletePreset(preset.id)}
                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
