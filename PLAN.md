# 땅콩땅콩땅땅콩콩 - 사진/영상 공유 서비스

## 개요

가족/친구 단위(5~20명) 사진·영상 공유 웹 서비스.
Synology DS920+ (Celeron J4125 4코어, 4GB RAM)에서 Docker로 운영.
포트 2230, Synology DDNS로 접근.

---

## 기술 스택

| 항목 | 선택 | 이유 |
|------|------|------|
| **Backend** | Node.js + **Fastify** | Express 대비 2~3배 빠름, JSON 직렬화 최적화 |
| **Frontend** | React + **Vite** | 빠른 빌드, 작은 번들 |
| **DB** | **SQLite** (better-sqlite3) | 별도 프로세스 없음, 20명 이하면 충분, 메모리 절약 |
| **이미지 처리** | **Sharp** (libvips) | 썸네일 생성, EXIF 회전 처리, 매우 빠름 |
| **영상 썸네일** | **ffmpeg** | 영상 첫 프레임 추출 |
| **파일 저장** | 로컬 파일시스템 (Volume Mount) | NAS 볼륨 직접 활용 |
| **인증** | 카카오/네이버 OAuth → JWT | 세션 서버 불필요 |
| **컨테이너** | Docker Compose (단일 컨테이너) | 최소 리소스 |

---

## 아키텍처

```
Docker Compose (포트 2230)
┌─────────────────────────────────┐
│  Node.js (Fastify)              │
│  ├── API 서버 (/api/*)          │
│  ├── OAuth (/api/auth/*)        │
│  ├── SPA 정적 파일 서빙         │
│  └── 미디어 직접 서빙 (Range)   │
│                                 │
│  SQLite (파일 DB, /data/db/)    │
└─────────────────────────────────┘
         │
    Volume Mount
         │
    /data/
    ├── originals/    원본 사진·영상
    ├── thumbnails/   썸네일 (300px)
    └── peanut.db     SQLite DB
```

> **단일 컨테이너**: Nginx 프록시 없음. Fastify가 정적 파일 + API + 미디어 서빙 전부 처리.
> Synology의 4코어를 최대한 활용하면서 메모리 오버헤드 최소화.

---

## DB 스키마 (SQLite)

```sql
-- 사용자
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,        -- 'kakao' | 'naver'
  providerId TEXT NOT NULL,
  name TEXT NOT NULL,            -- OAuth에서 받은 이름 (닉네임으로 사용)
  profileImage TEXT,             -- OAuth 프로필 이미지
  role TEXT DEFAULT 'member',    -- 'master' | 'member'
  createdAt TEXT DEFAULT (datetime('now')),
  UNIQUE(provider, providerId)
);

-- 미디어 (사진 + 영상)
CREATE TABLE media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uploaderId INTEGER NOT NULL REFERENCES users(id),
  filename TEXT NOT NULL,        -- 저장된 파일명 (UUID)
  originalName TEXT NOT NULL,    -- 원본 파일명
  mimeType TEXT NOT NULL,
  type TEXT NOT NULL,            -- 'image' | 'video'
  size INTEGER NOT NULL,         -- bytes
  width INTEGER,
  height INTEGER,
  duration REAL,                 -- 영상 길이 (초)
  createdAt TEXT DEFAULT (datetime('now'))
);

-- 확인 기록 (사진 본 사람)
CREATE TABLE views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mediaId INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  userId INTEGER NOT NULL REFERENCES users(id),
  createdAt TEXT DEFAULT (datetime('now')),
  UNIQUE(mediaId, userId)        -- 사용자당 1번만 기록
);

-- 다운로드 기록
CREATE TABLE downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mediaId INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  userId INTEGER NOT NULL REFERENCES users(id),
  createdAt TEXT DEFAULT (datetime('now')),
  UNIQUE(mediaId, userId)        -- 사용자당 1번만 기록
);

-- 좋아요
CREATE TABLE likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mediaId INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  userId INTEGER NOT NULL REFERENCES users(id),
  createdAt TEXT DEFAULT (datetime('now')),
  UNIQUE(mediaId, userId)
);

-- 댓글
CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mediaId INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  userId INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  createdAt TEXT DEFAULT (datetime('now'))
);
```

---

