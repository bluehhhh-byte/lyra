# 제3자 코드·자산 귀속

이 저장소가 직접 쓰지 않은 것과 그 출처, 그리고 사용 조건을 적는다.
조건이 확인되지 않은 항목은 그렇다고 적는다 — 없는 허락을 있는 것처럼 쓰지 않는다.

## 드로잉 엔진 `lib/fable/`

- **출처**: https://www.kengoworks.com/fable — Kevin T. Ngo(@kevin_t_ngo)가 공개한 생성 미술 페이지.
  페이지 설명은 "I asked Fable 5 to make its own personal website"다.
- **무엇을 가져왔나**: 타일 드로잉 엔진의 구조와 원시 도형 함수(`chaikin` `fbm` `hatchFill`
  `enso` `fern` `drip` `blob` 등 41개 이름이 겹친다)와 팔레트(RGB 20색 중 18색 동일).
  2026-08-30~31에 `lib/fable/core.js` `primitives.js` `wall.js`로 옮기며 모듈로 나누고
  Lyra의 테마·오디오 반응 계층에 맞게 고쳤다. 원본과 글자까지 같은 줄은 없지만
  **파생물이다.**
- **라이선스**: 2026-08-31 확인 시점에 원본 페이지와 스크립트 어디에도 라이선스·저작권
  표기·재사용 조건이 **없다.** 명시된 허락이 없으면 기본은 모든 권리 보유다.
- **상태**: **허락 미확보.** 저작자에게 사용 허락을 요청하기 전까지 이 항목은 미해결이다.
  요청 후 답을 받으면 여기에 날짜와 답변 요지를 적는다. 거절이면 `lib/fable/`을
  독자 구현으로 대체한다.
- 이 사이트는 개인 1인용이고 비상업·비색인(`app/robots.js`)이지만, 그것이 허락을 대신하지는 않는다.

## 글꼴 Pretendard

- **출처**: https://github.com/orioncactus/pretendard (길형진) — `app/globals.css`에서
  jsdelivr CDN의 dynamic-subset 빌드를 불러온다. 저장소에 파일을 두지 않는다.
- **라이선스**: SIL Open Font License 1.1.

## 외부 API·자료

- 앨범 커버와 30초 미리듣기: Apple iTunes Search API, Deezer — 저장하지 않고 원본 주소에서 재생.
- 영화 메타데이터·포스터: TMDB API.
- 가사 원문: 저작권은 원저작자에게 있다. 번역과 코멘트는 개인 감상이다.
  (모든 페이지 하단 고지와 같은 내용)
