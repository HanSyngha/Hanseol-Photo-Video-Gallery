import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import db from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
// 토큰 발급 앱 식별(aud). family(peanut-family)와 같은 호스트(포트만 다름)라 쿠키 저장소를 공유하고,
// 과거엔 시크릿까지 같아서 상대 앱 토큰이 그대로 통과해 '같은 id의 다른 사람'으로 로그인되는
// 사고가 있었다. 시크릿 분리와 별개로 aud 검증으로 한 번 더 막는다.
const JWT_AUDIENCE = 'peanut-share';
const BASE_URL = process.env.BASE_URL || 'http://localhost:2230';

// access 4h + refresh 90일. 예전엔 refresh가 없고 access 쿠키에 만료도 없어서(세션 쿠키)
// 브라우저를 닫거나 4시간만 지나면 무조건 재로그인이었다.
const ACCESS_TOKEN_TTL_SEC = 4 * 3600;
const REFRESH_TOKEN_TTL_SEC = 90 * 24 * 3600;
const REFRESH_COOKIE = 'pnrefresh';

interface JwtPayload {
  userId: number;
  role: string;
  iat?: number;
  exp?: number;
}

// 인증 이벤트 로깅 (IP/기기별 세션 추적)
function logAuth(event: string, request: FastifyRequest, extra: Record<string, any> = {}) {
  const ip = request.headers['x-real-ip'] || request.headers['x-forwarded-for'] || request.ip;
  const ua = request.headers['user-agent'] || 'unknown';
  const mode = request.headers['x-app-mode'] || 'none';
  const cookies = Object.keys(request.cookies || {}).join(',');
  console.log(`[AUTH] ${event} | ip=${ip} | mode=${mode} | ua=${ua.slice(0, 80)} | cookies=[${cookies}]`, JSON.stringify(extra));
}

// 요청의 앱 모드에 따라 쿠키 이름 결정 (PWA: pnpauth, 브라우저: pnauth)
// P2(family)와 쿠키 충돌 방지를 위해 'pn' prefix 사용
function getTokenCookieName(request: FastifyRequest): string {
  const mode = request.headers['x-app-mode'];
  return mode === 'pwa' ? 'pnpauth' : 'pnauth';
}

// JWT 검증
export function authenticate(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  const cookieName = getTokenCookieName(request);
  // X-App-Mode 헤더가 있으면 해당 쿠키만, 없으면 (img/video 등) 양쪽 다 확인
  const token = request.headers['x-app-mode']
    ? request.cookies?.[cookieName]
    : (request.cookies?.pnpauth || request.cookies?.pnauth);
  if (!token) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET, { audience: JWT_AUDIENCE }) as JwtPayload;
    const user = db.prepare('SELECT id, name, banned FROM users WHERE id = ?').get(payload.userId) as any;
    if (user?.banned) {
      logAuth('BANNED', request, { userId: payload.userId });
      reply.clearCookie(cookieName, { path: '/' }).code(403).send({ error: 'Banned' });
      return;
    }
    // /api/auth/me 요청에만 상세 로깅 (매 요청 로깅은 과다)
    if (request.url.startsWith('/api/auth/me')) {
      const iat = payload.iat ? new Date(payload.iat * 1000).toISOString() : '?';
      logAuth('ME', request, { userId: payload.userId, name: user?.name, cookie: cookieName, issuedAt: iat });
    }
    (request as any).user = payload;
    done();
  } catch {
    logAuth('INVALID_TOKEN', request, { cookie: cookieName });
    reply.clearCookie(cookieName, { path: '/' }).code(401).send({ error: 'Invalid token' });
    return;
  }
}

function generateToken(userId: number, role: string): string {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '4h', audience: JWT_AUDIENCE });
}

// refresh token: 256bit 랜덤. 평문은 클라이언트에만, 서버는 SHA-256 해시만 저장.
function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function upsertUser(provider: string, providerId: string, name: string, profileImage: string | null) {
  // 카카오 등은 profile_image_url을 http://로 주는데 HTTPS 사이트에선 mixed-content로 차단됨 → https로 승격
  if (profileImage && profileImage.startsWith('http://')) profileImage = 'https://' + profileImage.slice(7);
  const existing = db.prepare('SELECT id, role FROM users WHERE provider = ? AND providerId = ?').get(provider, providerId) as any;

  if (existing) {
    const MASTER_NAMES = ['황하람', '한승하'];
    const updatedRole = MASTER_NAMES.includes(name) ? 'master' : existing.role;
    db.prepare('UPDATE users SET name = ?, profileImage = ?, role = ? WHERE id = ?').run(name, profileImage, updatedRole, existing.id);
    return { id: existing.id, role: updatedRole };
  }

  const MASTER_NAMES = ['황하람', '한승하'];
  const role = MASTER_NAMES.includes(name) ? 'master' : 'member';

  const result = db.prepare('INSERT INTO users (provider, providerId, name, profileImage, role) VALUES (?, ?, ?, ?, ?)').run(provider, providerId, name, profileImage, role);
  return { id: result.lastInsertRowid as number, role };
}

