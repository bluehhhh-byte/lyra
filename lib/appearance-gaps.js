// 작품 사용 정보에서 무엇을 '결손'으로 볼지 — 한 곳에서만 판정한다.
//
// 화면(app/admin/appearance-gaps.js)·자동 채움·붙여넣기 적용이 같은 규칙을
// 봐야 "메웠는데 아직 결손"이라는 말이 안 나온다. lib/admin/needs.js가 곡에
// 대해 하는 일을 작품 연결에 대해 하는 자리다.
//
// 이 파일은 아무것도 import하지 않는다 — API 라우트가 쓰는 next/cache가 딸려
// 오면 테스트에서 부를 수 없다.
export const APPEARANCE_GAP_LABELS = Object.freeze({
  director: "감독",
  year: "연도",
  status: "공개 상태",
});

// 근거 주소는 결손이 아니다. 조사를 AI가 먼저 하게 되면서 주소로 남지 않는
// 출처가 많아졌고(검색 결과, 크레딧 화면), 그걸 결손으로 세면 영영 0이 되지
// 않는 목록이 된다. 주소가 있으면 형식만 본다 — 저장 쪽 몫이다.
export function gapsOf(item) {
  const missing = [];
  // 캡션의 `& 감독, 영화 <작품> 엔딩 (연도) |` 한 줄이 이 셋으로 만들어진다.
  // 한글 표기가 원칙이지만 원문만 있어도 그 줄은 만들어진다.
  if (!item?.director_ko && !item?.director) missing.push("director");
  if (!item?.year) missing.push("year");
  if (item?.status !== "verified") missing.push("status");
  return missing.length ? missing : null;
}
