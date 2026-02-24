import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth.js';
import { enqueue, getQueueStatus } from '../upload-queue.js';
import db from '../db.js';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { v4 as uuidv4 } from 'uuid';

const DATA_DIR = path.resolve('data');

export function registerMediaRoutes(app: FastifyInstance) {
  // 미디어 목록 (커서 기반 페이지네이션, sort 지원)
  app.get('/api/media', { preHandler: authenticate }, async (request) => {
    const { cursor, limit = '20', sort = 'recent' } = request.query as { cursor?: string; limit?: string; sort?: string };
    const lim = Math.min(parseInt(limit), 50);
    const { userId, role } = (request as any).user;

    const baseQuery = `
      SELECT m.*,
        u.name as uploaderName, u.profileImage as uploaderImage,
        (SELECT COUNT(*) FROM likes WHERE mediaId = m.id) as likeCount,
        (SELECT COUNT(*) FROM comments WHERE mediaId = m.id) as commentCount,
        EXISTS(SELECT 1 FROM likes WHERE mediaId = m.id AND userId = ?) as liked,
        (SELECT json_group_array(json_object('userId', vu.id, 'name', vu.name, 'profileImage', vu.profileImage))
         FROM views vw JOIN users vu ON vu.id = vw.userId WHERE vw.mediaId = m.id) as viewersJson,
        (SELECT json_group_array(json_object('userId', du.id, 'name', du.name, 'profileImage', du.profileImage))
         FROM downloads dl JOIN users du ON du.id = dl.userId WHERE dl.mediaId = m.id) as downloadersJson
      FROM media m
      JOIN users u ON u.id = m.uploaderId
    `;

    let rows: any[];
    if (sort === 'likes') {
      // 좋아요순: 전체 로드 (소규모 서비스)
      rows = db.prepare(baseQuery + ' ORDER BY likeCount DESC, m.id DESC').all(userId);
    } else if (cursor) {
      rows = db.prepare(baseQuery + ' WHERE m.createdAt < ? ORDER BY m.createdAt DESC, m.id DESC LIMIT ?').all(userId, cursor, lim);
    } else {
      rows = db.prepare(baseQuery + ' ORDER BY m.createdAt DESC, m.id DESC LIMIT ?').all(userId, lim);
    }

    const isMaster = role === 'master';
    const items = rows.map(row => {
      const viewers = isMaster && row.viewersJson ? JSON.parse(row.viewersJson).filter((v: any) => v.userId !== null) : [];
      const downloaders = isMaster && row.downloadersJson ? JSON.parse(row.downloadersJson).filter((d: any) => d.userId !== null) : [];
      const { viewersJson, downloadersJson, ...rest } = row;
      return { ...rest, liked: !!row.liked, viewers, downloaders };
    });

    const nextCursor = sort === 'likes' ? null : (rows.length === lim ? rows[rows.length - 1].createdAt : null);
    return { items, nextCursor };
  });

  // 단일 미디어 상세
  app.get('/api/media/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId, role } = (request as any).user;

    const row = db.prepare(`
      SELECT m.*,
        u.name as uploaderName, u.profileImage as uploaderImage,
        (SELECT COUNT(*) FROM likes WHERE mediaId = m.id) as likeCount,
        (SELECT COUNT(*) FROM comments WHERE mediaId = m.id) as commentCount,
        EXISTS(SELECT 1 FROM likes WHERE mediaId = m.id AND userId = ?) as liked,
        (SELECT json_group_array(json_object('userId', vu.id, 'name', vu.name, 'profileImage', vu.profileImage))
         FROM views vw JOIN users vu ON vu.id = vw.userId WHERE vw.mediaId = m.id) as viewersJson,
        (SELECT json_group_array(json_object('userId', du.id, 'name', du.name, 'profileImage', du.profileImage))
         FROM downloads dl JOIN users du ON du.id = dl.userId WHERE dl.mediaId = m.id) as downloadersJson
      FROM media m
      JOIN users u ON u.id = m.uploaderId
      WHERE m.id = ?
    `).get(userId, parseInt(id)) as any;

    if (!row) return reply.code(404).send({ error: 'Not found' });

    const isMaster = role === 'master';
    const viewers = isMaster && row.viewersJson ? JSON.parse(row.viewersJson).filter((v: any) => v.userId !== null) : [];
    const downloaders = isMaster && row.downloadersJson ? JSON.parse(row.downloadersJson).filter((d: any) => d.userId !== null) : [];
    const { viewersJson, downloadersJson, ...rest } = row;
    return { ...rest, liked: !!row.liked, viewers, downloaders };
  });

  // 업로드 전 중복 체크 (해시)
  app.post('/api/media/check-duplicate', { preHandler: authenticate }, async (request) => {
    const { hash } = request.body as { hash: string };
    if (!hash) return { duplicate: false };
    const existing = db.prepare('SELECT id FROM media WHERE hash = ?').get(hash) as any;
    return { duplicate: !!existing, existingId: existing?.id ?? null };
  });

  // 처리 큐 상태
  app.get('/api/media/processing', { preHandler: authenticate }, async () => {
    return getQueueStatus();
  });

  // 업로드
  app.post('/api/media/upload', { preHandler: authenticate }, async (request, reply) => {
    const data = await request.file();
    if (!data) return reply.code(400).send({ error: 'No file' });

    const mimeType = data.mimetype;
    const type = mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('video/') ? 'video' : null;
    if (!type) return reply.code(400).send({ error: 'Unsupported file type' });

    const ext = path.extname(data.filename);
    const filename = uuidv4() + ext;
    const filePath = path.join(DATA_DIR, 'originals', filename);

    app.log.info({ originalName: data.filename, mimeType, type }, 'Upload started');

    // 파일 저장 (pipeline으로 안전하게 스트림 처리)
    await pipeline(data.file, fs.createWriteStream(filePath));

    const stat = fs.statSync(filePath);
    app.log.info({ originalName: data.filename, size: stat.size, filename }, 'File saved');

    // 빠른 해시: 첫 4MB + 마지막 4MB + 파일 크기 (클라이언트와 동일 방식)
    const fileHash = await computeQuickHash(filePath, stat.size);
    app.log.info({ originalName: data.filename, hash: fileHash.slice(0, 12) }, 'Hash computed');

    const existing = db.prepare('SELECT id FROM media WHERE hash = ?').get(fileHash) as any;
    if (existing) {
      fs.unlinkSync(filePath);
      app.log.info({ originalName: data.filename, existingId: existing.id }, 'Duplicate skipped');
      return { ok: true, duplicate: true, existingId: existing.id };
    }

    const uploaderId = (request as any).user.userId;
    enqueue({ filename, originalName: data.filename, mimeType, type, size: stat.size, uploaderId, hash: fileHash });
    app.log.info({ originalName: data.filename, uploaderId, filename }, 'Enqueued for processing');

    return { ok: true, filename };
  });

  // 삭제
  app.delete('/api/media/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId, role } = (request as any).user;

    const media = db.prepare('SELECT * FROM media WHERE id = ?').get(parseInt(id)) as any;
    if (!media) return reply.code(404).send({ error: 'Not found' });

    if (media.uploaderId !== userId && role !== 'master') {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    // 파일 삭제
    const originalPath = path.join(DATA_DIR, 'originals', media.filename);
    const thumbPath = path.join(DATA_DIR, 'thumbnails', media.filename + '.webp');
    if (fs.existsSync(originalPath)) fs.unlinkSync(originalPath);
    if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);

    db.prepare('DELETE FROM media WHERE id = ?').run(parseInt(id));
    return { ok: true };
  });

  // 원본 파일 서빙 (Range Request 지원)
  app.get('/api/media/:id/file', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const media = db.prepare('SELECT filename, mimeType, size FROM media WHERE id = ?').get(parseInt(id)) as any;
    if (!media) return reply.code(404).send({ error: 'Not found' });

    const filePath = path.join(DATA_DIR, 'originals', media.filename);
    if (!fs.existsSync(filePath)) return reply.code(404).send({ error: 'File not found' });

    const range = request.headers.range;
    const stat = fs.statSync(filePath);

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0]);
      const end = parts[1] ? parseInt(parts[1]) : stat.size - 1;
      const chunkSize = end - start + 1;

      reply.code(206).headers({
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': media.mimeType,
      });
      return reply.send(fs.createReadStream(filePath, { start, end }));
    }

    reply.headers({
      'Content-Length': stat.size,
      'Content-Type': media.mimeType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'max-age=31536000, immutable',
    });
    return reply.send(fs.createReadStream(filePath));
  });

  // 썸네일 서빙
  app.get('/api/media/:id/thumb', async (request, reply) => {
    const { id } = request.params as { id: string };
    const media = db.prepare('SELECT filename FROM media WHERE id = ?').get(parseInt(id)) as any;
    if (!media) return reply.code(404).send({ error: 'Not found' });

    const thumbPath = path.join(DATA_DIR, 'thumbnails', media.filename + '.webp');
    if (!fs.existsSync(thumbPath)) return reply.code(404).send({ error: 'Thumbnail not found' });

    reply.headers({
      'Content-Type': 'image/webp',
      'Cache-Control': 'max-age=31536000, immutable',
    });
    return reply.send(fs.createReadStream(thumbPath));
  });

  // 다운로드 (원본 다운로드 + 기록)
  app.get('/api/media/:id/download', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request as any).user.userId;

    const media = db.prepare('SELECT filename, originalName, mimeType, size FROM media WHERE id = ?').get(parseInt(id)) as any;
    if (!media) return reply.code(404).send({ error: 'Not found' });

    // 다운로드 기록
    db.prepare('INSERT OR IGNORE INTO downloads (mediaId, userId) VALUES (?, ?)').run(parseInt(id), userId);

    const filePath = path.join(DATA_DIR, 'originals', media.filename);
    reply.headers({
      'Content-Type': media.mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(media.originalName)}"`,
      'Content-Length': media.size,
    });
    return reply.send(fs.createReadStream(filePath));
  });
}

const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB

async function computeQuickHash(filePath: string, fileSize: number): Promise<string> {
  const hash = crypto.createHash('sha256');

  if (fileSize <= CHUNK_SIZE) {
    // 작은 파일: 전체 해시
    const data = fs.readFileSync(filePath);
    hash.update(data);
  } else {
    // 큰 파일: head 4MB + tail 4MB + 파일 크기
    const fd = fs.openSync(filePath, 'r');
    const head = Buffer.alloc(CHUNK_SIZE);
    const tail = Buffer.alloc(CHUNK_SIZE);
    fs.readSync(fd, head, 0, CHUNK_SIZE, 0);
    fs.readSync(fd, tail, 0, CHUNK_SIZE, fileSize - CHUNK_SIZE);
    fs.closeSync(fd);
    hash.update(head);
    hash.update(tail);
    const sizeBuf = Buffer.alloc(8);
    sizeBuf.writeDoubleBE(fileSize);
    hash.update(sizeBuf);
  }

  return hash.digest('hex');
}