## 성능 전략 (핵심)

### 1. 업로드 시 전처리
- 원본 그대로 저장 (손실 없음)
- Sharp로 300px 썸네일 즉시 생성 (WebP, quality 80)
- EXIF 기반 자동 회전 적용
- 영상: ffmpeg으로 첫 프레임 썸네일 추출

### 2. 갤러리 로딩 (네트워크 속도 = 로딩 속도)
- **가상 스크롤**: `react-virtuoso`로 DOM에 보이는 것만 렌더링
- **썸네일만 로드**: 갤러리에서는 300px WebP 썸네일만 (1장 ~20KB)
- **IntersectionObserver**: 뷰포트 진입 시에만 로드
- **HTTP Cache**: 썸네일/원본에 `Cache-Control: max-age=31536000, immutable` (UUID 파일명이라 변경 없음)

### 3. 원본 보기 (라이트박스)
- 클릭 → 먼저 썸네일을 blur 배경으로 표시 → 원본 로드 완료 시 교체 (progressive)
- `Range Request` 지원으로 대용량 이미지/영상도 스트리밍
- 영상: `<video>` 태그 + Range Request (HLS 불필요, 20명 이하)

### 4. 업로드 큐 시스템
- **클라이언트 큐**: 선택한 파일을 순차적으로 하나씩 서버에 전송
- **서버 처리 큐**: 전송 완료된 파일을 FIFO 순서로 하나씩 후처리 (썸네일, EXIF, DB 등록)
- 여러 사용자가 동시 업로드해도 서버 큐에 순차 추가 → CPU 과부하 방지
- 업로드 중 `beforeunload` 경고: "업로드 진행 중입니다. 페이지를 떠나면 남은 파일의 업로드가 중단됩니다."
- 웹 종료 시: 이미 전송 완료된 파일은 서버에서 후처리 계속, 미전송 파일은 자동 소멸
- 불완전 전송 파일: 서버 임시 폴더에서 자동 정리 (30분 후 cleanup)
- 드래그앤드롭 + 클릭 모두 지원
- 각 파일별 진행률 표시

### 5. API 최적화
- 갤러리 목록: 미디어 + 확인/다운로드/좋아요 정보를 **한 번의 쿼리**로 JOIN
- 페이지네이션: cursor 기반 (offset보다 빠름)
- SQLite WAL 모드: 읽기/쓰기 동시 처리

---

## 화면 구성

### 1. 로그인 페이지
- 로고 (땅땅로고.png)
- "땅콩땅콩땅땅콩콩" 타이틀
- 카카오 로그인 버튼 (노란색)
- 네이버 로그인 버튼 (초록색)

### 2. 메인 갤러리
- 상단: 로고 + 서비스명 + 업로드 버튼 + 사용자 메뉴
- 그리드 레이아웃 (반응형: 모바일 2열, 태블릿 3열, 데스크탑 4~5열)
- 각 썸네일 카드:
  - 영상이면 재생 아이콘 오버레이 + 길이 표시
  - 좋아요 수
  - **우측 하단**: 확인/다운로드한 사용자 아이콘 (아바타 뱃지)
    - 👁 아이콘 + "홍길동님이 확인"
    - ⬇ 아이콘 + "김철수님이 다운로드"
    - 여러 명이면 아바타 스택 + "+3" 형태

### 3. 미디어 상세 (라이트박스/모달)
- 사진: 전체화면 뷰, 좌우 스와이프/화살표
- 영상: 비디오 플레이어
- 하단 패널:
  - 업로더 정보 + 업로드 시간
  - 좋아요 버튼 + 카운트
  - 다운로드 버튼
  - 확인/다운로드 한 사람 목록
  - 댓글 목록 + 입력

### 4. 업로드 모달
- 드래그앤드롭 영역
- 파일 선택 버튼
- 업로드 진행률 (각 파일별)

---

## 프로젝트 구조

