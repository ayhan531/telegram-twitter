import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Clock, Loader2, Image as ImageIcon } from 'lucide-react';

export default function ScheduledTweets({ accounts, onShowToast }) {
  const [tweets, setTweets] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const twitterAccounts = accounts.filter(a => a.platform === 'twitter');

  const [form, setForm] = useState({
    accountId: twitterAccounts[0]?.id || '',
    text: '',
    hashtags: [],
    hashtagInput: '',
    mediaBase64: null,
    scheduleMode: 'once', // once, daily, interval
    datetime: '',
    times: '',
    intervalMinutes: 60,
    humanLike: true
  });

  useEffect(() => {
    fetch('/api/scheduled-tweets')
      .then(r => r.json())
      .then(d => {
        if (d.tweets) setTweets(d.tweets);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!form.accountId || !form.text) {
      return onShowToast('Lütfen hesap ve tweet metnini girin.', 'error');
    }

    try {
      const res = await fetch('/api/scheduled-tweets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, id: `sch-${Date.now()}`, status: 'pending' })
      });
      const data = await res.json();
      setTweets([...tweets, data.tweet || { ...form, id: `sch-${Date.now()}`, status: 'pending' }]);
      setShowForm(false);
      onShowToast('Zamanlanmış tweet eklendi.', 'success');
    } catch (e) {
      onShowToast('Hata oluştu.', 'error');
    }
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`/api/scheduled-tweets/${id}`, { method: 'DELETE' });
      setTweets(tweets.filter(t => t.id !== id));
      onShowToast('Tweet silindi.', 'info');
    } catch (e) {}
  };

  const handleAddHashtag = (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === ',') {
      e.preventDefault();
      const val = form.hashtagInput.trim().replace(/^#/, '');
      if (val && form.hashtags.length < 10 && !form.hashtags.includes(val)) {
        setForm({ ...form, hashtags: [...form.hashtags, val], hashtagInput: '' });
      }
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setForm({ ...form, mediaBase64: ev.target.result });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl glass-panel border border-slate-800 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Clock className="text-indigo-400" size={22} />
            <span>Zamanlanmış Tweetler</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            İleri tarihli, düzenli veya aralıklı tweetlerinizi ayarlayın.
          </p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition flex items-center space-x-2">
          <Plus size={16} /><span>Yeni Zamanlı Tweet</span>
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base">Yeni Zamanlı Tweet</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Hesap</label>
                <select value={form.accountId} onChange={e => setForm({...form, accountId: e.target.value})}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs">
                  <option value="">Seçiniz...</option>
                  {twitterAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.username})</option>)}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Tweet Metni ({form.text.length} / 280)</label>
                <textarea rows="3" value={form.text} onChange={e => setForm({...form, text: e.target.value})} maxLength={280}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs resize-none"></textarea>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Hashtagler</label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {form.hashtags.map((tag, i) => (
                    <span key={i} className="px-2 py-1 rounded bg-indigo-900/60 text-indigo-200 text-[10px] flex items-center gap-1">
                      #{tag} <button onClick={() => setForm({...form, hashtags: form.hashtags.filter(x => x !== tag)})} className="text-rose-400 hover:text-rose-300">✕</button>
                    </span>
                  ))}
                </div>
                <input type="text" value={form.hashtagInput} onChange={e => setForm({...form, hashtagInput: e.target.value})} onKeyDown={handleAddHashtag}
                  placeholder="#bitcoin #crypto"
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs" />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Görsel (Opsiyonel)</label>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="text-xs text-slate-400" />
                {form.mediaBase64 && <img src={form.mediaBase64} alt="Preview" className="h-16 mt-2 rounded border border-slate-700" />}
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Zamanlama Modu</label>
                <select value={form.scheduleMode} onChange={e => setForm({...form, scheduleMode: e.target.value})}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs">
                  <option value="once">Bir Kerelik</option>
                  <option value="daily">Her Gün</option>
                  <option value="interval">Aralıklı</option>
                </select>
              </div>

              {form.scheduleMode === 'once' && (
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Tarih ve Saat</label>
                  <input type="datetime-local" value={form.datetime} onChange={e => setForm({...form, datetime: e.target.value})}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs" />
                </div>
              )}

              {form.scheduleMode === 'daily' && (
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Saatler (Örn: 09:00, 18:00)</label>
                  <input type="text" value={form.times} onChange={e => setForm({...form, times: e.target.value})}
                    placeholder="09:00, 18:00"
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs" />
                </div>
              )}

              {form.scheduleMode === 'interval' && (
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Aralık (Dakika)</label>
                  <input type="number" min="1" value={form.intervalMinutes} onChange={e => setForm({...form, intervalMinutes: parseInt(e.target.value) || 60})}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs" />
                </div>
              )}

              <div className="pt-2">
                <label className="flex items-center space-x-2 text-xs text-slate-300">
                  <input type="checkbox" checked={form.humanLike} onChange={e => setForm({...form, humanLike: e.target.checked})} />
                  <span>Human-like paylaşımlar (1-10 dk rastgele gecikme ekle)</span>
                </label>
              </div>
            </div>

            <button onClick={handleSave} className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition">Kaydet</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 size={32} className="animate-spin text-indigo-500" /></div>
      ) : tweets.length === 0 ? (
        <div className="p-12 text-center rounded-2xl glass-panel border border-slate-800 border-dashed space-y-4">
          <p className="text-xs text-slate-400">Henüz zamanlanmış tweet yok.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tweets.map(tweet => (
            <div key={tweet.id} className="p-4 rounded-xl glass-panel border border-slate-700 flex justify-between items-center bg-slate-900/40">
              <div className="min-w-0 flex-1 pr-4">
                <p className="text-xs text-sky-400 font-bold mb-1">{twitterAccounts.find(a => a.id === tweet.accountId)?.username || tweet.accountId}</p>
                <p className="text-sm text-white truncate">{tweet.text.slice(0, 60)}{tweet.text.length > 60 ? '...' : ''}</p>
                <p className="text-[10px] text-slate-500 mt-1">
                  Mod: {tweet.scheduleMode} 
                  {tweet.scheduleMode === 'once' && ` - ${tweet.datetime}`}
                  {tweet.scheduleMode === 'daily' && ` - ${tweet.times}`}
                  {tweet.scheduleMode === 'interval' && ` - ${tweet.intervalMinutes} dk`}
                </p>
              </div>
              <div className="flex items-center space-x-3 shrink-0">
                <span className={`px-2 py-1 rounded-full text-[10px] font-bold border ${
                  tweet.status === 'sent' ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30' :
                  tweet.status === 'failed' ? 'bg-rose-950/60 text-rose-300 border-rose-500/30' :
                  'bg-amber-950/60 text-amber-300 border-amber-500/30'
                }`}>
                  {tweet.status === 'sent' ? 'Gönderildi' : tweet.status === 'failed' ? 'Hata' : 'Bekliyor'}
                </span>
                <button onClick={() => handleDelete(tweet.id)} className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-950/40">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
