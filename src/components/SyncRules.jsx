import React, { useState, useEffect } from 'react';
import {
  Repeat, Plus, Trash2, CheckCircle2, ArrowRight,
  SlidersHorizontal, X, Play, Pause, Send, Loader2, Info
} from 'lucide-react';

const PLATFORM_META = {
  telegram:  { icon: '✈️', label: 'Telegram' },
  twitter:   { icon: '𝕏',  label: 'X (Twitter)' },
  instagram: { icon: '📸', label: 'Instagram' },
  facebook:  { icon: '📘', label: 'Facebook' },
};

const REPLY_LABELS = {
  following: '👥 Takip ettiklerin yanıtlar',
  mentioned: '📣 Bahsettiklerin yanıtlar',
  verified:  '✅ Onaylılar yanıtlar',
};

const IG_KIND_LABELS = { post: '🖼️ Gönderi', story: '⏳ Hikâye', reel: '🎬 Reels' };

// Kurallar hem eski (yalnızca Twitter) hem yeni biçimde olabiliyor; ikisini de
// aynı özet satırına indiriyoruz.
function describeTargets(rule) {
  const targets = rule.targets?.length
    ? rule.targets
    : (rule.targetAccounts || []).map(a => ({
        platform: 'twitter', name: a.name, options: { replyMode: rule.replyMode },
      }));

  return targets.map(t => {
    const meta = PLATFORM_META[t.platform] || { icon: '•', label: t.platform };
    let detail = t.name || '';
    if (t.platform === 'twitter') {
      detail = REPLY_LABELS[t.options?.replyMode] || '🌍 Herkes yanıtlar';
    } else if (t.platform === 'telegram') {
      detail = t.chatId || '—';
    } else if (t.platform === 'instagram') {
      detail = `${IG_KIND_LABELS[t.options?.kind] || '🖼️ Gönderi'}${t.options?.disableComments ? ' · 🔇' : ''}`;
    } else if (t.platform === 'facebook') {
      detail = IG_KIND_LABELS[t.options?.kind] || '🖼️ Gönderi';
    }
    return { icon: meta.icon, title: t.name || meta.label, detail };
  });
}

const inputCls = 'w-full px-3 py-2 rounded-xl glass-input text-white text-xs';
const selectCls = 'w-full px-3 py-2 rounded-xl glass-input text-white text-xs bg-slate-800 border border-slate-700';

