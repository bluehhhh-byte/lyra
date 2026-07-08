# Lyra 개발 기록

좋아하는 노래의 원문 가사와 한글 번역·해설을 모아 보여주는 개인 음악 컬렉션 블로그.
방문자는 읽기 전용, 곡 관리는 비밀번호로 보호되는 admin에서 수행한다.

## 기술 스택

- **Next.js 15** (App Router) — 프론트 + API 라우트 한 프로젝트
- **React 19**, **Tailwind CSS v4**
- **Vercel** 배포 (GitHub 연동, push 시 자동 재배포)
- **데이터 저장소**: 곡 하나 = markdown 파일 하나 (`songs/*.md`). DB 없음.
- **외부 API**
  - iTunes Search API — 곡 메타데이터·앨범아트·미리듣기·발매연도 (키 불필요)
  - lrclib.net — 가사 자동 로드 (키 불필요)
  - Google Gemini (`gemini-2.5-flash`) — 번역·자동 태그·코멘트·독음 생성

## 데이터 모델 (`songs/*.md`)

```markdown
---
title: Lemon
title_ko: 레몬
artist: 米津玄師
artist_ko: 요네즈 켄시
album: Lemon - Single
year: 2018
artwork: https://…600x600bb.jpg
preview: https://…m4a          # iTunes 30초 미리듣기
lang: ja                       # en | ja | ko
tags: [일본, 2010s, j-pop, 그리움, 애도]
date: 2026-07-07
comment: 곡에 대한 한 줄 감상 (자동 생성, 수정 가능)
---
[Verse 1]
夢ならばどれほどよかったでしょう
+ 유메나라바 도레호도 요캇타데쇼         # 한글 독음 (일본어 곡)
> 꿈이라면 얼마나 좋았을까요             # 한글 번역
// 이 연에 대한 해설 노트                # 분석 노트
```

파싱 규칙 (`lib/songs.js`): `[...]`=섹션 헤더, `+`=윗줄 독음, `>`=윗줄 번역, `//`=연 해설, 빈 줄=연 구분.

## 주요 기능

### 방문자 (공개)
- **홈**: 앨범아트 그리드, 곡·가수·가사 **통합 검색**, **국가·연대·가수별 그룹** 보기.
  검색어·태그·그룹은 URL 쿼리에 미러링돼 새로고침·링크 공유 시 복원된다.
- **태그 페이지** (`/tags`): 사용 빈도에 따라 글자 크기가 커지는 태그 인덱스
- **곡 페이지**: 원문(세리프)·독음·번역 대역 표시, **sticky 툴바**(읽기 모드 토글 + 글자 크기
  3단, localStorage 저장) + 읽기 진행률 바, 앨범아트 히어로, YouTube 링크, 곡 코멘트,
  연 단위 해설 노트 + **연 딥링크·복사**, 가수·앨범·연도 표기(일본 아티스트는 한글 독음 병기),
  **관련 곡 추천**(가수·태그 기반), `←/→` 키로 곡 이동
- **전역 미리듣기 플레이어**: `<audio>`가 레이아웃에 있어 곡을 넘겨도 재생이 끊기지 않는다
- OG 메타태그 — 공유 시 앨범아트 카드. `sitemap.xml`·`robots.txt`·커스텀 404

### 관리자 (`/admin`, 비밀번호 보호)
- **곡 추가**: 언어·검색필드(가수명 기본/제목/전체) 선택 → iTunes 검색(미·한·일 스토어 통합, 관련도 정렬, 더 보기 페이징)
  → 곡 선택 시 lrclib에서 **가사 자동 로드** → Gemini **번역**(일본어는 한글 독음 포함)
  → **자동 생성**: 태그(국가·연대·장르·감성)·한글 제목·아티스트 독음·코멘트
  → 검수·수정 후 저장
- **곡 수정/삭제**: raw markdown 편집, 삭제
- 국가·연대 태그는 Gemini 없이도 항상 부여(결정적), 감성·코멘트·독음은 Gemini 단일 JSON 호출로 생성

## 아키텍처 노트

- **인증** (`middleware.js`): 프로덕션에서 `/admin`·`/api/admin`을 `ADMIN_PASSWORD` 쿠키로 보호.
  로컬 dev는 인증 없이 열림.
- **쓰기 백엔드** (`lib/store.js`): Vercel 서버리스는 파일시스템이 읽기 전용이므로,
  온라인에서 곡 저장/수정/삭제는 **GitHub Contents API 커밋**으로 처리 → 커밋이 재배포를 트리거.
  로컬 dev는 `fs`로 직접 쓰기(즉시 반영). `GITHUB_TOKEN`·`GITHUB_REPO`로 분기.
- **Gemini 호출 통합**: 태그·제목·독음·코멘트를 1회 JSON 호출로 묶어 무료 티어 rate limit 회피.
- **모바일**: 입력창 글씨 16px(모바일)로 iOS 포커스 확대 방지, 핀치 줌은 유지.
- **테마** (`globals.css`): 다크가 기본, `prefers-color-scheme: light`에서 `@theme` CSS 변수만
  덮어쓴다. Tailwind v4 유틸리티가 전부 `var()`를 참조하므로 JS도 `dark:` 클래스도 필요 없다.
  미디어쿼리는 특이성을 더하지 않으므로 `html` 규칙보다 **뒤에** 와야 한다.
  에러 문구의 `red-400`만 라이트에서 대비가 모자라 `dark:` variant로 분기.
  `viewport.colorScheme`로 네이티브 위젯(오디오 컨트롤·스크롤바·입력창)도 따라간다.

## 환경변수 (Vercel)

| 변수 | 용도 | 필수 |
|------|------|------|
| `ADMIN_PASSWORD` | admin 로그인 비밀번호 | ✅ |
| `GITHUB_TOKEN` | 곡 저장용 PAT (lyra 저장소 Contents 읽기·쓰기) | ✅ |
| `GITHUB_REPO` | `owner/repo` (예: `bluehhhh-byte/lyra`) | ✅ |
| `GEMINI_API_KEY` | 번역·태그·코멘트·독음 생성 | 선택 |
| `NEXT_PUBLIC_SITE_URL` | sitemap·OG 절대 URL (미설정 시 Vercel 도메인 자동 사용) | 선택 |

## 개발 히스토리 (요약)

1. 정적 가사 블로그 초기 구현 (홈·곡 페이지·태그 필터, markdown 파일 데이터)
2. 곡 추가 CLI → 브라우저 admin 페이지로 전환
3. 일본어·한국어 곡 지원 (독음 3단 표시, 한국어는 번역 없이 원문)
4. lrclib 가사 자동 로드
5. iTunes 미·한·일 스토어 통합 검색, 관련도 정렬, 더 보기 페이징
6. 곡 수정/삭제, 자동 태그(국가·연대·장르·감성)
7. 온라인 배포 — 인증 미들웨어 + GitHub 커밋 저장 백엔드
8. iTunes 미리듣기 + YouTube 링크, OG 공유 카드
9. 한글 곡 제목·발매연도 표시, 코멘트 자동 생성
10. 국가·연도 태그 보장, 아티스트 한글 독음, Gemini 단일 JSON 호출로 통합
11. 모바일 입력 확대 방지
12. 읽기 모드 토글, 사이트 검색, 정렬 그룹, 관련 곡 추천

## 로컬 실행

```bash
npm install
GEMINI_API_KEY=xxx npm run dev   # http://localhost:3000, admin 인증 없이 열림
```
