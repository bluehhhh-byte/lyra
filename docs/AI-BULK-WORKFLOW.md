# 대량 작업 지시서 (Claude · ChatGPT)

전 곡·전 영화를 대상으로 하는 작업은 이 문서대로 한다. Gemini는 여기 쓰지 않는다 —
무료 티어 호출로는 768곡을 훑지 못하고, 중간에 끊기면 어디까지 했는지도 남지 않는다.

역할은 셋으로 나뉜다.

| | 하는 일 |
|---|---|
| 코드 | 무엇이 부족한지 진단, 결과 검증, 파일 병합 |
| Gemini | 요약 목록만 보고 "먼저 손볼 N곡" 선별, 새 항목 1건의 번역·설명 |
| Claude·ChatGPT | 배치 단위 실제 생성 |

---

## 0. 시작 전 — 작업 공간 분리

배포된 admin은 GitHub API로 `main`에 직접 커밋한다(그래야 Vercel이 재배포한다).
그 사이 로컬에서 대량 작업이 돌면 서로 덮어쓴다. **실제로 겪은 사고다** — 자동수정
커밋과 독음 작업이 겹쳐 리베이스 충돌이 났고, 정리 스크립트가 멀쩡한 번역까지 지웠다.

```bash
node scripts/worktree.mjs new readings   # ../lyra-readings 에 work/readings 브랜치
cd ../lyra-readings
# … 작업 …
node scripts/worktree.mjs done readings  # main에 합치고 worktree 제거
```

쓰기 스크립트는 `main`에서 실행하면 스스로 멈춘다(`lib/admin/preflight.js`).
정말 필요하면 `--force`를 붙이되, 그 순간 admin 자동 저장과 경쟁한다는 뜻이다.

`main`은 GitHub 쪽에서도 보호해 둔다 — **force push와 브랜치 삭제만** 막는다.
필수 상태 검사나 PR 필수는 걸지 않았다. 배포된 admin이 GitHub API로 `main`에 바로
커밋해야 Vercel이 재배포되는데, 그 경로가 막히면 관리자 화면의 저장이 통째로 죽는다.
되돌리려면 저장소 Settings → Branches에서 규칙을 지우면 된다.

`worktree.mjs done`은 `main` 작업 트리가 깨끗해야 합친다. `data/needs-work.json`처럼
진단 스크립트가 건드린 파일이 남아 있으면 병합이 중단되고 브랜치만 남는다 —
그때는 `git checkout -- data/needs-work.json` 후 다시 합친다.

---

## 1. 진단 — 무엇이 부족한가

```bash
node scripts/needs-work.mjs            # → data/needs-work.json
node scripts/needs-work.mjs --field=keywords --batch=30
```

산출물은 배치로 잘려 있다. **음악 30곡, 영화 20편**이 한 배치다. 더 크게 묶지 않는다 —
한 배치가 실패해도 그 배치만 다시 돌리면 되게 하기 위해서다.

```json
{
  "at": "2026-08-14T…",
  "total": { "songs": 768, "songsNeedingWork": 23, "moviesNeedingWork": 1 },
  "byNeed": { "키워드 근거 약함": 8, "가사 없음": 2 },
  "songBatches": [[{ "id": "slug", "kind": "song", "title": "…", "artist": "…",
                     "lang": "en", "year": "2004", "needs": ["연도 없음"] }]],
  "movieBatches": [[…]]
}
```

## 2. 선별 (선택) — 먼저 할 것 고르기

목록이 길면 `/admin` → 대량 작업 → 우선순위에서 Gemini에게 번호만 고르게 한다.
**원문은 주지 않는다.** 넘기는 건 제목·아티스트·부족 항목뿐이고 받는 것도 번호 목록이라
호출 한 번 분량이다.

## 3. 생성 — Claude·ChatGPT

배치 하나(30곡)를 통째로 주고 아래 스키마로 받는다. 곡 파일을 읽어야 판단이 서는
작업(키워드·감정·코멘트)은 `songs/<slug>.md`를 읽게 한다.

### 출력 스키마

```json
{
  "model": "claude-opus-5",
  "generated_at": "2026-08-14T10:00:00Z",
  "prompt_version": "keywords-v2",
  "items": [
    {
      "slug": "radiohead-no-surprises",
      "keywords": ["집", "정원", "소음", "심장"],
      "emotion": "체념",
      "comment": "…",
      "title_ko": "…",
      "genre": "Alternative Rock",
      "year": "1997",
      "artwork": "https://…",
      "confidence": "high",
      "note": "비운 이유"
    }
  ]
}
```

### 허용 필드

`keywords` `emotion` `comment` `title_ko` `genre` `year` `artwork` — 그리고 기록용으로
`confidence` `note` `model` `generated_at` `prompt_version` `reviewed`.

### 금지 필드

`slug` `id` `title` `artist` `lyrics` `source_hash` `published` — **바꾸면 안 되는 것들**이다.
보내와도 검증 단계가 무시하고 `validation-report.json`의 `ignored`에 기록한다.
가사 본문은 이 경로로 고치지 않는다(가사는 `/admin` 가사 정확성 검토에서 근거와 함께).

