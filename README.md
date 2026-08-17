# Lyra — 가사 · 번역 · 영화 기록

좋아하는 노래의 원문 가사와 한글 번역·해설, 그리고 본 영화의 별점·감상을 모아두는
개인 블로그. 음악은 Lyra, 영화 섹션은 Syno. 라는 이름을 쓴다.

프로젝트의 정체성·현재 현황·운영 원칙은 [PROJECT.md](PROJECT.md),
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

## 곡 원문 형식

Neon 전환 후에도 기존 마크다운 형식을 그대로 `lyra_contents.raw`에 보관한다.
`songs/*.md`와 `movies/*.md`는 최초 이전 자료이자 로컬 파일 모드의 원본이다.

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

## 콘텐츠 저장소와 배포 (Vercel)

운영 콘텐츠는 Neon Postgres에 저장한다. 곡·영화 추가·수정·삭제는 DB 저장 후
Next.js 캐시를 무효화하므로 재배포 없이 반영된다. GitHub와 Vercel 배포는 코드가
변경될 때만 사용한다.

**환경변수 (Vercel Project Settings → Environment Variables):**

| 변수 | 용도 |
|------|------|
| `ADMIN_PASSWORD` | 온라인 admin 로그인 비밀번호 (필수, 없으면 admin 잠김) |
| `DATABASE_URL` | Neon Free 프로젝트의 pooled 연결 문자열 |
| `LYRA_CONTENT_STORE` | `neon`으로 설정하면 운영 콘텐츠를 DB에서 읽고 쓴다 |
| `GITHUB_TOKEN` | 모바일 코드 배포용 GitHub 읽기 토큰. 파일 저장 fallback에서도 사용 |
| `GITHUB_REPO` | 파일 저장 fallback 저장소 (`owner/repo`) |
| `GEMINI_API_KEY` | 번역·자동태그·코멘트·취향 리포트·추천 (선택, 없으면 해당 기능만 비활성) |
| `GEMINI_MODEL` | 품질용 모델 (기본 `gemini-flash-latest`) |
| `GEMINI_MODEL_LITE` | 분류·일괄용 모델 (기본 `gemini-flash-lite-latest`) |
| `TMDB_API_KEY` | 영화 검색·상세·왓챠 임포트 (영화 기능에 필수) |
| `NEXT_PUBLIC_SITE_URL` | sitemap·OG 절대 URL (선택, 미설정 시 Vercel 도메인 자동 사용) |

**온라인 admin 동작:**
- 프로덕션에서 `/admin`·`/api/admin`은 비밀번호 로그인으로 보호된다
  (쿠키에는 HMAC 서명된 30일 만료 토큰 — 비밀번호 원문은 담지 않는다).
  로컬 dev는 인증 없이 열림.
- Neon 모드에서 곡·영화 추가/수정/삭제 → DB 저장 → 관련 캐시 무효화 → 즉시 반영.
- admin 배포 버튼은 코드 변경을 GitHub `main`에서 가져와 배포할 때만 사용한다.
- `LYRA_CONTENT_STORE`가 없으면 종전 GitHub 파일 저장 방식으로 동작하므로 전환 전 배포도 안전하다.

### Neon Free 최초 이전 (카드·자동 과금 없음)

Vercel Marketplace는 결제 수단과 연결될 수 있으므로 사용하지 않는다. Neon에서 직접
Free 프로젝트를 만들면 무료 한도 초과 시 자동 과금되지 않는다.

1. Neon에서 카드 없이 Free 프로젝트를 만들고 pooled 연결 문자열을 복사한다.
2. 로컬 `.env.local`에 `DATABASE_URL=...`를 넣는다. 아직 `LYRA_CONTENT_STORE`는 넣지 않는다.
3. `pnpm db:migrate`를 실행한다. 테이블 생성, 곡·영화·JSON 업로드와 SHA-256 검증을 한 번에 수행한다.
4. `pnpm db:verify`로 파일과 DB가 완전히 같은지 다시 확인한다.
5. 검증 성공 후 Vercel Production 환경에 `DATABASE_URL`과 `LYRA_CONTENT_STORE=neon`을 추가하고 한 번 배포한다.
6. admin 상단에 “저장 즉시 반영” 안내가 보이는지 확인한 뒤 시험 항목 하나를 저장한다.

전환 전에는 `LYRA_CONTENT_STORE`를 설정하지 않는다. 명시적인 opt-in이라 `DATABASE_URL`만
주입된 상태에서는 기존 파일/GitHub 경로가 계속 사용된다. 문제가 생기면 환경변수를 제거하고
이전 빌드를 다시 배포할 수 있으며, Neon 데이터는 삭제되지 않는다.
