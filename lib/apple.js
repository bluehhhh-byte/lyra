// Apple Music 링크 — 곡마다 하나씩 반드시 나오게 한다.
//
// 커버·미리듣기를 스토어에서 가져다 쓰는 이상 그 곡의 스토어 페이지로 가는 길은
// 있어야 한다. trackId가 있으면 그 곡으로 바로 가고, 없으면 검색 결과로 보낸다.
// (iTunes 매칭이 안 된 곡이 아직 많아 정확 링크만으로는 절반이 빈다.)
const STORE = "kr";

// 저장된 링크는 검색한 스토어를 그대로 달고 온다(us·jp 등). 한국 계정으로 열면
// 그 스토어에서는 못 여는 페이지라 "콘텐츠를 사용할 수 없습니다"가 뜬다.
// 곡 id는 스토어와 무관하므로 앞의 나라 코드만 우리 스토어로 바꿔 준다.
const toStore = (u) => u.replace(/(music\.apple\.com)\/[a-z]{2}\//, `$1/${STORE}/`);

export function appleUrl(song) {
  const ext = String(song?.external_url || "");
  if (ext.includes("music.apple.com")) return toStore(ext);
  const id = String(song?.trackId || "").trim();
  if (/^\d+$/.test(id)) return `https://music.apple.com/${STORE}/song/${id}`;
  const term = [song?.title, song?.artist].filter(Boolean).join(" ");
  return `https://music.apple.com/${STORE}/search?term=${encodeURIComponent(term)}`;
}

// 정확히 그 곡을 가리키는 링크인지 — 화면에서 문구를 달리 쓴다
export const isExactApple = (song) =>
  String(song?.external_url || "").includes("music.apple.com") || /^\d+$/.test(String(song?.trackId || "").trim());
