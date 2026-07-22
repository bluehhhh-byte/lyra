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
tags: [일본, J-Pop, 2018]      # 국가 · 장르(영문 어휘) · 발매연도
keywords: [꿈, 레몬, 그림자]    # 번역 가사의 핵심 단어 3~5개 (열린 어휘, Gemini 추출)
emotion: 그리움                 # 감정 1개 (닫힌 목록 15종, 통계 일기가 날짜별 집계)
date: 2026-07-07
published: 2026-07-07T22:03:11.000Z  # 기록 시각 (통계·일기의 날짜 기준)
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
- **태그 페이지** (`/tags`): 사용 빈도에 따라 글자 크기가 커지는 태그 인덱스. **곡+영화 통합** —
  연도 태그(2004) 클릭 시 `/tags/[tag]`에서 그해의 음악과 영화·드라마를 한 페이지에서 본다
- **곡 페이지**: 원문(세리프)·독음·번역 대역 표시, **sticky 툴바**(읽기 모드 토글 + 글자 크기
  3단, localStorage 저장) + 읽기 진행률 바, 앨범아트 히어로, YouTube 링크, 곡 코멘트,
  연 단위 해설 노트 + **연 딥링크·복사**, 가수·앨범·연도 표기(일본 아티스트는 한글 독음 병기),
  **가사 키워드 `#`칩**(누르면 그 단어가 나오는 다른 곡을 가사 검색으로), 태그 칩(→ 통합 태그 페이지),
  **관련 곡 추천**(가수·태그 기반), `←/→` 키로 곡 이동
- **통계** (`/stats`): 국가·연대·가수·장르·태그 분포, 기록 월·시간대, 영화 별점 분포,
  **감정 변화 시계열**(날짜별 감정을 밝음↔어두움 valence로 그린 SVG 곡선)
- **키워드 일기** (`/diary`): 기록 날짜별 상세 — 그날의 지배 감정·부가 감정·가사 키워드·기록한 곡 목록
- **전역 미리듣기 플레이어**: `<audio>`가 레이아웃에 있어 곡을 넘겨도 재생이 끊기지 않는다
- **가사 카드 공유**: 구절을 1080×1350 이미지 카드로(앨범 추출색 배경), 인스타/저장용
- OG 메타태그 — 공유 시 앨범아트 카드. `sitemap.xml`·`robots.txt`·커스텀 404
- **인터랙션 레이어** (`globals.css` 하단, 라이브러리 0개): 카드 순차 등장·호버 리프트·포인터
  스포트라이트, 가사 연 스크롤 리빌, 히어로 앰비언트 드리프트, 테마 원형 리빌. `prefers-reduced-motion` 존중

### 관리자 (`/admin`, 비밀번호 보호)
- **곡 추가**: 언어·검색필드(가수명 기본/제목/전체) 선택 → iTunes 검색(미·한·일 스토어 통합, 19금·숨은 곡
  자동 병합, 관련도 정렬, 더 보기 페이징) → 곡 선택 시 lrclib에서 **가사 자동 로드** → Gemini
  **번역**(일본어는 한글 독음 포함, 영어 가사 줄 첫 글자 자동 대문자화) → **자동 생성**: 태그(국가·연대·장르)·
  한글 제목·아티스트 독음·코멘트·**키워드·감정** → 검수·수정 후 저장
- **곡 수정/삭제**: raw markdown 편집, 삭제
- **가사 품질 재검사** (`/admin`): 부분 전사를 lrclib의 더 온전한 전사로 **자동 교체** + 번역 재생성.
  손으로 쓴 연 해설은 원문 줄 기준으로 이관(`carryNotes`), 쓰기는 맨 마지막이라 Gemini 실패 시 원본 무손상
- **일괄 도구**: 전체 메타 AI 재생성(태그·코멘트·독음 덮어씀), **키워드·감정 일괄 추출**(keywords/emotion만
  채움, 코멘트·태그 보존 — 기존 곡 소급용)
- 국가·연대 태그는 Gemini 없이도 항상 부여(결정적), 나머지는 Gemini 단일 JSON 호출로 생성

## 아키텍처 노트

- **인증** (`middleware.js`): 프로덕션에서 `/admin`·`/api/admin`을 `ADMIN_PASSWORD` 쿠키로 보호.
  로컬 dev는 인증 없이 열림.
- **쓰기 백엔드** (`lib/store.js`): Vercel 서버리스는 파일시스템이 읽기 전용이므로,
  온라인에서 곡 저장/수정/삭제는 **GitHub Contents API 커밋**으로 처리 → 커밋이 재배포를 트리거.
  로컬 dev는 `fs`로 직접 쓰기(즉시 반영). `GITHUB_TOKEN`·`GITHUB_REPO`로 분기.
- **Gemini 호출 통합**: 태그·제목·독음·코멘트·키워드·감정을 1회 JSON 호출로 묶어 무료 티어 rate limit 회피.
  일괄 작업은 곡당 ~4s 간격(순차)으로 분당 한도(RPM) 회피, 일일 한도 소진 시엔 다음날.
- **Gemini 모델**: `GEMINI_MODEL` 환경변수, 기본 `gemini-flash-latest` **별칭**. 버전을 하드코딩하면
  API 키 재발급 시 죽는다("no longer available to new users") — 별칭이 현재 flash를 따라간다.
