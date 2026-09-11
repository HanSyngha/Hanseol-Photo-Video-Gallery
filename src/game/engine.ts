// 설이 키우기 — 게임 엔진
//
// 난이도의 핵심은 두 가지다.
//  1) 정답(설이한테 먹히는 방법)이 숨겨져 있고, 시행착오로만 알아낼 수 있다.
//  2) 그 정답이 18~23일마다 예고 없이 바뀐다. 실제로 설이가 뒤집기를 배웠다가
//     하루 만에 까먹은 것처럼(D+131 기록), 겨우 익숙해지면 다시 원점이 된다.
// 그래서 게임오버 없이도 계속 긴장이 유지된다.

export const TOTAL_DAYS = 200;
export const SLOTS = ['dawn', 'morning', 'day', 'evening'] as const;
export type Slot = (typeof SLOTS)[number];

export const SLOT_LABEL: Record<Slot, string> = {
  dawn: '새벽', morning: '아침', day: '낮', evening: '저녁',
};

// ── 밸런싱 (여기만 고치면 난이도가 바뀐다) ──────────────────────────────────
export const BAL = {
  patternResetMin: 18,          // 패턴이 바뀌는 최소 간격(게임일)
  patternResetMax: 23,          // 최대 간격 — 딱 20일로 고정하면 카운터 보고 대비해버린다
  masteryCap: 2,                // 정답을 몇 번 성공해야 숙련 만렙인가
  hitCorrectBase: 0.68,         // 정답 + 숙련 0일 때 성공률
  hitCorrectMastered: 0.88,     // 정답 + 숙련 만렙 (100%는 아니다 — 이게 '과각성' 사고)
  hitWrong: 0.22,
  hitNear: 0.45,                // 정답과 같은 계열 — '조금 통한다'는 중간 신호               // 오답 성공률
  hitFloor: 0.05,
  hitCeil: 0.90,
  arousalMax: 3,                // 과각성 스택 상한
  arousalPenalty: 0.14,         // 스택당 재우기 성공률 하락
  cryNoCauseRate: 0.40,         // 뜬금없는 울음 중 '원인 없음' 비율
  cryMaxTries: 5,               // 울음 한 번에 시도할 수 있는 횟수
  cryHoldNeeded: 2,             // 원인 없음일 때 '안고 버티기' 몇 번이면 그치나
  dayPassScore: 60,
  penaltyCap: 0.22,          // 컨디션 페널티 총합 상한 — 무한 중첩 방지             // 이 점수 이상이어야 그날 사진이 해금된다

  // 게이지 수지 — 하루 턴 수 안에서 4개 게이지를 돌릴 수 있어야 한다.
  // 턴당 감소 × 하루턴수 ≈ 회복량 × (그 게이지에 쓸 수 있는 턴수) 가 되도록 맞춘 값.
  drainHunger: 10,
  drainSleep: 8,
  recoverHunger: 42,
  recoverSleep: 48,
  recoverMood: 30,
  recoverHealth: 12,
  staminaNightNewborn: 46,
  staminaNight: 58,
};

// ── 행동 ────────────────────────────────────────────────────────────────────
export type Category = 'feed' | 'sleep' | 'soothe' | 'care';

export interface Method { id: string; label: string; group: string }
export interface ActionDef {
  id: Category;
  label: string;
  icon: string;
  stamina: number;              // 1회 시도당 부모 체력 소모
  methods: Method[];
}

