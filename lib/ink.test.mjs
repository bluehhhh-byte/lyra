import assert from "node:assert/strict";
import test from "node:test";
import { audioFeatures, composition, hashSlug, strokePoints } from "./ink.js";

test("slug와 메타가 같은 구도는 결정론적이다", () => {
  const seed = hashSlug("the-smile-friend-of-a-friend");
  const meta = { genre: "Alternative Rock", tags: ["영미", "Alternative Rock"], emotion: "불안" };
  assert.deepEqual(composition(seed, meta), composition(seed, meta));
  assert.notDeepEqual(composition(seed, meta), composition(hashSlug("another-song"), meta));
});

test("장르 에너지가 구도 밀도와 팔레트를 편향한다", () => {
  const seed = hashSlug("same-song");
  const calm = composition(seed, { genre: "Folk", emotion: "고요" });
  const intense = composition(seed, { genre: "Heavy Metal", emotion: "격정" });
  assert.ok(intense.energy > calm.energy);
  assert.ok(intense.strokes.length > calm.strokes.length);
  assert.ok(intense.palette.includes("accent"));
  assert.ok(!calm.palette.includes("accent"));
  assert.equal(intense.strokes.filter((stroke) => stroke.kind === "ruler").length <= 1, true);
  assert.ok(intense.strokes.some((stroke) => stroke.kind === "circle"));
  assert.ok(intense.strokes.some((stroke) => stroke.kind === "dot"));
});

test("스트로크 progress는 0과 1 경계를 지킨다", () => {
  const plan = composition(hashSlug("progress"), { genre: "Jazz" });
  for (const stroke of plan.strokes) {
    assert.deepEqual(strokePoints(stroke, plan.noiseSeed, -1), []);
    const full = strokePoints(stroke, plan.noiseSeed, 2);
    assert.ok(full.length >= 1);
    for (const point of full) {
      assert.ok(Number.isFinite(point.x));
      assert.ok(Number.isFinite(point.y));
    }
  }
});

test("오디오 특징은 정규화되고 양의 스펙트럼 변화만 flux로 잡는다", () => {
  const quiet = audioFeatures(new Uint8Array(64));
  assert.deepEqual({ ...quiet }, { bass: 0, mid: 0, treble: 0, rms: 0, flux: 0 });
  const steady = audioFeatures(Uint8Array.from({ length: 64 }, () => 32), quiet);
  const same = audioFeatures(Uint8Array.from({ length: 64 }, () => 32), steady);
  const onset = audioFeatures(Uint8Array.from({ length: 64 }, () => 240), same);
  assert.equal(same.flux, 0);
  assert.ok(onset.flux > 0.7);
  for (const value of Object.values(onset)) assert.ok(value >= 0 && value <= 1);
});
