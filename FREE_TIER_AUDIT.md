# Lyra 무료티어 지속 사용 감사

기준일: 2026-08-23
범위: Vercel Hobby, Neon Free, GitHub Free/Actions, Gemini Developer API Free

## 결론

Lyra는 현재처럼 한 사람이 사용하는 규모라면 무료티어로 계속 운영할 수 있다. 현재 병목은 DB 저장공간이나 Vercel 전송량이 아니다. 가장 먼저 막아야 할 것은 공개 크롤링으로 동적 페이지가 대량 호출되는 경로, 2MiB에 접근 중인 전곡 캐시, 상세 페이지가 전곡을 매번 파싱하는 구조, 그리고 관측 코드가 Neon 쓰기와 compute wake-up을 만드는 구조다.

현재 DB는 16.46MiB로 Neon Free 0.5GB의 약 3.3%에 불과하다. 반면 전곡 캐시 payload는 1,610,404 bytes로 Next Data Cache 2MiB 한도의 76.8%다. 지금 평균 크기가 유지된다는 단순 추정으로 약 1,090곡에서 90% 경고선, 약 1,200곡에서 하드 한도에 닿는다. 한도를 넘으면 캐시가 저장되지 않아 전곡 DB 읽기가 요청마다 반복될 수 있으므로 저장공간보다 훨씬 가까운 한계다.

## 측정 기준

| 항목 | 현재 측정 | 무료 한도·판단 |
|---|---:|---|
| Neon DB | 17,260,544 bytes (16.46MiB) | 0.5GB의 약 3.3%, 여유 큼 |
| Neon 콘텐츠 | 곡 928개 3,273,742 bytes, 영화 50개 68,525 bytes | 원본 크기 자체는 작음 |
| Neon `lyra_data` | 23개 4,353,617 bytes | 이 중 생성 산출물 `search-index.json` 2,965,173 bytes는 DB 보관 불필요 |
| 전곡 Data Cache | 1,610,404 bytes (2MiB의 76.8%) | 가장 가까운 용량 절벽 |
| 최근 자체 Neon 계측 | 약 30시간, 읽기 162회, 추정 전송 216,459,467 bytes | 공급자 청구값이 아닌 JSON 결과 크기 추정치 |
| 운영 홈 응답 | gzip 115,261 bytes, 해제 후 523,162 bytes, CDN MISS/no-store | 개인 사용 전송량은 작지만 매번 함수 실행 |
| 곡 상세 응답 | gzip 10,869 bytes, CDN MISS/no-store | 응답은 작아도 내부에서 전곡 파싱 |
| 검색 응답 | 522 bytes, 측정 응답 1.87초, CDN MISS | 콜드 인덱스 생성 비용이 응답보다 큼 |
| 공개 sitemap | 4,091 URL: 곡 928, 영화 50, 인물 2,545, 기록 560, 기타 8 | 개인 사이트인데 크롤러에 전체 동적 표면을 공개 |
| GitHub 저장소 | Public | 표준 GitHub-hosted Actions는 public repo에서 무료 |

공식 최신 기준은 Vercel Hobby 월 4 CPU-hours, 360 GB-hours memory, 100GB Fast Data Transfer, 100만 invocations, 6,000 build minutes이며, Neon Free는 프로젝트당 100 CU-hours, 0.5GB storage, 월 5GB public network transfer다. Neon은 5GB를 넘으면 다음 주기까지 compute가 중지될 수 있다. Gemini의 정확한 RPM/TPM/RPD는 모델과 프로젝트별로 바뀌므로 AI Studio의 활성 한도를 기준으로 삼아야 한다.

- Vercel: https://vercel.com/docs/limits
- Neon: https://neon.com/pricing
- Neon network transfer: https://neon.com/docs/introduction/network-transfer
- Gemini rate limits: https://ai.google.dev/gemini-api/docs/rate-limits
- GitHub Actions: https://docs.github.com/en/billing/concepts/product-billing/github-actions

## 즉시 고칠 항목

