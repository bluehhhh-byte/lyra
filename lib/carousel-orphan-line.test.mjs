import assert from "node:assert/strict";
import { wrap, wrapTight } from "./carousel-wrap.js";

// 글자 폭을 크기에 비례하는 고정값으로 흉내낸 ctx — 실제 폰트 없이 줄바꿈만 본다.
const fakeCtx = () => ({
  font: "",
  get size() {
    return Number(this.font.match(/(\d+)px/)?.[1] || 0);
  },
  measureText(text) {
    return { width: [...text].length * this.size };
  },
});

const serif = (s) => `600 ${s}px serif`;

// 한두 글자만 넘쳐 다음 줄로 밀리는 경우 — 그 줄만 줄여 한 줄로 붙인다
{
  const ctx = fakeCtx();
  const text = "열두글자짜리인문장이야"; // 11자
  const maxW = 10 * 40; // 40px에서 10자까지

  ctx.font = serif(40);
  assert.equal(wrap(ctx, text, maxW).length, 2, "그냥 접으면 두 줄이 된다");
  assert.equal([...wrap(ctx, text, maxW).at(-1)].length, 1, "마지막 줄에 한 글자만 남는다");

  ctx.font = serif(40);
  const tight = wrapTight(ctx, text, maxW, { font: serif, size: 40 });
  assert.equal(tight.lines.length, 1, "한 줄로 붙는다");
  assert.ok(tight.size < 40 && tight.size >= 36, `줄인 크기가 과하지 않다 (${tight.size})`);
  assert.equal(tight.lines[0], text, "글자는 그대로다");
}

// 마지막 줄이 넉넉히 차 있으면 손대지 않는다 — 고아 줄이 아니라 정상적인 줄바꿈이다
{
  const ctx = fakeCtx();
  const text = "스무글자로꽉채운문장이라마지막줄도가득참"; // 20자 = 10 + 10
  ctx.font = serif(40);
  const tight = wrapTight(ctx, text, 10 * 40, { font: serif, size: 40 });
  assert.equal(tight.lines.length, 2, "그대로 두 줄");
  assert.equal([...tight.lines.at(-1)].length, 10, "마지막 줄이 가득 차 있다");
  assert.equal(tight.size, 40, "크기를 건드리지 않는다");
}

// 세 줄로 접히면서 마지막에 두 글자만 남는 것도 고아 줄이다 — 줄여서 한 줄을 없앤다
{
  const ctx = fakeCtx();
  const text = "이문장은한줄에절대들어가지않을만큼충분히길다"; // 22자
  ctx.font = serif(40);
  assert.equal(wrap(ctx, text, 10 * 40).length, 3, "그냥 접으면 세 줄");

  ctx.font = serif(40);
  const tight = wrapTight(ctx, text, 10 * 40, { font: serif, size: 40 });
  assert.equal(tight.lines.length, 2, "한 줄 줄어든다");
  assert.ok(tight.size < 40 && tight.size >= 36, `줄인 크기가 과하지 않다 (${tight.size})`);
}

// 이미 한 줄이면 아무것도 하지 않는다
{
  const ctx = fakeCtx();
  ctx.font = serif(40);
  const tight = wrapTight(ctx, "짧은문장", 10 * 40, { font: serif, size: 40 });
  assert.deepEqual(tight, { lines: ["짧은문장"], size: 40 });
}

// 판단이 끝나면 ctx.font 는 원래 크기로 돌아와야 한다 — 다음 줄이 그 폰트로 재어진다
{
  const ctx = fakeCtx();
  ctx.font = serif(40);
  wrapTight(ctx, "열두글자짜리인문장이야", 10 * 40, { font: serif, size: 40 });
  assert.equal(ctx.size, 40, "호출 뒤 폰트가 복원된다");
}

console.log("✓ 캐러셀 — 한두 글자 때문에 줄이 늘어나지 않는다");
