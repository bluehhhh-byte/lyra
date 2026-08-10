// 영화 코멘트 생성 헬퍼 — 영화 도메인 전용.
import { geminiText } from "./gemini.js";

function ratingGuide(rating) {
  const ratingNum = Number(rating);
  return Number.isFinite(ratingNum) && ratingNum >= 3
    ? `사용자 별점은 ${ratingNum.toFixed(1)}/5다. 작품의 기존 평가와 반응을 참고하되, 코멘트는 좋은 점·강점·인상적인 성취를 중심으로 쓸 것.`
    : Number.isFinite(ratingNum) && ratingNum > 0 && ratingNum <= 2.5
      ? `사용자 별점은 ${ratingNum.toFixed(1)}/5다. 작품의 기존 평가와 반응을 참고하되, 코멘트는 아쉬운 점·한계·비판받는 지점을 중심으로 쓸 것.`
      : "사용자 별점은 아직 없다. 작품의 기존 평가와 반응을 참고하되, 장단점을 과장 없이 균형 있게 쓸 것.";
}

export async function movieComment({ key, title, director, mediaType, rating, synopsis = "", tmdbRating = "", tmdbVotes = "" }) {
  const kind = mediaType === "tv" ? "드라마" : "영화";
  const publicRating =
    tmdbRating && Number(tmdbVotes) > 0
      ? `TMDB 공개 평점은 ${Number(tmdbRating).toFixed(1)}/10 (${tmdbVotes}표)다.`
      : "";
  const synopsisHint = synopsis ? `\n줄거리 참고:\n${synopsis.slice(0, 800)}` : "";
  return (
    await geminiText(
      key,
      `${kind} "${title}"${director ? ` (연출/감독 ${director})` : ""}에 대한 개인 감상 코멘트를 한국어 1~2문장으로 써줘. ${publicRating} ${ratingGuide(rating)} 작품의 주제·연출·인상을 담아서. 반드시 평서문 '~다'체로 끝맺을 것. "~습니다/~해요" 금지. 담백한 톤. 코멘트 문장만 출력.${synopsisHint}`
    )
  )
    .replace(/\s*\n+\s*/g, " ")
    .replace(/^["']|["']$/g, "")
    .trim();
}
