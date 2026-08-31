import assert from "node:assert/strict";
import { motifCategoryTextTone, motifCategoryTone, motifYearTone } from "./motif-vocabulary-colors.js";

assert.equal(motifCategoryTone("풍경"), motifCategoryTone("풍경"), "같은 이미지의 결은 항상 같은 색이다");
assert.notEqual(motifCategoryTone("풍경"), motifCategoryTone("감정과 관계"), "서로 다른 이미지의 결은 구분된다");
assert.match(motifCategoryTextTone("풍경"), /text-sky/, "워드클라우드도 이미지의 결 색상을 공유한다");
assert.equal(motifYearTone("2020"), motifYearTone(2020), "같은 연도는 문자열·숫자 형식과 무관하게 같은 색이다");
assert.notEqual(motifYearTone(2020), motifYearTone(2021), "인접한 연도는 서로 다른 색이다");
assert.equal(motifYearTone("연도 미상"), "border-line bg-surface text-muted", "연도 미상은 중립색을 쓴다");
console.log("✓ 가사 모티프 이미지 결·연도 색상을 결정적으로 매핑");
