import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth.js';
import db from '../db.js';

// 설이 생일. 게임 D+1 = 이 날짜. (relatives에는 family의 babies 테이블이 없어 상수로 둔다)
const BIRTH = '2026-02-19';
const TOTAL_DAYS = 200;

// 게임 D+N → 실제 날짜 'YYYY-MM-DD'
function dayToDate(day: number): string {
  const d = new Date(BIRTH + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + day - 1);
  return d.toISOString().slice(0, 10);
}

// 실제 날짜 → 게임 D+N
function dateToDay(date: string): number {
  return Math.floor(
    (new Date(date.slice(0, 10) + 'T00:00:00Z').getTime() - new Date(BIRTH + 'T00:00:00Z').getTime()) / 86400000
  ) + 1;
}

// 촬영 시각 → 게임 시간대. 게임 하루가 이 4구간으로 나뉜다.
function slotOf(createdAt: string): 'dawn' | 'morning' | 'day' | 'evening' {
  const h = parseInt(createdAt.slice(11, 13), 10);
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'day';
  if (h >= 17 && h < 22) return 'evening';
  return 'dawn';
}

export function registerGameRoutes(app: FastifyInstance) {
  // ── 세이브 ──────────────────────────────────────────────────────────────
  app.get('/api/game/save', { preHandler: authenticate }, async (request) => {
    const { userId } = (request as any).user;
    const row = db.prepare('SELECT * FROM game_saves WHERE userId = ?').get(userId) as any;
    if (!row) return { save: null };
    return { save: { ...row, state: JSON.parse(row.state), finished: !!row.finished } };
  });

  app.put('/api/game/save', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as any).user;
    const b = request.body as {
      state?: unknown; day?: number; albumCount?: number;
      score?: number; bestStreak?: number; finished?: boolean; grade?: string | null;
    };
    if (!b || typeof b.state !== 'object' || b.state === null) {
      return reply.code(400).send({ error: 'state required' });
    }
    const day = Math.min(Math.max(Number(b.day) || 1, 1), TOTAL_DAYS);
    const albumCount = Math.min(Math.max(Number(b.albumCount) || 0, 0), TOTAL_DAYS);
    const score = Math.max(Number(b.score) || 0, 0);
    const bestStreak = Math.max(Number(b.bestStreak) || 0, 0);
    const finished = b.finished ? 1 : 0;
    const grade = b.grade ?? null;

    db.prepare(`
      INSERT INTO game_saves (userId, state, day, albumCount, score, bestStreak, finished, grade, clearedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 1 THEN datetime('now', '+9 hours') ELSE NULL END)
      ON CONFLICT(userId) DO UPDATE SET
        state = excluded.state, day = excluded.day, albumCount = excluded.albumCount,
        score = excluded.score, bestStreak = excluded.bestStreak,
        finished = excluded.finished, grade = excluded.grade,
        clearedAt = COALESCE(game_saves.clearedAt, excluded.clearedAt),
        updatedAt = datetime('now', '+9 hours')
    `).run(userId, JSON.stringify(b.state), day, albumCount, score, bestStreak, finished, grade, finished);

    return { ok: true };
  });

  // 처음부터 다시 키우기
  app.delete('/api/game/save', { preHandler: authenticate }, async (request) => {
    const { userId } = (request as any).user;
    db.prepare('DELETE FROM game_saves WHERE userId = ?').run(userId);
    return { ok: true };
  });

  // ── 리더보드 ────────────────────────────────────────────────────────────
  // 한 사람이 독식하지 않도록 3개 축으로 나눠서 각각 상위 10명.
  app.get('/api/game/leaderboard', { preHandler: authenticate }, async () => {
    const base = `
      SELECT u.id AS userId, u.name, u.profileImage,
             g.albumCount, g.score, g.bestStreak, g.grade, g.day, g.finished
      FROM game_saves g JOIN users u ON u.id = g.userId
    `;
    const top = (order: string) => db.prepare(`${base} ORDER BY ${order} LIMIT 10`).all()
      .map((r: any) => ({ ...r, finished: !!r.finished }));
    return {
      album: top('g.albumCount DESC, g.day DESC'),
      score: top('g.score DESC, g.albumCount DESC'),
      streak: top('g.bestStreak DESC, g.albumCount DESC'),
    };
  });

  // ── 그날의 미디어 ───────────────────────────────────────────────────────
  // 게임 D+N에 해당하는 실제 날짜의 사진/영상을 시간대별로 나눠서 준다.
  app.get('/api/game/day/:day', { preHandler: authenticate }, async (request, reply) => {
    const day = parseInt((request.params as any).day, 10);
    if (!Number.isFinite(day) || day < 1 || day > TOTAL_DAYS) {
      return reply.code(400).send({ error: 'day out of range' });
    }
    const date = dayToDate(day);
    const rows = db.prepare(`
      SELECT id, filename, type, originalName, width, height, duration, createdAt
      FROM media WHERE date(createdAt) = ? ORDER BY createdAt ASC
    `).all(date) as any[];

    const slots: Record<string, any[]> = { dawn: [], morning: [], day: [], evening: [] };
    for (const r of rows) slots[slotOf(r.createdAt)].push(r);

    // 그날 걸린 특별 이벤트(실제 기록). 있으면 전용 이벤트로 연출한다.
    const event = db.prepare(
      'SELECT id, title, startDate, endDate, color FROM gallery_events WHERE ? BETWEEN startDate AND endDate LIMIT 1'
    ).get(date) as any;

    return {
      day, date,
      total: rows.length,
      slots,
      event: event ? { ...event, dayIndex: dateToDay(date) - dateToDay(event.startDate) + 1 } : null,
    };
  });

  // 게임 전체 타임라인 메타 — 어느 날에 사진/영상/이벤트가 있는지 한 번에.
  // 클라가 200일치를 매일 물어보지 않게 앞에서 한 방에 받아간다.
  app.get('/api/game/timeline', { preHandler: authenticate }, async () => {
    const rows = db.prepare(`
      SELECT date(createdAt) AS d, COUNT(*) AS n, SUM(type = 'video') AS v
      FROM media GROUP BY date(createdAt)
    `).all() as any[];
    const days: Record<number, { n: number; v: number }> = {};
    for (const r of rows) {
      const dn = dateToDay(r.d);
      if (dn >= 1 && dn <= TOTAL_DAYS) days[dn] = { n: r.n, v: r.v || 0 };
    }
    const events = (db.prepare('SELECT id, title, startDate, endDate, color FROM gallery_events').all() as any[])
      .map(e => ({ ...e, day: dateToDay(e.startDate), endDay: dateToDay(e.endDate) }))
      .filter(e => e.endDay >= 1 && e.day <= TOTAL_DAYS)
      .sort((a, b) => a.day - b.day);
    return { birth: BIRTH, totalDays: TOTAL_DAYS, days, events };
  });
}
