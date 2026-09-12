# Lyra 개발 기록

좋아하는 노래의 원문 가사와 한글 번역·해설을 모아 보여주는 개인 음악 컬렉션 블로그.
방문자는 읽기 전용, 곡 관리는 비밀번호로 보호되는 admin에서 수행한다.

## 기술 스택

- **Next.js 15** (App Router) — 프론트 + API 라우트 한 프로젝트
- **React 19**, **Tailwind CSS v4**
- **Vercel** 배포 (코드 변경은 관리자 배포 버튼으로 GitHub `main`을 빌드)
- **데이터 저장소**: 운영은 Neon PostgreSQL, Markdown·JSON은 이관 원본과 로컬 폴백.
- **외부 API**
  - iTunes Search API — 곡 메타데이터·앨범아트·미리듣기·발매연도 (키 불필요)
  - lrclib.net — 가사 자동 로드 (키 불필요)
  - Google Gemini (`gemini-flash-latest` 별칭, `GEMINI_MODEL`로 변경) — 번역·자동 태그·코멘트·독음·취향 리포트·추천 생성
  - TMDB — 영화·드라마 검색·상세·장르 영문화 (`TMDB_API_KEY`)

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
youtube: 검색어 override        # (선택) 유튜브 자동 검색이 엉뚱한 영상을 잡을 때
youtube_id: dQw4w9WgXcQ         # (선택) 영상 ID 직접 지정 — 검색 자체를 건너뜀
---
[Verse 1]
夢ならばどれほどよかったでしょう
+ 유메나라바 도레호도 요캇타데쇼         # 한글 독음 (일본어 곡)
> 꿈이라면 얼마나 좋았을까요             # 한글 번역
// 이 연에 대한 해설 노트                # 분석 노트
```

파싱 규칙 (`lib/songs.js`): `[...]`=섹션 헤더, `+`=윗줄 독음, `>`=윗줄 번역, `//`=연 해설, 빈 줄=연 구분.

원문 여러 줄을 한 문장으로 옮긴 번역은 `>^N`으로 범위를 밝힌다 — `>^2`는 위 두 줄에
대한 하나의 번역이다. 덮인 줄은 번역 누락으로 세지 않으며(린트), 범위가 연을 넘으면
린트 오류다. 기존 `>`는 `>^1`과 같다. 예전 게시글에서 승격은 `node scripts/merge-translation-spans.mjs`.

## 소량 작업과 대량 작업

AI를 쓰는 자리를 둘로 나눈다. Gemini는 무료 티어라 호출 수가 적어 768곡을 훑을 수 없다.

| | 소량 (Gemini) | 대량 (Claude·ChatGPT) |
|---|---|---|
| 언제 | 새 곡·영화를 하나 추가할 때 | 전 곡 대상 작업 |
| 무엇 | 가사 번역, 독음, 코멘트, 태그 — 곡 하나 분량 | 키워드·감정, 코멘트, 한글 제목, 장르·연도, 취향 리포트, 모티프 |
| 어디서 | `/admin` 곡 추가·누락 항목 보정(한 곡씩) | `/admin` **대량 작업** 패널 |

파이프라인은 네 단계다. 각 단계의 산출물이 다음 단계의 입력이다.

```
1. 진단   node scripts/needs-work.mjs        → data/needs-work.json   (코드)
2. 선별   /admin 대량 작업 → 우선순위 고르기  → 목록 부분집합         (Gemini, 요약만)
3. 생성   Claude·ChatGPT에 배치(곡 30·영화 20)를 넘겨 채운다          (Claude)
4. 검증   node scripts/validate-bulk.mjs --write → data/validation-report.json (코드)
```

Gemini에는 **원문을 주지 않는다.** 2단계에서 넘기는 건 제목·아티스트·부족 항목뿐이고,
답으로 받는 것도 번호 목록이다 — 무료 티어 호출 한 번 분량이다.

