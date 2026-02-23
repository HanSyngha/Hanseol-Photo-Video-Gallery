import { processImage, processVideo } from './media-processor.js';
import { sendPushToOthers } from './push.js';
import db from './db.js';

interface QueueItem {
  filename: string;
  originalName: string;
  mimeType: string;
  type: 'image' | 'video';
  size: number;
  uploaderId: number;
  hash: string;
}

const queue: QueueItem[] = [];
let processing = false;

export function enqueue(item: QueueItem) {
  queue.push(item);
  processNext();
}

async function processNext() {
  if (processing || queue.length === 0) return;
  processing = true;

  const item = queue.shift()!;
  try {
    const result = item.type === 'image'
      ? await processImage(item.filename)
      : await processVideo(item.filename);

    db.prepare(`
      INSERT INTO media (uploaderId, filename, originalName, mimeType, type, size, width, height, duration, hash, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      item.uploaderId,
      item.filename,
      item.originalName,
      item.mimeType,
      item.type,
      item.size,
      result.width ?? null,
      result.height ?? null,
      result.duration ?? null,
      item.hash,
      result.takenAt ?? new Date().toISOString().replace('T', ' ').slice(0, 19),
    );

    // 업로더 이름 조회 후 다른 사용자에게 알림
    const uploader = db.prepare('SELECT name FROM users WHERE id = ?').get(item.uploaderId) as any;
    const uploaderName = uploader?.name || '누군가';
    const typeLabel = item.type === 'image' ? '사진' : '영상';
    sendPushToOthers(item.uploaderId, '땅콩땅콩땅콩콩땅', `${uploaderName}님이 ${typeLabel}을 올렸어요!`);
  } catch (err) {
    console.error('Processing failed:', item.filename, err);
  }

  processing = false;
  processNext();
}
