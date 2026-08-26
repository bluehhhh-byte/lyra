# 성능·무료 티어 감사

## G-03 · 클라이언트 번들

2026-08-27 `pnpm build`의 Next.js 15.5.20 출력으로 측정했다. 공통 First Load JS는 102 kB다.

| 순위 | 경로 | Route JS | First Load JS | 공통분 제외 | 주된 원인 |
| ---: | --- | ---: | ---: | ---: | --- |
| 1 | `/admin/cyno-carousel` | 10.7 kB | **124 kB** | 약 22 kB | Canvas 5장 렌더러, 이미지 로더, 편집 폼, 캡션 미리보기 |
| 2 | `/songs/[slug]` | 5.08 kB | **122 kB** | 약 20 kB | 가사 선택/Canvas 카드 제작, 플레이어 상호작용 |
| 3 | `/movies/[slug]` | 4.58 kB | **121 kB** | 약 19 kB | Canvas 영화 카드 제작과 상세 상호작용 |

가장 큰 경로와 가장 작은 공개 상세 경로 사이의 차이는 3 kB이고, 세 경로 모두 124 kB 이하이다. 상위 세 곳의 추가 코드가 모두 해당 화면을 열어야 쓰는 편집·Canvas 기능이라 새 라이브러리나 전역 의존성을 넣어 줄이는 작업은 하지 않았다. 다음 측정에서 공통 번들이 102 kB보다 커지거나 한 경로가 130 kB를 넘으면 동적 import 분리를 먼저 검토한다.

## G-04 · 폰트 전달

`app/globals.css`는 Pretendard Variable 1.3.9의 고정 버전 동적 서브셋 CSS를 사용한다. 명조 계열은 운영체제 글꼴만 사용하므로 별도 웹 폰트 전송은 0 byte다. `pnpm build` 뒤 `node scripts/audit-fonts.mjs --check`가 생성된 홈페이지 HTML의 실제 문자 범위를 CDN의 `unicode-range`와 대조했다.

| 방식 | 초기 원본 자산 크기 |
| --- | ---: |
| 전체 Pretendard Variable woff2 한 파일 | 2,057,688 bytes |
| 동적 서브셋 CSS | 53,513 bytes |
| 홈페이지가 선택한 서브셋 woff2 25개 | 595,932 bytes |
| 동적 서브셋 합계 | **649,445 bytes** |

현재 방식은 전체 폰트 한 파일보다 **1,408,243 bytes, 68.4%** 작다. CSS는 CDN 전송 압축이 추가로 적용될 수 있으므로 표는 재현 가능한 압축 해제 자산 크기로 통일했다. 이미 큰 폭의 절감이 있고 버전도 고정되어 있어, 자체 호스팅이나 더 작은 수동 글리프 목록으로 바꾸지 않았다. 수동 목록은 새 콘텐츠의 한글이 빠질 위험이 더 크다.

## G-05 · 인물 라우트 비용

`node lib/people-cache-size.test.mjs`로 실제 영화·Watcha 데이터를 합쳐 측정했다.

| 대상 | 건수 | JSON 크기 | Data Cache 2 MiB 대비 |
| --- | ---: | ---: | ---: |
| 전체 인물 요약 | 2,544명 | 668 KiB | 약 32.6% |
| 가장 큰 상세(하정우) | 17편 | 9.8 KiB | 약 0.5% |

`getAllPeopleRuntime`은 작품 배열을 뺀 요약만 6시간 캐시하고, `getPersonRuntime`은 2,544명 전체 그래프를 만들지 않고 요청한 이름 한 건만 별도 캐시한다. 전량 `generateStaticParams`는 추가하지 않았다. 현재 빌드도 `/people/[name]`을 동적 경로 하나로 보고하며, 2,544개 상세 페이지 정적 생성은 0건이다. 즉 전량 정적화 없이 목록 페이로드를 2 MiB의 3분의 1 아래로 유지한다.

## G-07 · Neon 전송량

관리자 사용량 화면은 Neon `GET /projects/{project_id}`가 돌려주는 현재 결제 주기의 `data_transfer_bytes`를 표시한다. 이 값이 결제 주기 시작에 초기화되는 누적 전송량이라는 점은 [Neon 네트워크 전송 문서](https://neon.com/docs/introduction/network-transfer)의 프로젝트 상세 API 설명을 따른다.

요금제 한도는 바뀔 수 있으므로 코드의 5 GB/500 MB 상수를 제거했다. 배포 환경에서 현재 계약값을 `NEON_TRANSFER_LIMIT_BYTES`, `NEON_STORAGE_LIMIT_BYTES`로 제공한 경우에만 사용률·남은 등록 횟수를 계산한다. 설정하지 않으면 공급자 사용량 자체는 계속 보이되 한도와 안전 상태를 추정하지 않는다. 따라서 오래된 무료 요금제 숫자를 현재 한도처럼 표시하지 않는다.