검증 단계가 지키는 것: 감정·장르·국가는 닫힌 어휘, 연도는 4자리, 커버는 https,
코멘트는 ~다체, 키워드는 3~8개(중복 제거). **id·title·artist는 모델이 보내와도 무시하고
기록만 한다** — 대량 작업에서 제목이 바뀌면 어느 곡이 어떻게 바뀌었는지 알 수 없다.
기존 값은 덮지 않는다(`--overwrite`를 줄 때만).

화면에서 하는 대량 작업 흐름은 이렇다.

1. `/admin` → **대량 작업** → 항목을 고르고 "부족한 곡 세기" — 외부 API를 부르지 않고
   `lib/admin/needs.js` 기준으로 무엇이 비었는지만 센다.
2. "작업 꾸러미 내려받기"로 목록(JSON)을 받아 Claude·ChatGPT에 넘긴다.
3. 채워 온 JSON을 "검증하고 반영"에 붙여넣는다. 서버가 닫힌 어휘(감정·장르·국가),
   4자리 연도, https 커버, 코멘트 문체(~다체)를 검사하고 통과한 것만 쓴다.
   거부된 항목은 이유와 함께 화면에 남는다.

**무엇이 부족한지는 `lib/admin/needs.js` 한 곳에서만 판정한다.** 예전에는 관리자 형식검사가
자체 규칙을 갖고 있어, 파서를 고쳐 이미 해결된 것(병합 번역 `>^N`, 🗨 해설 줄, 외국곡 속
한국어 가사)까지 "번역 없음"으로 세어 214곡을 고치라고 했다. 규칙을 바꿀 일이 생기면 그 파일만 고친다.

## 가사 정확성 감사

무손실 검증(`pnpm verify:instagram`)은 **"인스타에 적힌 그대로냐"**만 본다. 캡션에
처음부터 있던 오타·잘못 들은 단어·다른 버전 가사는 잡히지 않는다. 그걸 고치려면:

1. `/admin` → **가사 정확성 검토**에서 곡을 연다 (위험도순: 댓글 복원 → 병합 번역
   → 긴 캡션 → Claude 영어 번역 → 일본어).
2. 오른쪽에 공식 가사·앨범 북클릿·공식 영상 자막을 붙여넣고 줄 단위로 비교한다.
   한 사이트만 보고 바꾸지 않는다 — 반복 후렴·버전 차이로 지금 가사가 맞을 수 있다.
3. 왼쪽을 고치고 분류·사유·근거 URL을 적어 저장한다.

`source_hash`는 **절대 갱신하지 않는다.** 인스타 원본을 계속 가리켜야 원본이 무엇이었는지
남는다. 달라진 줄은 `data/lyrics-corrections.json`에 정규화 해시로 기록되고,
검증기는 그 이력이 있는 교체·삭제만 차이로 허용한다. 근거 없는 원문 변경은 오류다.

기계가 잡을 수 있는 신호는 `node scripts/audit-lyrics.mjs` — 캡션 혼입(해시태그·연도),
3회 이상 연속 중복, 같은 원문에 다른 번역, 번역=원문, 번역 길이 이상(방향별 기준),
일본어 인식 실패. 여기 나온 건 의심 목록이지 오류 확정이 아니다.

## 주요 기능

### 방문자 (공개)
- **홈**: 컬렉션 초상, 음악·영화 통합 최근 기록, 최근 취향 변화, 오래된 기록 재발견 뒤에
  앨범아트 그리드와 곡·가수·가사 **통합 검색**, **국가·연대·가수별 그룹** 보기.
  검색어·태그·그룹은 URL 쿼리에 미러링돼 새로고침·링크 공유 시 복원된다.
- **태그 페이지** (`/tags`): 사용 빈도에 따라 글자 크기가 커지는 태그 인덱스. **곡+영화 통합** —
  연도 태그(2004) 클릭 시 `/tags/[tag]`에서 그해의 음악과 영화·드라마를 한 페이지에서 본다
