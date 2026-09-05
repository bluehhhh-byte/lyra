// 캔버스 줄바꿈 — 곡 카드와 영화 카드가 함께 쓴다.
// JSX가 없는 모듈로 둔 것은 node에서 그대로 테스트하기 위해서다.

// 단어 단위로 접고, 띄어쓰기 없는 CJK 덩어리는 글자 단위로 내려간다
export function wrap(ctx, text, maxW) {
  const out = [];
  let line = "";
  for (const word of text.split(" ")) {
    const tryLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(tryLine).width <= maxW) {
      line = tryLine;
      continue;
    }
    if (line) out.push(line);
    if (ctx.measureText(word).width <= maxW) {
      line = word;
      continue;
    }
    line = "";
    for (const ch of word) {
      if (ctx.measureText(line + ch).width > maxW) {
        out.push(line);
        line = ch;
      } else line += ch;
    }
  }
  if (line) out.push(line);
  return out;
}

// 한 줄이 한두 글자 때문에 다음 줄로 밀리면, 카드에는 글자 두어 개만 놓인 줄이
// 남아 가사가 끊겨 보인다. 그 정도 넘침이면 줄을 늘리는 대신 그 줄만 조금 줄여
// 붙인다. 많이 넘친 줄은 그대로 접는다 — 억지로 줄이면 다른 줄과 크기가 눈에 띄게
// 어긋난다.
export function wrapTight(ctx, text, maxW, { font, size, orphanMax = 3, minRatio = 0.88 } = {}) {
  const lines = wrap(ctx, text, maxW);
  if (!font || lines.length < 2) return { lines, size };
  if ([...lines.at(-1)].length > orphanMax) return { lines, size };

  const floor = Math.max(1, Math.round(size * minRatio));
  for (let next = size - 1; next >= floor; next--) {
    ctx.font = font(next);
    const tried = wrap(ctx, text, maxW);
    if (tried.length < lines.length) {
      ctx.font = font(size);
      return { lines: tried, size: next };
    }
  }
  ctx.font = font(size);
  return { lines, size };
}
