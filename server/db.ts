import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.resolve('data');
const DB_PATH = path.join(DATA_DIR, 'peanut.db');

// 데이터 디렉토리 생성
fs.mkdirSync(path.join(DATA_DIR, 'originals'), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'thumbnails'), { recursive: true });

const db = new Database(DB_PATH);

// WAL 모드 + 성능 설정
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

// 테이블 생성
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    providerId TEXT NOT NULL,
    name TEXT NOT NULL,
    profileImage TEXT,
    role TEXT DEFAULT 'member',
    createdAt TEXT DEFAULT (datetime('now')),
    UNIQUE(provider, providerId)
  );

  CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uploaderId INTEGER NOT NULL REFERENCES users(id),
    filename TEXT NOT NULL,
    originalName TEXT NOT NULL,
    mimeType TEXT NOT NULL,
    type TEXT NOT NULL,
    size INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    duration REAL,
    hash TEXT,
    createdAt TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mediaId INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    userId INTEGER NOT NULL REFERENCES users(id),
    createdAt TEXT DEFAULT (datetime('now')),
    UNIQUE(mediaId, userId)
  );

  CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mediaId INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    userId INTEGER NOT NULL REFERENCES users(id),
    createdAt TEXT DEFAULT (datetime('now')),
    UNIQUE(mediaId, userId)
  );

  CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mediaId INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    userId INTEGER NOT NULL REFERENCES users(id),
    createdAt TEXT DEFAULT (datetime('now')),
    UNIQUE(mediaId, userId)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mediaId INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    userId INTEGER NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    createdAt TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    keys TEXT NOT NULL,
    createdAt TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_media_created ON media(createdAt DESC);
  CREATE INDEX IF NOT EXISTS idx_media_uploader ON media(uploaderId);
  CREATE INDEX IF NOT EXISTS idx_views_media ON views(mediaId);
  CREATE INDEX IF NOT EXISTS idx_downloads_media ON downloads(mediaId);
  CREATE INDEX IF NOT EXISTS idx_likes_media ON likes(mediaId);
  CREATE INDEX IF NOT EXISTS idx_comments_media ON comments(mediaId);
  CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(userId);
`);

// 마이그레이션: 기존 DB에 hash 컬럼 추가
try {
  db.exec('ALTER TABLE media ADD COLUMN hash TEXT');
} catch {
  // 이미 존재하면 무시
}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_media_hash ON media(hash)'); } catch {}

// 기존 파일들의 해시를 채워넣기 (quick hash: head+tail+size)
import crypto from 'crypto';
const CHUNK = 4 * 1024 * 1024;
const unhashed = db.prepare('SELECT id, filename FROM media WHERE hash IS NULL').all() as { id: number; filename: string }[];
if (unhashed.length > 0) {
  const update = db.prepare('UPDATE media SET hash = ? WHERE id = ?');
  for (const row of unhashed) {
    try {
      const filePath = path.join(DATA_DIR, 'originals', row.filename);
      if (!fs.existsSync(filePath)) continue;
      const stat = fs.statSync(filePath);
      const hash = crypto.createHash('sha256');
      if (stat.size <= CHUNK) {
        hash.update(fs.readFileSync(filePath));
      } else {
        const fd = fs.openSync(filePath, 'r');
        const head = Buffer.alloc(CHUNK);
        const tail = Buffer.alloc(CHUNK);
        fs.readSync(fd, head, 0, CHUNK, 0);
        fs.readSync(fd, tail, 0, CHUNK, stat.size - CHUNK);
        fs.closeSync(fd);
        hash.update(head);
        hash.update(tail);
        const sizeBuf = Buffer.alloc(8);
        sizeBuf.writeDoubleBE(stat.size);
        hash.update(sizeBuf);
      }
      update.run(hash.digest('hex'), row.id);
    } catch {}
  }
  console.log(`Backfilled hash for ${unhashed.length} existing files`);
}

export default db;
