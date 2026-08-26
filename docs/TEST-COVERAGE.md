# 로직 모듈 테스트 감사

2026-08-27 개선 목록의 직접 테스트 파일이 없던 12개 모듈을 다시 분류했다.

| 모듈 | 판단 |
| --- | --- |
| `diary` | 날짜 그룹·빈 감정·집계 분기를 새 `node:test`로 검증 |
| `home-song-list` | 목록 투영, 국가 우선순위, 연대, 본문 제외를 새 테스트로 검증 |
| `tmdb` | fetch를 대체해 검색 필터와 영화 상세 정규화를 새 테스트로 검증 |
| `music-taste-core`, `taste-core` | 기존 `music-taste.test.mjs`, `taste.test.mjs`가 주요 분기를 직접 검증 |
| `static-details` | 기존 `detail-isr.test.mjs`가 제한·정렬·라우트 연결을 검증 |
| `usage-metrics-core` | 기존 `usage-metrics`, `usage-gate`, `usage-paths`, `neon-usage` 테스트가 직접 검증 |
| `moments` | 저장소 I/O 래퍼다. 순수 정규화 로직은 `moments-core.test.mjs`에서 검증하며 DB 통합은 H-03에서 다룬다. |
| `search-index` | 캐시/파일 I/O 조정자다. 순수 크기 판정은 `search-index-size.test.mjs`, 검색 결과 계약은 검색 테스트군에서 검증한다. |
| `usage-metrics-db` | SQL I/O 어댑터다. 게이트·정규화는 단위 테스트로 고정했고 DB 장애 통합은 H-03 범위에 둔다. |
| `site`, `tmdb-link` | 각각 환경변수 기본값과 한 줄 URL 상수라 분기 로직이 없어 별도 테스트를 추가하지 않았다. |

테스트 프레임워크나 새 런타임 의존성은 추가하지 않았다.