### 값 규칙

| 필드 | 규칙 |
|---|---|
| `emotion` | 닫힌 15종 중 하나: 사랑 설렘 그리움 이별 슬픔 고독 위로 희망 기쁨 분노 저항 불안 체념 회상 몽환 |
| `keywords` | 한국어 명사 3~8개, 중복 없음, **가사에 실제로 나오는 단어**, 감정 단어 반복 금지 |
| `genre` | `lib/genre.js`의 닫힌 영문 목록. 우산 장르(Rock·Pop)는 더 구체적인 게 없을 때만 |
| `year` | 4자리 원곡 발매연도. 컴필레이션·리이슈 연도 금지 |
| `artwork` | `https://` 이미지 URL. 실제로 열리는지 검증 단계가 다시 확인한다 |
| `comment` | 한국어 1~2문장, 평서문 ~다체(한다/이다/같다/된다). ~습니다/~해요 금지. 40~120자 |

모르면 비운다. **그럴듯한 오답이 빈칸보다 나쁘다.** 확신이 낮으면 `confidence: "medium"`.

## 4. 검증·병합 — 코드

```bash
node scripts/validate-bulk.mjs out-1.json out-2.json --write
node scripts/validate-bulk.mjs out.json --write --overwrite   # 기존 값도 덮을 때
```

- 닫힌 어휘·4자리 연도·https·문체·키워드 개수를 코드가 검사한다
- 기존 값은 덮지 않는다(`--overwrite` 없이는)
- 통과분만 파일에 쓰고 `data/validation-report.json`에 통과·거부·무시를 남긴다
- 쓰기가 일어나면 `data/ai-generation-log.json`에 어떤 모델이 무엇을 바꿨는지 이어 적는다

거부 목록을 읽고 고친 뒤 **그 배치만** 다시 돌린다. 이미 반영된 항목은 기존 값이
있으므로 다시 써지지 않는다 — 그래서 재실행이 안전하다.

## 4-1. 가사가 없는 곡 — 직접 채우기

캡션에 가사를 안 적은 게시글은 밖에서 원문을 가져온다(lrclib → 벅스 → 지니 → Genius 순으로
찾아봤다). 그래도 어디에도 없는 곡이 남는다. 그건 사람이 붙여넣는 수밖에 없다.

```bash
node scripts/add-lyrics.mjs --list                     # 가사 없는 곡 목록
node scripts/add-lyrics.mjs <slug> lyrics.txt --source=<URL> --write
```

붙여넣은 본문은 `lyrics_external: true`로 표시되고 출처가 남는다 — 인스타 캡션에서 온 게
아니므로 원본 대조가 이 곡의 본문을 캡션과 맞춰보지 않는다. 이미 본문이 있으면 덮어쓰지 않는다.

찾아봤는데 정말 없는 곡은 그렇게 적어 둔다. 안 그러면 매번 대기열에 다시 올라온다.

| 표시 | 뜻 |
|---|---|
| `instrumental: true` | 연주곡 — 원래 가사가 없다 |
| `lyrics_none: true` + `lyrics_note` | 어디에도 원문이 공개돼 있지 않다. 어디를 확인했는지 note에 적는다 |
| `artwork_none: true` | 커버가 어느 서비스에도 없다 |

`lyrics_none`은 근거(`lyrics_note`)가 없으면 린트가 오류로 잡는다 — 확인 없는 포기는
그냥 미기입이다. 나중에 원문을 구하면 `add-lyrics.mjs`로 그대로 붙이면 된다.

브라우저에서 하려면 `/admin` → **가사 정확성 검토**에도 같은 곡들이 "가사 없음"으로 맨 위에
뜬다. 왼쪽 칸에 붙여넣고 저장하면 된다.

채운 뒤에는 번역을 붙인다.

```bash
node scripts/apply-translations.mjs tr-out.json   # { "songs": { "<slug>": { "map": { "원문": "번역" } } } }
node scripts/apply-readings.mjs rd-out.json       # 일본어 곡 한글 독음
```

## 5. 마무리

```bash
node scripts/needs-work.mjs        # 대기열이 줄었는지
pnpm check                         # 테스트 + 데이터 린트 + 빌드 + smoke
node scripts/project-status.mjs --write   # 문서의 현황 숫자 갱신
node scripts/worktree.mjs done <이름>
```

인스타에서 온 곡을 건드렸다면 원본 대조도 돌린다.

```bash
pnpm verify:instagram -- "<export 폴더>"
```

---

## 재개 방법

배치가 중간에 끊겼을 때:

1. `data/validation-report.json`에서 어디까지 통과했는지 본다
2. `node scripts/needs-work.mjs`를 다시 돌린다 — 이미 채워진 곡은 목록에서 빠진다
3. 남은 배치만 다시 생성에 넘긴다

같은 파일을 두 번 반영해도 안전하다(기존 값을 덮지 않으므로). 다만 `--overwrite`는
그 보호를 끄므로, 되돌릴 준비(커밋)를 하고 쓴다.
