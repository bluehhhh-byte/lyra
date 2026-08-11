# Lyra — 가사 · 번역 · 영화 기록

좋아하는 노래의 원문 가사와 한글 번역·해설, 그리고 본 영화의 별점·감상을 모아두는
개인 블로그. 음악은 Lyra, 영화 섹션은 Syno. 라는 이름을 쓴다.

자세한 구조·기능·아키텍처는 [DEVELOPMENT.md](DEVELOPMENT.md) 참고.

## 실행

```bash
pnpm install
pnpm dev        # http://localhost:3000 — 로컬은 admin 인증 없이 열림
pnpm check      # 테스트 + 데이터 lint + 빌드 + smoke (push 전 게이트, CI와 동일)
```

## 곡 추가 (admin)

```bash
GEMINI_API_KEY=xxx pnpm dev
# → http://localhost:3000/admin
```

1. 언어 선택 후 곡 검색 (iTunes 미·한·일 스토어 통합, 앨범아트 자동)
2. 곡 선택 → 가사 자동 로드 (lrclib.net, 못 찾으면 수동 붙여넣기) → Gemini 번역
   (일본어는 한글 독음 포함)
3. 번역 검수·수정, `// 해설` 노트 추가 → 태그·코멘트·키워드·감정 자동 생성 → 저장

CLI 버전: `pnpm add -- "곡명 아티스트"` (영어 전용).
영화는 admin의 영화 관리에서 TMDB 검색으로 등록하고, 왓챠피디아 별점은
북마클릿([scripts/watcha-bookmarklet.md](scripts/watcha-bookmarklet.md))으로 가져온다.

## 곡 파일 형식 (`songs/*.md`)

```markdown
---
title: Yesterday
artist: The Beatles
album: Help!
artwork: https://...600x600bb.jpg
lang: en                # en | ja | ko
tags: [영미, Rock, 1965]
keywords: [어제, 근심]
emotion: 그리움
date: 2026-07-06
comment: 곡에 대한 한 줄 감상.
---
[Verse 1]
Yesterday, all my troubles seemed so far away
> 어제만 해도, 모든 근심이 저 멀리 있는 것 같았는데
```

- `[...]` = 섹션 헤더, `>` = 바로 윗줄의 번역, 빈 줄 = 연 구분
- `+ 독음` = 바로 윗줄의 한글 발음 (일본어 곡), `// 텍스트` = 해당 연의 분석 노트
- `youtube:`(검색어) / `youtube_id:`(영상 ID)로 유튜브 영상을 수동 고정 가능

## 배포 (Vercel)

GitHub 저장소를 Vercel에 연결하면 push마다 자동 배포. GitHub Actions가
push/PR마다 `pnpm check`를 돌린다.

**환경변수 (Vercel Project Settings → Environment Variables):**

| 변수 | 용도 |
|------|------|
| `ADMIN_PASSWORD` | 온라인 admin 로그인 비밀번호 (필수, 없으면 admin 잠김) |
| `GITHUB_TOKEN` | 곡·영화 저장용. 이 저장소 Contents 읽기·쓰기 권한 PAT (필수) |
| `GITHUB_REPO` | `owner/repo` 예: `bluehhhh-byte/lyra` (필수) |
| `GEMINI_API_KEY` | 번역·자동태그·코멘트·취향 리포트·추천 (선택, 없으면 해당 기능만 비활성) |
| `GEMINI_MODEL` | 품질용 모델 (기본 `gemini-flash-latest`) |
| `GEMINI_MODEL_LITE` | 분류·일괄용 모델 (기본 `gemini-flash-lite-latest`) |
| `TMDB_API_KEY` | 영화 검색·상세·왓챠 임포트 (영화 기능에 필수) |
| `NEXT_PUBLIC_SITE_URL` | sitemap·OG 절대 URL (선택, 미설정 시 Vercel 도메인 자동 사용) |

**온라인 admin 동작:**
- 프로덕션에서 `/admin`·`/api/admin`은 비밀번호 로그인으로 보호된다
  (쿠키에는 HMAC 서명된 30일 만료 토큰 — 비밀번호 원문은 담지 않는다).
  로컬 dev는 인증 없이 열림.
- 온라인에서 곡·영화 추가/수정/삭제 → GitHub에 커밋 → Vercel 자동 재배포(약 1분) 후 반영.
- 서버리스 파일시스템은 읽기 전용이라 저장은 GitHub API 커밋으로 처리 (`lib/store.js`).
