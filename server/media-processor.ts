import sharp from 'sharp';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execFileAsync = promisify(execFile);
const DATA_DIR = path.resolve('data');

interface ProcessResult {
  width?: number;
  height?: number;
  duration?: number;
}

export async function processImage(filename: string): Promise<ProcessResult> {
  const originalPath = path.join(DATA_DIR, 'originals', filename);
  const thumbPath = path.join(DATA_DIR, 'thumbnails', filename + '.webp');

  const metadata = await sharp(originalPath).metadata();

  await sharp(originalPath)
    .rotate() // EXIF 기반 자동 회전
    .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(thumbPath);

  return {
    width: metadata.width,
    height: metadata.height,
  };
}

export async function processVideo(filename: string): Promise<ProcessResult> {
  const originalPath = path.join(DATA_DIR, 'originals', filename);
  const thumbPath = path.join(DATA_DIR, 'thumbnails', filename + '.webp');

  // ffprobe로 메타데이터 추출
  let width: number | undefined;
  let height: number | undefined;
  let duration: number | undefined;

  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      originalPath,
    ]);
    const probe = JSON.parse(stdout);
    const videoStream = probe.streams?.find((s: any) => s.codec_type === 'video');
    if (videoStream) {
      width = parseInt(videoStream.width);
      height = parseInt(videoStream.height);
    }
    if (probe.format?.duration) {
      duration = parseFloat(probe.format.duration);
    }
  } catch {
    // ffprobe 실패해도 계속 진행
  }

  // 첫 프레임 추출 → WebP 썸네일
  const tmpFrame = path.join(DATA_DIR, 'thumbnails', filename + '_tmp.jpg');
  try {
    await execFileAsync('ffmpeg', [
      '-i', originalPath,
      '-vframes', '1',
      '-vf', 'scale=300:-1',
      '-y',
      tmpFrame,
    ]);

    await sharp(tmpFrame)
      .webp({ quality: 80 })
      .toFile(thumbPath);
  } finally {
    if (fs.existsSync(tmpFrame)) fs.unlinkSync(tmpFrame);
  }

  return { width, height, duration };
}
