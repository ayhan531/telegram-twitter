import React, { useState, useEffect } from 'react';
import {
  Repeat, Plus, Trash2, CheckCircle2, ArrowRight,
  SlidersHorizontal, X, Play, Pause, Send, Loader2, Info
} from 'lucide-react';

function RuleForm({ accounts, initial, onSave, onCancel }) {
  const telegramAccounts = accounts.filter(a => a.platform === 'telegram');
  const twitterAccounts  = accounts.filter(a => a.platform === 'twitter');

  const [form, setForm] = useState(initial || {
    title: 'Oto-Tweet Kuralı',
    sourceAccountId: telegramAccounts[0]?.credentials?.accountId || telegramAccounts[0]?.id || '',
    sourceChannelId: '', // @kanaladi, -100... or empty for all
    targetIds: twitterAccounts.map(a => a.id),
    autoHashtags: '',
    bannedKeywords: '',
    enabled: true,
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = () => {
    if (!form.sourceAccountId && telegramAccounts.length > 0) {
      form.sourceAccountId = telegramAccounts[0]?.credentials?.accountId || telegramAccounts[0]?.id;
    }
    if (!form.sourceAccountId) {
      alert('Lütfen önce Telegram hesabınızı bağlayın.');
      return;
    }
    if (twitterAccounts.length === 0) {
      alert('Lütfen hedef olarak Twitter hesabı bağlayın.');
      return;
    }

    const selectedTwitter = twitterAccounts.filter(a => form.targetIds.includes(a.id));
    onSave({
      ...form,
      id: initial?.id || `rule-${Date.now()}`,
      targetAccounts: selectedTwitter.length > 0 ? selectedTwitter : twitterAccounts,
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-[11px] font-bold text-slate-300 block mb-1">Kural Adı</label>
        <input type="text" value={form.title} onChange={e => set('title', e.target.value)}
          placeholder="Örn: Kripto Haber Oto-Tweet"
          className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs" />
      </div>

      <div>
        <label className="text-[11px] font-bold text-slate-300 block mb-1">📥 Kaynak: Telegram Hesabı</label>
        {telegramAccounts.length === 0 ? (
          <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-xs text-amber-200">
            Önce Telegram hesabı bağlamalısın (Bağlantılar sekmesi).
          </div>
        ) : (
          <select value={form.sourceAccountId} onChange={e => set('sourceAccountId', e.target.value)}
            className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs bg-slate-800 border border-slate-700">
            {telegramAccounts.map(a => (
              <option key={a.id} value={a.credentials?.accountId || a.id}>
                ✈️ {a.name} ({a.username})
              </option>
            ))}
          </select>
        )}
      </div>

      <div>
        <label className="text-[11px] font-bold text-slate-300 block mb-0.5">📡 Kaynak: Kanal, Grup veya Sohbet</label>
        <p className="text-[10px] text-slate-400 mb-1.5">
          Kanal/Grup kullanıcı adı (örn: <code className="text-sky-400">@btchaber</code>) veya ID numarası (örn: <code className="text-sky-400">-1001234567890</code>).
          <strong> Boş bırakırsan gelen TÜM mesajlar tweet atılır.</strong>
        </p>
        <input type="text" value={form.sourceChannelId} onChange={e => set('sourceChannelId', e.target.value)}
          placeholder="@kanaladi veya -1001234567890 (Boş = Tüm mesajlar)"
          className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs font-mono" />
      </div>

      <div>
        <label className="text-[11px] font-bold text-slate-300 block mb-1">📤 Hedef Twitter Hesabı</label>
        {twitterAccounts.length === 0 ? (
          <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-xs text-amber-200">
            Önce Twitter hesabı bağlamalısın (Bağlantılar sekmesi).
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-sm">𝕏</span>
              <span className="text-xs font-bold text-white">{twitterAccounts[0].name} ({twitterAccounts[0].username})</span>
            </div>
            <CheckCircle2 size={16} className="text-emerald-400" />
          </div>
        )}
      </div>

      <div>
        <label className="text-[11px] font-bold text-slate-300 block mb-0.5">🏷️ Otomatik Hashtag (İsteğe Bağlı)</label>
        <input type="text" value={form.autoHashtags} onChange={e => set('autoHashtags', e.target.value)}
          placeholder="#kripto, #gündem, #telegram"
          className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs" />
      </div>

      <div>
        <label className="text-[11px] font-bold text-slate-300 block mb-0.5">🚫 Yasaklı Kelimeler (İsteğe Bağlı)</label>
        <p className="text-[10px] text-slate-400 mb-1">Bu kelimeleri içeren mesajlar tweet atılmaz. Virgülle ayırın.</p>
        <input type="text" value={form.bannedKeywords} onChange={e => set('bannedKeywords', e.target.value)}
          placeholder="reklam, spam, promosyon"
          className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs" />
      </div>

      <div className="flex space-x-3 pt-2">
        <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700">İptal</button>
        <button onClick={handleSave} className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-md">Kuralı Kaydet ✓</button>
      </div>
    </div>
  );
}

export default function SyncRules({ accounts, rules, setRules, onShowToast }) {
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [testingId, setTestingId] = useState(null);
  const [testText, setTestText] = useState('');

  useEffect(() => {
    fetch('/api/sync/rules')
      .then(r => r.json())
      .then(d => { if (d.rules?.length) setRules(d.rules); })
      .catch(() => {});
  }, []);

  const handleSave = async (rule) => {
    try {
      await fetch('/api/sync/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });
    } catch (e) {}

    setRules(prev => {
      const idx = prev.findIndex(r => r.id === rule.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = rule; return n; }
      return [...prev, rule];
    });
    setShowForm(false);
    setEditingRule(null);
    onShowToast('Oto-Sync kuralı kaydedildi!', 'success');
  };

  const handleDelete = async (id) => {
    await fetch(`/api/sync/rules/${id}`, { method: 'DELETE' }).catch(() => {});
    setRules(prev => prev.filter(r => r.id !== id));
    onShowToast('Kural silindi.', 'info');
  };

  const handleToggle = async (rule) => {
    const updated = { ...rule, enabled: !rule.enabled };
    await fetch('/api/sync/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(() => {});
    setRules(prev => prev.map(r => r.id === rule.id ? updated : r));
  };

  const handleTest = async (rule) => {
    const text = testText || '⚡ OmniSync Test Tweeti: Telegram -> Twitter Oto-Sync bağlantısı aktif ve çalışıyor! ✅';
    setTestingId(rule.id);
    try {
      const r = await fetch('/api/sync/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleId: rule.id, text }),
      });
      const d = await r.json();
      onShowToast(d.success ? '✅ Test tweeti başarıyla atıldı!' : '❌ Hata: ' + d.error, d.success ? 'success' : 'error');
    } catch (e) {
      onShowToast('❌ Hata: ' + e.message, 'error');
    } finally {
      setTestingId(null);
    }
  };

  const telegramAccounts = accounts.filter(a => a.platform === 'telegram');
  const twitterAccounts  = accounts.filter(a => a.platform === 'twitter');

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="p-6 rounded-2xl glass-panel border border-slate-800 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Repeat className="text-indigo-400" size={22} />
            <span>Oto-Tweet Kuralları</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Telegram kanallarından ve sohbetlerinden gelen mesajların otomatik tweet atılması için kurallarını yönet.
          </p>
        </div>
        <button onClick={() => { setEditingRule(null); setShowForm(true); }}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition flex items-center space-x-2">
          <Plus size={16} /><span>Yeni Kural Ekle</span>
        </button>
      </div>

      {/* Prerequisites warning */}
      {(telegramAccounts.length === 0 || twitterAccounts.length === 0) && (
        <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/20 text-xs text-amber-200 space-y-2">
          <p className="font-bold text-amber-300 flex items-center space-x-2">
            <Info size={14} /><span>Kural oluşturmadan önce:</span>
          </p>
          {telegramAccounts.length === 0 && <p>• <strong>Telegram Hesabı</strong> bağla (Bağlantılar sekmesi)</p>}
          {twitterAccounts.length === 0 && <p>• <strong>Twitter Hesabı</strong> bağla (Bağlantılar sekmesi)</p>}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h3 className="font-bold text-white text-base">
                {editingRule ? 'Kuralı Düzenle' : 'Yeni Oto-Tweet Kuralı Ekle'}
              </h3>
              <button onClick={() => { setShowForm(false); setEditingRule(null); }} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="p-6">
              <RuleForm
                accounts={accounts}
                initial={editingRule}
                onSave={handleSave}
                onCancel={() => { setShowForm(false); setEditingRule(null); }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Rules list */}
      {rules.length === 0 ? (
        <div className="p-12 text-center rounded-2xl glass-panel border border-slate-800 border-dashed space-y-4">
          <div className="text-5xl">⚡</div>
          <h3 className="text-sm font-bold text-slate-200">Henüz Kural Yok</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            "Yeni Kural Ekle" butonuna basarak Telegram kanalını Twitter hesabına bağla.
          </p>
          <button onClick={() => setShowForm(true)} className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md">
            + İlk Kuralı Ekle
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Test Text Input */}
          <div className="flex items-center space-x-3 p-3.5 rounded-xl bg-slate-900 border border-slate-800">
            <input type="text" value={testText} onChange={e => setTestText(e.target.value)}
              placeholder="Test tweeti metni (Boş bırakırsanız varsayılan test mesajı yollanır)"
              className="flex-1 px-3 py-2 rounded-xl glass-input text-white text-xs" />
          </div>

          {rules.map(rule => (
            <div key={rule.id} className={`p-5 rounded-2xl glass-panel border transition ${rule.enabled ? 'border-indigo-500/30 bg-indigo-950/10' : 'border-slate-800 opacity-60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-3">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${rule.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                    <h3 className="font-bold text-sm text-white truncate">{rule.title}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${rule.enabled ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'}`}>
                      {rule.enabled ? 'AKTİF' : 'PASİF'}
                    </span>
                  </div>

                  {/* Flow Visualization */}
                  <div className="flex items-center space-x-2 flex-wrap gap-y-2">
                    <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-sky-900/30 border border-sky-500/20">
                      <span className="text-sm">✈️</span>
                      <div>
                        <p className="text-[11px] font-semibold text-sky-300">Telegram</p>
                        <p className="text-[9px] text-slate-400 font-mono">{rule.sourceChannelId || 'Tüm Mesajlar'}</p>
                      </div>
                    </div>

                    <ArrowRight size={14} className="text-slate-500 shrink-0" />

                    <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-900/30 border border-indigo-500/20">
                      <span className="text-sm">𝕏</span>
                      <span className="text-[11px] text-indigo-300 font-semibold">Twitter</span>
                    </div>
                  </div>

                  {/* Filters */}
                  <div className="flex items-center flex-wrap gap-2 mt-3">
                    {rule.autoHashtags && (
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                        🏷️ {rule.autoHashtags}
                      </span>
                    )}
                    {rule.bannedKeywords && (
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-rose-950/40 text-rose-300 border border-rose-500/20">
                        🚫 Filtre: {rule.bannedKeywords}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2 shrink-0">
                  <button onClick={() => handleToggle(rule)} title={rule.enabled ? 'Duraklat' : 'Başlat'}
                    className={`p-2 rounded-xl border transition ${rule.enabled ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'}`}>
                    {rule.enabled ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <button onClick={() => handleTest(rule)} disabled={testingId === rule.id} title="Test Tweeti At"
                    className="px-3 py-2 rounded-xl border bg-indigo-600/20 border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30 text-xs font-bold flex items-center space-x-1 transition">
                    {testingId === rule.id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    <span>Test Tweeti At</span>
                  </button>
                  <button onClick={() => { setEditingRule(rule); setShowForm(true); }} title="Düzenle"
                    className="p-2 rounded-xl border bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 transition">
                    <SlidersHorizontal size={14} />
                  </button>
                  <button onClick={() => handleDelete(rule.id)} title="Sil"
                    className="p-2 rounded-xl border bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
