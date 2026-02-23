# Synology DS920+ 배포 가이드

## 1. 사전 준비

### Synology에서 Docker 설치
- 패키지 센터 → Docker (Container Manager) 설치

### SSH 접속
```bash
ssh admin@{NAS_IP}
```

### 프로젝트 올리기
```bash
# 로컬에서 NAS로 전송 (ssh 경로)
scp -r ./땅콩땅콩땅땅콩콩 admin@{NAS_IP}:/volume1/docker/peanut
```

또는 git을 사용:
```bash
# NAS에서
cd /volume1/docker
git clone {repo_url} peanut
```

---

## 2. 환경변수 설정

```bash
cd /volume1/docker/peanut
cp .env.example .env
```

`.env` 파일 수정:
```
KAKAO_CLIENT_ID=실제_클라이언트_ID
KAKAO_CLIENT_SECRET=실제_시크릿
NAVER_CLIENT_ID=실제_클라이언트_ID
NAVER_CLIENT_SECRET=실제_시크릿
JWT_SECRET=랜덤문자열_최소32자
BASE_URL=https://your.synology.me:2230
```

JWT_SECRET 생성:
```bash
openssl rand -hex 32
```

---

## 3. OAuth 콜백 URL 등록

### 카카오
1. https://developers.kakao.com/console/app/1378312
2. 카카오 로그인 → Redirect URI 추가:
   `https://{your}.synology.me:2230/api/auth/kakao/callback`

### 네이버
1. https://developers.naver.com/apps/#/myapps/KMLT9PlrrxqqFCfD5goB/overview
2. API 설정 → Callback URL 추가:
   `https://{your}.synology.me:2230/api/auth/naver/callback`

---

## 4. Docker 빌드 & 실행

```bash
cd /volume1/docker/peanut

# 빌드 & 실행 (백그라운드)
docker compose up -d --build

# 로그 확인
docker compose logs -f

# 재시작
docker compose restart

# 중지
docker compose down
```

---

## 5. Synology 포트포워딩

### 방법 A: Synology 제어판
1. 제어판 → 외부 액세스 → 라우터 구성
2. 포트 2230 (TCP) 추가

### 방법 B: 공유기에서 직접
1. 공유기 관리자 페이지 접속
2. 포트포워딩 추가:
   - 외부 포트: 2230
   - 내부 IP: NAS의 내부 IP (ex: 192.168.0.x)
   - 내부 포트: 2230
   - 프로토콜: TCP

---

## 6. DDNS 설정

### Synology DDNS (이미 설정돼 있을 수 있음)
1. 제어판 → 외부 액세스 → DDNS
2. Synology 제공 DDNS 사용 또는 기존 주소 확인

확인 후 `.env`의 `BASE_URL` 업데이트.

---

## 7. HTTPS 인증서 (선택)

Let's Encrypt를 사용하면 무료 HTTPS:
1. 제어판 → 보안 → 인증서
2. 추가 → Let's Encrypt 인증서
3. 도메인: your.synology.me

---

## 8. 업데이트 방법

코드 수정 후:
```bash
cd /volume1/docker/peanut
git pull   # 또는 파일 다시 전송
docker compose up -d --build
```

---

## 9. 데이터 백업

`data/` 디렉토리만 백업하면 모든 데이터 보존:
```bash
# 백업
tar czf peanut-backup-$(date +%Y%m%d).tar.gz data/

# 복원
tar xzf peanut-backup-YYYYMMDD.tar.gz
```

---

## 10. 트러블슈팅

| 증상 | 확인 |
|------|------|
| 접속 안 됨 | 포트포워딩 확인, 방화벽 2230 열기 |
| OAuth 실패 | `.env` 키 확인, 콜백 URL 확인 |
| 이미지 안 보임 | `data/thumbnails/` 파일 있는지 확인 |
| 영상 썸네일 없음 | `docker exec peanut ffmpeg -version` 확인 |
| DB 오류 | `data/peanut.db` 권한 확인 (`chmod 666`) |
