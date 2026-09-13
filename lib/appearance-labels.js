// 작품 사용 정보의 공용 라벨 — 서버(song-appearances.js)와 클라이언트(caption.js)
// 이 모두 쓴다. 이 파일은 어떤 것도 import하지 않는다 — fs가 섞이면 클라이언트
// 번들이 깨진다.
export const WORK_TYPES = Object.freeze({
  movie: "영화",
  drama: "드라마",
  anime_movie: "극장판 애니메이션",
  anime_series: "TV 애니메이션",
});

export const APPEARANCE_ROLES = Object.freeze({
  main_theme: "메인 주제가",
  opening: "오프닝",
  ending: "엔딩",
  insert_song: "삽입곡",
  background: "배경음악",
  trailer: "예고편·프로모션",
  character_song: "캐릭터송",
  other: "기타",
});
