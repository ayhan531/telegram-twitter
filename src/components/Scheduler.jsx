import React, { useState } from 'react';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Plus, 
  Send, 
  Filter,
  ArrowRight
} from 'lucide-react';

export default function Scheduler({ 
  accounts, 
  scheduledPosts, 
  setScheduledPosts, 
  logs, 
  setLogs, 
  onOpenQuickCompose,
  onShowToast 
}) {
  
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'scheduled', 'published'

  const filteredPosts = scheduledPosts.filter(post => {
    if (statusFilter === 'all') return true;
    return post.status === statusFilter;
  });

  const handlePublishNow = (post) => {
    // Update post status to published
    setScheduledPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'published' } : p));
    
    // Add to activity logs
    const selectedAccNames = accounts
      .filter(a => post.targetIds.includes(a.id))
      .map(a => a.name);

    const newLog = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleString('tr-TR'),
      source: 'Planlanmış Takvim Gönderisi',
      messagePreview: post.content.slice(0, 60) + '...',
      targets: selectedAccNames,
      status: 'success',
      details: 'Planlanan saat öncesi kullanıcı tarafından anında tetiklendi.'
    };

    setLogs(prev => [newLog, ...prev]);
    onShowToast('Gönderi anında yayınlandı!', 'success');
  };

  const handleDeletePost = (id) => {
    setScheduledPosts(prev => prev.filter(p => p.id !== id));
    onShowToast('Planlanmış gönderi silindi.', 'info');
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="p-6 rounded-2xl glass-panel border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <CalendarIcon className="text-amber-400" />
            <span>Planlanmış Paylaşım & Takvim Kuyruğu</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Gelecek tarihler için zamanladığınız gönderilerin yayın saatlerini yönetin, takvimi inceleyin veya anında tetikleyin.
          </p>
        </div>

        <div className="flex items-center space-x-3 self-start md:self-auto">
          {/* Status Filter */}
          <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-lg ${statusFilter === 'all' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400'}`}
            >
              Tümü ({scheduledPosts.length})
            </button>
            <button
              onClick={() => setStatusFilter('scheduled')}
              className={`px-3 py-1 rounded-lg ${statusFilter === 'scheduled' ? 'bg-amber-600 text-white font-semibold' : 'text-slate-400'}`}
            >
              Planlananlar ({scheduledPosts.filter(p => p.status === 'scheduled').length})
            </button>
            <button
              onClick={() => setStatusFilter('published')}
              className={`px-3 py-1 rounded-lg ${statusFilter === 'published' ? 'bg-emerald-600 text-white font-semibold' : 'text-slate-400'}`}
            >
              Yayınlananlar
            </button>
          </div>

          <button
            onClick={onOpenQuickCompose}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-500 hover:from-indigo-500 hover:to-sky-400 text-white text-xs font-semibold shadow-md"
          >
            <Plus size={16} />
            <span>Zamanla</span>
          </button>
        </div>
      </div>

      {/* Calendar Grid Representation & Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Visual Calendar Box (4 cols) */}
        <div className="lg:col-span-4 p-5 rounded-2xl glass-panel border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2">
            <Clock size={16} className="text-amber-400" />
            <span>Zamanlama Özeti</span>
          </h3>

          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Bekleyen Gönderi:</span>
              <span className="font-bold text-amber-400 text-sm">
                {scheduledPosts.filter(p => p.status === 'scheduled').length} Adet
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Gelecek 24 Saat İçinde:</span>
              <span className="font-bold text-sky-400">2 Gönderi</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Otomatik Yayın Durumu:</span>
              <span className="text-emerald-400 font-bold flex items-center">
                <span className="w-2 h-2 rounded-full bg-emerald-400 mr-1 animate-pulse"></span>
                Zamanlayıcı Aktif
              </span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-800/30 text-xs space-y-2">
            <p className="font-semibold text-indigo-300">💡 Bilgi & Öneri</p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Render sunucusuna deploy ettikten sonra bilgisayarınızı kapatsanız dahi zamanlanmış tüm sosyal medya paylaşımlarınız belirlediğiniz saatte otomatik yayınlanacaktır.
            </p>
          </div>
        </div>

        {/* Right Column: Scheduled Posts Queue (8 cols) */}
        <div className="lg:col-span-8 space-y-3">
          {filteredPosts.length === 0 ? (
            <div className="p-12 text-center rounded-2xl glass-panel border border-slate-800 space-y-3">
              <CalendarIcon size={36} className="mx-auto text-slate-600" />
              <p className="text-sm font-semibold text-slate-300">Kuyrukta bu kriterde gönderi bulunamadı.</p>
              <button
                onClick={onOpenQuickCompose}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold"
              >
                + Yeni Gönderi Zamanla
              </button>
            </div>
          ) : (
            filteredPosts.map(post => {
              const targetAccs = accounts.filter(a => post.targetIds.includes(a.id));
              const isScheduled = post.status === 'scheduled';

              return (
                <div key={post.id} className="p-5 rounded-2xl glass-panel border border-slate-800 hover:border-indigo-500/30 transition space-y-3">
                  
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div className="flex items-center space-x-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        isScheduled ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}>
                        {isScheduled ? '⏳ Planlandı' : '✅ Yayınlandı'}
                      </span>
                      <span className="text-xs text-slate-300 font-semibold flex items-center space-x-1">
                        <Clock size={13} className="text-slate-400" />
                        <span>Tarih: {post.scheduledAt.replace('T', ' ')}</span>
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      {isScheduled && (
                        <button
                          onClick={() => handlePublishNow(post)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition flex items-center space-x-1"
                        >
                          <Send size={12} />
                          <span>Şimdi Yayınla</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleDeletePost(post.id)}
                        className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Post Content */}
                  <p className="text-xs sm:text-sm text-slate-100 whitespace-pre-wrap leading-relaxed">
                    {post.content}
                  </p>

                  {/* Target accounts badges */}
                  <div className="flex items-center justify-between pt-1 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-slate-400">Hedefler:</span>
                      {targetAccs.map(t => (
                        <span key={t.id} className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 text-[11px]">
                          {t.name}
                        </span>
                      ))}
                    </div>

                    <span className="text-[10px] text-slate-500">Oluşturulma: {post.createdAt}</span>
                  </div>

                </div>
              );
            })
          )}
        </div>

      </div>

    </div>
  );
}