// OAuth 콜백에서 쿠키 이름 결정 (pnapp_mode 쿠키로 판별). 'app_mode'는 family와 이름이 겹쳐
// 같은 호스트에서 서로 덮어썼으므로 앱별 prefix 사용.
function getCallbackCookieName(request: FastifyRequest): string {
  return request.cookies?.pnapp_mode === 'pwa' ? 'pnpauth' : 'pnauth';
}

const COOKIE_OPTS = (secure: boolean) => ({
  path: '/' as const,
  httpOnly: true,
  secure,
  sameSite: 'lax' as const,
});
const ACCESS_COOKIE_OPTS = (secure: boolean) => ({
  ...COOKIE_OPTS(secure),
  maxAge: ACCESS_TOKEN_TTL_SEC,
});
const REFRESH_COOKIE_OPTS = (secure: boolean) => ({
  ...COOKIE_OPTS(secure),
  maxAge: REFRESH_TOKEN_TTL_SEC,
});

function revokeRefreshToken(refreshToken?: string) {
  if (!refreshToken) return;
  db.prepare("UPDATE device_sessions SET revokedAt = datetime('now', '+9 hours') WHERE tokenHash = ? AND revokedAt IS NULL")
    .run(hashToken(refreshToken));
}

function createRefreshSession(userId: number, deviceName: string | null) {
  const refreshToken = generateRefreshToken();
  db.prepare('INSERT INTO device_sessions (userId, tokenHash, deviceName) VALUES (?, ?, ?)')
    .run(userId, hashToken(refreshToken), deviceName?.slice(0, 80) || null);
  return refreshToken;
}

function refreshAccessToken(refreshToken: string, request: FastifyRequest): string | null {
  const session = db.prepare('SELECT id, userId, revokedAt FROM device_sessions WHERE tokenHash = ?').get(hashToken(refreshToken)) as any;
  if (!session || session.revokedAt) {
    logAuth('REFRESH_INVALID', request, {});
    return null;
  }
  const user = db.prepare('SELECT id, role, banned FROM users WHERE id = ?').get(session.userId) as any;
  if (!user || user.banned) return null;
  db.prepare("UPDATE device_sessions SET lastUsedAt = datetime('now', '+9 hours') WHERE id = ?").run(session.id);
  return generateToken(user.id, user.role);
}

// OAuth 콜백 공통: 이전 refresh 세션 폐기 → 두 쿠키 이름 모두 정리 → access + refresh 쿠키 발급.
function issueSession(request: FastifyRequest, reply: FastifyReply, user: { id: number; role: string }) {
  const token = generateToken(user.id, user.role);
  const refreshToken = createRefreshSession(user.id, `web:${request.headers['user-agent'] || 'unknown'}`);
  const cookieName = getCallbackCookieName(request);
  const secure = BASE_URL.startsWith('https');
  revokeRefreshToken(request.cookies?.[REFRESH_COOKIE]);
  return reply
    .clearCookie('pnauth', { path: '/' })
    .clearCookie('pnpauth', { path: '/' })
    .clearCookie(REFRESH_COOKIE, { path: '/' })
    .setCookie(cookieName, token, ACCESS_COOKIE_OPTS(secure))
    .setCookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS(secure))
    .clearCookie('pnapp_mode', { path: '/' })
    .clearCookie('auth', { path: '/' })
    .clearCookie('pauth', { path: '/' })
    .clearCookie('token', { path: '/' })
    .redirect('/');
}

