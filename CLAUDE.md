# CLAUDE.md

## Behavioral Guidelines

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

**CRITICAL: NAS 데이터 절대 삭제 금지.** `/data/originals`, `/data/thumbnails`, `peanut.db`를 삭제하거나 초기화하지 마라. 스키마 변경이 필요하면 마이그레이션으로 처리. 사용자가 명시적으로 요청하더라도 반드시 한 번 더 확인받아라.

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

가족/친구 단위(5~20명) 사진/영상 공유 웹 서비스. Synology DS720+ NAS에서 Docker로 운영.
서비스명: 땅콩땅콩땅콩콩땅

### Tech Stack

- **Backend**: Node.js + Fastify (TypeScript)
- **Frontend**: React + Vite (TypeScript)
- **DB**: SQLite (better-sqlite3), WAL mode
- **Image Processing**: Sharp (libvips) - 300px WebP thumbnails
- **Video Thumbnails**: ffmpeg
- **Auth**: Kakao/Naver OAuth -> JWT
- **Deployment**: Docker Compose, single container, port 2280

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
- 갤러리: IntersectionObserver 지연 로딩 + 날짜별 그룹핑
- 라이트박스: progressive loading (썸네일 blur -> 원본)
- 삭제 권한: 본인 미디어 + master는 전체 삭제 가능

### OAuth 설정

- **Kakao**: 개발자콘솔 앱 이름 "Hanseol Dashboard" (ID 1378312)
  - Client ID(REST API KEY) + Redirect URI + 클라이언트 시크릿: 앱 설정 > 앱 > 플랫폼 키 > REST API 키 클릭
- **Naver**: 네이버 개발자센터
- `.env`의 `BASE_URL`이 OAuth 콜백 URL의 기반 (현재 `https://syngha.synology.me:2280`)

### HTTPS 구성

- Synology DSM 내장 Reverse Proxy 사용 (Control Panel > Login Portal > Advanced > Reverse Proxy)
- 규칙: `https://*:2280` → `http://localhost:12280`
- Docker는 `127.0.0.1:12280:2280`으로 바인딩 (외부 직접 접근 차단)
- **Reverse Proxy는 반드시 켜둬야 함** (SSL 처리 담당, 끄면 HTTPS 안 됨)
- SSL 인증서: Let's Encrypt (`syngha.synology.me`), 90일 자동갱신
  - 발급/관리: Control Panel > Security > Certificate
  - Reverse Proxy에 할당: Certificate > Settings > `*:2280` → `syngha.synology.me` 인증서 선택
- crypto.subtle (클라이언트 해시) 사용을 위해 HTTPS 필수

### DB Tables

users, media (hash 컬럼 포함), views, downloads, likes, comments, push_subscriptions

### NAS 접속

```bash
# SSH
ssh -i ~/.ssh/nas_key -p 2222 syngha_han@syngha.synology.me

# 프로젝트 경로
/volume1/docker/peanut/

# Docker 명령 (PATH 필요)
export PATH=/usr/local/bin:$PATH
docker compose build
docker compose down && docker compose up -d
docker logs peanut-peanut-1
```

### 배포 플로우

```bash
# 1. NAS로 rsync (변경분만 전송)
# 주의: -e 옵션 안에 반드시 --rsync-path도 지정해야 함 (Synology rsync 호환 이슈)
# 단순 rsync -e "ssh -i ... -p 2222"는 "Permission denied" 에러 발생 가능
# → --rsync-path=/usr/bin/rsync 추가 또는 ssh -v로 디버깅
rsync -avz --rsync-path=/usr/bin/rsync -e "ssh -i ~/.ssh/nas_key -p 2222" --exclude=node_modules --exclude=dist --exclude=data --exclude=.git --exclude=.env ./ syngha_han@syngha.synology.me:/volume1/docker/peanut/

# 2. NAS에서 빌드 & 재시작
ssh -i ~/.ssh/nas_key -p 2222 syngha_han@syngha.synology.me "cd /volume1/docker/peanut && export PATH=/usr/local/bin:\$PATH && docker compose build && docker compose down && docker compose up -d"
```

#### rsync "Permission denied" 트러블슈팅

Synology NAS에서 rsync가 `Permission denied`로 실패하는 경우:
1. SSH 단독 테스트: `ssh -i ~/.ssh/nas_key -p 2222 syngha_han@syngha.synology.me "echo ok"` → 이게 되면 키는 정상
2. rsync에 `--rsync-path=/usr/bin/rsync` 추가 (NAS의 rsync 경로 명시)
3. 그래도 안 되면 `-e "ssh -v -i ..."` 로 verbose 로그 확인
4. NAS DSM > Control Panel > Terminal & SNMP > rsync 서비스가 켜져있는지 확인 (SSH rsync와 별개)

### Commands

```bash
# Dev
npm run dev          # Vite dev server (frontend)
npm run dev:server   # Fastify dev server (backend)

# Build & Deploy
docker compose up --build
```
