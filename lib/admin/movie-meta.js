// 영화 줄거리 정돈 + 코멘트 생성 — 영화 도메인 전용.
// 예전엔 줄거리·코멘트를 따로 두 번 호출했다. 무료 티어 RPM(분당 ~10회)에서
// 호출 수가 곧 병목이라 JSON 한 번으로 합쳤다 — 영화당 Gemini 사용량 절반.
import { geminiText } from "./gemini.js";

function ratingGuide(rating) {
  const ratingNum = Number(rating);
  return Number.isFinite(ratingNum) && ratingNum >= 3
    ? `사용자 별점은 ${ratingNum.toFixed(1)}/5다. 작품의 기존 평가와 반응을 참고하되, 코멘트는 좋은 점·강점·인상적인 성취를 중심으로 쓸 것.`
    : Number.isFinite(ratingNum) && ratingNum > 0 && ratingNum <= 2.5
      ? `사용자 별점은 ${ratingNum.toFixed(1)}/5다. 작품의 기존 평가와 반응을 참고하되, 코멘트는 아쉬운 점·한계·비판받는 지점을 중심으로 쓸 것.`
      : "사용자 별점은 아직 없다. 작품의 기존 평가와 반응을 참고하되, 장단점을 과장 없이 균형 있게 쓸 것.";
}

const clean = (s) =>
  String(s || "")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/^["']|["']$/g, "")
    .trim();

// 줄거리 정돈 + 감상 코멘트를 한 번의 JSON 호출로. 반환: { synopsis, comment }
// synopsis는 원문이 없거나 정돈 실패면 "" — 호출부가 원문을 유지한다.
export async function movieMetaGen({ key, title, director, mediaType, rating, synopsis = "", tmdbRating = "", tmdbVotes = "" }) {
  const kind = mediaType === "tv" ? "드라마" : "영화";
  const publicRating =
    tmdbRating && Number(tmdbVotes) > 0
      ? `TMDB 공개 평점은 ${Number(tmdbRating).toFixed(1)}/10 (${tmdbVotes}표)다.`
      : "";
  const raw = await geminiText(
    key,
    `${kind} "${title}"${director ? ` (연출/감독 ${director})` : ""}에 대해 JSON으로 두 가지를 만들어라.
1) "synopsis": 아래 원문 줄거리를 바탕으로 정돈한 줄거리. 맞춤법·어색한 번역투를 다듬고 핵심만 2~4문장의 깔끔한 한국어 평서문으로. 과한 스포일러 금지. 원문이 없으면 빈 문자열.
2) "comment": 개인 감상 코멘트 한국어 1~2문장. ${publicRating} ${ratingGuide(rating)} 작품의 주제·연출·인상을 담아서. 반드시 평서문 '~다'체로 끝맺을 것. "~습니다/~해요" 금지. 담백한 톤.
원문 줄거리:
${synopsis.slice(0, 1500) || "(없음)"}
{"synopsis":"...","comment":"..."} 형식의 순수 JSON만 출력.`,
    true
  );
  try {
    const out = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, "").trim());
    return { synopsis: clean(out.synopsis), comment: clean(out.comment) };
  } catch {
    return { synopsis: "", comment: "" };
  }
}