export const ACTIONS: ActionDef[] = [
  {
    id: 'feed', label: '먹이기', icon: '🍼', stamina: 5,
    methods: [
      { id: 'upright', label: '세워 안고', group: 'hold' },
      { id: 'cradle', label: '눕혀 안고', group: 'hold' },
      { id: 'warm', label: '조금 따뜻하게', group: 'temp' },
      { id: 'cool', label: '미지근하게', group: 'temp' },
      { id: 'slow', label: '천천히 나눠서', group: 'temp' },
      { id: 'burp', label: '중간에 트림시키며', group: 'hold' },
    ],
  },
  {
    id: 'sleep', label: '재우기', icon: '😴', stamina: 8,
    methods: [
      { id: 'pat', label: '토닥이기', group: 'touch' },
      { id: 'rock', label: '안고 흔들기', group: 'touch' },
      { id: 'lullaby', label: '자장가', group: 'sound' },
      { id: 'shush', label: '쉬~ 소리', group: 'sound' },
      { id: 'dark', label: '불 끄고 어둡게', group: 'sound' },
      { id: 'swaddle', label: '속싸개로 감싸기', group: 'touch' },
    ],
  },
  {
    id: 'soothe', label: '달래기', icon: '🫂', stamina: 6,
    methods: [
      { id: 'hold', label: '안고 버티기', group: 'body' },
      { id: 'pacifier', label: '공갈젖꼭지', group: 'stim' },
      { id: 'walk', label: '안고 걷기', group: 'body' },
      { id: 'toy', label: '딸랑이', group: 'stim' },
      { id: 'sing', label: '노래 불러주기', group: 'stim' },
      { id: 'skin', label: '살 맞대고 눕기', group: 'body' },
    ],
  },
  {
    id: 'care', label: '돌보기', icon: '🧼', stamina: 5,
    methods: [
      { id: 'diaper', label: '기저귀 갈기', group: 'clean' },
      { id: 'bath', label: '목욕', group: 'clean' },
      { id: 'clothes', label: '옷 갈아입히기', group: 'clean' },
      { id: 'temp', label: '실내온도 맞추기', group: 'env' },
      { id: 'massage', label: '마사지', group: 'env' },
      { id: 'play', label: '놀아주기', group: 'env' },
    ],
  },
];

const ACTION_BY_ID = Object.fromEntries(ACTIONS.map(a => [a.id, a])) as Record<Category, ActionDef>;

// 울음의 숨은 원인 → 이걸 해결하는 방법. 플레이어에겐 안 보여준다.
export const CRY_CAUSES: { id: string; label: string; fix: { cat: Category; method: string } }[] = [
  { id: 'tag', label: '옷 태그가 배겼다', fix: { cat: 'care', method: 'clothes' } },
  { id: 'hot', label: '실내가 덥다', fix: { cat: 'care', method: 'temp' } },
  { id: 'wet', label: '기저귀가 축축하다', fix: { cat: 'care', method: 'diaper' } },
  { id: 'burp', label: '트림이 안 나왔다', fix: { cat: 'feed', method: 'burp' } },
  { id: 'tummy', label: '배가 아프다', fix: { cat: 'care', method: 'massage' } },
  { id: 'lonely', label: '안기고 싶다', fix: { cat: 'soothe', method: 'skin' } },
  { id: 'bored', label: '심심하다', fix: { cat: 'care', method: 'play' } },
  { id: 'bright', label: '너무 밝다', fix: { cat: 'sleep', method: 'dark' } },
];

// ── 챕터 (실제 기록에 맞춤) ─────────────────────────────────────────────────
export interface Chapter { id: number; title: string; from: number; to: number; turns: number; note: string }

export const CHAPTERS: Chapter[] = [
  { id: 1, title: '신생아기', from: 1, to: 40, turns: 6, note: '2~3시간마다 수유. 새벽이 길다.' },
  { id: 2, title: '적응기', from: 41, to: 96, turns: 5, note: '목욕과 놀이가 열린다. 통잠에 도전.' },
  { id: 3, title: '백일', from: 97, to: 120, turns: 5, note: '제주도, 그리고 백일잔치.' },
  { id: 4, title: '뒤집기', from: 121, to: 180, turns: 4, note: '뒤집고, 까먹고, 다시 기억해낸다.' },
  { id: 5, title: '이유식과 배밀이', from: 181, to: 200, turns: 4, note: '첫 이유식. 그리고 배밀이.' },
];

export function chapterOf(day: number): Chapter {
  return CHAPTERS.find(c => day >= c.from && day <= c.to) ?? CHAPTERS[CHAPTERS.length - 1];
}

