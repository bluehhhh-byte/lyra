import assert from "node:assert/strict";
import test from "node:test";
import {
  PALETTE,
  bbox,
  chaikin,
  fbm,
  hashSeed,
  mul32,
  resample,
  stream,
  valueNoise,
} from "./core.js";

test("동일한 시드는 동일한 난수 스트림을 만든다", () => {
  const first = mul32(hashSeed("radiohead"));
  const second = mul32(hashSeed("radiohead"));
  assert.deepEqual(Array.from({ length: 12 }, () => first()), Array.from({ length: 12 }, () => second()));
  assert.notDeepEqual(Array.from({ length: 3 }, () => stream(7)()), Array.from({ length: 3 }, () => stream(8)()));
});

test("노이즈와 기하 연산은 DOM 없이 결정론적으로 동작한다", () => {
  assert.equal(valueNoise(1.25, 9.4, 31), valueNoise(1.25, 9.4, 31));
  assert.equal(fbm(0.3, 0.7, 91, 4), fbm(0.3, 0.7, 91, 4));
  const sampled = resample([[0, 0], [10, 0], [10, 10]], 2.5);
  assert.deepEqual(sampled, resample([[0, 0], [10, 0], [10, 10]], 2.5));
  assert.deepEqual(bbox(chaikin([[0, 0], [10, 0], [10, 10]], false, 2)), [0, 0, 10, 10]);
});

test("원본 Fable 팔레트 값을 보존한다", () => {
  // VOID 만 원본(24,20,17)보다 어둡다 — violet scratchboard 테마에서 의도적으로 낮춤.
  assert.deepEqual(PALETTE.VOID, [18, 16, 14]);
  assert.deepEqual(PALETTE.CREAM, [246, 241, 228]);
  assert.deepEqual(PALETTE.CLAY, [172, 80, 54]);
  assert.deepEqual(PALETTE.GOLD, [214, 178, 108]);
});