- **곡 페이지**: 원문(세리프)·독음·번역 대역 표시, **sticky 툴바**(읽기 모드 토글 + 글자 크기
  3단, localStorage 저장) + 읽기 진행률 바, 앨범아트 히어로, YouTube 링크, 곡 코멘트,
  연 단위 해설 노트 + **연 딥링크·복사**, 가수·앨범·연도 표기(일본 아티스트는 한글 독음 병기),
  **가사 키워드 `#`칩**(누르면 그 단어가 나오는 다른 곡을 가사 검색으로), 태그 칩(→ 통합 태그 페이지),
  **관련 곡 추천**(가수·태그 기반), `←/→` 키로 곡 이동
- **영화 탐색** (`/movies`): 감상평 있는 큐레이션 영화(`movies/*.md`). 제목·감독·배우·줄거리
  검색, 영화/드라마·국가·장르·최소 별점 필터, 기록일·개봉연도·별점·제목 정렬과 랜덤 보기.
  조건은 URL에 저장된다
- **평가한 영화** (`/watched`): 왓챠피디아에서 가져온 별점 영화 ~1,000편(`data/watcha-movies.json`).
  별점 분포 막대(클릭 시 그 별점만 필터), 포스터 그리드(클릭 → TMDB)
- **취향 분석** (`/watched/taste`): 국가·장르·감독·배우·연대·상영시간별 관람 편수와 평균 별점,
  편애/기피, **AI 리포트**(Gemini 취향 분석), **감정 변화 시계열**. 감독·배우는 인물 페이지로 링크
- **음악 취향** (`/songs/taste`): 모아온 곡의 해석 — 장르·감정(밝음↔어두움 기울기)·
  시대·권역·아티스트 편향(반복 vs 한 곡 발견형)·가사 키워드 칩(→ 가사 검색).
  상단의 **취향을 만든 기록**은 대표 감정·장르·시대가 겹치는 실제 곡과 가사로 분석 근거를 보여준다.
  별점이 없으므로 표현은 '많이 담은'. 해석 문단은 집계에서 결정적으로 생성(Gemini 불필요).
  admin '취향 리포트 생성' 버튼은 Gemini 3~4문단 교차 해석을 data/music-report.json에
  저장 — 페이지 상단 표시 + 추천 곡 생성 프롬프트에도 주입돼 추천 방향을 잡는다.
  /stats는 숫자·기록, 이 페이지는 해석 담당
- **가사 모티프** (`/songs/motifs`): 곡 요약(키워드·감정·대표 구절)을 Gemini 1회로
  묶은 이미지·주제 클러스터. slug·구절은 실제 가사와 대조 검증, 곡당 최대 3개 모티프.
  admin '모티프 생성' 버튼 → data/motifs.json
- **Lyra×Cyno 교차**: 영화 상세에 '이 시대의 음악'(같은 연대 컬렉션 곡, 같은 권역 우선),
  곡 상세에 '이 시대의 영화'. 결산에는 '이번 기간의 변화'(대표 감정 이동·처음 등장한
  가수·기록의 흐름 링크)
- **추천 곡** (`/recommendations/music`) / **추천 영화** (`/recommendations`): 취향 기반
  Gemini 추천이 쌓인다 — 곡은 iTunes 매칭 + 카드 ▶로 30초 미리듣기, 영화는 TMDB 링크.
  이미 담은 곡·본 영화는 제외. 페이지가 길어 메뉴를 둘로 분리
- **문화 아카이브** (`/archive`): 같은 날 기록한 음악·영화를 월별 타임라인과 날짜 상세로 통합
  월 상단의 `그때의 나`는 음악 감정과 큐레이션 영화의 검수 주제를 함께 요약하며, 주제를 누르면 근거 영화만 남긴다
- **통합 검색**: 헤더에서 음악·가사·영화·평가한 영화·감독·배우를 한 번에 검색
- **문화 결산** (`/recap`): 월간·연간 기록량·감정·키워드·가수·최고 별점 작품과 공유 카드
- **인물 페이지** (`/people`): `.md` 영화 + 왓챠 데이터셋을 합쳐 감독·출연진을 역색인.
  참여 작품(내부 상세 or TMDB 링크)과 평균 별점 표시