### P0 — 개인 사이트를 검색 크롤러에 공개하지 않기

- 트리거: `robots.js`가 `/` 전체를 허용하고 `sitemap.xml`이 동적 URL 4,091개를 광고한다.
- 영향: 한 명만 쓰는 사이트라도 검색봇이 2,545개 인물 페이지와 928개 곡 페이지를 순회한다. 인물 한 건은 영화·Watcha 데이터 전체를 다시 조합하고, 곡 한 건은 전곡을 파싱한다. Vercel 4 CPU-hours가 사람의 사용량과 무관하게 소진될 수 있다.
- 조치: `robots`를 전면 `disallow`하고 sitemap 노출을 제거하며 `noindex`를 설정한다. 정말 본인만 접근한다면 Vercel Deployment Protection의 Vercel Authentication을 production에도 적용할 수 있는지 대시보드에서 확인해 우선 사용한다.
- 완료 조건: `/robots.txt`가 전체 크롤링을 금지하고, `/sitemap.xml`이 개인 콘텐츠 URL을 더 이상 열거하지 않으며, 비로그인 봇 요청이 애플리케이션 함수까지 도달하지 않는다.

### P0 — 전곡 단일 캐시를 한도 전에 분할하기

- 트리거: 현재 payload 1.61MB, 2MiB 한도의 76.8%. 단순 선형 추정으로 곡 약 1,200개에서 한도 도달.
- 영향: `unstable_cache`가 값을 저장하지 못하면 6시간 캐시 의도가 무너지고 약 3.3MB 전곡 읽기가 요청마다 Neon egress로 잡힌다. 5GB는 전곡 읽기 약 1,500회면 소진 가능하다.
- 조치: 전곡 메타데이터 인덱스와 가사 본문을 분리한다. 목록·홈·연관 항목은 작은 메타 인덱스를 사용하고, 상세 페이지는 slug 단건을 별도 cache key로 읽는다. 임시방편으로 TTL을 줄이면 안 된다.
- 완료 조건: 캐시 크기 회귀 테스트가 70% 이하를 유지하거나 shard당 상한을 강제하고, 2MiB 초과 시 테스트가 실패한다.

### P0 — 상세 페이지의 전량 파싱 제거

- 트리거: `getSongRuntime(slug)`와 `getMovieRuntime(slug)`가 각각 전체 목록을 만든 뒤 `find`한다. 곡 상세는 이어서 연관곡 때문에 전곡을 다시 요청하고 영화 교차 추천도 읽는다. 인물 상세도 1,095편가량을 합쳐 2,545명 목록을 만든 뒤 한 명을 찾는다.
- 영향: Neon cache hit여도 Vercel 함수에서 gzip 해제, frontmatter/가사 파싱, 정렬, 인물 집계를 매 요청 수행한다. 공개 크롤링과 결합하면 Active CPU가 먼저 소진된다.
- 조치: `readContentRow(kind, slug)`를 실제 상세 조회에 사용하고 slug별 `unstable_cache`를 둔다. 연관 추천에는 전곡 본문이 아닌 사전 계산된 경량 메타 인덱스를 사용한다. 인물 인덱스도 revision 기준으로 캐시하거나 빌드 산출물로 만든다.
- 완료 조건: 단일 곡/영화/인물 요청에서 전곡 본문 조회·파싱이 발생하지 않는 테스트를 추가한다.

### P1 — 사용량 계측이 사용량을 만들지 않게 하기

- 트리거: 실제 DB read마다 `recordNeonRead`가 `lyra_usage_buckets`에 즉시 upsert하고, 10% 표본 세션은 경로 변경마다 `/api/usage`를 호출해 다시 Neon write를 만든다.
- 영향: 관측 대상인 Neon을 추가로 깨우고 compute 활성 시간을 늘린다. 서버리스 인스턴스별 메모리 rate limit은 외부 요청을 전역 제한하지 못한다. 현재 browser page-view 값은 0이라 비용 대비 관측 효용도 확인되지 않았다.
- 조치: 브라우저 계측은 기본 off 또는 관리자 세션에만 적용한다. 필요하면 한 세션당 한 번으로 합치고, 서버 read 계측은 메모리/로그에 누적한 뒤 하루 단위로 쓰거나 공급자 API 수치를 사용한다.
- 완료 조건: 일반 페이지 100회 열람 시 계측 목적의 Neon write가 0회이거나 정해진 소수의 batch write만 발생한다.