// 실제 기록에서 가져온 스크립트 이벤트. 그날엔 평소 루틴 대신 이게 뜬다.
export interface ScriptEvent { day: number; title: string; kind: 'milestone' | 'reset' | 'trip' | 'party' }
export const SCRIPT_EVENTS: ScriptEvent[] = [
  { day: 97, title: '제주도로 떠나는 날', kind: 'trip' },
  { day: 100, title: '설이 100일', kind: 'party' },
  { day: 101, title: '100일 잔치', kind: 'party' },
  { day: 130, title: '설이가 처음으로 뒤집었다', kind: 'milestone' },
  { day: 131, title: '뒤집는 법을 까먹었다', kind: 'reset' },
  { day: 132, title: '뒤집는 법을 다시 기억해냈다', kind: 'milestone' },
  { day: 139, title: '되집기 성공', kind: 'milestone' },
  { day: 181, title: '첫 이유식', kind: 'milestone' },
  { day: 200, title: '배밀이 시작', kind: 'milestone' },
];

export const scriptEventOf = (day: number) => SCRIPT_EVENTS.find(e => e.day === day) ?? null;

// ── 상태 ────────────────────────────────────────────────────────────────────
export interface Baby { hunger: number; sleep: number; mood: number; health: number; arousal: number }
export interface Parent { stamina: number; mental: number }

export interface PatternState {
  correct: Record<Category, string>;                                  // 카테고리별 현재 정답
  log: Record<Category, Record<string, { ok: number; fail: number }>>; // 플레이어가 알아낸 것
  index: number;                                                       // 몇 번째 패턴인지
  nextResetDay: number;
}

export interface Cry { causeId: string | null; tries: number; holds: number }

export interface GameState {
  seed: number;
  day: number;
  slotIdx: number;
  baby: Baby;
  parent: Parent;
  pattern: PatternState;
  cry: Cry | null;
  dayScore: number;
  dayTurns: number;
  dayAvgSum: number;
  album: number[];        // 해금한 날짜(D+N)
  streak: number;
  bestStreak: number;
  score: number;
  finished: boolean;
  log: string[];          // 최근 연출 문구
}

// ── 난수 (시드 고정 — 같은 세이브는 같은 전개) ──────────────────────────────
function rng(state: GameState): number {
  state.seed = (state.seed * 1664525 + 1013904223) >>> 0;
  return state.seed / 4294967296;
}
const pick = <T,>(s: GameState, arr: T[]): T => arr[Math.floor(rng(s) * arr.length)];
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

// ── 패턴 ────────────────────────────────────────────────────────────────────
function rollPattern(s: GameState): Record<Category, string> {
  const out = {} as Record<Category, string>;
  for (const a of ACTIONS) out[a.id] = pick(s, a.methods).id;
  return out;
}

function resetPattern(s: GameState) {
  s.pattern.correct = rollPattern(s);
  s.pattern.log = { feed: {}, sleep: {}, soothe: {}, care: {} };
  s.pattern.index += 1;
  s.pattern.nextResetDay =
    s.day + BAL.patternResetMin + Math.floor(rng(s) * (BAL.patternResetMax - BAL.patternResetMin + 1));
  s.log.push('무언가 달라졌다. 어제까지 되던 게 오늘은 안 먹힌다.');
}

// 이 방법이 정답인지 / 정답과 같은 계열인지 / 완전히 빗나갔는지.
// 플레이어는 이 결과를 문구로만 본다. 숫자는 안 보여준다.
export type Tier = 'correct' | 'near' | 'off';
export function methodTier(s: GameState, cat: Category, method: string): Tier {
  const correct = s.pattern.correct[cat];
  if (method === correct) return 'correct';
  const ms = ACTION_BY_ID[cat].methods;
  const g = ms.find(m => m.id === method)?.group;
  return g && g === ms.find(m => m.id === correct)?.group ? 'near' : 'off';
}

// 실패했을 때도 방향은 알려준다. 이게 없으면 6개를 순수 랜덤으로 찍어야 해서
// 탐색 기간이 통째로 실점이 된다.
export function hintFor(tier: Tier): string {
  return tier === 'near' ? ' 그래도 아까보단 나은 것 같다.' : ' 이 방향은 아닌 듯하다.';
}

