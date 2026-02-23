import { useEffect, useCallback, useState, useRef } from 'react';
import type { MediaItem, User } from '../api';
import { api } from '../api';
import VideoPlayer from './VideoPlayer';
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

export default function Lightbox({ items, index, user, onClose, onNavigate, onDelete, onLikeToggle }: Props) {
  const item = items[index];
  const [highResLoaded, setHighResLoaded] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { api.recordView(item.id).catch(() => {}); }, [item.id]);
  useEffect(() => { setHighResLoaded(false); }, [item.id]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onNavigate(index - 1);
      if (e.key === 'ArrowRight' && index < items.length - 1) onNavigate(index + 1);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [index, items.length, onClose, onNavigate]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0 && index < items.length - 1) onNavigate(index + 1);
    if (dx > 0 && index > 0) onNavigate(index - 1);
  }, [index, items.length, onNavigate]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

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
        {/* 미디어 영역 */}
        <div className={styles.mediaSection}>
          {/* 닫기 */}
          <button onClick={onClose} className={styles.closeBtn}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>

          {/* 네비게이션 */}
          {index > 0 && (
            <button className={`${styles.navBtn} ${styles.navPrev}`} onClick={() => onNavigate(index - 1)}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          )}
          {index < items.length - 1 && (
            <button className={`${styles.navBtn} ${styles.navNext}`} onClick={() => onNavigate(index + 1)}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}

          {/* 미디어 */}
          <div className={styles.mediaWrap} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
            {item.type === 'video' ? (
              <VideoPlayer src={api.fileUrl(item.id)} />
            ) : (
              <div className={styles.imageContainer}>
                <img src={api.thumbUrl(item.id)} className={`${styles.blurBg} ${highResLoaded ? styles.hidden : ''}`} alt="" />
                <img src={api.fileUrl(item.id)} className={styles.fullImage} alt={item.originalName} onLoad={() => setHighResLoaded(true)} />
              </div>
            )}
          </div>
        </div>

        {/* 사이드 패널 - 항상 표시 */}
        <div className={styles.sidePanel}>
          {/* 업로더 정보 */}
          <div className={styles.uploaderRow}>
            <div className={styles.uploaderAvatar}>
              {item.uploaderImage
                ? <img src={item.uploaderImage} alt="" />
                : <span>{item.uploaderName[0]}</span>
              }
            </div>
            <div>
              <div className={styles.uploaderName}>{item.uploaderName}</div>
              <div className={styles.uploadTime}>{new Date(item.createdAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}</div>
            </div>
          </div>

          {/* 액션 바 */}
          <div className={styles.actionBar}>
            <button className={`${styles.likeBtn} ${item.liked ? styles.liked : ''}`} onClick={handleLike}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill={item.liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              <span>{item.likeCount}</span>
            </button>
            <a href={api.downloadUrl(item.id)} className={styles.actionBtn}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              저장
            </a>
            {canDelete && (
              <button onClick={handleDelete} className={`${styles.actionBtn} ${styles.deleteBtn}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                삭제
              </button>
            )}
          </div>

          {/* 확인/다운로드 사람 */}
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

          {/* 댓글 */}
          <div className={styles.commentsWrap}>
            <Comments mediaId={item.id} user={user} />
          </div>
        </div>
      </div>
    </div>
  );
}