### P1 — production 쓰기는 Neon으로 fail-closed

- 트리거: `LYRA_CONTENT_STORE=neon`이 빠지면서 `GITHUB_TOKEN`과 `GITHUB_REPO`가 남아 있으면 `store.js`가 GitHub Contents API PUT/DELETE로 자동 전환한다.
- 영향: 관리자 일괄 개선이 파일당 commit과 push event를 만들 수 있고, 과거 abuse flag 및 배포 폭주 문제가 재발할 수 있다. 현재 GitHub 이벤트 전달이 불안정한 상태에서는 복구 확인도 어렵다.
- 조치: production에서는 Neon이 아니면 저장을 명시적으로 실패시킨다. GitHub 경로는 read-only backup/export로만 남기고 웹 요청에서 repository write를 하지 않는다. 백업은 별도 수동 또는 저빈도 단일 commit 작업으로 분리한다.
- 완료 조건: production 환경 오설정 테스트에서 GitHub API를 호출하지 않고 명확한 5xx/관리자 오류를 반환한다.

## 다음 단계의 안정화

### P1 — migration과 캐시 무효화를 원자적인 운영 절차로 만들기

- `migrate-content.mjs`는 모든 JSON을 올리므로 `.gitignore`의 생성 산출물인 `search-index.json` 2.97MB와 `playlist.json` 0.35MB도 DB에 들어갔다. 업로드 대상 allowlist를 사용하고 불필요한 두 행은 다음 검증된 정리 작업에서 제거한다.
- 현재 migration은 내용이 같아도 모든 행의 `updated_at`을 바꾸며, 마지막 캐시 무효화는 `ADMIN_PASSWORD` 로그인 성공에 의존한다. 별도 `REVALIDATE_SECRET` 기반 단일 endpoint나 revision 기반 cache key로 바꾸고, 실패 시 성공처럼 안내하지 않도록 한다.
- 배포가 Data Cache를 반드시 비운다고 가정하지 않는다. 6시간 TTL은 장애 안전망으로 유지한다.

### P1 — 무료 한도 경보를 실제 공급자 값에 연결

- Neon `data_transfer_bytes`는 Free에서도 project/branch detail API로 확인하고 50/70/85%에서 경보한다. 자체 `bytesOf(JSON)`는 진단 보조치로만 표시한다.
- Vercel은 4 CPU-hours를 최우선 지표로 보고, invocation·Fast Data Transfer·build minutes도 같이 기록한다. 현재 홈 115KB만 놓고 보면 100GB 전송보다 CPU가 먼저 위험하다.
- 코드에 박힌 한도값은 날짜와 출처를 붙이고 월 1회 공식 문서와 대조한다.

### P2 — 검색 인덱스와 홈 payload 줄이기

- 검색 인덱스는 서버리스 콜드 인스턴스마다 전곡 가사·영화·인물·기록을 메모리에 다시 만든다. revision별 직렬화 인덱스를 Data Cache나 Blob에 저장하고, 가사 라인은 별도 검색 구조로 나눈다.
- 홈은 928곡 메타를 HTML/RSC로 보내고 `searchParams` 때문에 no-store 동적 응답이다. 기본 홈은 캐시 가능한 route로 만들고 필터 상태는 client URL에서 읽거나 경량 API로 제공한다.
- 다만 현재 115KB gzip은 한 사람 사용 기준으로 긴급한 bandwidth 문제는 아니다. P0 CPU/캐시 문제를 먼저 해결한다.

### P2 — Gemini 호출 예산을 기능 단위로 제한

