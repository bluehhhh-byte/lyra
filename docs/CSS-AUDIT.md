# 전역 CSS 사용 감사

2026-08-27 `node scripts/audit-css.mjs --check`로 `app/globals.css`의 프로젝트 전용 규칙을 JSX/JS 참조와 대조했다.

- 사용자 클래스 6개: `card-in`, `hero-ambient`, `lyric-line`, `orbit-segment`, `reveal`, `spot`
- keyframes 3개: `rise-in`, `ambient-drift`, `orbit-draw`
- 미사용 클래스 0개, 미사용 keyframes 0개
- `::view-transition-old/new`는 `theme-toggle.js`의 `document.startViewTransition`과 Web Animations pseudoElement가 사용한다.
- 전역 `:focus-visible`, 밝은 테마 변수, 모바일 16px 입력 규칙은 각각 접근성·테마·iOS 확대 방지의 전역 계약이므로 JSX 문자열 검색만으로 제거할 수 없는 활성 규칙이다.

따라서 제거한 규칙은 0개다. 이름만 검색해 전역 동작 규칙을 지우지 않았고, 앞으로 프로젝트 전용 클래스나 keyframes가 고아가 되면 검사가 실패해 정확한 이름을 보고한다.