- **키워드·감정 신뢰 경계** (`lib/keywords.js`): Gemini가 값을 정하므로 파서가 방어선. `emotion`은
  닫힌 목록(15종) 밖이면 버리고, `keywords`는 문장급·따옴표 포함 항목을 버린다(프론트매터 안전).
  틀린 값보다 없는 값이 낫고 모든 표시부가 없어도 조용히 넘어간다.
- **감정 valence** (`lib/keywords.js`): 감정은 순서 없는 라벨이라 시계열 y축이 없다 — 밝음↔어두움(-3~+3)
  주관적 매핑으로 축을 준다. 시계열 점 색도 이 값을 따른다. 매핑만 바꾸면 재조정.
- **모바일**: 입력창 글씨 16px(모바일)로 iOS 포커스 확대 방지, 핀치 줌은 유지.
- **테마** (`globals.css`): 다크가 기본. `@theme` CSS 변수만 덮어써서 전환한다 —
  Tailwind v4 유틸리티가 전부 `var()`를 참조하므로 `dark:` 클래스가 필요 없다.
  - 시스템 추종: `@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) }`
  - 사용자 고정: `:root[data-theme="light"]` (헤더 토글 → `localStorage.lyra_theme`)
  - 두 셀렉터 모두 `(0,2,0)`이라 `html` 규칙 `(0,0,1)`을 순서와 무관하게 이긴다.
  - `layout.js`의 인라인 blocking 스크립트가 first paint 전에 `data-theme`를 찍어
    플래시를 막는다. **`THEME_KEY`는 `lib/theme.js`(평범한 모듈)에 있어야 한다.**
    `"use client"` 모듈의 non-component export는 서버에서 `undefined`가 된다
    (`lib/theme.test.mjs`가 이걸 지킨다).
  - 에러 문구의 `red-400`만 라이트에서 대비가 모자라 `dark:` variant로 분기.
  - `viewport.colorScheme` + 고정 시 `style.colorScheme`으로 네이티브 위젯
    (오디오 컨트롤·스크롤바·입력창)도 따라간다.

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
13. 인터랙션 레이어 (`globals.css` 하단) — 라이브러리 없이 CSS 중심:
    그리드 카드 순차 등장·호버 리프트·포인터 스포트라이트(위임 핸들러 1개),
    가사 연 스크롤 리빌(`animation-timeline: view()`, 미지원 브라우저는 정적),
    가사 줄 호버 하이라이트(hover 기기 한정), 히어로 앨범아트 앰비언트 드리프트,
    테마 전환 원형 리빌(View Transitions API, 미지원 시 즉시 전환).
    전부 `prefers-reduced-motion` 존중.
14. 영어 가사 줄 첫 글자 자동 대문자화 (`lib/songs.js`, 합자·길이변화 글자는 제외)
15. 가사 품질 재검사 자동 교체 — 더 온전한 lrclib 전사로 교체 + 번역 재생성, 연 해설 이관
16. 가사 키워드 + 감정 추출 (`lib/keywords.js`) — 곡 페이지 `#`칩, 소급 도구
17. 키워드 일기(`/diary`) + 통계 감정 시계열, 곡+영화 통합 태그 페이지(`/tags/[tag]`)
18. 영화 장르 영어화(TMDB ko-KR 한국어 장르명 → 영문 어휘)

### 시도했다가 되돌린 것
- **리디자인 4연속 기각**: 리스닝 룸(앰비언트+캐러셀)·성도(별자리 canvas)·노선도(SVG 지하철)·
  가사집 서가(3D 책등). 전부 구현→기각→revert. 표현 계층만 교체하는 안이었다.
- **감정 차원(mood, 5단계 강도+감정명)**: 배포까지 갔다 기각·revert. 이후 단일 라벨 `emotion`으로
  재설계돼 키워드 기능에 통합됨.

## 주요 파일 지도

| 경로 | 역할 |
|------|------|
| `lib/songs.js` | 곡 markdown 파싱, 영어 가사 대문자화 |
| `lib/movies.js` | 영화 markdown 파싱 (곡과 같은 프론트매터, 본문은 줄거리 산문) |
| `lib/genre.js` / `lib/keywords.js` | 장르 / 키워드·감정 어휘·검증·감정 valence |
| `lib/diary.js` | 날짜별 감정·키워드 집계 (통계·일기 공용) |
| `lib/store.js` / `lib/tmdb.js` | GitHub·fs 쓰기 백엔드 / TMDB 래퍼(장르 영문화) |
| `app/api/admin/route.js` | 모든 admin 액션(검색·번역·저장·재검사·소급)의 서버 로직 |
| `app/diary/` `app/emotion-timeline.js` | 키워드 일기 페이지 / 감정 시계열 SVG |
| `app/tags/[tag]/` | 곡+영화 통합 태그 페이지 |
| `lib/*.test.mjs` | 프레임워크 없는 assert 테스트 (`node lib/xxx.test.mjs`) |

## 로컬 실행

```bash
npm install
GEMINI_API_KEY=xxx npm run dev   # http://localhost:3000, admin 인증 없이 열림
node lib/keywords.test.mjs        # 개별 테스트 (프레임워크 없음)
```