```
땅콩땅콩땅땅콩콩/
├── docker-compose.yml
├── Dockerfile
├── package.json
├── 땅땅로고.png
├── 땅땅로고.ico
│
├── server/                   # Backend (Fastify)
│   ├── index.ts              # 서버 진입점
│   ├── db.ts                 # SQLite 초기화 + 마이그레이션
│   ├── auth.ts               # OAuth (카카오/네이버) + JWT
│   ├── routes/
│   │   ├── media.ts          # 업로드/목록/삭제
│   │   ├── interaction.ts    # 좋아요/댓글/확인/다운로드
│   │   └── user.ts           # 사용자 정보
│   ├── media-processor.ts    # Sharp + ffmpeg 처리
│   └── upload-queue.ts       # 서버 처리 큐 (FIFO, 하나씩)
│
├── src/                      # Frontend (React + Vite)
│   ├── main.tsx
│   ├── App.tsx
│   ├── pages/
│   │   ├── Login.tsx
│   │   └── Gallery.tsx
│   ├── components/
│   │   ├── MediaGrid.tsx     # 가상 스크롤 그리드
│   │   ├── MediaCard.tsx     # 썸네일 카드 (뱃지 포함)
│   │   ├── Lightbox.tsx      # 상세 보기 모달
│   │   ├── VideoPlayer.tsx
│   │   ├── UploadModal.tsx
│   │   ├── Comments.tsx
│   │   └── UserBadges.tsx    # 확인/다운로드 아바타 뱃지
│   ├── hooks/
│   │   └── useAuth.ts
│   └── api.ts                # API 클라이언트
│
└── data/                     # Docker Volume (실제 NAS 경로 마운트)
    ├── originals/
    ├── thumbnails/
    └── peanut.db
```

---

## OAuth 설정 가이드

### 카카오
1. https://developers.kakao.com → 앱 생성
2. Redirect URI: `https://{your}.synology.me:2230/api/auth/kakao/callback`
3. 동의 항목: 닉네임, 프로필 이미지

### 네이버
1. https://developers.naver.com → 앱 등록
2. Callback URL: `https://{your}.synology.me:2230/api/auth/naver/callback`
3. 필수: 이름, 프로필 이미지

---

## Docker 배포

```yaml
# docker-compose.yml
version: '3.8'
services:
  peanut:
    build: .
    ports:
      - "2230:2230"
    volumes:
      - ./data:/app/data
    environment:
      - KAKAO_CLIENT_ID=xxx
      - KAKAO_CLIENT_SECRET=xxx
      - NAVER_CLIENT_ID=xxx
      - NAVER_CLIENT_SECRET=xxx
      - JWT_SECRET=xxx
      - BASE_URL=https://xxx.synology.me:2230
    restart: always
```

```dockerfile
FROM node:20-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
COPY public/ ./public/
EXPOSE 2230
CMD ["node", "dist/server/index.js"]
```

---

## 구현 순서

1. **프로젝트 초기화**: package.json, TypeScript, Vite, Docker 설정
2. **Backend 기본**: Fastify 서버 + SQLite DB 초기화
3. **OAuth 인증**: 카카오/네이버 로그인 + JWT + master 자동 지정
4. **미디어 업로드**: 파일 업로드 + Sharp 썸네일 + ffmpeg 영상 썸네일
5. **미디어 서빙**: 원본/썸네일 서빙 (Range Request, Cache)
6. **갤러리 UI**: 가상 스크롤 그리드 + 썸네일 카드
7. **라이트박스**: 사진/영상 상세 보기 (progressive loading)
8. **상호작용**: 좋아요/댓글/확인/다운로드 기록 + 뱃지 표시
9. **업로드 UI**: 드래그앤드롭 + 진행률
10. **Docker 빌드 + Synology 배포 테스트**

---

## 확정된 사항

- **삭제 권한**: 올린 사람은 본인 미디어 삭제 가능, master는 모든 미디어 삭제 가능
- **사용자 관리**: master만 가능 (차단/삭제)
- **업로드 제한**: 없음 (NAS 용량 충분)
- **OAuth**: Dashboard 앱 재활용 (콜백 URL만 추가)
  - Kakao: https://developers.kakao.com/console/app/1378312
  - Naver: https://developers.naver.com/apps/#/myapps/KMLT9PlrrxqqFCfD5goB/overview
  - 각 앱에 `https://{synology-ddns}:2230/api/auth/kakao/callback`, `/api/auth/naver/callback` 추가 필요

## 미결 사항

- [ ] Synology DDNS 주소 (배포 시 OAuth 콜백 URL 설정에 필요)