// 성공했을 때도 '쉽게 됐는지 / 겨우 됐는지'를 알려준다.
// 이게 없으면 near(어중간하게 통하는 방법)로 성공한 걸 정답으로 착각해서
// 플레이어가 45%짜리 방법에 갇힌 채 판이 끝난다.
export function tone(tier: Tier, easy: string, barely: string): string {
  return tier === 'correct' ? easy : barely;
}

export function masteryOf(s: GameState, cat: Category, method: string): number {
  const e = s.pattern.log[cat]?.[method];
  if (!e) return 0;
  return Math.min(1, e.ok / BAL.masteryCap);
}

// 이 방법이 지금 먹힐 확률. 플레이어에겐 숫자를 보여주지 않는다.
export function successRate(s: GameState, cat: Category, method: string): number {
  const tier = methodTier(s, cat, method);
  let p = tier === 'correct'
    ? BAL.hitCorrectBase + (BAL.hitCorrectMastered - BAL.hitCorrectBase) * masteryOf(s, cat, method)
    : tier === 'near' ? BAL.hitNear : BAL.hitWrong;

  // 컨디션 페널티는 합쳐서 penaltyCap을 넘지 않는다. 안 그러면 한 번 무너진 판이
  // 영영 복구가 안 돼서 '어려운 게임'이 아니라 '고장난 게임'이 된다.
  let penalty = 0;
  if (s.baby.mood < 30) penalty += 0.10;
  if (s.parent.mental < 30) penalty += 0.07;
  if (s.parent.stamina < 20) penalty += 0.07;
  p -= Math.min(penalty, BAL.penaltyCap);
  if (cat === 'sleep') p -= s.baby.arousal * BAL.arousalPenalty;

  return Math.max(BAL.hitFloor, Math.min(BAL.hitCeil, p));
}

// ── 초기화 ──────────────────────────────────────────────────────────────────
export function newGame(seed = Date.now() >>> 0): GameState {
  const s: GameState = {
    seed,
    day: 1, slotIdx: 0,
    baby: { hunger: 50, sleep: 50, mood: 70, health: 90, arousal: 0 },
    parent: { stamina: 100, mental: 100 },
    pattern: { correct: {} as Record<Category, string>, log: { feed: {}, sleep: {}, soothe: {}, care: {} }, index: 0, nextResetDay: 0 },
    cry: null,
    dayScore: 0, dayTurns: 0, dayAvgSum: 0,
    album: [], streak: 0, bestStreak: 0, score: 0,
    finished: false,
    log: [],
  };
  s.pattern.correct = rollPattern(s);
  s.pattern.nextResetDay = BAL.patternResetMin + Math.floor(rng(s) * (BAL.patternResetMax - BAL.patternResetMin + 1));
  return s;
}

// ── 울음 ────────────────────────────────────────────────────────────────────
// 황혼 울음: 저녁에 잦고, D+14~90이 피크. 실제 영아산통 곡선을 따라간다.
export function cryChance(day: number, slot: Slot): number {
  const colic = day < 14 ? 0.3 : day <= 45 ? 1.0 : day <= 90 ? 0.7 : day <= 130 ? 0.4 : 0.25;
  const bySlot: Record<Slot, number> = { dawn: 0.22, morning: 0.12, day: 0.14, evening: 0.30 };
  return bySlot[slot] * colic;
}

function startCry(s: GameState) {
  const noCause = rng(s) < BAL.cryNoCauseRate;
  s.cry = { causeId: noCause ? null : pick(s, CRY_CAUSES).id, tries: 0, holds: 0 };
  s.log.push('설이가 웁니다. 게이지는 다 정상인데...');
}

export interface TurnResult {
  ok: boolean;
  text: string;
  cryResolved?: boolean;
  cryFailed?: boolean;
  arousalHit?: boolean;
}

