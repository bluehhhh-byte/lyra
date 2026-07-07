# Lyra — 가사 · 번역 컬렉션

좋아하는 노래의 영어 가사와 한글 번역을 나란히 모아두는 개인 블로그.

## 실행

```bash
npm install
npm run dev   # http://localhost:3000
```

## 곡 추가 (admin 페이지, dev 전용)

```bash
GEMINI_API_KEY=xxx npm run dev
# → http://localhost:3000/admin
```

1. 언어(영어/일본어) 선택 후 곡 검색 (iTunes 메타데이터 + 앨범아트 자동)
2. 곡 선택하면 가사 전문 자동 로드 (lrclib.net, 못 찾으면 수동 붙여넣기) → Gemini 번역 생성 (일본어는 한글 독음 포함)
3. 번역 검수·수정, `// 해설` 노트 추가, 태그/코멘트 입력 → 저장

admin 페이지와 API는 프로덕션 빌드에서 404. 배포본은 읽기 전용.
CLI 버전도 있음: `npm run add -- "곡명 아티스트"` (영어 전용).

## 곡 파일 형식 (`songs/*.md`)

```markdown
---
title: Yesterday
artist: The Beatles
album: Help!
artwork: https://...600x600bb.jpg
tags: [classic, 잔잔한]
date: 2026-07-06
comment: 곡에 대한 한 줄 감상.
---
[Verse 1]
Yesterday, all my troubles seemed so far away
> 어제만 해도, 모든 근심이 저 멀리 있는 것 같았는데
```

- `[...]` = 섹션 헤더, `>` = 바로 윗줄의 번역, 빈 줄 = 연 구분
- `+ 독음` = 바로 윗줄의 한글 발음 (일본어 곡), `// 텍스트` = 해당 연의 분석 노트
- 일본어 곡은 frontmatter에 `lang: ja`

## 배포 (Vercel)

GitHub 저장소를 Vercel에 연결하면 push마다 자동 배포.

**환경변수 (Vercel Project Settings → Environment Variables):**

| 변수 | 용도 |
|------|------|
| `ADMIN_PASSWORD` | 온라인 admin 로그인 비밀번호 (필수, 없으면 admin 잠김) |
| `GITHUB_TOKEN` | 곡 저장용. lyra 저장소 Contents 읽기·쓰기 권한 PAT (필수) |
| `GITHUB_REPO` | `owner/repo` 예: `bluehhhh-byte/lyra` (필수) |
| `GEMINI_API_KEY` | 번역·자동태그 (선택, 없으면 해당 기능만 비활성) |

**온라인 admin 동작:**
- `/admin` 접근 시 비밀번호 로그인. 로컬 dev(`npm run dev`)는 인증 없이 열림.
- 온라인에서 곡 추가/수정/삭제 → GitHub에 커밋 → Vercel 자동 재배포(약 1분) 후 반영.
- 서버리스 파일시스템은 읽기 전용이라 저장은 GitHub API 커밋으로 처리 (`lib/store.js`).
