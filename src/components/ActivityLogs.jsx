import React, { useState } from 'react';
import { 
  ListOrdered, 
  Search, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Filter,
  Eye
} from 'lucide-react';

export default function ActivityLogs({ logs, setLogs, onShowToast }) {
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLogModal, setSelectedLogModal] = useState(null);

  const filteredLogs = logs.filter(log => {
    const term = searchTerm.toLowerCase();
    return (
      log.source.toLowerCase().includes(term) ||
      log.messagePreview.toLowerCase().includes(term) ||
      log.targets.join(' ').toLowerCase().includes(term)
    );
  });

  const handleClearLogs = () => {
    if (confirm('Tüm işlem geçmişi ve logları temizlemek istediğinize emin misiniz?')) {
      setLogs([]);
      onShowToast('Log geçmişi temizlendi.', 'info');
    }
  };

  const handleRetryDispatch = (log) => {
    onShowToast(`"${log.messagePreview.slice(0, 30)}..." mesajı yeniden gönderildi!`, 'success');
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="p-6 rounded-2xl glass-panel border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <ListOrdered className="text-indigo-400" />
            <span>İşlem Geçmişi & Denetim Logları (Audit Logs)</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Çapraz paylaşımların tarih, kaynak, hedef, filtre sonucu ve dağıtım durumlarını detaylı inceleyin.
          </p>
        </div>

        <div className="flex items-center space-x-3 self-start md:self-auto">
          {/* Search bar */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <input 
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Loglarda ara..."
              className="pl-8 pr-3 py-1.5 rounded-xl glass-input text-xs text-white"
            />
          </div>

          <button
            onClick={handleClearLogs}
            className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold transition"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="p-5 rounded-2xl glass-panel border border-slate-800 space-y-4 overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-900/80 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800">
            <tr>
              <th className="py-3 px-4">Tarih & Saat</th>
              <th className="py-3 px-4">Kaynak</th>
              <th className="py-3 px-4">Mesaj Özeti</th>
              <th className="py-3 px-4">Hedef Hesaplar</th>
              <th className="py-3 px-4">Durum</th>
              <th className="py-3 px-4 text-right">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  Kayıtlı log bulunamadı.
                </td>
              </tr>
            ) : (
              filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-900/40 transition">
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">{log.timestamp}</td>
                  <td className="py-3 px-4 font-semibold text-white">{log.source}</td>
                  <td className="py-3 px-4 max-w-xs truncate text-slate-200">"{log.messagePreview}"</td>
                  <td className="py-3 px-4">{log.targets.join(', ')}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      log.status === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      log.status === 'filtered' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                      'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}>
                      {log.status === 'success' ? 'Başarılı' : log.status === 'filtered' ? 'Filtrelendi' : 'Hata'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right space-x-1">
                    <button
                      onClick={() => setSelectedLogModal(log)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                      title="Detayı Gör"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      onClick={() => handleRetryDispatch(log)}
                      className="p-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 transition"
                      title="Yeniden Gönder"
                    >
                      <RefreshCw size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Log Detail Modal */}
      {selectedLogModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Log Detayları ({selectedLogModal.id})</h3>
              <button onClick={() => setSelectedLogModal(null)} className="text-slate-400">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="font-bold text-slate-400">Tarih:</span>
                <p className="text-white font-mono">{selectedLogModal.timestamp}</p>
              </div>

              <div>
                <span className="font-bold text-slate-400">Kaynak:</span>
                <p className="text-white">{selectedLogModal.source}</p>
              </div>

              <div>
                <span className="font-bold text-slate-400">Hedefler:</span>
                <p className="text-emerald-400 font-semibold">{selectedLogModal.targets.join(', ')}</p>
              </div>

              <div>
                <span className="font-bold text-slate-400">Mesaj İletisi:</span>
                <p className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 whitespace-pre-wrap mt-1">
                  {selectedLogModal.messagePreview}
                </p>
              </div>

              <div>
                <span className="font-bold text-slate-400">Dönüştürücü İşlem Detayı:</span>
                <p className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 mt-1">
                  {selectedLogModal.details}
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedLogModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-semibold"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