// 울음 대응. 원인을 맞히면 즉시 그친다. 원인이 없으면 '안고 버티기'만 통한다.
function actOnCry(s: GameState, cat: Category, method: string): TurnResult {
  const cry = s.cry!;
  cry.tries += 1;
  s.parent.stamina = clamp(s.parent.stamina - ACTION_BY_ID[cat].stamina);

  if (cry.causeId === null) {
    if (cat === 'soothe' && method === 'hold') {
      cry.holds += 1;
      if (cry.holds >= BAL.cryHoldNeeded) {
        s.cry = null;
        s.baby.mood = clamp(s.baby.mood + 8);
        s.dayScore += 12;
        return { ok: true, text: '한참을 안고 있으니 스르르 그쳤다. 이유는 끝내 몰랐다.', cryResolved: true };
      }
      return { ok: false, text: '안고 버틴다. 아직 운다.' };
    }
    if (cry.tries >= BAL.cryMaxTries) return failCry(s, '뭘 해도 안 통했다. 오늘은 그냥 그런 날이었다.');
    return { ok: false, text: '소용없다. 설이는 계속 운다.' };
  }

  const cause = CRY_CAUSES.find(c => c.id === cry.causeId)!;
  if (cause.fix.cat === cat && cause.fix.method === method) {
    s.cry = null;
    s.baby.mood = clamp(s.baby.mood + 14);
    s.dayScore += 18;
    return { ok: true, text: `${cause.label}. 해결하자 곧바로 그쳤다.`, cryResolved: true };
  }
  if (cry.tries >= BAL.cryMaxTries) return failCry(s, '끝내 원인을 못 찾았다.');
  return { ok: false, text: '아니다. 계속 운다.' };
}

function failCry(s: GameState, text: string): TurnResult {
  s.cry = null;
  s.baby.mood = clamp(s.baby.mood - 14);
  s.baby.arousal = Math.min(BAL.arousalMax, s.baby.arousal + 1);
  s.parent.mental = clamp(s.parent.mental - 12);
  s.dayScore -= 10;
  return { ok: false, text, cryFailed: true, arousalHit: true };
}

// ── 한 턴 ───────────────────────────────────────────────────────────────────
export function act(s: GameState, cat: Category, method: string): TurnResult {
  if (s.finished) return { ok: false, text: '이미 200일을 다 키웠다.' };

  if (s.cry) {
    const r = actOnCry(s, cat, method);
    s.log.push(r.text);
    if (!s.cry) advance(s);
    return r;
  }

  const def = ACTION_BY_ID[cat];
  s.parent.stamina = clamp(s.parent.stamina - def.stamina);

  const p = successRate(s, cat, method);
  const tier = methodTier(s, cat, method);
  const ok = rng(s) < p;
  const entry = (s.pattern.log[cat][method] ??= { ok: 0, fail: 0 });
  ok ? entry.ok++ : entry.fail++;

  let text: string;
  let arousalHit = false;

  if (cat === 'sleep') {
    if (ok) {
      s.baby.sleep = clamp(s.baby.sleep + BAL.recoverSleep);
      s.baby.arousal = Math.max(0, s.baby.arousal - 1);
      s.dayScore += 15;
      text = tone(tier, '눕히자마자 스르륵 잠들었다. 이 방법이다.', '한참 걸렸지만 겨우 잠들었다.');
    } else {
      s.baby.arousal = Math.min(BAL.arousalMax, s.baby.arousal + 1);
      s.baby.mood = clamp(s.baby.mood - 12);
      s.parent.mental = clamp(s.parent.mental - 8);
      s.dayScore -= 7;
      arousalHit = true;
      text = '⚡ 설이가 과각성이 되어버렸습니다! 눈이 더 말똥말똥해졌다.' + hintFor(tier);
    }
  } else if (cat === 'feed') {
    if (ok) {
      s.baby.hunger = clamp(s.baby.hunger + BAL.recoverHunger);
      s.baby.sleep = clamp(s.baby.sleep + 8);
      s.dayScore += 15;
      text = tone(tier, '쭉쭉 잘 먹는다. 이 방법이다.', '조금 먹다 말다 했지만 먹긴 먹었다.');
    } else {
      s.baby.hunger = clamp(s.baby.hunger + 10);
      s.baby.mood = clamp(s.baby.mood - 10);
      s.dayScore -= 5;
      text = '고개를 돌린다. 잘 안 먹는다.' + hintFor(tier);
    }
  } else if (cat === 'soothe') {
    if (ok) {
      s.baby.mood = clamp(s.baby.mood + BAL.recoverMood);
      s.baby.arousal = Math.max(0, s.baby.arousal - 1);
      s.dayScore += 12;
      text = tone(tier, '금세 방긋 웃는다. 이 방법이다.', '그럭저럭 진정은 됐다.');
    } else {
      s.baby.mood = clamp(s.baby.mood - 8);
      s.dayScore -= 6;
      text = '별로 안 통한다.' + hintFor(tier);
    }
  } else {
    if (ok) {
      s.baby.health = clamp(s.baby.health + BAL.recoverHealth);
      s.baby.mood = clamp(s.baby.mood + 12);
      s.dayScore += 12;
      text = tone(tier, '아주 개운해했다. 이 방법이다.', '싫진 않은 눈치다.');
    } else {
      s.baby.mood = clamp(s.baby.mood - 8);
      s.dayScore -= 6;
      text = '싫다고 버둥거린다.' + hintFor(tier);
    }
  }

  s.log.push(text);
  advance(s);
  return { ok, text, arousalHit };
}

