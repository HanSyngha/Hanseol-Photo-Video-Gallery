import { useState, useEffect, useCallback } from 'react';
import { api, type User } from '../api';
import styles from './Admin.module.css';

interface AdminUser {
  id: number;
  name: string;
  profileImage: string | null;
  role: string;
  provider: string;
  createdAt: string;
  banned: number;
  uploadCount: number;
  viewCount: number;
  downloadCount: number;
  likeCount: number;
  commentCount: number;
}

interface Props {
  user: User;
  onBack: () => void;
}

export default function Admin({ user, onBack }: Props) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getUsers().then((data) => {
      setUsers(data as unknown as AdminUser[]);
    }).finally(() => setLoading(false));
  }, []);

  const handleBan = useCallback(async (id: number, banned: boolean) => {
    await api.banUser(id, banned);
    setUsers(prev => prev.map(u => u.id === id ? { ...u, banned: banned ? 1 : 0 } : u));
  }, []);

  const handleDelete = useCallback(async (id: number, name: string) => {
    if (!confirm(`'${name}' 사용자를 삭제할까요? 업로드한 미디어는 유지됩니다.`)) return;
    await api.deleteUser(id);
    setUsers(prev => prev.filter(u => u.id !== id));
  }, []);

  if (user.role !== 'master') return null;

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h1>사용자 관리</h1>
      </header>

      <main className={styles.main}>
        {loading ? (
          <div className={styles.loading}>불러오는 중...</div>
        ) : (
          <div className={styles.userList}>
            {users.map(u => (
              <div key={u.id} className={`${styles.userCard} ${u.banned ? styles.banned : ''}`}>
                <div className={styles.userTop}>
                  <div className={styles.userAvatar}>
                    {u.profileImage
                      ? <img src={u.profileImage} alt="" />
                      : <span>{u.name[0]}</span>
                    }
                  </div>
                  <div className={styles.userInfo}>
                    <div className={styles.userName}>
                      {u.name}
                      {u.role === 'master' && <span className={styles.badge}>관리자</span>}
                      {u.banned ? <span className={styles.badgeBan}>차단됨</span> : null}
                    </div>
                    <div className={styles.userMeta}>
                      {u.provider === 'kakao' ? '카카오' : '네이버'} · 가입 {u.createdAt.slice(2, 10).replace(/-/g, '.')}
                    </div>
                  </div>
                </div>

                <div className={styles.stats}>
                  <div className={styles.stat}>
                    <span className={styles.statNum}>{u.uploadCount}</span>
                    <span className={styles.statLabel}>업로드</span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statNum}>{u.viewCount}</span>
                    <span className={styles.statLabel}>조회</span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statNum}>{u.downloadCount}</span>
                    <span className={styles.statLabel}>저장</span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statNum}>{u.likeCount}</span>
                    <span className={styles.statLabel}>좋아요</span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statNum}>{u.commentCount}</span>
                    <span className={styles.statLabel}>댓글</span>
                  </div>
                </div>

                {u.role !== 'master' && (
                  <div className={styles.actions}>
                    <button
                      className={u.banned ? styles.unbanBtn : styles.banBtn}
                      onClick={() => handleBan(u.id, !u.banned)}
                    >
                      {u.banned ? '차단 해제' : '차단'}
                    </button>
                    <button className={styles.deleteBtn} onClick={() => handleDelete(u.id, u.name)}>
                      삭제
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
