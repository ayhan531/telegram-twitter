import React, { useState, useEffect } from 'react';
import {
  Repeat, Plus, Trash2, CheckCircle2, ArrowRight,
  SlidersHorizontal, X, ChevronDown, ChevronUp,
  Play, Pause, Send, Loader2, Info, ExternalLink
} from 'lucide-react';

const PLATFORM_EMOJI = { twitter: '𝕏', telegram: '✈️', whatsapp: '💬', discord: '🎮', linkedin: 'in' };
const PLATFORM_LABEL = { twitter: 'Twitter', telegram: 'Telegram', whatsapp: 'WhatsApp', discord: 'Discord', linkedin: 'LinkedIn' };

// ════════════════════════════════════════════════════════════════════════════
// RULE FORM
// ════════════════════════════════════════════════════════════════════════════
function RuleForm({ accounts, initial, onSave, onCancel }) {
  const telegramAccounts = accounts.filter(a => a.platform === 'telegram');
  const targetAccounts   = accounts.filter(a => a.platform !== 'telegram');

  const [form, setForm] = useState(initial || {
    title: 'Yeni Oto-Sync Kuralı',
    sourceAccountId: telegramAccounts[0]?.credentials?.accountId || telegramAccounts[0]?.id || '',
    sourceChannelId: '',   // Telegram kanal ID veya @username
    allowedSenders: '',    // Boş = herkes, ID ile filtrele
    targetIds: targetAccounts.map(a => a.id),
    autoHashtags: '',
    bannedKeywords: '',
    forwardMedia: false,
    enabled: true,
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const toggleTarget = (id) => set('targetIds', form.targetIds.includes(id)
    ? form.targetIds.filter(x => x !== id)
    : [...form.targetIds, id]);

  const handleSave = () => {
    if (!form.sourceAccountId) { alert('Kaynak Telegram hesabı seçin.'); return; }
    if (form.targetIds.length === 0) { alert('En az 1 hedef hesap seçin.'); return; }
    if (!form.sourceChannelId.trim()) { alert('Kanal ID veya kullanıcı adı girin.'); return; }

    // Attach full account objects for server-side use
    const targetAccObjs = accounts.filter(a => form.targetIds.includes(a.id));
    onSave({
      ...form,
      id: initial?.id || `rule-${Date.now()}`,
      targetAccounts: targetAccObjs,
    });
  };

  return (
    <div className="space-y-4">
      {/* Rule title */}
      <div>
        <label className="text-[11px] font-bold text-slate-300 block mb-1">Kural Adı</label>
        <input type="text" value={form.title} onChange={e => set('title', e.target.value)}
          className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs" />
      </div>

      {/* Source Telegram account */}
      <div>
        <label className="text-[11px] font-bold text-slate-300 block mb-1">📥 Kaynak: Telegram Hesabı</label>
        {telegramAccounts.length === 0 ? (
          <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/20 text-xs text-amber-300">
            Önce Telegram hesabı bağlamalısın (Hesaplar sekmesi).
          </div>
        ) : (
          <select value={form.sourceAccountId} onChange={e => set('sourceAccountId', e.target.value)}
            className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs bg-slate-800">
            {telegramAccounts.map(a => (
              <option key={a.id} value={a.credentials?.accountId || a.id}>
                ✈️ {a.name} {a.username}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Source channel/group */}
      <div>
        <label className="text-[11px] font-bold text-slate-300 block mb-0.5">📡 Kaynak: Kanal veya Grup</label>
        <p className="text-[10px] text-slate-500 mb-1.5">
          Kanal/grup @kullanıcıadı gir (örn: <code className="text-sky-400">@btchaber</code>) veya ID numarası (örn: <code className="text-sky-400">-1001234567890</code>).
          Boş bırakırsan tüm mesajlar yakalanır.
        </p>
        <input type="text" value={form.sourceChannelId} onChange={e => set('sourceChannelId', e.target.value)}
          placeholder="@kanaladi veya -1001234567890 (boş = hepsi)"
          className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs font-mono" />
        <a href="https://t.me/username_to_id_bot" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center space-x-1 text-[10px] text-sky-400 hover:underline mt-1">
          <ExternalLink size={10} /><span>Kanal ID'sini nasıl öğrenirim? →</span>
        </a>
      </div>

      {/* Sender filter */}
      <div>
        <label className="text-[11px] font-bold text-slate-300 block mb-0.5">👤 Gönderen Filtresi (isteğe bağlı)</label>
        <p className="text-[10px] text-slate-500 mb-1.5">Sadece belirli kullanıcıların mesajlarını al. Boş = herkesinki. Virgülle ayır.</p>
        <input type="text" value={form.allowedSenders} onChange={e => set('allowedSenders', e.target.value)}
          placeholder="123456789, 987654321 veya boş bırak"
          className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs" />
      </div>

      {/* Target accounts */}
      <div>
        <label className="text-[11px] font-bold text-slate-300 block mb-1.5">📤 Hedef Hesaplar</label>
        {targetAccounts.length === 0 ? (
          <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/20 text-xs text-amber-300">
            Hedef olarak Twitter, WhatsApp veya Discord hesabı bağlamalısın.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {targetAccounts.map(a => {
              const selected = form.targetIds.includes(a.id);
              return (
                <button key={a.id} type="button" onClick={() => toggleTarget(a.id)}
                  className={`flex items-center space-x-2 p-2.5 rounded-xl border text-left transition ${
                    selected
                      ? 'bg-indigo-600/20 border-indigo-500/60 text-white'
                      : 'bg-slate-800/40 border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold ${selected ? 'bg-indigo-600' : 'bg-slate-700'}`}>
                    {PLATFORM_EMOJI[a.platform]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{a.name}</p>
                    <p className="text-[10px] opacity-60">{PLATFORM_LABEL[a.platform]}</p>
                  </div>
                  {selected && <CheckCircle2 size={14} className="text-indigo-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Auto hashtags */}
      <div>
        <label className="text-[11px] font-bold text-slate-300 block mb-0.5">🏷️ Otomatik Hashtag (isteğe bağlı)</label>
        <input type="text" value={form.autoHashtags} onChange={e => set('autoHashtags', e.target.value)}
          placeholder="#kripto, #bitcoin, #telegram"
          className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs" />
      </div>

      {/* Banned keywords */}
      <div>
        <label className="text-[11px] font-bold text-slate-300 block mb-0.5">🚫 Yasaklı Kelimeler (isteğe bağlı)</label>
        <p className="text-[10px] text-slate-500 mb-1">Bu kelimeleri içeren mesajlar tweet atılmaz. Virgülle ayır.</p>
        <input type="text" value={form.bannedKeywords} onChange={e => set('bannedKeywords', e.target.value)}
          placeholder="reklam, spam, promosyon"
          className="w-full px-3 py-2 rounded-xl glass-input text-white text-xs" />
      </div>

      <div className="flex space-x-3 pt-2">
        <button onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold transition border border-slate-700">
          İptal
        </button>
        <button onClick={handleSave}
          className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition shadow-md">
          Kuralı Kaydet ✓
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function SyncRules({ accounts, rules, setRules, onShowToast }) {
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [testingId, setTestingId] = useState(null);
  const [testText, setTestText] = useState('');

  // On mount: load rules from server (in case server was restarted)
  useEffect(() => {
    fetch('/api/sync/rules')
      .then(r => r.json())
      .then(d => { if (d.rules?.length) setRules(d.rules); })
      .catch(() => {});
  }, []);

  const handleSave = async (rule) => {
    // Save to server
    try {
      await fetch('/api/sync/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });
    } catch (e) { console.error(e); }

    setRules(prev => {
      const idx = prev.findIndex(r => r.id === rule.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = rule; return n; }
      return [...prev, rule];
    });
    setShowForm(false);
    setEditingRule(null);
    onShowToast('Kural kaydedildi!', 'success');
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
    const text = testText || 'OmniSync test mesajı: Bu Telegram kanalından gelen bir deneme tweeti. ✅';
    setTestingId(rule.id);
    try {
      const r = await fetch('/api/sync/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleId: rule.id, text }),
      });
      const d = await r.json();
      onShowToast(d.success ? '✅ Test tweeti atıldı!' : '❌ Hata: ' + d.error, d.success ? 'success' : 'error');
    } catch (e) {
      onShowToast('❌ ' + e.message, 'error');
    } finally {
      setTestingId(null);
    }
  };

  const telegramAccounts = accounts.filter(a => a.platform === 'telegram');
  const targetAccounts   = accounts.filter(a => a.platform !== 'telegram');

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="p-5 rounded-2xl glass-panel border border-slate-800 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <Repeat className="text-indigo-400" size={20} /><span>Oto-Sync Kuralları</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Telegram kanalından gelen mesajları otomatik olarak Twitter, WhatsApp vb. platformlara ilet.
          </p>
        </div>
        <button onClick={() => { setEditingRule(null); setShowForm(true); }}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition flex items-center space-x-2">
          <Plus size={16} /><span>Kural Ekle</span>
        </button>
      </div>

      {/* Prerequisites warning */}
      {(telegramAccounts.length === 0 || targetAccounts.length === 0) && (
        <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/20 text-xs text-amber-200 space-y-2">
          <p className="font-bold text-amber-300 flex items-center space-x-2">
            <Info size={14} /><span>Kural eklemeden önce:</span>
          </p>
          {telegramAccounts.length === 0 && <p>• <strong>Telegram hesabı</strong> bağla (Hesaplar sekmesi → QR kodu tara)</p>}
          {targetAccounts.length === 0 && <p>• <strong>Hedef hesap</strong> bağla (Twitter, WhatsApp veya Discord)</p>}
        </div>
      )}

      {/* How it works */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-400 space-y-2">
        <p className="font-bold text-white text-sm">⚡ Nasıl Çalışır?</p>
        <div className="flex items-start space-x-2">
          <span className="text-sky-400 font-mono shrink-0">1.</span>
          <span>Telegram hesabını QR ile bağla → sistem arka planda o hesabın mesajlarını dinlemeye başlar</span>
        </div>
        <div className="flex items-start space-x-2">
          <span className="text-sky-400 font-mono shrink-0">2.</span>
          <span>Buraya kural ekle: Kaynak kanal + Hedef Twitter/WhatsApp hesabı seç</span>
        </div>
        <div className="flex items-start space-x-2">
          <span className="text-sky-400 font-mono shrink-0">3.</span>
          <span>O kanalda yeni mesaj geldiğinde sistem otomatik tweet/mesaj atar — sen hiçbir şey yapmadan</span>
        </div>
        <div className="mt-2 p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/20 text-amber-300 space-y-1">
          <p>⚠️ Render'ın ücretsiz planı 15 dk trafik gelmezse sunucuyu uyutuyor. Bu sayfa açıkken sistem her dakika kendini otomatik onarıyor (Telegram dinleyicisini ve kuralları yeniden kuruyor), o yüzden sekmeyi açık tutmak yeterli.</p>
          <p>Tarayıcı kapalıyken de kesintisiz çalışsın istiyorsan, <a href="https://cron-job.org" target="_blank" rel="noopener noreferrer" className="underline">cron-job.org</a> gibi ücretsiz bir servisle bu adrese 10 dakikada bir istek attır — Render hiç uyumaz.</p>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h3 className="font-bold text-white text-base">
                {editingRule ? 'Kuralı Düzenle' : 'Yeni Kural Ekle'}
              </h3>
              <button onClick={() => { setShowForm(false); setEditingRule(null); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 max-h-[80vh] overflow-y-auto">
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
            "Kural Ekle" ile Telegram kanalını Twitter/WhatsApp hesabına bağla.
            Kanal mesajları otomatik olarak paylaşılacak.
          </p>
          <button onClick={() => setShowForm(true)}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md">
            + İlk Kuralı Ekle
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Test text input */}
          <div className="flex items-center space-x-3 p-3 rounded-xl bg-slate-900 border border-slate-800">
            <input type="text" value={testText} onChange={e => setTestText(e.target.value)}
              placeholder="Test tweeti metni (boş bırakırsan varsayılan kullanılır)"
              className="flex-1 px-3 py-2 rounded-xl glass-input text-white text-xs" />
          </div>

          {rules.map(rule => {
            const srcAcc = accounts.find(a =>
              (a.credentials?.accountId || a.id) === rule.sourceAccountId
            );
            const targets = (rule.targetAccounts || []).filter(t =>
              accounts.find(a => a.id === t.id)
            );

            return (
              <div key={rule.id} className={`p-5 rounded-2xl glass-panel border transition ${rule.enabled ? 'border-indigo-500/30 bg-indigo-950/10' : 'border-slate-800 opacity-60'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-3">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${rule.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                      <h3 className="font-bold text-sm text-white truncate">{rule.title}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${rule.enabled ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'}`}>
                        {rule.enabled ? 'AKTİF' : 'DURAKLATILDI'}
                      </span>
                    </div>

                    {/* Flow visualization */}
                    <div className="flex items-center space-x-2 flex-wrap gap-y-2">
                      <div className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-sky-900/30 border border-sky-500/20">
                        <span className="text-sm">✈️</span>
                        <div>
                          <p className="text-[10px] font-semibold text-sky-300">{srcAcc?.name || 'Telegram'}</p>
                          <p className="text-[9px] text-slate-400 font-mono">{rule.sourceChannelId || 'Tüm kanallar'}</p>
                        </div>
                      </div>
                      <ArrowRight size={14} className="text-slate-500 shrink-0" />
                      <div className="flex items-center space-x-1.5 flex-wrap gap-1">
                        {(rule.targetAccounts || []).map(t => (
                          <div key={t.id} className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-indigo-900/30 border border-indigo-500/20">
                            <span className="text-xs">{PLATFORM_EMOJI[t.platform]}</span>
                            <span className="text-[10px] text-indigo-300 font-semibold">{t.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Tags / filters */}
                    <div className="flex items-center flex-wrap gap-1.5 mt-2">
                      {rule.allowedSenders && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                          👤 Filtreli gönderen
                        </span>
                      )}
                      {rule.autoHashtags && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                          🏷️ {rule.autoHashtags.split(',')[0].trim()}...
                        </span>
                      )}
                      {rule.bannedKeywords && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-950/40 text-rose-300 border border-rose-500/20">
                          🚫 Filtre aktif
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col space-y-1.5 shrink-0">
                    <button onClick={() => handleToggle(rule)} title={rule.enabled ? 'Duraklat' : 'Başlat'}
                      className={`p-1.5 rounded-lg border transition ${rule.enabled ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'}`}>
                      {rule.enabled ? <Pause size={14} /> : <Play size={14} />}
                    </button>
                    <button onClick={() => handleTest(rule)} disabled={testingId === rule.id} title="Test tweeti at"
                      className="p-1.5 rounded-lg border bg-indigo-500/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20 transition">
                      {testingId === rule.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    </button>
                    <button onClick={() => { setEditingRule(rule); setShowForm(true); }} title="Düzenle"
                      className="p-1.5 rounded-lg border bg-slate-700/50 border-slate-600 text-slate-300 hover:bg-slate-700 transition">
                      <SlidersHorizontal size={14} />
                    </button>
                    <button onClick={() => handleDelete(rule.id)} title="Sil"
                      className="p-1.5 rounded-lg border bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
