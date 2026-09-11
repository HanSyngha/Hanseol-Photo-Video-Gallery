import { useState, useEffect, useCallback, useRef } from 'react';
import { api, type User } from '../api';
import {
  newGame, act, ACTIONS, CHAPTERS, TOTAL_DAYS, SLOTS, SLOT_LABEL,
  chapterOf, scriptEventOf, currentSlot, gradeOf,
  type GameState, type Category, type Slot,
} from '../game/engine';
import styles from './Game.module.css';

interface Props { user: User; onClose: () => void }
type Tab = 'play' | 'album' | 'rank';

const GAUGES = [
  { key: 'hunger', label: '배고픔', icon: '🍼' },
  { key: 'sleep', label: '졸림', icon: '😴' },
  { key: 'mood', label: '기분', icon: '🙂' },
  { key: 'health', label: '건강', icon: '💚' },
] as const;

export default function Game({ user, onClose }: Props) {
  const [state, setState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('play');
  const [openCat, setOpenCat] = useState<Category | null>(null);
  const [dayMedia, setDayMedia] = useState<any>(null);
  const [dayEnd, setDayEnd] = useState<{ day: number; unlocked: boolean } | null>(null);
  const [rank, setRank] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const prevDay = useRef(1);

  // ── 세이브 불러오기 ────────────────────────────────────────────────────
  useEffect(() => {
    api.getGameSave()
      .then(r => {
        if (!r.save) { setState(null); return; }
        const st = r.save.state as GameState;
        // 이어하기로 들어올 때 '하루 끝' 시트가 헛뜨지 않게 기준일을 세이브에 맞춘다.
        // (초기값 1로 두면 D+17 세이브를 열자마자 'D+1 끝'이 떠버린다)
        prevDay.current = st.day;
        setState(st);
      })
      .catch(() => setState(null))
      .finally(() => setLoading(false));
  }, []);

  // ── 자동 저장 (턴마다, 디바운스) ───────────────────────────────────────
  const persist = useCallback((s: GameState) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      api.putGameSave({
        state: s, day: s.day, albumCount: s.album.length, score: s.score,
        bestStreak: s.bestStreak, finished: s.finished,
        grade: s.finished ? gradeOf(s.album) : null,
      }).catch(() => {});
    }, 600);
  }, []);

  // ── 그날의 사진 ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!state) return;
    let alive = true;
    api.getGameDay(state.day).then(d => { if (alive) setDayMedia(d); }).catch(() => {});
    return () => { alive = false; };
  }, [state?.day]);

  // ── 하루가 넘어갔는지 감지 → 결과 시트 ─────────────────────────────────
  useEffect(() => {
    if (!state) return;
    if (state.day !== prevDay.current) {
      const finishedDay = prevDay.current;
      setDayEnd({ day: finishedDay, unlocked: state.album.includes(finishedDay) });
      prevDay.current = state.day;
    }
  }, [state?.day, state?.album.length]);

  const start = useCallback(() => {
    const s = newGame();
    prevDay.current = s.day;
    setState(s); persist(s);
  }, [persist]);

  const doAct = useCallback((cat: Category, method: string) => {
    if (!state || busy) return;
    setBusy(true);
    const s: GameState = JSON.parse(JSON.stringify(state));
    act(s, cat, method);
    s.log = s.log.slice(-4);
    setState(s); persist(s); setOpenCat(null);
    setTimeout(() => setBusy(false), 160);
  }, [state, busy, persist]);

  const restart = useCallback(async () => {
    if (!confirm('지금까지 키운 기록이 사라집니다. 처음부터 다시 키울까요?')) return;
    await api.resetGameSave().catch(() => {});
    start();
  }, [start]);

  useEffect(() => {
    if (tab === 'rank') api.getGameLeaderboard().then(setRank).catch(() => {});
  }, [tab]);

  // ── 화면 ───────────────────────────────────────────────────────────────
  if (loading) {
    return <div className={styles.overlay}><div className={styles.center}><div className={styles.spinner} /></div></div>;
  }

  if (!state) {
    return (
      <div className={styles.overlay}>
        <div className={styles.intro}>
          <button className={styles.closeBtn} onClick={onClose} aria-label="닫기">✕</button>
          <div className={styles.introIcon}>👶</div>
          <h1 className={styles.introTitle}>설이 키우기</h1>
          <p className={styles.introDesc}>
            설이의 200일을 다시 살아봅니다.<br />
            하루를 무사히 넘기면 <strong>그날 실제로 찍은 사진</strong>이 해금됩니다.
          </p>
          <ul className={styles.introList}>
            <li>설이한테 뭐가 통하는지는 <b>알려주지 않습니다.</b> 직접 찾아야 합니다.</li>
            <li>겨우 알아냈다 싶으면 <b>어느 날 갑자기 안 통합니다.</b></li>
            <li>게이지가 다 멀쩡한데 우는 날도 있습니다. 그럴 땐 그냥 안고 버티세요.</li>
          </ul>
          <button className={styles.primaryBtn} onClick={start}>설이 만나러 가기</button>
        </div>
      </div>
    );
  }

  const ch = chapterOf(state.day);
  const slot = currentSlot(state);
  const ev = scriptEventOf(state.day);
  const slotPhotos: any[] = dayMedia?.slots?.[slot] ?? [];
  const anyPhotos: any[] = dayMedia ? SLOTS.flatMap(sl => dayMedia.slots?.[sl] ?? []) : [];
  const hero = slotPhotos[0] ?? anyPhotos[0] ?? null;

  return (
    <div className={styles.overlay}>
      {/* 헤더 */}
      <header className={styles.header}>
        <button className={styles.closeBtn} onClick={onClose} aria-label="닫기">✕</button>
        <div className={styles.headerMid}>
          <div className={styles.dayLabel}>D+{state.day}<span className={styles.dayTotal}>/{TOTAL_DAYS}</span></div>
          <div className={styles.chapterLabel}>{ch.title} · {SLOT_LABEL[slot]}</div>
        </div>
        <div className={styles.albumCount}>📷 {state.album.length}</div>
      </header>

      <div className={styles.tabs}>
        {([['play', '키우기'], ['album', '앨범'], ['rank', '랭킹']] as const).map(([v, l]) => (
          <button key={v} className={`${styles.tab} ${tab === v ? styles.tabOn : ''}`} onClick={() => setTab(v)}>{l}</button>
        ))}
      </div>

      {tab === 'play' && (
        <div className={styles.body}>
          {/* 게이지 */}
          <div className={styles.gauges}>
            {GAUGES.map(g => {
              const v = Math.round((state.baby as any)[g.key]);
              return (
                <div key={g.key} className={styles.gauge}>
                  <span className={styles.gaugeIcon}>{g.icon}</span>
                  <div className={styles.bar}><div className={styles.barFill} style={{ width: `${v}%`, background: v < 30 ? '#e5484d' : v < 55 ? '#f5a524' : '#30a46c' }} /></div>
                  <span className={styles.gaugeVal}>{v}</span>
                </div>
              );
            })}
          </div>
          <div className={styles.parentRow}>
            <span>부모 체력 <b>{Math.round(state.parent.stamina)}</b></span>
            <span>멘탈 <b>{Math.round(state.parent.mental)}</b></span>
            {state.baby.arousal > 0 && <span className={styles.arousal}>⚡ 과각성 {state.baby.arousal}</span>}
          </div>

          {/* 오늘의 설이 */}
          <div className={styles.stage}>
            {hero ? (
              <img className={styles.heroImg} src={api.thumbUrl(hero.id, hero.filename, 640)} alt="" />
            ) : <div className={styles.heroEmpty}>📷</div>}
            {ev && <div className={styles.eventChip}>{ev.title}</div>}
            {state.cry && <div className={styles.cryOverlay}>
              <div className={styles.cryFace}>😭</div>
              <div className={styles.cryText}>설이가 웁니다</div>
              <div className={styles.crySub}>시도 {state.cry.tries}/5</div>
            </div>}
          </div>

          {/* 연출 로그 */}
          <div className={styles.log}>
            {state.log.slice(-2).map((l, i) => <p key={i} className={i === state.log.slice(-2).length - 1 ? styles.logNow : ''}>{l}</p>)}
          </div>

          {/* 행동 카드 */}
          <div className={styles.deck}>
            {ACTIONS.map(a => (
              <button key={a.id} className={styles.card} onClick={() => setOpenCat(a.id)} disabled={busy}>
                <span className={styles.cardIcon}>{a.icon}</span>
                <span className={styles.cardLabel}>{a.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'album' && (
        <div className={styles.body}>
          <p className={styles.albumHead}>{state.album.length} / {TOTAL_DAYS}장 · 등급 {gradeOf(state.album)}</p>
          <div className={styles.albumGrid}>
            {Array.from({ length: TOTAL_DAYS }, (_, i) => i + 1).map(d => (
              <div key={d} className={`${styles.albumCell} ${state.album.includes(d) ? styles.albumOn : ''}`}>{d}</div>
            ))}
          </div>
          <button className={styles.dangerBtn} onClick={restart}>처음부터 다시 키우기</button>
        </div>
      )}

      {tab === 'rank' && (
        <div className={styles.body}>
          {!rank ? <div className={styles.spinner} /> : (
            ([['album', '📷 앨범 수집', 'albumCount'], ['score', '⭐ 육아 점수', 'score'], ['streak', '⚡ 최장 무사고', 'bestStreak']] as const)
              .map(([k, title, field]) => (
                <div key={k} className={styles.rankBlock}>
                  <h3 className={styles.rankTitle}>{title}</h3>
                  {(rank[k] ?? []).length === 0 && <p className={styles.rankEmpty}>아직 아무도 없어요</p>}
                  {(rank[k] ?? []).map((r: any, i: number) => (
                    <div key={r.userId} className={`${styles.rankRow} ${r.userId === user.id ? styles.rankMe : ''}`}>
                      <span className={styles.rankNo}>{i + 1}</span>
                      <span className={styles.rankName}>{r.name}</span>
                      <span className={styles.rankVal}>{r[field]}{k === 'album' ? '장' : k === 'streak' ? '일' : ''}</span>
                    </div>
                  ))}
                </div>
              ))
          )}
        </div>
      )}

      {/* 방법 선택 시트 */}
      {openCat && (
        <div className={styles.sheetBack} onClick={() => setOpenCat(null)}>
          <div className={styles.sheet} onClick={e => e.stopPropagation()}>
            <div className={styles.sheetGrab} />
            <h3 className={styles.sheetTitle}>
              {ACTIONS.find(a => a.id === openCat)!.icon} {ACTIONS.find(a => a.id === openCat)!.label} — 어떻게 할까요?
            </h3>
            <div className={styles.methodGrid}>
              {ACTIONS.find(a => a.id === openCat)!.methods.map(m => (
                <button key={m.id} className={styles.methodBtn} onClick={() => doAct(openCat, m.id)}>{m.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 하루 결과 */}
      {dayEnd && (
        <div className={styles.sheetBack} onClick={() => setDayEnd(null)}>
          <div className={styles.sheet} onClick={e => e.stopPropagation()}>
            <div className={styles.sheetGrab} />
            <h3 className={styles.sheetTitle}>D+{dayEnd.day} 끝</h3>
            {dayEnd.unlocked ? (
              <>
                <p className={styles.resultOk}>무사히 넘겼습니다. 그날의 사진이 해금됐어요.</p>
                <UnlockedPhoto day={dayEnd.day} />
              </>
            ) : (
              <p className={styles.resultBad}>힘든 하루였습니다. 그날 사진은 잠겨 있어요.</p>
            )}
            <button className={styles.primaryBtn} onClick={() => setDayEnd(null)}>다음 날로</button>
          </div>
        </div>
      )}

      {state.finished && !dayEnd && (
        <div className={styles.sheetBack}>
          <div className={styles.sheet}>
            <h3 className={styles.sheetTitle}>🎉 200일을 다 키웠습니다</h3>
            <p className={styles.resultOk}>
              앨범 {state.album.length}/{TOTAL_DAYS}장 · 최종 등급 <b>{gradeOf(state.album)}</b><br />
              최장 무사고 {state.bestStreak}일
            </p>
            <button className={styles.primaryBtn} onClick={() => setTab('album')}>앨범 보기</button>
            <button className={styles.dangerBtn} onClick={restart}>다시 키우기</button>
          </div>
        </div>
      )}
    </div>
  );
}

function UnlockedPhoto({ day }: { day: number }) {
  const [m, setM] = useState<any>(null);
  useEffect(() => {
    api.getGameDay(day).then(d => {
      const all = SLOTS.flatMap((s: Slot) => d.slots?.[s] ?? []);
      setM(all[0] ?? null);
    }).catch(() => {});
  }, [day]);
  if (!m) return null;
  return <img className={styles.unlockImg} src={api.thumbUrl(m.id, m.filename, 640)} alt="" />;
}
