import React, { useState, useEffect } from 'react';
import { Activity, RefreshCw, CheckCircle2, XCircle, Filter, MessageSquare } from 'lucide-react';

export default function ActivityLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/sync/logs');
      const d = await r.json();
      if (d.logs) setLogs(d.logs);
    } catch (_) {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-2xl glass-panel border border-slate-800 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Activity className="text-emerald-400" size={22} />
            <span>Canlı Akış & Otomatik Tweet Logları</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Telegram'dan yakalanan mesajlar ve Twitter'a gönderilen tweetlerin canlı durum günlüğü.
          </p>
        </div>
        <button onClick={fetchLogs} disabled={loading}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 flex items-center space-x-2 transition">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Yenile</span>
        </button>
      </div>

      {/* Logs Feed */}
      {logs.length === 0 ? (
        <div className="p-12 text-center rounded-2xl glass-panel border border-slate-800 border-dashed space-y-3">
          <div className="text-4xl">📡</div>
          <h3 className="text-sm font-bold text-slate-200">Henüz Log Kaydı Yok</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Telegram kanalından yeni bir mesaj geldiğinde veya test tweeti attığınızda durum burada görüntülenecektir.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map(log => (
            <div key={log.id} className="p-4 rounded-xl glass-panel border border-slate-800 flex items-start justify-between gap-4">
              <div className="flex items-start space-x-3 min-w-0 flex-1">
                <div className="mt-1 shrink-0">
                  {log.status === 'success' && <CheckCircle2 size={18} className="text-emerald-400" />}
                  {log.status === 'filtered' && <Filter size={18} className="text-amber-400" />}
                  {log.status === 'error' && <XCircle size={18} className="text-rose-400" />}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center space-x-2 flex-wrap">
                    <span className="text-xs font-bold text-white">{log.source}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{log.timestamp}</span>
                  </div>
                  <p className="text-xs text-slate-300 font-medium line-clamp-2 bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                    "{log.messagePreview}"
                  </p>
                  {log.details && (
                    <p className="text-[11px] text-slate-400">{log.details}</p>
                  )}
                </div>
              </div>

              <div className="shrink-0">
                <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase ${
                  log.status === 'success' ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30' :
                  log.status === 'filtered' ? 'bg-amber-950 text-amber-300 border border-amber-500/30' :
                  'bg-rose-950 text-rose-300 border border-rose-500/30'
                }`}>
                  {log.status === 'success' ? 'Başarılı' : log.status === 'filtered' ? 'Filtrelendi' : 'Hata'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
