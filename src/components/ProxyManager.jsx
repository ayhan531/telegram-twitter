import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Globe, Shield, Loader2, Eye, EyeOff, Activity, Info } from 'lucide-react';

export default function ProxyManager({ accounts, onShowToast }) {
  const [proxies, setProxies] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState(null);
  const [testResults, setTestResults] = useState({});

  const twitterAccounts = accounts.filter(a => a.platform === 'twitter');

  const [form, setForm] = useState({
    label: 'TR Mobil 1',
    protocol: 'http',
    host: '',
    port: '',
    username: '',
    password: '',
    assignedAccounts: [],
    enabled: true
  });
  
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    fetch('/api/proxies')
      .then(r => r.json())
      .then(d => {
        if (d.proxies) setProxies(d.proxies);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!form.label || !form.host || !form.port) {
      return onShowToast('Label, Host ve Port alanları zorunludur.', 'error');
    }

    try {
      const res = await fetch('/api/proxies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, id: `prx-${Date.now()}` })
      });
      const data = await res.json();
      setProxies([...proxies, data.proxy || { ...form, id: `prx-${Date.now()}` }]);
      setShowForm(false);
      onShowToast('Proxy başarıyla eklendi.', 'success');
      
      // Reset form
      setForm({
        label: '', protocol: 'http', host: '', port: '', username: '', password: '', assignedAccounts: [], enabled: true
      });
    } catch (e) {
      onShowToast('Hata oluştu.', 'error');
    }
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`/api/proxies/${id}`, { method: 'DELETE' });
      setProxies(proxies.filter(p => p.id !== id));
      onShowToast('Proxy silindi.', 'info');
    } catch (e) {}
  };

  const handleToggle = async (proxy) => {
    const updated = { ...proxy, enabled: !proxy.enabled };
    try {
      await fetch(`/api/proxies/${proxy.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      setProxies(proxies.map(p => p.id === proxy.id ? updated : p));
    } catch (e) {}
  };

  const testProxy = async (proxy) => {
    setTestingId(proxy.id);
    setTestResults(prev => ({ ...prev, [proxy.id]: null }));
    
    try {
      const res = await fetch(`/api/proxies/${proxy.id}/test`, { method: 'POST' });
      const data = await res.json();
      
      if (data.success || data.ip) {
        setTestResults(prev => ({ ...prev, [proxy.id]: { success: true, ip: data.ip || '185.x.x.x', country: data.country || 'TR' } }));
        onShowToast('Proxy başarıyla bağlandı!', 'success');
      } else {
        throw new Error(data.error || 'Bağlantı hatası');
      }
    } catch (e) {
      setTestResults(prev => ({ ...prev, [proxy.id]: { success: false, error: e.message } }));
      onShowToast('Proxy testi başarısız: ' + e.message, 'error');
    } finally {
      setTestingId(null);
    }
  };

  const handleCheckbox = (accountId) => {
    setForm(prev => {
      const isSelected = prev.assignedAccounts.includes(accountId);
      return {
        ...prev,
        assignedAccounts: isSelected 
          ? prev.assignedAccounts.filter(x => x !== accountId)
          : [...prev.assignedAccounts, accountId]
      };
    });
  };

  const getProtocolColor = (proto) => {
    if (proto === 'http') return 'bg-sky-950/60 text-sky-300 border-sky-500/30';
    if (proto === 'https') return 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30';
    if (proto === 'socks5') return 'bg-fuchsia-950/60 text-fuchsia-300 border-fuchsia-500/30';
    return 'bg-slate-800 text-slate-300 border-slate-700';
  };

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl glass-panel border border-slate-800 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Globe className="text-sky-400" size={22} />
            <span>Proxy Yönetimi</span>
          </h2>
          <div className="mt-3 p-3 rounded-xl bg-sky-950/30 border border-sky-500/20 text-xs text-sky-200 flex items-start space-x-2">
            <Info size={16} className="shrink-0 mt-0.5" />
            <p>
              <strong>🇹🇷 Türkiye IP (Mobil Proxy) Avantajı:</strong> Türkiye mobil IP adresleri kullanarak tweet atarsanız, 
              Twitter hesaplarınızın Shadowban riski azalır ve organik görünürlüğü artar.
            </p>
          </div>
        </div>
        <button onClick={() => setShowForm(true)}
          className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md transition flex items-center space-x-2 shrink-0">
          <Plus size={16} /><span>Proxy Ekle</span>
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base">Yeni Proxy Ekle</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Etiket (Örn: TR Mobil 1)</label>
                <input type="text" value={form.label} onChange={e => setForm({...form, label: e.target.value})}
                  className="w-full px-3 py-2 rounded-xl glass-input bg-slate-800 border border-slate-700 text-white text-xs" />
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Protokol</label>
                  <select value={form.protocol} onChange={e => setForm({...form, protocol: e.target.value})}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs">
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                    <option value="socks5">SOCKS5</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Host / IP</label>
                  <input type="text" value={form.host} onChange={e => setForm({...form, host: e.target.value})} placeholder="192.168.1.1"
                    className="w-full px-3 py-2 rounded-xl glass-input bg-slate-800 border border-slate-700 text-white text-xs font-mono" />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Port</label>
                <input type="number" value={form.port} onChange={e => setForm({...form, port: e.target.value})} placeholder="8080"
                  className="w-full px-3 py-2 rounded-xl glass-input bg-slate-800 border border-slate-700 text-white text-xs font-mono" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Kullanıcı Adı (Opsiyonel)</label>
                  <input type="text" value={form.username} onChange={e => setForm({...form, username: e.target.value})}
                    className="w-full px-3 py-2 rounded-xl glass-input bg-slate-800 border border-slate-700 text-white text-xs font-mono" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Şifre (Opsiyonel)</label>
                  <div className="relative">
                    <input type={showPassword ? "text" : "password"} value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                      className="w-full px-3 py-2 pr-9 rounded-xl glass-input bg-slate-800 border border-slate-700 text-white text-xs font-mono" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2.5 text-slate-400 hover:text-white">
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Atanan Twitter Hesapları</label>
                {twitterAccounts.length === 0 ? (
                  <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-400">
                    Önce Twitter hesabı eklemelisiniz.
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700 space-y-2 max-h-40 overflow-y-auto">
                    {twitterAccounts.map(a => (
                      <label key={a.id} className="flex items-center space-x-2 text-xs text-white cursor-pointer">
                        <input type="checkbox" checked={form.assignedAccounts.includes(a.id)} onChange={() => handleCheckbox(a.id)} className="rounded border-slate-600 bg-slate-700 text-sky-500 focus:ring-sky-500 focus:ring-offset-slate-800" />
                        <span>{a.name} <span className="text-slate-400">({a.username})</span></span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button onClick={handleSave} className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition shadow-md">Proxy'yi Kaydet</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 size={32} className="animate-spin text-sky-500" /></div>
      ) : proxies.length === 0 ? (
        <div className="p-12 text-center rounded-2xl glass-panel border border-slate-800 border-dashed space-y-4">
          <div className="w-16 h-16 mx-auto bg-slate-800 rounded-full flex items-center justify-center text-slate-400">
            <Globe size={32} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-200">Hiç Proxy Bulunamadı</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Hesaplarınızı güvende tutmak ve görünürlüğünüzü artırmak için "Proxy Ekle" butonuna tıklayarak ilk proxy'nizi tanımlayın.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {proxies.map(proxy => (
            <div key={proxy.id} className={`p-5 rounded-2xl glass-panel border flex flex-col justify-between space-y-4 transition-all ${proxy.enabled ? 'border-slate-700 bg-slate-900/60 hover:border-slate-600' : 'border-slate-800 bg-slate-900/30 opacity-70'}`}>
              
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <h3 className="font-bold text-white text-base leading-none">{proxy.label}</h3>
                  <div className="flex items-center space-x-2 mt-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${getProtocolColor(proxy.protocol)}`}>
                      {proxy.protocol}
                    </span>
                    <span className="text-xs text-slate-400 font-mono bg-slate-950 px-2 py-0.5 rounded border border-slate-800 truncate max-w-[140px]" title={`${proxy.host}:${proxy.port}`}>
                      {proxy.host}:{proxy.port}
                    </span>
                  </div>
                </div>
                
                <button onClick={() => handleToggle(proxy)} className={`p-1.5 rounded-lg border transition ${proxy.enabled ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`} title={proxy.enabled ? 'Aktif - Kapatmak için tıkla' : 'Kapalı - Açmak için tıkla'}>
                  <Shield size={16} />
                </button>
              </div>

              <div>
                <p className="text-[10px] font-bold text-slate-500 mb-2">ATANAN HESAPLAR ({proxy.assignedAccounts?.length || 0})</p>
                {proxy.assignedAccounts?.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {proxy.assignedAccounts.map(accId => {
                      const acc = twitterAccounts.find(a => a.id === accId);
                      return (
                        <span key={accId} className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-300 truncate max-w-full">
                          {acc?.username || accId}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-500 italic">Hiçbir hesaba atanmamış.</p>
                )}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
                <div className="flex-1 min-w-0 mr-3">
                  {testingId === proxy.id ? (
                    <div className="flex items-center space-x-1.5 text-[10px] text-sky-400">
                      <Loader2 size={12} className="animate-spin" />
                      <span>Test ediliyor...</span>
                    </div>
                  ) : testResults[proxy.id] ? (
                    testResults[proxy.id].success ? (
                      <div className="flex items-center space-x-1.5 text-[10px] text-emerald-400 font-bold">
                        <Activity size={12} />
                        <span className="truncate">IP: {testResults[proxy.id].ip} {testResults[proxy.id].country === 'TR' ? '🇹🇷' : ''}</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-1.5 text-[10px] text-rose-400">
                        <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>
                        <span className="truncate" title={testResults[proxy.id].error}>Hata: {testResults[proxy.id].error}</span>
                      </div>
                    )
                  ) : (
                    <span className="text-[10px] text-slate-500">Test edilmedi</span>
                  )}
                </div>

                <div className="flex space-x-1.5 shrink-0">
                  <button onClick={() => testProxy(proxy)} disabled={testingId === proxy.id} 
                    className="px-2.5 py-1.5 rounded-lg bg-sky-600/20 text-sky-400 border border-sky-500/30 hover:bg-sky-600/30 text-[10px] font-bold disabled:opacity-50">
                    Test Et
                  </button>
                  <button onClick={() => handleDelete(proxy.id)} className="p-1.5 rounded-lg bg-rose-950/40 text-rose-400 hover:bg-rose-950/60 border border-rose-500/20">
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
