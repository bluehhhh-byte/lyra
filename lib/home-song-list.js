import { parseEmotion } from "./keywords.js";

// 홈 "더 보기" 한 번이 가져오는 곡 수 — 수백 곡 한 방 응답이 콜드 경로에서
// 간헐 실패해 에러 바운더리를 띄운 사고 이후, 페이지 단위로 잘라 내보낸다.
export const HOME_PAGE_SIZE = 80;

const COUNTRY = { ko: "한국", ja: "일본", en: "영미" };
const COUNTRY_TAGS = ["한국", "일본", "영미", "유럽", "아시아", "중남미", "중동", "기타"];

// 홈 카드와 지연 로딩 API가 반드시 같은 모양을 내보내게 한다. 원문·번역 본문은
// 목록에 포함하지 않는다.
export function toHomeSong(song) {
  return {
    slug: song.slug,
    title: song.title,
    title_ko: song.title_ko || "",
    artist: song.artist,
    artist_ko: song.artist_ko || "",
    year: song.year || "",
    artwork: song.artwork || "",
    tags: song.tags || [],
    emotion: parseEmotion(song.emotion),
    country: (song.tags || []).find((tag) => COUNTRY_TAGS.includes(tag)) || COUNTRY[song.lang] || "기타",
    decade: song.year ? `${Math.floor(+song.year / 10) * 10}s` : "미상",
    album: song.album || "",
    recorded: song.published || song.date || "",
  };
}