export function registerAuthRoutes(app: FastifyInstance) {
  // --- 카카오 ---
  app.get('/api/auth/kakao', async (_request, reply) => {
    const clientId = process.env.KAKAO_CLIENT_ID;
    const redirectUri = `${BASE_URL}/api/auth/kakao/callback`;
    const url = `https://kauth.kakao.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;
    reply.redirect(url);
  });

  app.get('/api/auth/kakao/callback', async (request, reply) => {
    try {
      const { code } = request.query as { code: string };
      if (!code) return reply.redirect('/login?error=no_code');

      const clientId = process.env.KAKAO_CLIENT_ID!;
      const clientSecret = process.env.KAKAO_CLIENT_SECRET!;
      const redirectUri = `${BASE_URL}/api/auth/kakao/callback`;

      const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code,
        }),
      });
      const tokenData = await tokenRes.json() as any;
      if (!tokenData.access_token) return reply.redirect('/login?error=token_failed');

      const userRes = await fetch('https://kapi.kakao.com/v2/user/me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userData = await userRes.json() as any;
      if (!userData.id) return reply.redirect('/login?error=user_info_failed');

      const name = userData.kakao_account?.profile?.nickname || '사용자';
      const profileImage = userData.kakao_account?.profile?.profile_image_url || null;

      const user = upsertUser('kakao', String(userData.id), name, profileImage);
      logAuth('LOGIN', request, { provider: 'kakao', userId: user.id, name, cookie: getCallbackCookieName(request) });
      return issueSession(request, reply, user);
    } catch (err) {
      request.log.error(err, 'Kakao OAuth failed');
      reply.redirect('/login?error=oauth_failed');
    }
  });

  // --- 네이버 ---
  app.get('/api/auth/naver', async (_request, reply) => {
    const clientId = process.env.NAVER_CLIENT_ID;
    const redirectUri = `${BASE_URL}/api/auth/naver/callback`;
    const state = Math.random().toString(36).substring(2);
    const url = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    reply.redirect(url);
  });

  app.get('/api/auth/naver/callback', async (request, reply) => {
    try {
      const { code, state } = request.query as { code: string; state: string };
      if (!code) return reply.redirect('/login?error=no_code');

      const clientId = process.env.NAVER_CLIENT_ID!;
      const clientSecret = process.env.NAVER_CLIENT_SECRET!;
      const redirectUri = `${BASE_URL}/api/auth/naver/callback`;

      const tokenRes = await fetch(`https://nid.naver.com/oauth2.0/token?grant_type=authorization_code&client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}&state=${state}`);
      const tokenData = await tokenRes.json() as any;
      if (!tokenData.access_token) return reply.redirect('/login?error=token_failed');

      const userRes = await fetch('https://openapi.naver.com/v1/nid/me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userData = await userRes.json() as any;
      if (!userData.response?.id) return reply.redirect('/login?error=user_info_failed');

      const profile = userData.response;
      const name = profile.name || profile.nickname || '사용자';
      const profileImage = profile.profile_image || null;

      const user = upsertUser('naver', profile.id, name, profileImage);
      logAuth('LOGIN', request, { provider: 'naver', userId: user.id, name, cookie: getCallbackCookieName(request) });
      return issueSession(request, reply, user);
    } catch (err) {
      request.log.error(err, 'Naver OAuth failed');
      reply.redirect('/login?error=oauth_failed');
    }
  });

  // --- 현재 사용자 정보 ---
  app.get('/api/auth/me', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = (request as any).user;
    const user = db.prepare('SELECT id, name, profileImage, role, createdAt FROM users WHERE id = ?').get(userId) as any;
    // refresh 도입 전 로그인한 세션(access 쿠키만 있음)에 refresh 쿠키를 심어 준다.
    if (user && !request.cookies?.[REFRESH_COOKIE]) {
      const secure = BASE_URL.startsWith('https');
      const refreshToken = createRefreshSession(user.id, `web:${request.headers['user-agent'] || 'unknown'}`);
      reply.setCookie(REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS(secure));
      logAuth('WEB_REFRESH_BOOTSTRAP', request, { userId: user.id, name: user.name });
    }
    return user || null;
  });

  // --- 로그아웃 ---
  // 주의: 이 앱의 쿠키만 지운다. family(fauth/fpauth)는 같은 호스트라 여기서 지우면 family 세션까지 끊긴다.
  app.post('/api/auth/logout', async (request, reply) => {
    revokeRefreshToken(request.cookies?.[REFRESH_COOKIE]);
    reply
      .clearCookie('pnauth', { path: '/' })
      .clearCookie('pnpauth', { path: '/' })
      .clearCookie(REFRESH_COOKIE, { path: '/' })
      .clearCookie('auth', { path: '/' })
      .clearCookie('pauth', { path: '/' })
      .clearCookie('token', { path: '/' })
      .send({ ok: true });
  });

  // 웹/PWA 세션 자동 갱신. refresh token은 httpOnly 쿠키로만 전달한다.
  app.post('/api/auth/refresh', async (request, reply) => {
    const refreshToken = request.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) return reply.code(401).send({ error: 'No refresh token' });
    const accessToken = refreshAccessToken(refreshToken, request);
    if (!accessToken) {
      return reply
        .clearCookie('pnauth', { path: '/' })
        .clearCookie('pnpauth', { path: '/' })
        .clearCookie(REFRESH_COOKIE, { path: '/' })
        .code(401)
        .send({ error: 'Invalid refresh token' });
    }
    const cookieName = getTokenCookieName(request);
    const secure = BASE_URL.startsWith('https');
    reply
      .clearCookie('pnauth', { path: '/' })
      .clearCookie('pnpauth', { path: '/' })
      .setCookie(cookieName, accessToken, ACCESS_COOKIE_OPTS(secure))
      .send({ ok: true, expiresIn: ACCESS_TOKEN_TTL_SEC });
  });
}
