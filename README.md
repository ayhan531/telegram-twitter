# 🚀 OmniSync Social - Otomatik Çapraz Paylaşım & Zamanlayıcı Platformu

OmniSync Social, Telegram kanallarınızdan/gruplarınızdan veya diğer sosyal medya hesaplarınızdan (Twitter/X, WhatsApp, LinkedIn, Instagram, Discord) otomatik içerik çekip diğer tüm hesaplarınıza çapraz paylaşım (cross-posting) yapmanızı sağlayan modern bir otomasyon merkezidir.

---

## 🌟 Öne Çıkan Özellikler

1. **Çapraz Paylaşım & Otomasyon Kuralları (Multi-Channel Sync)**:
   - Kaynak kanal (Örn: Telegram Teknoloji Kanalı) -> Hedef hesaplar (Twitter, WhatsApp, LinkedIn, Discord).
   - İstediğiniz kuralı tek tıkla aktif/pasif yapma.

2. **Gelişmiş Paylaşım Oluşturucu & Canlı Önizleme**:
   - Telegram, Twitter, WhatsApp, LinkedIn ve Instagram için anlık canlı önizleme kartları.
   - Twitter 280 karakter sınırı kontrolü ve otomatik **Tweet Thread / Flood** bölücü.

3. **Hashtag & İçerik Dönüştürme Filtreleri**:
   - Yasaklı kelimeleri otomatik temizleme / değiştirme.
   - Platforma özel otomatik hashtag grupları ekleme.

4. **Planlanmış Paylaşım & Takvim**:
   - İstenilen tarih ve saatte gönderi planlama.
   - İnteraktif haftalık/aylık takvim görünümü.

5. **Canlı Webhook Test & Simülatörü**:
   - Telegram veya WhatsApp'tan örnek mesaj atarak sistemin bunu nasıl dönüştürüp diğer kanallara aktardığını canlı simüle etme.

---

## 📱 Render.com Üzerinde Mobil / Bulut Yayınlama (Deploy Guide)

Bilgisayar başında değilken telefonunuzdan veya herhangi bir cihazdan erişmek için 3 basit adımda Render'a deploy edebilirsiniz:

### 1. GitHub'a Yükleme
1. [GitHub](https://github.com)'da yeni bir repo oluşturun (Örn: `omni-social-sync`).
2. Bu klasördeki tüm dosyaları GitHub reposuna push edin:
   ```bash
   git init
   git add .
   git commit -m "Initial OmniSync Social release"
   git branch -M main
   git remote add origin https://github.com/KULLANICI_ADINIZ/omni-social-sync.git
   git push -u origin main
   ```

### 2. Render.com Bağlantısı
1. [Render Dashboard](https://dashboard.render.com/)'a gidin.
2. **New +** butonuna basıp **Web Service** seçeneğini seçin.
3. GitHub reponuzu bağlayın.
4. Render ayarları otomatik algılayacaktır (`render.yaml` sayesinde):
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
5. **Create Web Service** butonuna basın!

🎉 Birkaç dakika içinde `https://omni-social-sync.onrender.com` gibi canlı bir adresiniz olacak ve telefonunuzdan girip tüm paylaşımları yönetebileceksiniz!

---

## 💻 Yerel Geliştirme (Local Setup)

```bash
# Bağımlılıkları yükleme
npm install

# Geliştirici sunucusunu başlatma (Local dev)
npm run dev

# Production build ve canlı sunucu testi
npm run build
npm start
```