function PlatformPicker({ value, onChange, disabledSet }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {Object.entries(PLATFORM_META).map(([key, p]) => {
        const off = disabledSet?.has(key);
        return (
          <button
            key={key}
            type="button"
            disabled={off}
            onClick={() => onChange(key)}
            className={`py-2 rounded-xl border text-[11px] font-bold transition ${
              value === key
                ? 'bg-indigo-600 border-indigo-400 text-white'
                : off
                  ? 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <div className="text-base leading-tight">{p.icon}</div>
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

function RuleForm({ accounts, initial, onSave, onCancel }) {
  const telegramAccounts = accounts.filter(a => a.platform === 'telegram');
  const twitterAccounts  = accounts.filter(a => a.platform === 'twitter');

  // Instagram/Facebook hesapları sunucuda tutuluyor (jetonlar tarayıcıya
  // hiç inmiyor), bu yüzden onları ayrıca çekiyoruz.
  const [metaAccounts, setMetaAccounts] = useState([]);
  useEffect(() => {
    fetch('/api/meta/status')
      .then(r => r.json())
      .then(d => setMetaAccounts(d.accounts || []))
      .catch(() => {});
  }, []);

  const igAccounts = metaAccounts.filter(a => a.platform === 'instagram');
  const fbAccounts = metaAccounts.filter(a => a.platform === 'facebook');

  const [form, setForm] = useState(initial || {
    title: 'Yeni Paylaşım Kuralı',
    sourcePlatform: 'telegram',
    sourceAccountId: telegramAccounts[0]?.credentials?.accountId || telegramAccounts[0]?.id || '',
    sourceChannelId: '',
    sourceSenderId: '',
    sourceHandle: '',
    sourcePageId: '',
    skipRetweets: true,
    skipReplies: true,
    replyMode: 'everyone',
    targets: [],
    autoHashtags: '',
    bannedKeywords: '',
    enabled: true,
  });

  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // İkinci hedefi eklerken zaten kullanılan hesabı tekrar seçmek yerine
  // sıradaki boşta olanı öneriyoruz: C ve D'yi arka arkaya eklemek yetiyor.
  const firstUnused = (list, idOf = a => a.id) => {
    const used = new Set((form.targets || []).filter(t => t.platform).map(t => t.accountId));
    return list.find(a => !used.has(idOf(a))) || list[0];
  };

  const addTarget = (platform) => {
    const base = { platform, options: {} };
    if (platform === 'twitter') {
      const a = firstUnused(twitterAccounts);
      if (!a) return alert('Önce X hesabı bağlamalısın (Bağlantılar sekmesi).');
      Object.assign(base, { name: a.name, accountId: a.id, options: { replyMode: 'everyone' } });
    } else if (platform === 'telegram') {
      const a = firstUnused(telegramAccounts, a => a.credentials?.accountId || a.id);
      if (!a) return alert('Önce Telegram hesabı bağlamalısın.');
      Object.assign(base, { name: a.name, accountId: a.credentials?.accountId || a.id, chatId: '' });
    } else if (platform === 'instagram') {
      const a = firstUnused(igAccounts);
      if (!a) return alert('Önce Instagram hesabı bağlamalısın.');
      Object.assign(base, { name: `@${a.username}`, accountId: a.id, options: { kind: 'post', disableComments: false } });
    } else if (platform === 'facebook') {
      const a = fbAccounts[0];
      if (!a) return alert('Önce Facebook hesabı bağlamalısın.');
      Object.assign(base, { name: a.pages?.[0]?.name || a.name, accountId: a.id, pageId: a.pages?.[0]?.id, options: { kind: 'post', commentControl: 'EVERYONE' } });
    }
    set('targets', [...(form.targets || []), base]);
  };

  const updateTarget = (i, patch) => {
    const next = [...form.targets];
    next[i] = { ...next[i], ...patch, options: { ...next[i].options, ...(patch.options || {}) } };
    set('targets', next);
  };

  const removeTarget = (i) => set('targets', form.targets.filter((_, j) => j !== i));

  const runPreview = async () => {
    setPreviewing(true);
    setPreview(null);
    try {
      const r = await fetch('/api/source/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: form.sourcePlatform, handle: form.sourceHandle }),
      });
      setPreview(await r.json());
    } catch (e) {
      setPreview({ success: false, error: e.message });
    }
    setPreviewing(false);
  };

  const handleSave = () => {
    if (form.sourcePlatform === 'telegram' && !form.sourceAccountId) {
      return alert('Önce Telegram hesabını bağla.');
    }
    if (form.sourcePlatform === 'twitter' && !form.sourceHandle.trim()) {
      return alert('Çekilecek X hesabını gir (örn: @nasa).');
    }
    if ((form.sourcePlatform === 'instagram' || form.sourcePlatform === 'facebook') && !form.sourceAccountId) {
      return alert(`Önce ${PLATFORM_META[form.sourcePlatform].label} hesabını bağla.`);
    }
    if (!form.targets?.length) {
      return alert('En az bir hedef ekle.');
    }
    const badTg = form.targets.find(t => t.platform === 'telegram' && !t.chatId?.trim());
    if (badTg) return alert('Telegram hedefi için kanal/grup adresi gir (örn: @kanalim).');

    onSave({ ...form, id: initial?.id || `rule-${Date.now()}` });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-[11px] font-bold text-slate-300 block mb-1">Kural Adı</label>
        <input type="text" value={form.title} onChange={e => set('title', e.target.value)}
          placeholder="Örn: Kripto Haber → X + Instagram"
          className={inputCls} />
      </div>

      {/* ── KAYNAK ────────────────────────────────────────────── */}
      <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-700 space-y-3">
        <label className="text-[11px] font-bold text-sky-300 block">📥 KAYNAK — nereden çekilecek?</label>
        <PlatformPicker value={form.sourcePlatform} onChange={v => { set('sourcePlatform', v); setPreview(null); }} />

        {form.sourcePlatform === 'telegram' && (
          <>
            {telegramAccounts.length === 0 ? (
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-xs text-amber-200">
                Önce Telegram hesabı bağlamalısın (Bağlantılar sekmesi).
              </div>
            ) : (
              <select value={form.sourceAccountId} onChange={e => set('sourceAccountId', e.target.value)} className={selectCls}>
                {telegramAccounts.map(a => (
                  <option key={a.id} value={a.credentials?.accountId || a.id}>✈️ {a.name} ({a.username})</option>
                ))}
              </select>
            )}
            <div>
              <p className="text-[10px] text-slate-400 mb-1">
                Kanal/grup: <code className="text-sky-400">@btchaber</code>, <code className="text-sky-400">-1001234567890</code> veya
                {' '}<code className="text-sky-400">t.me/...</code>. <strong>Boş = tüm sohbetler.</strong>
              </p>
              <input type="text" value={form.sourceChannelId} onChange={e => set('sourceChannelId', e.target.value)}
                placeholder="@kanaladi (Boş = hepsi)" className={inputCls + ' font-mono'} />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 mb-1">
                👤 Yalnızca bu kişi (isteğe bağlı). Kanallarda gönderiler kanalın kendisine ait olduğu için bu asıl <strong>gruplarda</strong> işe yarar.
              </p>
              <input type="text" value={form.sourceSenderId} onChange={e => set('sourceSenderId', e.target.value)}
                placeholder="@kullaniciadi (Boş = herkes)" className={inputCls + ' font-mono'} />
            </div>
          </>
        )}

        {form.sourcePlatform === 'twitter' && (
          <>
            <p className="text-[10px] text-slate-400">
              Herkese açık <strong>herhangi bir</strong> X hesabı. Kendi hesabın olması gerekmez, linkini yapıştırman yeterli.
            </p>
            <input type="text" value={form.sourceHandle} onChange={e => set('sourceHandle', e.target.value)}
              placeholder="@nasa veya https://x.com/nasa" className={inputCls + ' font-mono'} />
            <div className="flex gap-3 text-[11px] text-slate-300">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={!!form.skipRetweets} onChange={e => set('skipRetweets', e.target.checked)} />
                Retweetleri atla
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={!!form.skipReplies} onChange={e => set('skipReplies', e.target.checked)} />
                Yanıtları atla
              </label>
            </div>
            <button type="button" onClick={runPreview} disabled={previewing || !form.sourceHandle.trim()}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-bold text-white disabled:opacity-40">
              {previewing ? 'Deneniyor...' : '🔍 Bu hesabı okuyabiliyor muyuz?'}
            </button>
          </>
        )}

        {form.sourcePlatform === 'instagram' && (
          <>
            {igAccounts.length === 0 ? (
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-xs text-amber-200">
                Önce Instagram hesabı bağlamalısın (Bağlantılar sekmesi).
              </div>
            ) : (
              <select value={form.sourceAccountId} onChange={e => set('sourceAccountId', e.target.value)} className={selectCls}>
                {igAccounts.map(a => <option key={a.id} value={a.id}>📸 @{a.username}</option>)}
              </select>
            )}
            <div>
              <p className="text-[10px] text-slate-400 mb-1">
                Başka bir hesabı çekmek istersen adını yaz. <strong>Boş = kendi gönderilerin.</strong> Instagram
                başkalarının hesabını okumaya yalnızca herkese açık <strong>İşletme/Kreatör</strong> hesapları için izin veriyor.
              </p>
              <input type="text" value={form.sourceHandle} onChange={e => set('sourceHandle', e.target.value)}
                placeholder="@baskahesap (Boş = kendi hesabın)" className={inputCls + ' font-mono'} />
            </div>
          </>
        )}

        {form.sourcePlatform === 'facebook' && (
          <>
            {fbAccounts.length === 0 ? (
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-xs text-amber-200">
                Önce Facebook hesabı bağlamalısın (Bağlantılar sekmesi).
              </div>
            ) : (
              <>
                <select value={form.sourceAccountId} onChange={e => set('sourceAccountId', e.target.value)} className={selectCls}>
                  {fbAccounts.map(a => <option key={a.id} value={a.id}>📘 {a.name}</option>)}
                </select>
                <select value={form.sourcePageId} onChange={e => set('sourcePageId', e.target.value)} className={selectCls}>
                  {(fbAccounts.find(a => a.id === form.sourceAccountId)?.pages || fbAccounts[0]?.pages || []).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </>
            )}
          </>
        )}

        {preview && (
          <div className={`p-2.5 rounded-lg text-[11px] border ${preview.success
            ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
            : 'bg-rose-950/40 border-rose-500/30 text-rose-200'}`}>
            {preview.success
              ? <>✅ {preview.author} okunabiliyor — {preview.count} gönderi bulundu. En yenisi: “{preview.items?.[0]?.text?.slice(0, 70) || '(metinsiz)'}”</>
              : <>❌ {preview.error}</>}
          </div>
        )}
      </div>

      {/* ── HEDEFLER ──────────────────────────────────────────── */}
      <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-700 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold text-emerald-300">📤 HEDEFLER — nereye gönderilecek?</label>
          <span className="text-[10px] text-slate-500">{form.targets?.length || 0} hedef</span>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {Object.entries(PLATFORM_META).map(([key, p]) => (
            <button key={key} type="button" onClick={() => addTarget(key)}
              className="py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-200">
              <div className="text-base leading-tight">{p.icon}</div>
              + {p.label}
            </button>
          ))}
        </div>

        {(form.targets || []).map((t, i) => (
          <div key={i} className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">
                {PLATFORM_META[t.platform].icon} {PLATFORM_META[t.platform].label} — {t.name}
              </span>
              <button type="button" onClick={() => removeTarget(i)} className="text-rose-400 hover:text-rose-300">
                <Trash2 size={13} />
              </button>
            </div>

            {t.platform === 'twitter' && (
              <>
                {/* Hangi X hesabına gideceği seçilebilmeli; eskiden her zaman
                    ilk hesap kullanılıyordu ve ikincisi hiç seçilemiyordu. */}
                <select value={t.accountId} onChange={e => {
                  const a = twitterAccounts.find(x => x.id === e.target.value);
                  updateTarget(i, { accountId: e.target.value, name: a?.name || a?.username });
                }} className={selectCls}>
                  {twitterAccounts.map(a => (
                    <option key={a.id} value={a.id}>𝕏 {a.name} ({a.username})</option>
                  ))}
                </select>
                <select value={t.options.replyMode} onChange={e => updateTarget(i, { options: { replyMode: e.target.value } })} className={selectCls}>
                  <option value="everyone">💬 Yanıtlar: Herkes</option>
                  <option value="following">👥 Yanıtlar: Takip ettiklerin</option>
                  <option value="mentioned">📣 Yanıtlar: Yalnızca bahsettiklerin</option>
                  <option value="verified">✅ Yanıtlar: Onaylanmış hesaplar</option>
                </select>
              </>
            )}

            {t.platform === 'telegram' && (
              <>
                <select value={t.accountId} onChange={e => updateTarget(i, { accountId: e.target.value })} className={selectCls}>
                  {telegramAccounts.map(a => (
                    <option key={a.id} value={a.credentials?.accountId || a.id}>{a.name}</option>
                  ))}
                </select>
                <input type="text" value={t.chatId || ''} onChange={e => updateTarget(i, { chatId: e.target.value })}
                  placeholder="@kanalim veya -1001234567890" className={inputCls + ' font-mono'} />
                <p className="text-[10px] text-slate-500">Bu kanalda yönetici olman gerekiyor.</p>
              </>
            )}

            {t.platform === 'instagram' && (
              <>
                <select value={t.accountId} onChange={e => {
                  const a = igAccounts.find(x => x.id === e.target.value);
                  updateTarget(i, { accountId: e.target.value, name: `@${a?.username || ''}` });
                }} className={selectCls}>
                  {igAccounts.map(a => <option key={a.id} value={a.id}>@{a.username}</option>)}
                </select>
                <select value={t.options.kind} onChange={e => updateTarget(i, { options: { kind: e.target.value } })} className={selectCls}>
                  <option value="post">🖼️ Gönderi (foto/video/karusel)</option>
                  <option value="story">⏳ Hikâye</option>
                  <option value="reel">🎬 Reels (yalnızca video)</option>
                </select>
                <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
                  <input type="checkbox" checked={!!t.options.disableComments}
                    onChange={e => updateTarget(i, { options: { disableComments: e.target.checked } })} />
                  🔇 Yorumları kapat
                </label>
              </>
            )}

            {t.platform === 'facebook' && (
              <>
                <select value={t.pageId} onChange={e => {
                  const acc = fbAccounts.find(x => x.id === t.accountId) || fbAccounts[0];
                  const pg = acc?.pages?.find(p => p.id === e.target.value);
                  updateTarget(i, { pageId: e.target.value, name: pg?.name });
                }} className={selectCls}>
                  {(fbAccounts.find(a => a.id === t.accountId)?.pages || []).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <select value={t.options.kind} onChange={e => updateTarget(i, { options: { kind: e.target.value } })} className={selectCls}>
                  <option value="post">🖼️ Gönderi</option>
                  <option value="story">⏳ Hikâye (yalnızca görsel)</option>
                  <option value="reel">🎬 Reels (yalnızca video)</option>
                </select>
                <select value={t.options.commentControl} onChange={e => updateTarget(i, { options: { commentControl: e.target.value } })} className={selectCls}>
                  <option value="EVERYONE">💬 Yorumlar: Herkes</option>
                  <option value="PEOPLE_AND_PAGES_YOU_FOLLOW">👥 Yorumlar: Takip ettiklerin</option>
                  <option value="FOLLOWERS_AND_MENTIONED">📣 Yorumlar: Takipçiler ve bahsedilenler</option>
                  <option value="MENTIONED_ONLY">🔒 Yorumlar: Yalnızca bahsedilenler</option>
                </select>
              </>
            )}
          </div>
        ))}

        {!form.targets?.length && (
          <p className="text-[11px] text-slate-500 text-center py-2">
            Henüz hedef yok. Yukarıdan bir platform seç — birden fazla ekleyebilirsin.
          </p>
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
                      <span className="text-sm">{PLATFORM_META[rule.sourcePlatform || 'telegram'].icon}</span>
                      <div>
                        <p className="text-[11px] font-semibold text-sky-300">
                          {PLATFORM_META[rule.sourcePlatform || 'telegram'].label}
                        </p>
                        <p className="text-[9px] text-slate-400 font-mono">
                          {rule.sourceHandle || rule.sourceChannelId || 'Tüm Mesajlar'}
                        </p>
                        {rule.sourceSenderId && (
                          <p className="text-[9px] text-amber-300/80 font-mono">👤 {rule.sourceSenderId}</p>
                        )}
                      </div>
                    </div>

                    <ArrowRight size={14} className="text-slate-500 shrink-0" />

                    {describeTargets(rule).map((t, i) => (
                      <div key={i} className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-900/30 border border-indigo-500/20">
                        <span className="text-sm">{t.icon}</span>
                        <div>
                          <p className="text-[11px] text-indigo-300 font-semibold">{t.title}</p>
                          <p className="text-[9px] text-slate-400">{t.detail}</p>
                        </div>
                      </div>
                    ))}
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
