import React, { useState } from 'react';
import { 
  PenTool, Send, Calendar, Sparkles, MessageSquare, 
  Twitter, Linkedin, Clock, BadgeCheck, Image as ImageIcon,
  Loader2, CheckCircle2, XCircle, AlertTriangle
} from 'lucide-react';

export default function PostComposer({ 
  accounts, rules, scheduledPosts, setScheduledPosts, logs, setLogs, hashtagPresets, onShowToast 
}) {
  const [content, setContent] = useState('');
  const [selectedAccountIds, setSelectedAccountIds] = useState(accounts.map(a => a.id));
  const [autoHashtags, setAutoHashtags] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [isScheduleMode, setIsScheduleMode] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendResults, setSendResults] = useState(null);
  const [activePreviewTab, setActivePreviewTab] = useState('all');

  const fullText = [content.trim(), autoHashtags.trim()].filter(Boolean).join('\n\n');
  const charCount = fullText.length;

  const selectedAccounts = accounts.filter(a => selectedAccountIds.includes(a.id));
  const hasVerifiedTwitter = selectedAccounts.some(a => a.platform === 'twitter' && a.isVerified);
  const twitterLimit = hasVerifiedTwitter ? 25000 : 280;
  const isOverTwitterLimit = charCount > twitterLimit && selectedAccounts.some(a => a.platform === 'twitter');

  // Split into threads only for non-verified standard Twitter
  const buildThreadChunks = (text) => {
    if (text.length <= 280) return [text];
    const words = text.split(' ');
    const chunks = [];
    let cur = '';
    words.forEach(w => {
      if ((cur + ' ' + w).trim().length > 250) { chunks.push(cur.trim()); cur = w; }
      else cur = (cur ? cur + ' ' : '') + w;
    });
    if (cur.trim()) chunks.push(cur.trim());
    return chunks.map((c, i) => `(${i + 1}/${chunks.length}) ${c}`);
  };

  const twitterChunks = (!hasVerifiedTwitter && isOverTwitterLimit) ? buildThreadChunks(fullText) : [fullText];

  const toggleAccount = (id) => {
    setSelectedAccountIds(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  };

  const handleSendNow = async () => {
    if (!fullText) { onShowToast('Lütfen bir paylaşım metni girin!', 'error'); return; }
    if (selectedAccounts.length === 0) { onShowToast('En az 1 hedef hesap seçin!', 'error'); return; }

    const accountsWithCreds = selectedAccounts.filter(a => a.credentials && Object.keys(a.credentials).length > 0);
    if (accountsWithCreds.length === 0) {
      onShowToast('Seçili hesapların API bilgileri eksik! Hesaplar bölümünden credential ekleyin.', 'error');
      return;
    }

    setIsSending(true);
    setSendResults(null);

    try {
      // For Twitter, send each chunk if thread needed
      const dispatchAccounts = [];
      for (const acc of accountsWithCreds) {
        if (acc.platform === 'twitter' && !acc.isVerified && twitterChunks.length > 1) {
          // Each chunk as separate tweet - dispatch separately handled in results display
          dispatchAccounts.push({ ...acc, _twitterChunks: twitterChunks });
        } else {
          dispatchAccounts.push(acc);
        }
      }

      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accounts: accountsWithCreds,
          text: fullText,
          mediaUrl: mediaUrl || null
        })
      });

      const data = await res.json();
      setSendResults(data.results || []);

      const successCount = (data.results || []).filter(r => r.success).length;
      const failCount = (data.results || []).length - successCount;

      // Add to logs
      setLogs(prev => [{
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleString('tr-TR'),
        source: 'Manuel Paylaşım (Composer)',
        messagePreview: fullText.slice(0, 60) + '...',
        targets: accountsWithCreds.map(a => a.name),
        status: failCount === 0 ? 'success' : 'partial',
        details: `${successCount} başarılı, ${failCount} başarısız.`
      }, ...prev]);

      if (successCount > 0) onShowToast(`${successCount} hesaba başarıyla gönderildi!`, 'success');
      if (failCount > 0) onShowToast(`${failCount} hesapta hata oluştu. Sonuçları kontrol edin.`, 'error');

    } catch (err) {
      onShowToast('Sunucu hatası: ' + err.message, 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleSchedulePost = () => {
    if (!fullText) { onShowToast('Lütfen bir paylaşım metni girin!', 'error'); return; }
    if (!scheduleTime) { onShowToast('Lütfen bir tarih ve saat seçin!', 'error'); return; }

    setScheduledPosts(prev => [{
      id: `post-${Date.now()}`,
      content: fullText,
      targetIds: selectedAccountIds,
      scheduledAt: scheduleTime,
      status: 'scheduled',
      mediaUrl,
      createdAt: new Date().toLocaleString('tr-TR')
    }, ...prev]);

    onShowToast('Paylaşım takvime eklendi!', 'success');
    setIsScheduleMode(false);
    setScheduleTime('');
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="p-5 rounded-2xl glass-panel border border-slate-800 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <PenTool className="text-indigo-400" size={20} />
            <span>Paylaşım Oluşturucu</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Seçtiğiniz hesaplara gerçek zamanlı gönderim. Hesapların API bilgileri otomatik kullanılır.
          </p>
        </div>
        <button
          onClick={() => setIsScheduleMode(!isScheduleMode)}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition flex items-center space-x-1.5 ${isScheduleMode ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-slate-800 text-slate-300 border-slate-700'}`}
        >
          <Clock size={14} />
          <span>{isScheduleMode ? 'Zamanlama Açık' : 'Zamanla'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left: Composer Form */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-2xl glass-panel border border-slate-800 space-y-4">

            {/* Account Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-2">
                Hedef Hesaplar {accounts.length === 0 && <span className="text-rose-400">(Önce Hesaplar bölümünden hesap bağlayın!)</span>}
              </label>
              {accounts.length === 0 ? (
                <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/30 text-xs text-rose-300">
                  Gönderim yapabilmek için önce <strong>Hesaplar & API</strong> bölümünden Twitter, Telegram, WhatsApp gibi hesaplarınızı bağlamanız gerekiyor.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {accounts.map(acc => {
                    const isSelected = selectedAccountIds.includes(acc.id);
                    const hasCreds = acc.credentials && Object.keys(acc.credentials).length > 0;
                    return (
                      <button
                        key={acc.id}
                        onClick={() => toggleAccount(acc.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition flex items-center space-x-1.5 ${
                          isSelected ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500/60' : 'bg-slate-900/60 text-slate-400 border-slate-800'
                        } ${!hasCreds ? 'opacity-50' : ''}`}
                        title={!hasCreds ? 'Bu hesabın API bilgileri eksik!' : ''}
                      >
                        <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-indigo-400' : 'bg-slate-600'}`}></span>
                        <span>{acc.name}</span>
                        {acc.platform === 'twitter' && acc.isVerified && <BadgeCheck size={12} className="text-sky-400" />}
                        {!hasCreds && <AlertTriangle size={12} className="text-amber-400" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Blue Tick Status */}
            {hasVerifiedTwitter && (
              <div className="p-3 rounded-xl bg-sky-950/40 border border-sky-500/30 text-xs text-sky-300 flex items-center space-x-2">
                <BadgeCheck size={16} className="text-sky-400 shrink-0" />
                <span><strong>Mavi Tik aktif!</strong> Twitter için 25.000 karaktere kadar bölünmeden gönderilir.</span>
              </div>
            )}

            {/* Textarea */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-300">Metin</label>
                <span className="text-[11px] text-slate-400">
                  {charCount} karakter
                  {isOverTwitterLimit && !hasVerifiedTwitter && <span className="text-amber-400 ml-2">🧵 {twitterChunks.length} tweet thread oluşacak</span>}
                  {hasVerifiedTwitter && charCount > 0 && <span className="text-sky-400 ml-2">✓ Mavi Tik</span>}
                </span>
              </div>
              <textarea
                rows={7}
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Paylaşımınızı buraya yazın..."
                className="w-full p-3.5 rounded-xl glass-input text-xs sm:text-sm text-white resize-none"
              />
            </div>

            {/* Hashtags */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Otomatik Hashtagler</label>
              <input
                type="text"
                value={autoHashtags}
                onChange={e => setAutoHashtags(e.target.value)}
                placeholder="#Teknoloji #Haber"
                className="w-full px-3 py-2 rounded-xl glass-input text-xs"
              />
            </div>

            {/* Quick Presets */}
            {hashtagPresets.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {hashtagPresets.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setAutoHashtags(prev => [prev, p.tags.join(' ')].filter(Boolean).join(' '))}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-indigo-950/60 text-slate-300 text-[11px] border border-slate-700 transition"
                  >
                    + {p.name}
                  </button>
                ))}
              </div>
            )}

            {/* Media URL */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                <ImageIcon size={13} className="inline mr-1 text-indigo-400" />
                Görsel URL (Opsiyonel)
              </label>
              <input
                type="text"
                value={mediaUrl}
                onChange={e => setMediaUrl(e.target.value)}
                placeholder="https://ornek.com/gorsel.jpg"
                className="w-full px-3 py-2 rounded-xl glass-input text-xs"
              />
            </div>

            {/* Schedule picker */}
            {isScheduleMode && (
              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 space-y-2">
                <label className="block text-xs font-bold text-amber-300">Tarih & Saat Seçin</label>
                <input
                  type="datetime-local"
                  value={scheduleTime}
                  onChange={e => setScheduleTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs"
                />
              </div>
            )}

            {/* Send Button */}
            <div className="pt-1">
              {isScheduleMode ? (
                <button
                  onClick={handleSchedulePost}
                  className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold shadow-lg transition flex items-center justify-center space-x-2"
                >
                  <Calendar size={16} />
                  <span>Zamanla</span>
                </button>
              ) : (
                <button
                  onClick={handleSendNow}
                  disabled={isSending || accounts.length === 0}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-500 hover:from-indigo-500 hover:to-sky-400 text-white text-sm font-bold shadow-lg transition flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  <span>{isSending ? 'Gönderiliyor...' : `Şimdi Gönder (${selectedAccounts.length} Hesap)`}</span>
                </button>
              )}
            </div>

            {/* Send Results */}
            {sendResults && sendResults.length > 0 && (
              <div className="space-y-2 pt-2">
                <p className="text-xs font-bold text-slate-300">Gönderim Sonuçları:</p>
                {sendResults.map((r, i) => (
                  <div key={i} className={`p-3 rounded-xl text-xs flex items-start space-x-2 ${r.success ? 'bg-emerald-950/40 border border-emerald-500/30' : 'bg-rose-950/40 border border-rose-500/30'}`}>
                    {r.success ? <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" /> : <XCircle size={14} className="text-rose-400 shrink-0 mt-0.5" />}
                    <div>
                      <p className="font-semibold text-white">{r.accountName} ({r.platform})</p>
                      <p className={r.success ? 'text-emerald-300' : 'text-rose-300'}>
                        {r.success ? (r.tweetId || r.messageId ? `Gönderildi ✓` : 'Başarılı ✓') : r.error}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>

        {/* Right: Live Platform Previews */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-5 rounded-2xl glass-panel border border-slate-800 space-y-4">

            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Sparkles className="text-amber-400" size={16} />
                <span>Canlı Önizleme</span>
              </h3>
              <div className="flex items-center space-x-1 text-xs">
                {['all','telegram','twitter','whatsapp'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActivePreviewTab(tab)}
                    className={`px-2 py-1 rounded-lg capitalize ${activePreviewTab === tab ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400'}`}
                  >
                    {tab === 'all' ? 'Tümü' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4 max-h-[580px] overflow-y-auto pr-1">

              {/* Telegram Preview */}
              {(activePreviewTab === 'all' || activePreviewTab === 'telegram') && (
                <div className="p-4 rounded-xl bg-slate-900 border border-sky-500/30 space-y-2">
                  <p className="text-xs text-sky-400 font-bold flex items-center space-x-2">
                    <MessageSquare size={14} />
                    <span>TELEGRAM</span>
                    <span className="text-[10px] text-slate-400 font-normal">Gerçek Bot API ile gönderim yapılır</span>
                  </p>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 leading-relaxed space-y-2">
                    {mediaUrl && <img src={mediaUrl} alt="" className="w-full max-h-48 object-cover rounded-lg" onError={e => e.target.style.display='none'} />}
                    <p className="whitespace-pre-wrap">{fullText || <span className="text-slate-500 italic">Mesaj metni burada görünecek...</span>}</p>
                    <p className="text-[10px] text-sky-400 text-right">Bot API · sendMessage</p>
                  </div>
                </div>
              )}

              {/* Twitter Preview */}
              {(activePreviewTab === 'all' || activePreviewTab === 'twitter') && (
                <div className="p-4 rounded-xl bg-slate-900 border border-neutral-700 space-y-2">
                  <p className="text-xs text-white font-bold flex items-center space-x-2">
                    <Twitter size={14} className="text-sky-400" />
                    <span>TWITTER (X)</span>
                    {hasVerifiedTwitter 
                      ? <span className="text-[10px] text-sky-300 font-semibold flex items-center"><BadgeCheck size={12} className="mr-0.5 text-sky-400" /> Mavi Tik · 25k limit</span>
                      : isOverTwitterLimit
                        ? <span className="text-[10px] text-amber-400 font-semibold">🧵 {twitterChunks.length} parça thread</span>
                        : <span className="text-[10px] text-slate-400 font-normal">{charCount}/280</span>
                    }
                  </p>
                  {(hasVerifiedTwitter || !isOverTwitterLimit) ? (
                    <div className="p-3 rounded-xl bg-black border border-neutral-800 text-xs text-slate-100 space-y-2">
                      <p className="text-sky-400 font-bold text-[11px] flex items-center space-x-1">
                        <span>@cem_tech_x</span>
                        {hasVerifiedTwitter && <BadgeCheck size={12} className="text-sky-400" />}
                      </p>
                      {mediaUrl && <img src={mediaUrl} alt="" className="w-full max-h-48 object-cover rounded-lg" onError={e => e.target.style.display='none'} />}
                      <p className="whitespace-pre-wrap">{fullText || <span className="text-slate-500 italic">Tweet içeriği...</span>}</p>
                      <p className="text-[10px] text-slate-500">OAuth 1.0a · POST /2/tweets</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {twitterChunks.map((chunk, i) => (
                        <div key={i} className="p-3 rounded-xl bg-black border border-neutral-800 text-xs text-slate-100">
                          {i === 0 && mediaUrl && <img src={mediaUrl} alt="" className="w-full max-h-48 object-cover rounded-lg mb-2" onError={e => e.target.style.display='none'} />}
                          <p className="whitespace-pre-wrap">{chunk}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* WhatsApp Preview */}
              {(activePreviewTab === 'all' || activePreviewTab === 'whatsapp') && (
                <div className="p-4 rounded-xl bg-slate-900 border border-emerald-500/30 space-y-2">
                  <p className="text-xs text-emerald-400 font-bold flex items-center space-x-2">
                    <MessageSquare size={14} />
                    <span>WHATSAPP</span>
                    <span className="text-[10px] text-slate-400 font-normal">Meta Cloud API ile gönderim</span>
                  </p>
                  <div className="p-3.5 rounded-xl bg-[#0b141a] border border-emerald-900/40 text-xs text-slate-100 space-y-2">
                    {mediaUrl && <img src={mediaUrl} alt="" className="w-full max-h-48 object-cover rounded-lg" onError={e => e.target.style.display='none'} />}
                    <p className="whitespace-pre-wrap">{fullText || <span className="text-slate-500 italic">WhatsApp mesajı...</span>}</p>
                    <p className="text-[10px] text-slate-400 text-right">19:27 ✓✓</p>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
