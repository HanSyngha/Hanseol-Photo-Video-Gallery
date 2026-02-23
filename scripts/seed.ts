import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { v4 as uuid } from 'uuid';

fs.mkdirSync('data/originals', { recursive: true });
fs.mkdirSync('data/thumbnails', { recursive: true });

const db = new Database('data/peanut.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL, providerId TEXT NOT NULL, name TEXT NOT NULL, profileImage TEXT, role TEXT DEFAULT 'member', createdAt TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(provider, providerId));
  CREATE TABLE IF NOT EXISTS media (id INTEGER PRIMARY KEY AUTOINCREMENT, uploaderId INTEGER NOT NULL REFERENCES users(id), filename TEXT NOT NULL, originalName TEXT NOT NULL, mimeType TEXT NOT NULL, type TEXT NOT NULL, size INTEGER NOT NULL, width INTEGER, height INTEGER, duration REAL, createdAt TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS views (id INTEGER PRIMARY KEY AUTOINCREMENT, mediaId INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE, userId INTEGER NOT NULL REFERENCES users(id), createdAt TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(mediaId, userId));
  CREATE TABLE IF NOT EXISTS downloads (id INTEGER PRIMARY KEY AUTOINCREMENT, mediaId INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE, userId INTEGER NOT NULL REFERENCES users(id), createdAt TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(mediaId, userId));
  CREATE TABLE IF NOT EXISTS likes (id INTEGER PRIMARY KEY AUTOINCREMENT, mediaId INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE, userId INTEGER NOT NULL REFERENCES users(id), createdAt TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(mediaId, userId));
  CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, mediaId INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE, userId INTEGER NOT NULL REFERENCES users(id), content TEXT NOT NULL, createdAt TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE INDEX IF NOT EXISTS idx_media_created ON media(createdAt DESC);
`);

db.prepare('INSERT OR IGNORE INTO users (provider,providerId,name,profileImage,role) VALUES (?,?,?,?,?)').run('test', 'u1', '김땅콩', null, 'master');
db.prepare('INSERT OR IGNORE INTO users (provider,providerId,name,profileImage,role) VALUES (?,?,?,?,?)').run('test', 'u2', '이콩콩', null, 'member');
db.prepare('INSERT OR IGNORE INTO users (provider,providerId,name,profileImage,role) VALUES (?,?,?,?,?)').run('test', 'u3', '박알몬', null, 'member');

// Oldest first → highest IDs = today
const items = [
  { c: '#98d8c8', n: '여행2.jpg', d: 7, u: 3 }, { c: '#ffa07a', n: '여행1.jpg', d: 7, u: 2 }, { c: '#4ecdc4', n: '바다.jpg', d: 7, u: 1 },
  { c: '#ff6b6b', n: '노을.jpg', d: 3, u: 2 }, { c: '#a8e6cf', n: '해변.jpg', d: 3, u: 1 },
  { c: '#ff9a9e', n: '벚꽃.jpg', d: 1, u: 3 }, { c: '#ffd166', n: '해바라기.jpg', d: 1, u: 1 }, { c: '#c49bff', n: '라벤더밭.jpg', d: 1, u: 2 },
  { c: '#85e89d', n: '숲속.jpg', d: 0, u: 3 }, { c: '#6eb5ff', n: '파란하늘.jpg', d: 0, u: 1 }, { c: '#d85d5d', n: '석양.jpg', d: 0, u: 2 }, { c: '#e8a87c', n: '카페라떼.jpg', d: 0, u: 1 },
];

for (const it of items) {
  const fn = uuid() + '.jpg';
  const w = 400 + Math.floor(Math.random() * 200);
  const h = 300 + Math.floor(Math.random() * 300);
  const buf = await sharp({ create: { width: w, height: h, channels: 3, background: it.c } }).jpeg().toBuffer();
  fs.writeFileSync(path.join('data/originals', fn), buf);
  await sharp(buf).resize(300, 300, { fit: 'inside' }).webp({ quality: 80 }).toFile(path.join('data/thumbnails', fn + '.webp'));
  const dt = new Date(Date.now() - it.d * 86400000).toISOString().replace('T', ' ').slice(0, 19);
  db.prepare('INSERT INTO media (uploaderId,filename,originalName,mimeType,type,size,width,height,createdAt) VALUES (?,?,?,?,?,?,?,?,?)').run(it.u, fn, it.n, 'image/jpeg', 'image', buf.length, w, h, dt);
}

// Interactions (ID 12=카페라떼, ID 11=석양)
db.prepare('INSERT OR IGNORE INTO likes (mediaId,userId) VALUES (?,?)').run(12, 1);
db.prepare('INSERT OR IGNORE INTO likes (mediaId,userId) VALUES (?,?)').run(12, 2);
db.prepare('INSERT OR IGNORE INTO likes (mediaId,userId) VALUES (?,?)').run(11, 1);
db.prepare('INSERT OR IGNORE INTO views (mediaId,userId) VALUES (?,?)').run(12, 1);
db.prepare('INSERT OR IGNORE INTO views (mediaId,userId) VALUES (?,?)').run(12, 2);
db.prepare('INSERT OR IGNORE INTO views (mediaId,userId) VALUES (?,?)').run(12, 3);
db.prepare('INSERT OR IGNORE INTO downloads (mediaId,userId) VALUES (?,?)').run(12, 2);
db.prepare('INSERT OR IGNORE INTO comments (mediaId,userId,content) VALUES (?,?,?)').run(12, 2, '우와 너무 이뻐!');
db.prepare('INSERT OR IGNORE INTO comments (mediaId,userId,content) VALUES (?,?,?)').run(12, 3, '좋다 좋아~');

console.log('Seed complete: 12 photos, 3 users');
