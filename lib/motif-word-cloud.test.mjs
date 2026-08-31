import assert from "node:assert/strict";
import fs from "node:fs";
import { motifWordCloud } from "./motif-word-cloud.js";

const rows = [
  { word: "밤", count: 200, category: "풍경" },
  { word: "기억", count: 80, category: "시간과 기억" },
  { word: "벼랑", count: 10, category: "풍경" },
];
const cloud = motifWordCloud(rows);
assert.equal(cloud.length, rows.length, "모든 표 어휘를 빠짐없이 시각화한다");
assert.ok(cloud.find((row) => row.word === "밤").fontSize > cloud.find((row) => row.word === "기억").fontSize, "빈도가 높을수록 크게 표시한다");
assert.ok(cloud.find((row) => row.word === "기억").fontSize > cloud.find((row) => row.word === "벼랑").fontSize, "중간 빈도도 순서를 보존한다");
assert.deepEqual(motifWordCloud(rows), cloud, "배치와 크기는 다시 계산해도 동일하다");

const page = fs.readFileSync(new URL("../app/songs/motifs/page.js", import.meta.url), "utf8");
assert.match(page, /lyricVocabulary\(allSongs, \{ limit: 100 \}\)/, "표와 구름은 상위 100개를 사용한다");
assert.ok(page.indexOf("word-cloud-title") < page.indexOf("overflow-x-auto"), "워드클라우드를 표 위에 배치한다");

const store = fs.readFileSync(new URL("./store.js", import.meta.url), "utf8");
assert.match(store, /revalidatePath\("\/songs\/motifs"\)/, "곡 저장 후 모티프 페이지를 즉시 갱신한다");
console.log("✓ 가사 모티프 워드클라우드 크기·배치를 결정적으로 계산");