- 무료 한도는 모델별·프로젝트별로 변하므로 숫자를 코드에 고정하지 않는다. 관리자 화면에서 429와 모델별 실패를 표시하고, 일괄 작업은 concurrency 1, 요청 간 간격, 작업별 최대 호출 수, 재시작 가능한 checkpoint를 둔다.
- `*-latest` alias와 여러 fallback은 가용성에는 유리하지만 한 번의 사용자 작업이 여러 무료 요청을 소비할 수 있다. 429에서는 다른 고비용 모델을 연쇄 호출하지 말고 중단·재개하도록 한다.
- Gemini는 관리자 전용이므로 현재 트래픽에서 상시 비용원은 아니다.

## 지금 하지 않을 것

- 4,091개 URL을 모두 정적 생성하지 않는다. 한 사람용 사이트에서 build time과 산출물, 배포 시간을 늘리고 콘텐츠 변경마다 대규모 재생성을 유발한다.
- Neon TTL을 6시간보다 짧게 줄이지 않는다. 과거 5분 TTL은 월 약 20GB 추정으로 5GB 한도를 넘기는 구조였다.
- 현재 DB가 3.3%뿐이므로 유료 DB로 이전하거나 저장공간 최적화부터 하지 않는다.
- 이미지 전체를 Vercel로 재호스팅하지 않는다. 외부 원본을 브라우저가 직접 읽는 현재 방식이 Vercel transfer에 유리하다. `/api/img` 프록시는 공유 이미지 생성처럼 꼭 필요한 경우로 제한한다.
- GitHub Actions 최적화를 최우선으로 하지 않는다. 저장소가 public이라 표준 runner 분은 무료이고, workflow도 main push/PR에서만 실행되며 concurrency 취소가 있다. abuse flag 해제 후 이벤트 전달 정상화와 백업 전략을 별도로 확인한다.

## 권장 실행 순서

1. robots/sitemap을 개인 사이트 정책으로 전환하고 Vercel Authentication 적용 가능 여부를 확인한다.
2. production GitHub write fallback을 제거해 Neon fail-closed로 만든다.
3. slug 단건 캐시와 경량 메타 인덱스를 도입해 전곡 파싱을 상세 요청에서 제거한다.
4. 전곡 cache payload 상한 테스트와 shard 구조를 추가한다.
5. 자체 telemetry write를 끄거나 batch화하고 공급자 usage 경보를 연결한다.
6. migration allowlist와 독립 revalidation secret을 도입한다.
7. 검색/홈 payload 최적화는 위 항목의 실측 이후 진행한다.

이 순서대로라면 유료 전환 없이도 현재 콘텐츠의 수 배 규모까지 운영 여유를 만들 수 있다. 단, 가장 가까운 절벽은 저장공간이 아니라 전곡 Data Cache 2MiB 한도이므로 새 곡이 약 1,090개에 접근하기 전에 분할을 끝내야 한다.

---

## 강화 기록 (2026-09)

위 감사 이후 남아 있던 공백을 네 갈래로 닫았다. 원칙은 그대로다 — 유료 전환
없음, TTL 축소 없음, 전곡 정적 생성 없음, 외부 의존성 추가 없음.

### AI 한도가 "오늘의 업데이트"를 막지 않게

일일 예산이 곡 연구에만 걸려 있었다. 나머지 Gemini 호출(번역·키워드·감정,
영화 메타, 캐러셀 문구)은 한도 없이 나갔고, 그쪽이 먼저 계정 한도를 태우면
곡 등록이 통째로 막혔다.

- 기능별 몫(연구 25 · 곡 40 · 영화 20 · 캐러셀 20) + 계정 합산 80.
  합이 105인데 상한을 80으로 낮춘 건 자리를 남기기 위해서다. `LYRA_AI_DAILY_*`
  로 조정한다.
- 거부는 429가 아니라 `AI_BUDGET_EXHAUSTED` — 공급자가 막은 것과 우리가 멈춘
  것은 다른 사실이다. 어느 상한에 닿았는지·잔량·KST 리셋 시각을 함께 준다.