- **통계** (`/stats`): 국가·연대·가수·장르·태그 분포, 기록 월·시간대,
  영화·드라마 비율·월별 감상·개봉 연대·국가·장르·감독·별점·러닝타임,
  **감정 변화 시계열**(날짜별 감정을 밝음↔어두움 valence로 그린 SVG 곡선)
- **감정으로 보는 아카이브** (`/diary`): 월 이동·월간 요약·감정 달력·선택 날짜 상세·접힌 월간 기록.
  `month`·`day` URL 쿼리로 선택 상태가 유지되며 그날의 감정·가사 키워드·곡 목록을 본다
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
  채움, 코멘트·태그 보존 — 기존 곡 소급용). 전 곡 대상 작업은 Gemini 대신 **대량 작업** 패널을 쓴다
  (위 '소량 작업과 대량 작업' 참고)
- 국가·연대 태그는 Gemini 없이도 항상 부여(결정적), 나머지는 Gemini 단일 JSON 호출로 생성

## 아키텍처 노트

- **인증** (`middleware.js` + `lib/auth-token.js`): 프로덕션에서 `/admin`·`/api/admin` 보호.
  쿠키에는 비밀번호 원문이 아니라 HMAC 서명된 30일 만료 토큰이 담긴다(Web Crypto —
  Edge middleware·Node 라우트 양쪽 동작). 비밀번호를 바꾸면 기존 토큰 전부 무효.
  로컬 dev는 인증 없이 열림.
- **쓰기 백엔드** (`lib/store.js`, `lib/content-db.js`): 운영에서는 Neon에 저장하고 관련 Next.js
  캐시와 경로를 무효화해 배포 없이 즉시 반영한다. 로컬 dev는 `fs`에 직접 쓰며, GitHub Contents
  API는 명시적인 호환 폴백과 모바일 코드 배포 소스로만 남긴다.
- **문화 장면** (`lib/moments.js`): `lyra_moments`에 기간·본문·감정·키워드를, `lyra_moment_links`에
  연결된 곡·영화·가사 구절·연결 이유를 저장한다. 공개 조회는 서버 컴포넌트가 직접 수행한다.
- **Gemini 호출 통합**: 곡은 태그·제목·독음·코멘트·키워드·감정을 1회 JSON 호출로, 영화도
  줄거리 정돈+코멘트를 1회 JSON 호출로 묶어 무료 티어 rate limit 회피.
  일괄 작업은 곡당 ~7s 간격(순차)으로 분당 한도(~10 RPM) 아래 유지, 일일 한도 소진 시엔 다음날.
- **Gemini 2단 모델** (`lib/admin/gemini.js`): 품질 민감한 번역·해설·감상은 flash
  (`GEMINI_MODEL`), 기계적 분류(자동태그·키워드·감정·연 구분)는 flash-lite
  (`GEMINI_MODEL_LITE`, 기본 `gemini-flash-lite-latest`). 모델별 무료 쿼터 버킷이 분리돼
  있어 58곡 일괄 재생성이 번역용 flash 한도를 안 갉아먹는다. 429 응답의 RetryInfo
  retryDelay를 존중해 재시도(12초 캡).
- **Gemini 모델**: `GEMINI_MODEL` 환경변수, 기본 `gemini-flash-latest` **별칭**. 버전을 하드코딩하면
  API 키 재발급 시 죽는다("no longer available to new users") — 별칭이 현재 flash를 따라간다.
- **키워드·감정 신뢰 경계** (`lib/keywords.js`): Gemini가 값을 정하므로 파서가 방어선. `emotion`은
  닫힌 목록(15종) 밖이면 버리고, `keywords`는 문장급·따옴표 포함 항목을 버린다(프론트매터 안전).
  틀린 값보다 없는 값이 낫고 모든 표시부가 없어도 조용히 넘어간다.
