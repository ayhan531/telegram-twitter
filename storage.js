// ═══════════════════════════════════════════════════════════════════════════
//  KALICI DEPOLAMA
//
//  Neden gerekti: Render'ın dosya sistemi geçicidir. Her deploy, her yeniden
//  başlatma diski sıfırlar. Durum yalnızca data/state.json içinde tutulduğu
//  sürece her güncellemede bağlı hesapların TAMAMI siliniyordu.
//
//  Sıralama:
//    1. DATABASE_URL varsa  → Postgres (deploy'dan etkilenmez, çok cihaz güvenli)
//    2. Yoksa               → disk (atomik yazma + yedek + bozulma kurtarma)
//
//  Disk yolu kalıcı bir diske bağlı değilse açılışta yüksek sesle uyarıyoruz.
// ═══════════════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import os from 'os';

const STATE_KEY = 'app_state';

// ─── Postgres ───────────────────────────────────────────────────────────────
class PostgresStore {
  constructor(url) {
    this.url = url;
    this.pool = null;
    this.kind = 'postgres';
  }

  // TLS doğrulamasını körlemesine kapatmıyoruz: kapatmak, araya girenin
  // veritabanı trafiğini okumasına kapı açar. Önce doğrulayarak bağlanmayı
  // deniyor, yalnızca sertifika hatası alırsak ne yapılacağını söylüyoruz.
  sslOptions(verify) {
    if (/localhost|127\.0\.0\.1/.test(this.url) || /sslmode=disable/.test(this.url)) return false;
    return verify ? { rejectUnauthorized: true } : { rejectUnauthorized: false };
  }

  async connectWith(pg, ssl) {
    const pool = new pg.Pool({ connectionString: this.url, ssl, max: 4 });
    await pool.query('SELECT 1');
    return pool;
  }

  async init() {
    const { default: pg } = await import('pg');
    try {
      this.pool = await this.connectWith(pg, this.sslOptions(true));
    } catch (e) {
      const certIssue = /self.signed|unable to verify|certificate/i.test(e.message);
      if (!certIssue) throw e;

      if (process.env.PGSSL_NO_VERIFY === '1') {
        console.warn('[Depolama] Sertifika doğrulanamadı; PGSSL_NO_VERIFY=1 olduğu için doğrulamasız bağlanılıyor.');
        this.pool = await this.connectWith(pg, this.sslOptions(false));
      } else {
        throw new Error(
          `Veritabanı sertifikası doğrulanamadı (${e.message}). Render kullanıyorsan ` +
          '"Internal Database URL" değerini kullan — bu özel ağ üzerinden gider ve sorunu çözer. ' +
          'Zorunda kalırsan PGSSL_NO_VERIFY=1 ile doğrulamayı kapatabilirsin, ama tercih edilmez.'
        );
      }
    }

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS app_state (
        key         TEXT PRIMARY KEY,
        value       JSONB NOT NULL,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    // Her yazmada bir öncekini saklıyoruz: yanlış bir kayıt gelirse geri
    // dönebilelim diye. Sınırlı sayıda tutuluyor.
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS app_state_history (
        id          BIGSERIAL PRIMARY KEY,
        value       JSONB NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    return this;
  }

  async load() {
    const r = await this.pool.query('SELECT value FROM app_state WHERE key = $1', [STATE_KEY]);
    return r.rows[0]?.value || null;
  }

  async save(state) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const prev = await client.query('SELECT value FROM app_state WHERE key = $1', [STATE_KEY]);
      if (prev.rows[0]) {
        await client.query('INSERT INTO app_state_history (value) VALUES ($1)', [prev.rows[0].value]);
        await client.query(`
          DELETE FROM app_state_history
          WHERE id NOT IN (SELECT id FROM app_state_history ORDER BY id DESC LIMIT 50)
        `);
      }
      await client.query(`
        INSERT INTO app_state (key, value, updated_at) VALUES ($1, $2, now())
        ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()
      `, [STATE_KEY, JSON.stringify(state)]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async backups() {
    const r = await this.pool.query(
      'SELECT id, created_at, value FROM app_state_history ORDER BY id DESC LIMIT 50');
    return r.rows.map(row => ({
      id: String(row.id),
      createdAt: row.created_at,
      accounts: row.value?.accounts?.length || 0,
      rules: row.value?.rules?.length || 0,
    }));
  }

  async restore(id) {
    const r = await this.pool.query('SELECT value FROM app_state_history WHERE id = $1', [id]);
    if (!r.rows[0]) throw new Error('Yedek bulunamadı.');
    await this.save(r.rows[0].value);
    return r.rows[0].value;
  }

  describe() {
    return { kind: 'postgres', durable: true, detail: 'Postgres — deploy ve yeniden başlatmalardan etkilenmez.' };
  }
}

// ─── Disk ───────────────────────────────────────────────────────────────────
class FileStore {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'state.json');
    this.backupDir = path.join(dir, 'backups');
    this.kind = 'file';
  }

  async init() {
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(this.backupDir, { recursive: true, mode: 0o700 });
    // Klasör oluşabildi diye yazılabildiği anlamına gelmiyor (salt okunur
    // bağlanmış bir disk gibi). Gerçekten yazabildiğimizi kanıtlıyoruz.
    const probe = path.join(this.dir, '.write-test');
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return this;
  }

  async load() {
    const candidates = [this.file, ...this.backupPaths()];
    for (const p of candidates) {
      try {
        if (!fs.existsSync(p)) continue;
        const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (p !== this.file) {
          console.warn(`[Depolama] Ana dosya okunamadı, yedekten geri yüklendi: ${path.basename(p)}`);
        }
        return parsed;
      } catch (e) {
        console.error(`[Depolama] ${path.basename(p)} bozuk, bir önceki yedek denenecek: ${e.message}`);
      }
    }
    return null;
  }

  async save(state) {
    const json = JSON.stringify(state, null, 2);
    // Doğrudan üzerine yazarsak yazma sırasında kesinti olduğunda dosya
    // yarım kalır ve her şey kaybolur. Önce geçici dosyaya yazıp yer
    // değiştiriyoruz; rename aynı dosya sisteminde atomiktir.
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, json, { mode: 0o600 });
    fs.renameSync(tmp, this.file);

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(this.backupDir, `state-${stamp}.json`), json, { mode: 0o600 });
    this.pruneBackups();
  }

  backupPaths() {
    try {
      return fs.readdirSync(this.backupDir)
        .filter(f => f.startsWith('state-') && f.endsWith('.json'))
        .sort().reverse()
        .map(f => path.join(this.backupDir, f));
    } catch {
      return [];
    }
  }

  pruneBackups() {
    const all = this.backupPaths();
    for (const p of all.slice(50)) {
      try { fs.unlinkSync(p); } catch { /* yoksay */ }
    }
  }

  async backups() {
    return this.backupPaths().map(p => {
      let parsed = {};
      try { parsed = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { /* bozuk yedek */ }
      return {
        id: path.basename(p),
        createdAt: fs.statSync(p).mtime,
        accounts: parsed.accounts?.length || 0,
        rules: parsed.rules?.length || 0,
      };
    });
  }

  async restore(id) {
    // Dizin dışına çıkan bir isim gelmesin.
    const safe = path.basename(String(id));
    const p = path.join(this.backupDir, safe);
    if (!fs.existsSync(p)) throw new Error('Yedek bulunamadı.');
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    await this.save(parsed);
    return parsed;
  }

  describe() {
    // Render'da kalıcı disk /var/... altına bağlanır. Uygulama klasörünün
    // içindeki bir yol her deploy'da sıfırlanır.
    const onRender = !!process.env.RENDER;
    const looksPersistent = /^\/var\/|^\/data|^\/mnt/.test(this.dir);
    const durable = !onRender || looksPersistent;
    return {
      kind: 'file',
      durable,
      detail: durable
        ? `Disk: ${this.dir}`
        : `⚠️ ${this.dir} kalıcı DEĞİL. Render bu klasörü her deploy'da siler; bağlı hesaplar kaybolur.`,
    };
  }
}

