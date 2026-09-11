# semantic-wrap (벤더링 사본)

- 출처: https://github.com/woohyun-park/semantic-wrap
- 가져온 버전: **v0.4.0** (태그), 2026-09-11 기준
- 라이선스: Apache-2.0 — `LICENSE`와 `NOTICE`를 원본 그대로 함께 둔다
- 가져온 패키지: `packages/core/src`(전부) + `packages/ko/src`(전부)

## 왜 설치가 아니라 복사인가

`pnpm add`로 넣을 수 없는 상태였다. 셋 다 걸린다.

1. **npm에 없다.** `@semantic-wrap/core`·`/ko` 모두 `404 Not Found`.
   README에 npm 배지가 달려 있지만 아직 배포 전이다.
2. **빌드 산출물이 없다.** 릴리스 5건 모두 첨부 0개이고, 태그·main 어디에도
   `dist`가 없다. `package.json`은 `files: ["dist"]` + `prepack: bun run build`라
   git 설치 경로(`prepare`)로는 아무것도 만들어지지 않는다.
3. **git 설치 자체가 막힌다.** `pnpm add github:...#path:/packages/ko`는
   `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`로 거부된다 — 빌드 스크립트 실행이
   필요한 git 의존성이라 `allowBuilds` 허용이 있어야 하고, 허용해도 (2) 때문에
   bun 기반 모노레포 빌드를 이 저장소에서 돌려야 하며, 그 결과물조차
   `@semantic-wrap/core@^0.4.0`을 npm에서 찾다 실패한다.

저자가 npm에 올리면 이 폴더를 지우고 `pnpm add @semantic-wrap/ko`로 바꾸면 된다.
그때까지는 사본이 유일하게 동작하는 길이다.

## 원본에서 바꾼 것 — 딱 하나

import 지정자의 확장자를 `.js` → `.ts`로 바꿨다(37곳). 그 외 코드는 한 줄도
고치지 않았다.

TypeScript 관례는 "`.js`로 import하고 실제 파일은 `.ts`"인데, 그 재작성은
TS 툴체인이 해 준다. 이 저장소는 **tsconfig도 typescript 의존성도 없는 순수 JS
프로젝트**라 그 재작성을 해 줄 주체가 없다:

- 확장자를 뗀 형태(`./x`)는 webpack은 풀지만 Node는 못 푼다 →
  `node --test`로 도는 이 프로젝트의 테스트에서 import 불가
- `.js`를 그대로 두면 webpack이 `Module not found: ./ko-models.js`로 실패
- `.ts` 명시는 **양쪽 다** 푼다 → 이것을 택했다

덕분에 `typescript` 의존성을 추가하지 않고도 Next가 그대로 컴파일한다
(`pnpm build` 통과 확인). 무료티어 지시서의 "외부 npm 의존성 추가 금지"를
지킨다.

## 쓰는 법

핵심 API는 폭 측정 함수를 주입받는 순수 함수다. DOM 전용이 아니라
**캔버스에서도 쓸 수 있다** — 캐러셀 카드가 바로 그 경우다.

```js
import { koTitleModel } from "./vendor/semantic-wrap/ko.ts";
import { selectLineBreaks } from "./vendor/semantic-wrap/index.ts";

const { lines } = selectLineBreaks({
  text: "이 순간을 기념품처럼 챙기고 싶은 밤",
  model: koTitleModel,
  maxWidth: 11,              // measureText와 같은 단위
  measureText: (s) => /* 폭 */,
});
// → ["이 순간을 기념품처럼", "챙기고 싶은 밤"]
```

## 갱신 절차

1. 원본 태그를 확인하고 `packages/core/src`·`packages/ko/src`를 다시 내려받는다
2. import 확장자 `.js` → `.ts` 재작성 (위 이유)
3. `LICENSE`·`NOTICE`를 함께 갱신하고 이 문서의 버전·날짜를 고친다
4. `pnpm build`와 `pnpm test`를 돌린다
