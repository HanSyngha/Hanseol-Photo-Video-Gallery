import { useState, useEffect, useCallback, useRef } from 'react';
import type { MediaItem, User } from '../api';
import { api } from '../api';
import YarlLightbox, { type Slide } from 'yet-another-react-lightbox';
import Inline from 'yet-another-react-lightbox/plugins/inline';
import Video from 'yet-another-react-lightbox/plugins/video';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import Counter from 'yet-another-react-lightbox/plugins/counter';
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen';
import 'yet-another-react-lightbox/styles.css';
import Comments from './Comments';
import styles from './Lightbox.module.css';

interface Props {
  items: MediaItem[];
  index: number;
  user: User;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onDelete: (id: number) => void;
  onLikeToggle: (id: number, liked: boolean) => void;
}

function toSlides(items: MediaItem[]): Slide[] {
  return items.map(item => {
    if (item.type === 'video') {
      return {
        type: 'video' as const,
        poster: api.thumbUrl(item.id),
        width: item.width ?? undefined,
        height: item.height ?? undefined,
        autoPlay: true,
        controls: true,
        playsInline: true,
        sources: [{ src: api.fileUrl(item.id), type: item.mimeType }],
      };
    }
    return {
      src: api.fileUrl(item.id),
      alt: item.originalName,
      width: item.width ?? undefined,
      height: item.height ?? undefined,
    };
  });
}

export default function Lightbox({ items, index, user, onClose, onNavigate, onDelete, onLikeToggle }: Props) {
  const item = items[index];
  const slides = toSlides(items);
  const viewedRef = useRef<Set<number>>(new Set());
  const mediaSectionRef = useRef<HTMLDivElement>(null);
  const [videoLoading, setVideoLoading] = useState(false);

  // 조회 기록
  useEffect(() => {
    if (!viewedRef.current.has(item.id)) {
      viewedRef.current.add(item.id);
      api.recordView(item.id).catch(() => {});
    }
  }, [item.id]);

  // 비디오 로딩 감지
  useEffect(() => {
    if (item.type !== 'video') { setVideoLoading(false); return; }
    setVideoLoading(true);

    const section = mediaSectionRef.current;
    if (!section) return;

    let cancelled = false;
    const check = () => {
      if (cancelled) return;
      const video = section.querySelector('video');
      if (!video) { requestAnimationFrame(check); return; }

      const onReady = () => { if (!cancelled) setVideoLoading(false); };
      if (video.readyState >= 3) { setVideoLoading(false); return; }
      video.addEventListener('canplay', onReady, { once: true });
      return () => video.removeEventListener('canplay', onReady);
    };
    const cleanup = check();
    return () => { cancelled = true; cleanup?.(); };
  }, [item.id, item.type]);

  // body 스크롤 방지
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Escape로 닫기 (YARL inline은 기본 close 미지원)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleLike = useCallback(async () => {
    const result = await api.toggleLike(item.id);
    onLikeToggle(item.id, result.liked);
  }, [item.id, onLikeToggle]);

  const handleDelete = useCallback(async () => {
    if (!confirm('정말 삭제할까요?')) return;
    await onDelete(item.id);
  }, [item.id, onDelete]);

  const canDelete = item.uploaderId === user.id || user.role === 'master';

  return (
    <div className={styles.overlay}>
      <div className={styles.backdrop} onClick={onClose} />

      <div className={styles.content}>
        {/* 미디어 영역 — YARL Inline */}
        <div className={styles.mediaSection} ref={mediaSectionRef}>
          {videoLoading && (
            <div className={styles.videoLoadingOverlay}>
              <div className={styles.videoLoadingSpinner} />
              <span>영상 불러오는 중...</span>
            </div>
          )}
          <button onClick={onClose} className={styles.closeBtn}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>

          <YarlLightbox
            plugins={[Inline, Video, Zoom, Counter, Fullscreen]}
            slides={slides}
            index={index}
            inline={{ style: { width: '100%', height: '100%', background: 'transparent' } }}
            on={{ view: ({ index: i }) => onNavigate(i) }}
            carousel={{ finite: true }}
            video={{ autoPlay: true, controls: true, playsInline: true }}
            fullscreen={{ auto: false }}
            zoom={{ maxZoomPixelRatio: 3, doubleClickMaxStops: 2 }}
            className="yarl__lightbox--inline-custom"
          />
        </div>

        {/* 사이드 패널 */}
        <div className={styles.sidePanel}>
          <div className={styles.uploaderRow}>
            <div className={styles.uploaderAvatar}>
              {item.uploaderImage
                ? <img src={item.uploaderImage} alt="" />
                : <span>{item.uploaderName[0]}</span>
              }
            </div>
            <div>
              <div className={styles.uploaderName}>{item.uploaderName}</div>
              <div className={styles.uploadTime}>{item.createdAt.slice(2, 10).replace(/-/g, '.')}</div>
            </div>
          </div>

          <div className={styles.actionBar}>
            <button className={`${styles.likeBtn} ${item.liked ? styles.liked : ''}`} onClick={handleLike}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill={item.liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              <span>{item.likeCount}</span>
            </button>
            <a href={api.downloadUrl(item.id)} className={styles.actionBtn}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              저장
            </a>
            {canDelete && (
              <button onClick={handleDelete} className={`${styles.actionBtn} ${styles.deleteBtn}`}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                삭제
              </button>
            )}
          </div>

          <div className={styles.peopleSection}>
            {item.viewers.length > 0 && (
              <div className={styles.peopleRow}>
                <span className={styles.peopleIcon}>👁</span>
                <span className={styles.peopleNames}>{item.viewers.map(v => v.name).join(', ')}</span>
              </div>
            )}
            {item.downloaders.length > 0 && (
              <div className={styles.peopleRow}>
                <span className={styles.peopleIcon}>⬇</span>
                <span className={styles.peopleNames}>{item.downloaders.map(d => d.name).join(', ')}</span>
              </div>
            )}
          </div>

          <div className={styles.commentsWrap}>
            <Comments mediaId={item.id} user={user} />
          </div>
        </div>
      </div>
    </div>
  );
}