- **문화 공통 주제** (`lib/themes.js`): 영화 장르를 음악 감정으로 자동 변환하지 않는다. 상실·고독·불안·
  사랑·성장·가족·기억·위로·해방·희망의 닫힌 어휘만 허용하고, 큐레이션 영화마다 사람이 1~3개를 검수한다.
  관리자 영화 등록 화면도 같은 어휘를 사용한다. 초기 50편의 근거 있는 일괄 반영은
  `scripts/backfill-movie-themes.mjs`에 명시적으로 기록되어 있다.
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
| `DATABASE_URL` | Neon pooled 연결 문자열 | ✅ |
| `LYRA_CONTENT_STORE` | 운영 콘텐츠 저장소. `neon` | ✅ |
| `GITHUB_TOKEN` | 모바일 코드 배포 및 파일 저장 폴백용 PAT | 코드 배포에 필수 |
| `GITHUB_REPO` | `owner/repo` (예: `bluehhhh-byte/lyra`) | 코드 배포에 필수 |
| `GEMINI_API_KEY` | 번역·태그·코멘트·독음·취향 리포트·추천 생성 | 선택 |
| `GEMINI_MODEL` | 품질용 Gemini 모델 (미설정 시 `gemini-flash-latest`) | 선택 |
| `GEMINI_MODEL_LITE` | 분류·일괄용 모델 (미설정 시 `gemini-flash-lite-latest`) | 선택 |
| `GEMINI_MODEL_FALLBACKS` | 기본 모델이 503일 때 내려갈 후보 (쉼표 구분) | 선택 |
| `TMDB_API_KEY` | 영화 검색·상세·왓챠 임포트·추천 매칭 | 영화 기능에 필수 |
| `BRAVE_API_KEY` | 곡의 작품 수록 정보 웹 검색 | 선택 — 없으면 Apple Music·위키백과만 |
| `NEON_API_KEY` | 무료티어 감시(`scripts/quota-watch.mjs`)가 읽는 월 전송량. Neon 콘솔 → Account settings → API keys | 선택 — 없으면 전송량이 '확인 불가' |
| `NEON_PROJECT_ID` | 위 감시의 대상 프로젝트 | 선택 — 프로젝트가 하나면 키로 자동 조회 |
| `NEXT_PUBLIC_SITE_URL` | sitemap·OG 절대 URL (미설정 시 Vercel 도메인 자동 사용) | 선택 |

값을 붙여넣을 때 BOM(U+FEFF)이 딸려 오면 조용히 무시된다. `LYRA_CONTENT_STORE`가
그래서 이틀 동안 꺼져 있었다 — 화면에는 `neon`으로 보였다. 지금은 코드가 BOM·공백·
따옴표를 다듬지만, 무엇을 읽고 있는지는 `/api/version`의 `contentStore`로 확인한다.

## Gemini 대량 작업 설계 (구현 대기)

일괄 재생성·태그 추출 같은 대량 작업은 지금도 클라이언트가 30곡씩 끊어 보내지만,
전역 동시 실행 제한과 이어하기가 없다. 다음 규칙으로 구현한다:

- Neon `lyra_gemini_jobs` 큐 (배포 장부 `lyra_deploy_jobs`와 같은 lease 패턴).
  전역 동시 실행 1개 — BUILDING 부분 유니크 인덱스 방식 재사용.
- 작업 항목마다 idempotency key(= slug + 작업 종류) — 재실행해도 두 번 처리 안 됨.
- 한 요청은 소량만 처리하고 진행 상태를 큐에 저장, 다음 요청이 이어받는다.
  Vercel 함수 하나가 전체 목록을 도는 구조 금지.
- 429는 Retry-After를 그대로 기다리고, 무료 할당량 소진이 확인되면 큐를 멈춘다.
- 유료 API·외부 SaaS 큐 금지. lite 모델 우선(쿼터 버킷 분리).

## 백업 (DB → 파일)

운영 콘텐츠는 Neon에 있고 관리자 저장은 커밋을 만들지 않는다. 그래서 저장소만 보고
있으면 최근 기록이 없다. 주기적으로 되돌려 놓아야 git이 이력을 맡을 수 있다.