// ─── Seçim ──────────────────────────────────────────────────────────────────
export async function createStore({ databaseUrl, dataDir }) {
  if (databaseUrl) {
    try {
      const store = await new PostgresStore(databaseUrl).init();
      console.log('[Depolama] Postgres bağlandı — veriler deploy\'dan etkilenmez.');
      return store;
    } catch (e) {
      // Veritabanına ulaşamadığımızda çökmek yerine diske düşüyoruz; yoksa
      // geçici bir ağ sorunu uygulamayı tamamen kaldıramaz hâle getirirdi.
      console.error('[Depolama] Postgres bağlanamadı, diske düşülüyor:', e.message);
    }
  }
  // Tercih edilen klasör kullanılamıyorsa (kalıcı disk henüz eklenmemiş,
  // izin yok, salt okunur bağlanmış) sırayla diğerlerini deniyoruz.
  // Depolama katmanı hiçbir koşulda uygulamayı düşürmemeli.
  const candidates = [dataDir, '/var/data', path.join(process.cwd(), 'data'), path.join(os.tmpdir(), 'omnisync')]
    .filter(Boolean)
    .filter((d, i, arr) => arr.indexOf(d) === i);

  const failures = [];
  for (const dir of candidates) {
    try {
      const store = await new FileStore(dir).init();
      const info = store.describe();
      if (dir !== dataDir) {
        console.warn(`[Depolama] ${dataDir} kullanılamadı (${failures[0] || 'bilinmeyen sebep'}), ${dir} kullanılıyor.`);
      }
      if (!info.durable) {
        console.warn('══════════════════════════════════════════════════════════════');
        console.warn(info.detail);
        console.warn('Kalıcı hâle getirmek için Render panelinde ya:');
        console.warn('  • Disks → Add Disk  (Mount Path: /var/data)   ya da');
        console.warn('  • New → Postgres oluşturup servise bağla (DATABASE_URL otomatik gelir)');
        console.warn('══════════════════════════════════════════════════════════════');
      }
      return store;
    } catch (e) {
      failures.push(`${dir}: ${e.message}`);
    }
  }

  throw new Error('Hiçbir yazılabilir depolama klasörü bulunamadı → ' + failures.join(' | '));
}
