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

  CREATE INDEX IF NOT EXISTS idx_media_created ON media(createdAt DESC);
  CREATE INDEX IF NOT EXISTS idx_media_uploader ON media(uploaderId);
  CREATE INDEX IF NOT EXISTS idx_views_media ON views(mediaId);
  CREATE INDEX IF NOT EXISTS idx_downloads_media ON downloads(mediaId);
  CREATE INDEX IF NOT EXISTS idx_likes_media ON likes(mediaId);
  CREATE INDEX IF NOT EXISTS idx_comments_media ON comments(mediaId);
`);

export default db;
