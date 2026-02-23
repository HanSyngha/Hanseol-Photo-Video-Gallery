import { useState, useCallback, useEffect, useRef } from 'react';
import { api, type User, type MediaItem } from '../api';
import { useUploadQueue } from '../hooks/useUploadQueue';
import { useProcessingStatus } from '../hooks/useProcessingStatus';
import { usePinchColumns } from '../hooks/usePinchColumns';
import MediaGrid from '../components/MediaGrid';
import Lightbox from '../components/Lightbox';
import UploadModal from '../components/UploadModal';
import styles from './Gallery.module.css';

interface Props {
  user: User;
  onLogout: () => void;
}

type SortMode = 'recent' | 'likes';

export default function Gallery({ user, onLogout }: Props) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [sort, setSort] = useState<SortMode>('recent');
  const initialLoad = useRef(false);

  const loadMore = useCallback(async (cursor?: string | null, sortMode?: SortMode) => {
    const s = sortMode ?? sort;
    const data = await api.getMedia(cursor, s);
    if (cursor) {
      setItems(prev => [...prev, ...data.items]);
    } else {
      setItems(data.items);
    }
    setNextCursor(data.nextCursor);
  }, [sort]);

  const [pollingActive, setPollingActive] = useState(false);
  const processing = useProcessingStatus(pollingActive);

  const handleUploaded = useCallback(() => {
    setPollingActive(true);
    setTimeout(() => loadMore(null, sort), 1500);
  }, [loadMore, sort]);

  const uploadQueue = useUploadQueue(handleUploaded);
  const { columns, bind: bindPinch } = usePinchColumns();
  const gridRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (initialLoad.current) return;
    initialLoad.current = true;
    loadMore().finally(() => setLoading(false));
  }, [loadMore]);

  // 핀치 줌 바인딩
  useEffect(() => {
    return bindPinch(gridRef.current);
  }, [bindPinch]);

  // 처리 완료 시 갤러리 리로드 + 폴링 중지
  useEffect(() => {
    if (processing.justFinished) {
      loadMore(null, sort);
      setPollingActive(false);
    }
  }, [processing.justFinished, loadMore, sort]);

  const handleSortChange = useCallback((newSort: SortMode) => {
    if (newSort === sort) return;
    setSort(newSort);
    setLoading(true);
    loadMore(null, newSort).finally(() => setLoading(false));
  }, [sort, loadMore]);

  const handleLoadMore = useCallback(() => {
    if (nextCursor) loadMore(nextCursor);
  }, [nextCursor, loadMore]);

  const handleDelete = useCallback(async (id: number) => {
    await api.deleteMedia(id);
    setItems(prev => prev.filter(i => i.id !== id));
    setLightboxIndex(null);
  }, []);

  const handleLikeToggle = useCallback((id: number, liked: boolean) => {
    setItems(prev =>
      prev.map(item =>
        item.id === id
          ? { ...item, liked, likeCount: item.likeCount + (liked ? 1 : -1) }
          : item
      )
    );
  }, []);

  // 뒤로가기로 라이트박스/모달 닫기
  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
    history.pushState({ modal: 'lightbox' }, '');
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
    if (history.state?.modal === 'lightbox') history.back();
  }, []);

  const openUpload = useCallback(() => {
    setShowUpload(true);
    history.pushState({ modal: 'upload' }, '');
  }, []);

  const closeUpload = useCallback(() => {
    setShowUpload(false);
    if (history.state?.modal === 'upload') history.back();
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setLightboxIndex(null);
      setShowUpload(false);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <img src="/땅땅로고.png" alt="" className={styles.headerLogo} />
          <span className={styles.headerTitle}>땅콩땅콩땅콩콩땅</span>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.uploadBtn} onClick={() => openUpload()}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            올리기
          </button>
          <div className={styles.menuWrap}>
            <button className={styles.avatar} onClick={() => setShowMenu(!showMenu)}>
              {user.profileImage
                ? <img src={user.profileImage} alt="" />
                : <span>{user.name[0]}</span>
              }
            </button>
            {showMenu && (
              <div className={styles.menu} onClick={() => setShowMenu(false)}>
                <div className={styles.menuName}>{user.name}</div>
                <button onClick={onLogout}>로그아웃</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className={styles.main} ref={gridRef as React.RefObject<HTMLElement>}>
        {!loading && items.length > 0 && (
          <div className={styles.sortBar}>
            <button
              className={`${styles.sortBtn} ${sort === 'recent' ? styles.sortActive : ''}`}
              onClick={() => handleSortChange('recent')}
            >
              최신순
            </button>
            <button
              className={`${styles.sortBtn} ${sort === 'likes' ? styles.sortActive : ''}`}
              onClick={() => handleSortChange('likes')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              좋아요순
            </button>
          </div>
        )}

        {processing.isProcessing && (
          <div className={styles.processingBanner}>
            <div className={styles.processingSpinner} />
            <span>
              {processing.current
                ? `'${processing.current.originalName}' 처리 중...`
                : '처리 대기 중...'}
              {processing.queueCount > 0 && ` (대기 ${processing.queueCount}개)`}
            </span>
          </div>
        )}

        {processing.recentErrors.map(err => (
          <div key={err.filename} className={styles.errorBanner}>
            <span>'{err.originalName}' 처리 실패</span>
            <button className={styles.errorDismiss} onClick={() => processing.dismissError(err.filename)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}

        {loading ? (
          <div className={styles.loading}>불러오는 중...</div>
        ) : items.length === 0 ? (
          <div className={styles.empty}>
            <p>아직 사진이 없어요</p>
            <button onClick={() => openUpload()}>첫 사진 올리기</button>
          </div>
        ) : (
          <MediaGrid
            items={items}
            onItemClick={openLightbox}
            onLoadMore={handleLoadMore}
            hasMore={!!nextCursor}
            sort={sort}
            columns={columns}
          />
        )}
      </main>

      {/* 모바일 FAB */}
      <button className={styles.fab} onClick={() => openUpload()}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      {/* 업로드 진행 미니 토스트 (모달 닫은 후에도 표시) */}
      {!showUpload && uploadQueue.activeCount > 0 && (
        <div className={styles.uploadToast} onClick={() => openUpload()}>
          <div className={styles.toastSpinner} />
          <span>
            {uploadQueue.doneCount}/{uploadQueue.totalCount} 업로드 중...
          </span>
          {uploadQueue.currentFile && (
            <div className={styles.toastProgress}>
              <div className={styles.toastProgressFill} style={{ width: `${uploadQueue.currentFile.progress}%` }} />
            </div>
          )}
        </div>
      )}

      {lightboxIndex !== null && (
        <Lightbox
          items={items}
          index={lightboxIndex}
          user={user}
          onClose={closeLightbox}
          onNavigate={setLightboxIndex}
          onDelete={handleDelete}
          onLikeToggle={handleLikeToggle}
        />
      )}

      {showUpload && (
        <UploadModal
          uploadQueue={uploadQueue}
          onClose={closeUpload}
        />
      )}
    </div>
  );
}
