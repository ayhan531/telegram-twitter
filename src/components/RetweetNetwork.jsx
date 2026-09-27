import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Repeat, RefreshCw, Loader2 } from 'lucide-react';

export default function RetweetNetwork({ accounts, onShowToast }) {
  const [rules, setRules] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const twitterAccounts = accounts.filter(a => a.platform === 'twitter');

  const [form, setForm] = useState({
    title: 'Yeni RT Kuralı',
    sourceAccount: twitterAccounts[0]?.id || '',
    retweeterAccounts: [],
    delayMinutes: 5,
    enabled: true
  });

  useEffect(() => {
    fetch('/api/retweet-rules')
      .then(r => r.json())
      .then(d => {
        if (d.rules) setRules(d.rules);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!form.title || !form.sourceAccount || form.retweeterAccounts.length === 0) {
      return onShowToast('Lütfen tüm alanları doldurun.', 'error');
    }

    try {
      const res = await fetch('/api/retweet-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, id: `rt-${Date.now()}` })
      });
      const data = await res.json();
      setRules([...rules, data.rule || { ...form, id: `rt-${Date.now()}` }]);
      setShowForm(false);
      onShowToast('Retweet kuralı eklendi.', 'success');
    } catch (e) {
      onShowToast('Hata oluştu.', 'error');
    }
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`/api/retweet-rules/${id}`, { method: 'DELETE' });
      setRules(rules.filter(r => r.id !== id));
      onShowToast('Kural silindi.', 'info');
    } catch (e) {}
  };

  const handleToggle = async (rule) => {
    const updated = { ...rule, enabled: !rule.enabled };
    try {
      await fetch(`/api/retweet-rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      setRules(rules.map(r => r.id === rule.id ? updated : r));
    } catch (e) {}
  };

  const manualTrigger = async (rule) => {
    onShowToast('Retweet tetiklendi...', 'info');
  };

  const handleCheckbox = (id) => {
    setForm(prev => {
      const isSelected = prev.retweeterAccounts.includes(id);
      return {
        ...prev,
        retweeterAccounts: isSelected 
          ? prev.retweeterAccounts.filter(x => x !== id)
          : [...prev.retweeterAccounts, id]
      };
    });
  };

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl glass-panel border border-slate-800 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <RefreshCw className="text-indigo-400" size={22} />
            <span>Retweet Ağı</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Belirli bir hesabın tweetlerini ağdaki diğer hesaplara otomatik retweet yaptırın.
          </p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition flex items-center space-x-2">
          <Plus size={16} /><span>Yeni Kural</span>
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base">Yeni Retweet Kuralı</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Kural Adı</label>
                <input type="text" value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                  className="w-full px-3 py-2 rounded-xl glass-input bg-slate-800 border border-slate-700 text-white text-xs" />
              </div>
              
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Kaynak Hesap</label>
                <select value={form.sourceAccount} onChange={e => setForm({...form, sourceAccount: e.target.value})}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs">
                  <option value="">Seçiniz...</option>
                  {twitterAccounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.username})</option>)}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Retweet Edecek Hesaplar</label>
                <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700 space-y-2 max-h-40 overflow-y-auto">
                  {twitterAccounts.filter(a => a.id !== form.sourceAccount).map(a => (
                    <label key={a.id} className="flex items-center space-x-2 text-xs text-white">
                      <input type="checkbox" checked={form.retweeterAccounts.includes(a.id)} onChange={() => handleCheckbox(a.id)} />
                      <span>{a.name} ({a.username})</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Gecikme (Dakika)</label>
                <input type="number" min="0" value={form.delayMinutes} onChange={e => setForm({...form, delayMinutes: parseInt(e.target.value) || 0})}
                  className="w-full px-3 py-2 rounded-xl glass-input bg-slate-800 border border-slate-700 text-white text-xs" />
              </div>
            </div>

            <button onClick={handleSave} className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition">Kaydet</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 size={32} className="animate-spin text-indigo-500" /></div>
      ) : rules.length === 0 ? (
        <div className="p-12 text-center rounded-2xl glass-panel border border-slate-800 border-dashed space-y-4">
          <p className="text-xs text-slate-400">Henüz kural yok.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rules.map(rule => (
            <div key={rule.id} className={`p-5 rounded-2xl glass-panel border ${rule.enabled ? 'border-indigo-500/30 bg-indigo-950/10' : 'border-slate-800 opacity-60'}`}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-white text-sm">{rule.title}</h3>
                  <p className="text-xs text-slate-400">Gecikme: {rule.delayMinutes} dk</p>
                </div>
                <div className="flex space-x-2">
                  <button onClick={() => manualTrigger(rule)} className="px-3 py-1.5 rounded-xl bg-sky-900/40 text-sky-400 hover:bg-sky-900/60 text-xs font-bold">
                    Şimdi Retweet At
                  </button>
                  <button onClick={() => handleToggle(rule)} className="px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-bold">
                    {rule.enabled ? 'Açık' : 'Kapalı'}
                  </button>
                  <button onClick={() => handleDelete(rule.id)} className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-950/40">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-400"><strong>Kaynak:</strong> {twitterAccounts.find(a => a.id === rule.sourceAccount)?.username || rule.sourceAccount}</p>
                <p className="text-[10px] text-slate-400"><strong>Retweetçiler:</strong> {rule.retweeterAccounts.length} hesap</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
