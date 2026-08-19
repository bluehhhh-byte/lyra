# Lyra — Claude 작업 콘텍스트

개인 음악·영화 기록 아카이브. 사용자 1명(소유자 본인), 계정·광고·수익 없음.
운영: https://lyra-one-zeta.vercel.app · 저장소: github.com/bluehhhh-byte/lyra

## 무엇이 어디에 있는가 (2026-08-19 기준)

**진실 공급원은 Neon Postgres다. `songs/*.md`는 백업본이다.**

- `lyra_contents(kind, slug, raw)` — 곡 919 + 영화 50, raw는 md 원문 그대로
- `lyra_data(name, raw)` — data/*.json 23건
- `lyra_moments` — 문화적 장면(md 대응물 없음, 덤프 대상 아님)
- 스위치: `LYRA_CONTENT_STORE=neon`. 현재 모드는 `/api/version`의 `contentStore`로 확인
- 관리자 저장은 **GitHub 커밋을 만들지 않는다**. 곡 등록 → DB 기록 → 캐시 무효화 → 즉시 반영
- 배포가 필요한 경우는 둘뿐: 코드 변경, 집계 페이지 갱신(/stats /tags /songs/taste /songs/motifs /recommendations /people /sitemap.xml — 빌드 시점 정적)

## 절대 규칙

1. **원문 가사와 `source_hash`는 절대 변경하지 않는다.**
2. 사용자 미추적 파일과 작업 중인 데이터는 건드리지 않는다. 작업 전 `git status` 확인.
3. 경고를 임시로 숨기거나 예외 목록을 남발해 0건을 만들지 않는다. 판정 규칙은 `lib/admin/needs.js` 한 곳에서만.
4. GitHub에 짧은 시간 다수 커밋을 만들지 않는다(아래 '계정 플래그' 참조). 대량 파일 작업은 반드시 한 커밋으로 묶는다 — `lib/store.js`의 `commitFiles()`(Git Trees API) 또는 로컬 작업 후 단일 커밋.
5. 강제 푸시 금지. push 전 `git pull`(rebase.autoStash 설정됨).

## ⚠️ GitHub 계정 플래그 (미해제)

2026-08-12 백필이 4분 30초에 84커밋을 만들어 abuse 오탐. Support 티켓 #4667653 진행 중.

증상: push는 되지만 **이벤트가 발생하지 않는다** → Actions 미실행, Vercel Git 연동 미작동, OAuth 3rd-party 거부, `gh search`도 "flagged as spammy" 거부.

**따라서:**
- Vercel 대시보드 Redeploy 버튼은 같은 커밋만 다시 빌드한다. 새 커밋은 절대 반영 안 됨.
- 배포는 CLI 업로드: `pnpm deploy:prod`, 또는 origin/main을 detached worktree로 뽑아
  `VERCEL_ORG_ID=team_vk8fZtA1YueBPh3dnFXZNj0H VERCEL_PROJECT_ID=prj_NMnJerZFyg3lxOiHc3uOPHnT6xug npx vercel deploy --prod --yes --cwd <worktree>`
- 로컬 폴더를 직접 올리면 미추적 파일이 섞인다 — 반드시 깨끗한 worktree에서.
- 플래그 해제 확인: `gh api users/bluehhhh-byte/events --jq 'length'`가 0이 아니면 해제된 것.

## 무료 티어 예산과 지키는 법

| 서비스 | 한도(대략) | 현재 사용 | 지키는 장치 |
|---|---|---|---|
| Neon Free | 저장 0.5GB, 컴퓨트 ~190h/월 | 16MB (3%) | gzip 캐시로 요청당 DB 조회 제거, autosuspend |
| Vercel Hobby | 대역폭 100GB/월, maxDuration 60s(Fluid 300s) | 홈 HTML 1.4MB | 태그 무효화 캐시, `/api/admin` maxDuration 180 |
| Gemini Free | 모델별 RPM/RPD 버킷 분리 | 곡 등록 시 1~2회 | 대체 사슬 + 12s/48s 시한, 대량 작업은 lite 모델 |
| GitHub | abuse 감지(버스트 커밋) | 콘텐츠 커밋 0 | 저장이 커밋을 안 만듦, 백업은 단일 커밋 |

**원칙: 버스트를 만들지 않는다.** 무료 티어는 총량보다 순간 속도에 먼저 걸린다.
- 대량 Gemini 작업(일괄 재생성 등)은 서버리스가 아니라 **로컬 스크립트**로, lite 모델로, 배치 간 대기를 두고 돌린다.
- 대량 GitHub 쓰기는 Contents API(파일당 1커밋)가 아니라 Git Trees API(`commitFiles`) 한 커밋으로.
- Gemini 5xx/무응답은 재시도하지 않는다 — 모델 전체가 막힌 것. `lib/admin/gemini.js`가 대체 사슬로 처리한다. 이 정책을 되돌리지 말 것.

## 함정 (전부 실제 사고)

- **환경변수 BOM**: Vercel에 붙여넣은 값에 U+FEFF가 딸려와 `LYRA_CONTENT_STORE`와 `DATABASE_URL`이 이틀간 조용히 죽어 있었다. 코드가 이제 BOM·공백·따옴표를 다듬지만(`lib/content-db.js`의 `clean`), 새 환경변수를 추가하면 같은 함정을 의심하라.
- **unstable_cache 2MB 한도**: 초과 시 던지지 않고 조용히 저장을 건너뛴다 — 캐시가 도는 것처럼 보이지만 매 요청 DB를 읽는다. 곡 전량은 gzip으로 넣는다(`packRows`). 압축본이 한도 90%를 넘으면 경고 로그가 뜬다 — 뜨면 분할을 검토하라.
- **Gemini 모델 변덕**: 하루 안에 latest 503→200, 3.6-flash 200→무응답으로 뒤집혔다. 특정 버전을 기본으로 박지 마라. 별칭 + `GEMINI_MODEL_FALLBACKS`가 답이다.
- **PowerShell Out-File**: 기본으로 BOM을 붙인다. 다른 도구가 읽을 파일은 `-Encoding utf8` 명시.
- **sr-only를 `<table>`에 직접**: width:1px이 테이블에 안 먹혀 문서 폭이 늘어난다. div로 감싼다.
- **"use client" 모듈의 non-component export**: 서버에서 undefined. 상수는 non-client 모듈에.

## 정기 절차

**백업 (DB → 파일, 주기적으로 돌릴 것):**
```bash
node scripts/dump-content.mjs --check   # 차이만 확인 (다르면 exit 1)
node scripts/dump-content.mjs           # 파일로 쓰고 SHA-256 검증
git add -A songs movies data && git commit -m "backup: DB 스냅샷" && git push
```

**대량 파일 작업 후 (파일 → DB, 안 하면 사이트에 반영 안 됨):**
```bash
node scripts/migrate-content.mjs && node scripts/migrate-content.mjs --verify
```

**검증 일체:** `pnpm test`(lib/*.test.mjs 전부) · `pnpm build` · `node scripts/needs-work.mjs` · `node scripts/lint-data.mjs`

## 데이터 형식 요점

곡 md: frontmatter + 본문. 본문 줄 규칙 — 일반 줄=원문, `> `=번역, `>^N`=N줄 병합 번역, `+ `=독음, `// `=연 해설, `[Verse]`=섹션, 🗨/✏=소유자 해설, 빈 줄=연 구분. 파서는 `lib/songs.js`, CRLF 정규화 필수.

가사 없는 곡: `instrumental: true`(연주곡) 또는 `lyrics_none: true` + `lyrics_note`(원문 미공개). 이 표시가 있으면 needs.js가 번역·독음·키워드·감정을 대기열에서 뺀다. 관리자 2단계의 "연주곡으로 등록"/"가사 원문 없이 등록" 버튼이 세운다.

번역 방향: 한국 곡의 한국어 줄 → 영어(`needsEn`), 외국어 줄 → 한국어(`needsKo`). 규칙은 `docs/TRANSLATION.md`.

## 문서 지도

- `DEVELOPMENT.md` — 아키텍처·환경변수·백업 절차·개발 히스토리
- `docs/PROJECT.md` — 프로젝트 정의와 계획
- `docs/TRANSLATION.md` — 번역 품질 규칙
- `docs/EMOTION-MODEL.md` — 감정 모델(Russell circumplex)