- **"AI 보류로 저장"**: 저장이 Gemini를 부르는 곳은 연 나누기 하나뿐이라 그것만
  건너뛴다. 빈 항목은 `needs.js`가 대기열로 잡는다.
- 전곡 조사 재개는 버튼이 아니라 명령(`pnpm appearances:resume`)이다. 수백 번의
  호출을 서버리스에서 돌리면 이 트랙이 지키려는 예산을 스스로 태운다.

### 소진 전에 알기

- `.github/workflows/quota-watch.yml` — 매일 04:07 KST. 저장소 모드·헬스체크·
  Neon 월 전송량·Data Cache payload·어제 AI 호출을 한 리포트로. 70% 이상이거나
  폴백·헬스체크 실패면 이슈를 연다(열린 동명 이슈가 있으면 코멘트).
  판정과 문안은 `lib/quota-watch.js`의 순수 함수 — YAML은 테스트할 수 없다.
- **읽지 못한 값은 0이 아니라 "실측 불가"** 다. 0은 안전하다는 뜻으로 읽힌다.
- Vercel: `GET /v1/usage`는 **실재한다**(from·to는 ISO 필수). "Usage API가 없다"는
  옛 단정은 틀렸다. 다만 응답 필드는 검증하지 못했다 — 쓸 수 있는 토큰이
  만료 상태라 200을 못 받았다. 파서가 후보 이름을 훑고 못 알아보면
  `measured: false`로 떨어진다.

### 장애가 나도 복구 가능하게

- 관리자 전 화면 상단에 폴백 배너(5분 폴링). **무엇이 막혔는지**를 먼저 적는다.
- 저장 실패는 전부 초안으로 보관한다(등록 폼 포함 — 잃을 게 가장 많은 쪽인데
  없었다). 7일 뒤 폐기하되 콘솔에 남긴다.
- `docs/runbook-free-tier.md` — 증상 → 원인 → 대응. 안내하는 명령이 실제로
  존재하는지 테스트가 `package.json`·`scripts/`와 대조한다.
- 백업은 커밋 **전에** 센다. 전날보다 20% 넘게 줄면 멈추고 어제 백업을 지킨다
  (`--allow-shrink`로 통과). 검사 중 실제 버그를 잡았다: `git ls-tree`가 비ASCII
  경로를 따옴표로 감싸 한글 제목 곡 457개가 세어지지 않았다.

### 나머지 외부 API

- TMDB: 상태별로 사람이 할 일이 다른 오류로 분기(401/403·404·429·5xx).
  429는 서버가 준 `Retry-After`만큼만 한 번. 헤더가 없으면 재시도하지 않는다.
  검색 결과 1시간 캐시(200건, 인스턴스 로컬).
- `TMDB_API_KEY`도 BOM·공백 정규화를 통과시킨다 — 마지막 남은 날것이었다.
- `lib/external-timeouts.test.mjs`가 서버리스에서 도는 모든 `fetch`에 시한을
  강제한다. 이 검사가 `lib/store.js`의 GitHub 호출 4건과 API 라우트 3건을
  찾아냈다 — 매달린 공급자가 함수를 붙들면 그 시간이 그대로 한도에서 나간다.

### 켜야 값이 채워지는 것

| 환경변수 | 없으면 |
|---|---|
| `NEON_API_KEY`, `NEON_PROJECT_ID` | 월 전송량이 "실측 불가" |
| `LYRA_VERCEL_TOKEN` | CPU-hours가 "출처: 자체 추정" |

### 남은 한계

- Vercel `/v1/usage`의 **응답 필드는 미검증**이다. 유효한 토큰으로 한 번
  받아 보고 `lib/vercel-usage.js`의 `CANDIDATES`를 실제 이름으로 좁혀야 한다.
- 계정 합산 상한 검사는 원자적이지 않다(쓰기 전 읽기). 사용자가 한 명이라
  실익보다 복잡도가 크다고 판단했고, 승급 경로는 코드 주석에 적어 뒀다.
- 로컬 스크립트의 시한은 강제하지 않고 건수 상한으로만 본다.
