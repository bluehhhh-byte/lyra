import assert from "node:assert/strict";
import { applySections, originalLines } from "./admin/lyric-sections.js";

const body = [
  "첫 줄이다",
  "+ 첫 줄 독음",
  "> first line",
  "둘째 줄이다",
  "> second line",
  "셋째 줄이다",
  "> third line",
].join("\n");

// 번호는 원문 줄만 센다 — 번역·독음은 좌표에 끼어들지 않는다
{
  const lines = originalLines(body);
  assert.deepEqual(lines.map((l) => l.at), [0, 1, 2]);
  assert.deepEqual(lines.map((l) => l.text), ["첫 줄이다", "둘째 줄이다", "셋째 줄이다"]);
  assert.deepEqual(lines.map((l) => l.section), ["", "", ""]);
}

// 구간을 넣어도 원문·번역·독음은 자리와 순서를 지킨다
{
  const out = applySections(body, [{ at: 0, section: "Verse 1" }, { at: 2, section: "Chorus" }]);
  assert.match(out, /^\[Verse 1\]\n첫 줄이다\n\+ 첫 줄 독음\n> first line\n/);
  assert.ok(out.includes("\n[Chorus]\n셋째 줄이다"), out);
  const kept = out.split("\n").filter((l) => !/^\[/.test(l) && l.trim());
  assert.deepEqual(kept, body.split("\n"), "원문·번역·독음이 그대로 남는다");
}

// 이미 붙은 구간은 걷어내고 marks 가 정한 자리에만 다시 놓는다
{
  const marked = applySections(body, [{ at: 0, section: "Verse 1" }]);
  const moved = applySections(marked, [{ at: 1, section: "Chorus" }]);
  assert.ok(!moved.includes("[Verse 1]"), "지정하지 않은 구간은 남지 않는다");
  assert.ok(moved.includes("[Chorus]\n둘째 줄이다"));
}

// 빈 라벨은 그 자리의 구간을 지운다
{
  const marked = applySections(body, [{ at: 0, section: "Verse 1" }]);
  assert.ok(!applySections(marked, [{ at: 0, section: "" }]).includes("["));
}

// 좌표가 원문 줄 수를 넘으면 저장하지 않는다 — 조용히 어긋나느니 거절한다
{
  assert.throws(() => applySections(body, [{ at: 9, section: "Chorus" }]), /넘습니다/);
  assert.throws(() => applySections(body, [{ at: -1, section: "Chorus" }]), /올바르지 않습니다/);
}

// 대괄호·줄바꿈이 라벨에 섞여 들어와도 구간 문법이 깨지지 않는다
{
  const out = applySections(body, [{ at: 0, section: "[Cho\nrus]" }]);
  assert.ok(out.startsWith("[Chorus]\n"), out.slice(0, 20));
}

// 구간을 두 번 넣어도 결과가 같다 — 되풀이해도 본문이 부풀지 않는다
{
  const marks = [{ at: 0, section: "Verse 1" }, { at: 2, section: "Chorus" }];
  assert.equal(applySections(applySections(body, marks), marks), applySections(body, marks));
}

console.log("✓ 가사 구간 — 원문 보존·좌표 검증");
