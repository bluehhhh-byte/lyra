// 외부 카탈로그(iTunes·Deezer·MusicBrainz) 매칭 규칙 — 백필 공용.
// 원칙: artist와 title이 '둘 다' 일치해야 한다. live/remix/remaster 같은
// 버전 접미사는 우리 제목에 그 표기가 있을 때만 허용 — 아티스트만 맞고
// 제목이 다른 결과는 다른 곡이다.
import { normText } from "./itunes.js";

const VERSION_WORDS = /\b(live|remix|remaster(ed)?|acoustic|demo|edit|version|ver\.?|inst(rumental)?|mono|stereo|deluxe)\b|\(cut\b/i;

export const artistMatches = (a, b) => {
  const na = normText(a), nb = normText(b);
  return !!na && !!nb && (na.includes(nb) || nb.includes(na));
};

// exact | acceptable_version | reject
export function titleMatch(candidate, target) {
  const nc = normText(candidate), nt = normText(target);
  if (!nc || !nt) return "reject";
  if (nc === nt) return "exact";
  // 후보가 우리 제목 + 부가 표기: 버전 어휘면 우리 제목에도 있을 때만 허용
  if (nc.startsWith(nt) || nc.includes(nt)) {
    const extra = nc.replace(nt, " ");
    if (VERSION_WORDS.test(extra)) return VERSION_WORDS.test(target) ? "acceptable_version" : "reject";
    // 괄호 소제목 등 버전 어휘가 아닌 부가 표기는 허용 (「」, feat 등)
    return "acceptable_version";
  }
  if (nt.includes(nc) && nc.length >= 4) return "acceptable_version"; // 우리 쪽에 부제가 붙은 경우
  return "reject";
}

// 후보 목록 → { hit, status } — 명확한 1건만 채택, 비슷한 복수 후보는 ambiguous
export function pickTrack(candidates, { title, artist }) {
  const ok = candidates.filter((c) => artistMatches(c.artist, artist) && titleMatch(c.title, title) !== "reject");
  if (!ok.length) return { hit: null, status: "unavailable" };
  const exact = ok.filter((c) => titleMatch(c.title, title) === "exact");
  if (exact.length) return { hit: exact[0], status: "exact" };
  if (ok.length === 1) return { hit: ok[0], status: "acceptable_version" };
  // 서로 다른 제목의 acceptable 후보가 여럿 — 자동 선택하지 않는다
  const uniq = new Set(ok.map((c) => normText(c.title)));
  return uniq.size === 1 ? { hit: ok[0], status: "acceptable_version" } : { hit: null, status: "ambiguous" };
}
