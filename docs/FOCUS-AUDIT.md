# 키보드 포커스 감사

2026-08-27 `node scripts/audit-focus.mjs`로 `app/`의 JSX와 전역 CSS를 대조했다.

- 네이티브 대화형 태그(a/button/input/select/textarea/summary)는 스크립트 출력 기준으로 전부 전역 `:focus-visible`의 2px accent outline을 받는다.
- `outline-none` 유틸리티가 있는 입력도 Tailwind import 뒤에 선언된 전역 규칙이 덮어쓰며, 전역 규칙 뒤에 outline을 다시 없애는 CSS는 0곳이다.
- 기존 미리듣기 진행 막대는 클릭 가능한 `div`였으나 slider 역할·탭 진입·좌우 화살표 5초 이동·현재값을 추가했다. 카드 모달의 배경 클릭은 닫기 버튼을 보조하는 동작이며 dialog/document 역할로 구분했다.
- 역할 없이 `div`, `span`, `li`, `img`에 직접 `onClick`을 붙인 비의미 클릭 요소는 0곳이다.
- 비활성화된 컨트롤은 탭 순서에서 빠지는 네이티브 동작을 그대로 쓴다.

누락된 요소가 없어 시각 스타일을 중복 추가하지 않았다. 새 비의미 클릭 요소나 전역 outline 제거가 들어오면 감사 스크립트가 실패한다.