// ── 시간 진행 ───────────────────────────────────────────────────────────────
function advance(s: GameState) {
  s.dayTurns += 1;
  const ch = chapterOf(s.day);

  // 게이지 자연 감소 — 신생아기일수록 빨리 닳는다
  const drain = s.day <= 40 ? 1.35 : s.day <= 96 ? 1.15 : 1.0;
  s.baby.hunger = clamp(s.baby.hunger - BAL.drainHunger * drain);
  s.baby.sleep = clamp(s.baby.sleep - BAL.drainSleep * drain);
  if (s.baby.hunger < 25 || s.baby.sleep < 25) s.baby.mood = clamp(s.baby.mood - 10);
  if (s.baby.mood < 20) s.baby.health = clamp(s.baby.health - 4);

  s.dayAvgSum += (s.baby.hunger + s.baby.sleep + s.baby.mood + s.baby.health) / 4;

  s.slotIdx += 1;
  if (s.slotIdx >= ch.turns) return endDay(s);

  // 다음 턴 울음 판정
  const slot = SLOTS[s.slotIdx % SLOTS.length];
  if (!s.cry && rng(s) < cryChance(s.day, slot)) startCry(s);
}

function endDay(s: GameState) {
  const avg = s.dayTurns > 0 ? s.dayAvgSum / s.dayTurns : 0;
  const dayTotal = Math.round(avg * 0.85 + s.dayScore * 0.45);
  const passed = dayTotal >= BAL.dayPassScore;

  if (passed) {
    s.album.push(s.day);
    s.streak += 1;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    s.parent.mental = clamp(s.parent.mental + 10); // 사진을 보면 버텨진다
  } else {
    s.streak = 0;
  }
  s.score += Math.max(0, dayTotal);

  // 밤새 회복
  s.parent.stamina = clamp(s.parent.stamina + (s.day <= 40 ? BAL.staminaNightNewborn : BAL.staminaNight));
  s.baby.arousal = Math.max(0, s.baby.arousal - 1);

  s.day += 1;
  s.slotIdx = 0;
  s.dayScore = 0;
  s.dayTurns = 0;
  s.dayAvgSum = 0;

  if (s.day > TOTAL_DAYS) { s.day = TOTAL_DAYS; s.finished = true; return; }

  // 실제 기록: D+131에 뒤집는 법을 까먹었다 → 그날은 강제 리셋
  const ev = scriptEventOf(s.day);
  if (ev?.kind === 'reset') resetPattern(s);
  else if (s.day >= s.pattern.nextResetDay) resetPattern(s);

  const slot = SLOTS[0];
  if (rng(s) < cryChance(s.day, slot)) startCry(s);
}

// ── 최종 등급 ───────────────────────────────────────────────────────────────
export function gradeOf(album: number[]): 'S' | 'A' | 'B' | 'C' {
  const r = album.length / TOTAL_DAYS;
  return r >= 0.95 ? 'S' : r >= 0.82 ? 'A' : r >= 0.62 ? 'B' : 'C';
}

export const currentSlot = (s: GameState): Slot => SLOTS[s.slotIdx % SLOTS.length];
