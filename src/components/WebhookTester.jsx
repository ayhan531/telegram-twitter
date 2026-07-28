import React, { useState } from 'react';
import { 
  Sparkles, 
  Play, 
  CheckCircle2, 
  ArrowRight, 
  Terminal, 
  MessageSquare, 
  Twitter, 
  Linkedin, 
  RefreshCw,
  Zap,
  Filter,
  Check,
  BadgeCheck,
  ImageIcon
} from 'lucide-react';

export default function WebhookTester({ accounts, rules, logs, setLogs, onShowToast }) {
  
  const [selectedRuleId, setSelectedRuleId] = useState(rules[0]?.id || '');
  const [testPayload, setTestPayload] = useState(
    '🚀 YENİ DUYURU: OmniSync yapay zeka entegrasyonu ile artık Telegram kanallarınızdaki tüm haberler Twitter, WhatsApp ve LinkedIn hesaplarınıza otomatik aktarılıyor! Mavi tikli hesaplar için 25.000 karakter desteği ile bölünmeden görsel iletimi sağlandı.'
  );
  const [testMediaUrl, setTestMediaUrl] = useState('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80');

  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationSteps, setSimulationSteps] = useState([]);
  const [simComplete, setSimComplete] = useState(false);

  const activeRule = rules.find(r => r.id === selectedRuleId) || rules[0];

  const handleRunSimulation = () => {
    if (!testPayload.trim()) {
      onShowToast('Lütfen test mesajı metni yazın!', 'error');
      return;
    }

    setIsSimulating(true);
    setSimComplete(false);
    setSimulationSteps([]);

    const sourceAcc = accounts.find(a => a.id === activeRule?.sourceId);
    const targetAccs = accounts.filter(a => activeRule?.targetIds.includes(a.id));
    const twitterAcc = targetAccs.find(a => a.platform === 'twitter');
    const isTwitterVerified = twitterAcc?.isVerified ?? true;

    // Step 1: Webhook payload received
    setTimeout(() => {
      setSimulationSteps(prev => [...prev, {
        id: 1,
        title: `1. Webhook Payload Alındı [${sourceAcc?.name || 'Telegram Kanalı'}]`,
        detail: `Gelen içerik: "${testPayload.slice(0, 50)}..." ${testMediaUrl ? '(🖼️ Görsel Medya Ekli)' : ''}`,
        status: 'success'
      }]);
    }, 400);

    // Step 2: Banned keywords filter check
    setTimeout(() => {
      const bannedArr = activeRule?.options?.bannedKeywords || [];
      const hasBanned = bannedArr.some(k => testPayload.toLowerCase().includes(k.toLowerCase()));

      if (hasBanned) {
        setSimulationSteps(prev => [...prev, {
          id: 2,
          title: '2. Kelime Filtresi Kontrolü',
          detail: 'Yasaklı kelime algılandı! Akış durduruldu.',
          status: 'failed'
        }]);
        setIsSimulating(false);
        setSimComplete(true);
        return;
      }

      setSimulationSteps(prev => [...prev, {
        id: 2,
        title: '2. Kelime Filtresi Kontrolü',
        detail: '✓ Filtrelerden geçti (Yasaklı kelime yok)',
        status: 'success'
      }]);
    }, 900);

    // Step 3: Media Forwarding Check
    setTimeout(() => {
      setSimulationSteps(prev => [...prev, {
        id: 3,
        title: '3. Görsel & Medya İletim İşlemcisi',
        detail: testMediaUrl 
          ? '🖼️ Görsel medya optimize edildi ve hedef kanalların medya havuzuna eklendi.'
          : 'Yalnızca metin içerik iletiliyor.',
        status: 'success'
      }]);
    }, 1400);

    // Step 4: Blue Tick Verification & Character Limit Check
    setTimeout(() => {
      setSimulationSteps(prev => [...prev, {
        id: 4,
        title: '4. Twitter Mavi Tik (X Premium) & Karakter Sınırı Kontrolü',
        detail: isTwitterVerified 
          ? '🔵 Twitter hesabı MAVİ TİK (X Premium) sahibi! 25.000 karakter kapasitesi aktif -> Metin GEREKSİZ BÖLÜNMEDEN TEK PARÇA iletildi.'
          : 'Standart Twitter hesabı -> 280 karakter sınırı kontrol edildi.',
        status: 'success'
      }]);
    }, 1900);

    // Step 5: Broadcast completed
    setTimeout(() => {
      setSimulationSteps(prev => [...prev, {
        id: 5,
        title: `5. Hedef Hesaplara Başarıyla Gönderildi (${targetAccs.length} Kanal)`,
        detail: `Hedefler: ${targetAccs.map(t => `${t.name} ${t.platform === 'twitter' && t.isVerified ? '(🔵 Mavi Tik)' : ''}`).join(', ')}`,
        status: 'success'
      }]);

      setIsSimulating(false);
      setSimComplete(true);

      // Add to actual log store
      const newLog = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleString('tr-TR'),
        source: `${sourceAcc?.name || 'Telegram'} (Webhook Simülatörü)`,
        messagePreview: testPayload.slice(0, 60) + '...',
        targets: targetAccs.map(t => t.name),
        status: 'success',
        details: isTwitterVerified 
          ? 'Twitter Mavi Tik sayesinde 25.000 karakter desteğiyle gereksiz bölünmeden görsel iletimi sağlandı.' 
          : 'Canlı Webhook simülasyonu başarıyla dağıtıldı.'
      };

      setLogs(prev => [newLog, ...prev]);
      onShowToast('Webhook simülasyonu Mavi Tik & Görsel medya ile tamamlandı!', 'success');
    }, 2400);
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="p-6 rounded-2xl glass-panel border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Sparkles className="text-amber-400" />
            <span>Canlı Webhook & Görsel Medya Simülatörü</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Görsel medya ve Twitter Mavi Tik (25.000 karakter) desteğinin canlı simülasyonunu çalıştırın.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Input Column (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          
          <div className="p-5 rounded-2xl glass-panel border border-slate-800 space-y-4">
            
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Test Edilecek Paylaşım Kuralı
              </label>
              <select
                value={selectedRuleId}
                onChange={(e) => setSelectedRuleId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs"
              >
                {rules.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Simüle Edilecek Mesaj Metni
              </label>
              <textarea
                rows={5}
                value={testPayload}
                onChange={(e) => setTestPayload(e.target.value)}
                className="w-full p-3.5 rounded-xl glass-input text-xs text-white resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Görsel Medya URL'si (Opsiyonel)
              </label>
              <input
                type="text"
                value={testMediaUrl}
                onChange={(e) => setTestMediaUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
              />
            </div>

            <button
              onClick={handleRunSimulation}
              disabled={isSimulating}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-amber-500/20 transition flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {isSimulating ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>Simülasyon Çalışıyor...</span>
                </>
              ) : (
                <>
                  <Play size={16} />
                  <span>Canlı Mavi Tik & Medya Simülasyonunu Başlat</span>
                </>
              )}
            </button>

          </div>

        </div>

        {/* Right Simulation Stepper Column (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-5 rounded-2xl glass-panel border border-slate-800 space-y-4 min-h-[380px]">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Terminal className="text-indigo-400" size={16} />
              <span>Canlı Otomasyon İnceleme Konsolu</span>
            </h3>

            {simulationSteps.length === 0 ? (
              <div className="p-12 text-center text-slate-500 space-y-2">
                <Sparkles size={32} className="mx-auto text-slate-600" />
                <p className="text-xs">Sol taraftan "Simülasyonu Başlat" butonuna basın.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {simulationSteps.map(step => (
                  <div 
                    key={step.id}
                    className={`p-3.5 rounded-xl border transition-all ${
                      step.status === 'success' ? 'bg-slate-900/90 border-emerald-500/30' : 'bg-rose-950/30 border-rose-500/30'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 size={16} className={step.status === 'success' ? 'text-emerald-400' : 'text-rose-400'} />
                      <h4 className="font-bold text-xs text-white">{step.title}</h4>
                    </div>
                    <p className="text-[11px] text-slate-400 pl-6 mt-0.5">{step.detail}</p>
                  </div>
                ))}

                {simComplete && (
                  <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center space-x-2">
                    <BadgeCheck size={20} className="text-sky-400 shrink-0" />
                    <span>Mavi Tik (25.000 Karakter) ve Görsel Medya iletimi ile simülasyon başarıyla tamamlandı!</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
