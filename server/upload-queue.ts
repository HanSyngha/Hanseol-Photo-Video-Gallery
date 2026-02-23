import { processImage, processVideo } from './media-processor.js';
import db from './db.js';

interface QueueItem {
  filename: string;
  originalName: string;
  mimeType: string;
  type: 'image' | 'video';
  size: number;
  uploaderId: number;
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
      INSERT INTO media (uploaderId, filename, originalName, mimeType, type, size, width, height, duration)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    );
  } catch (err) {
    console.error('Processing failed:', item.filename, err);
  }

  processing = false;
  processNext();
}
