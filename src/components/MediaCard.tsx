import { useState, useRef, useEffect } from 'react';
import type { MediaItem } from '../api';
import { api } from '../api';
import UserBadges from './UserBadges';
import styles from './MediaCard.module.css';

interface Props {
  item: MediaItem;
  index?: number;
  onClick: () => void;
}

function formatDuration(sec: number | null): string {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function MediaCard({ item, index = 0, onClick }: Props) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSrc(api.thumbUrl(item.id));
          observerRef.current?.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observerRef.current.observe(el);

    return () => observerRef.current?.disconnect();
  }, [item.id]);

  return (
    <div className={styles.card} onClick={onClick} style={{ animationDelay: `${index * 60}ms` }}>
      <div className={styles.imageWrap}>
        <img
          ref={imgRef}
          src={src || undefined}
          alt={item.originalName}
          loading="lazy"
          decoding="async"
          className={`${styles.image} ${loaded ? styles.loaded : ''}`}
          onLoad={() => setLoaded(true)}
        />
        {!loaded && <div className={styles.placeholder} />}

        {item.type === 'video' && (
          <>
            <div className={styles.playIcon}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            {item.duration && (
              <span className={styles.duration}>{formatDuration(item.duration)}</span>
            )}
          </>
        )}
      </div>

      <div className={styles.info}>
        <div className={`${styles.likeCount} ${item.liked ? styles.active : ''}`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill={item.liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          {item.likeCount > 0 && <span>{item.likeCount}</span>}
        </div>
        <UserBadges viewers={item.viewers} downloaders={item.downloaders} />
      </div>
    </div>
  );
}