```bash
node scripts/dump-content.mjs --check   # 무엇이 다른지만 본다 (다르면 exit 1)
node scripts/dump-content.mjs           # 파일로 쓰고 SHA-256으로 검증
git add -A songs movies data && git commit
```

반대 방향(`scripts/migrate-content.mjs`)은 파일을 DB로 올린다. 대량 파일 작업을 한
뒤에는 이쪽을 써야 사이트에 반영된다. 두 스크립트 모두 쓰고 나서 해시를 다시 비교한다.

`lyra_moments`(문화적 장면)는 md 대응물이 없어 덤프 대상이 아니다.

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
- **발견 경로(다리·주제 코스)와 기록의 흐름**: 추천의 연장으로 만들었다 순차 기각.
  경로는 인공적이었고, 흐름(기록 순서를 가사 맥락으로 잇는 연속 서사)도 두 차례
  다듬은 뒤 최종 제거. 가사 클러스터는 /songs/motifs가 담당.

## 주요 파일 지도

| 경로 | 역할 |
|------|------|
| `lib/songs.js` | 곡 markdown 파싱, 영어 가사 대문자화 |
| `lib/movies.js` | 영화 markdown 파싱 (곡과 같은 프론트매터, 본문은 줄거리 산문) |
| `lib/genre.js` / `lib/keywords.js` | 장르 / 키워드·감정 어휘·검증·감정 valence |
| `lib/diary.js` | 날짜별 감정·키워드 집계 (통계·일기 공용) |
| `lib/store.js` / `lib/content-db.js` | Neon 우선 콘텐츠 저장 계층과 GitHub·fs 폴백 |
| `lib/moments.js` / `lib/moments-core.js` | 문화 장면 조회·저장 / 입력 정규화와 검증 |
| `lib/people.js` / `lib/taste-core.js` | 감독·배우 역색인 (.md+왓챠) / 취향 집계 요약 |
| `app/api/admin/route.js` | admin API 디스패처(32줄): action 파싱 → 도메인 핸들러 순차 시도 |
| `app/api/admin/{songs,movies,watcha}.js` | 도메인별 액션 로직 (곡 검색·번역·재검사 / 영화 / 왓챠·취향·추천) |
| `lib/admin/*.js` | admin 순수 헬퍼 (gemini·frontmatter·lrclib·itunes·song-meta·movie-meta) |
| `app/api/lyrics-index/route.js` | 가사 검색 인덱스(static) — 홈이 첫 검색 시 lazy fetch |
| `app/diary/` `app/emotion-timeline.js` | 키워드 일기 페이지 / 감정 시계열 SVG |
| `app/tags/[tag]/` | 곡+영화 통합 태그 페이지 |
| `app/admin/watcha-import.js` | 왓챠 JSON 붙여넣기 → 별점·코멘트 반영 UI |
| [`scripts/watcha-bookmarklet.md`](scripts/watcha-bookmarklet.md) | **왓챠 내보내기 북마클릿 + 사용법** (코드 수정 시 `node scripts/watcha-bookmarklet.mjs`로 재생성) |
| `scripts/instagram-import.mjs` | **인스타 내보내기 → 곡 임포트 (원문 보존)** — 캡션 본문이 1차 원본, `> `만 붙이고 무손실 검증. 가사 없는 게시글은 data/instagram-pending.json 대기 |
| `lib/*.test.mjs` | 프레임워크 없는 assert 테스트 (`node lib/xxx.test.mjs`) |

## 로컬 실행

```bash
pnpm install
GEMINI_API_KEY=xxx pnpm dev   # http://localhost:3000, admin 인증 없이 열림
pnpm test                     # lib/*.test.mjs 전체 (프레임워크 없는 assert 러너)
pnpm lint:data                # 콘텐츠 파일 검사 — 필수 필드·rating·emotion·중복 (오류만 exit 1)
pnpm build                    # 배포 포장 — 정적 페이지 생성까지 검증
pnpm smoke                    # 빌드 산출물을 next start로 띄워 17개 확인 (주요 페이지·API + 인증 경계)
pnpm check                    # test + lint:data + build + smoke 한 번에 (push 전 게이트)
```
