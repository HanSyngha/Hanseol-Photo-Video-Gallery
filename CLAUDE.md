# CLAUDE.md

## Behavioral Guidelines

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" -> "Write tests for invalid inputs, then make them pass"
- "Fix the bug" -> "Write a test that reproduces it, then make it pass"
- "Refactor X" -> "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]
```

---

## Project: 땅콩땅콩땅땅콩콩

가족/친구 단위(5~20명) 사진/영상 공유 웹 서비스. Synology DS920+ NAS에서 Docker로 운영.

### Tech Stack

- **Backend**: Node.js + Fastify (TypeScript)
- **Frontend**: React + Vite (TypeScript)
- **DB**: SQLite (better-sqlite3), WAL mode
- **Image Processing**: Sharp (libvips) - 300px WebP thumbnails
- **Video Thumbnails**: ffmpeg
- **Auth**: Kakao/Naver OAuth -> JWT
- **Deployment**: Docker Compose, single container, port 2230

### Architecture

단일 컨테이너. Nginx 없음. Fastify가 API + SPA 정적 파일 + 미디어 서빙 전부 처리.

```
/data/originals/   - 원본 사진/영상
/data/thumbnails/  - 300px WebP 썸네일
/data/peanut.db    - SQLite DB
```

### Project Structure

```
server/              # Fastify backend
  index.ts           # 서버 진입점
  db.ts              # SQLite 초기화
  auth.ts            # OAuth + JWT
  routes/media.ts    # 업로드/목록/삭제
  routes/interaction.ts  # 좋아요/댓글/확인/다운로드
  routes/user.ts     # 사용자 정보
  media-processor.ts # Sharp + ffmpeg
  upload-queue.ts    # FIFO 처리 큐

src/                 # React frontend
  pages/Login.tsx, Gallery.tsx
  components/MediaGrid, MediaCard, Lightbox, VideoPlayer,
             UploadModal, Comments, UserBadges
  hooks/useAuth.ts
  api.ts             # API 클라이언트
```

### Key Conventions

- 파일명은 UUID 기반 (캐시 immutable 전략)
- 커서 기반 페이지네이션 (offset 사용 금지)
- 업로드: 클라이언트 순차 전송 -> 서버 FIFO 큐 처리
- 미디어 서빙: Range Request 지원 필수
- 갤러리: react-virtuoso 가상 스크롤
- 라이트박스: progressive loading (썸네일 blur -> 원본)
- 삭제 권한: 본인 미디어 + master는 전체 삭제 가능

### DB Tables

users, media, views, downloads, likes, comments (상세 스키마는 PLAN.md 참조)

### Commands

```bash
# Dev
npm run dev          # Vite dev server (frontend)
npm run dev:server   # Fastify dev server (backend)

# Build & Deploy
docker compose up --build
```
