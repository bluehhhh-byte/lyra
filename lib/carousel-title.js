const TITLE_SIZES = [52, 48, 44, 40, 36, 34, 32];

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

// 괄호 속 feat./부제는 가능한 한 한 토큰으로 유지한다. 그래야 제목 본문 뒤에서
// 잘리는 대신 다음 줄로 통째로 내려갈 수 있다.
export function titleTokens(value) {
  return clean(value).match(/\([^)]*\)|\[[^\]]*\]|\S+/g) || [];
}

function splitWideToken(token, measure, maxWidth) {
  const lines = [];
  let line = "";
  for (const char of token) {
    if (line && measure(line + char) > maxWidth) {
      lines.push(line);
      line = char;
    } else {
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function wrapTitle(value, measure, maxWidth) {
  const lines = [];
  let line = "";
  for (const token of titleTokens(value)) {
    const next = line ? `${line} ${token}` : token;
    if (measure(next) <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    if (measure(token) <= maxWidth) {
      line = token;
      continue;
    }
    const pieces = splitWideToken(token, measure, maxWidth);
    lines.push(...pieces.slice(0, -1));
    line = pieces.at(-1) || "";
  }
  if (line) lines.push(line);
  return lines;
}

function ellipsize(value, measure, maxWidth) {
  const suffix = "…";
  let text = clean(value);
  while (text && measure(text + suffix) > maxWidth) text = text.slice(0, -1).trimEnd();
  return `${text}${suffix}`;
}

export function layoutCarouselTitle(value, measureAtSize, maxWidth, maxLines = 3) {
  const text = clean(value) || "제목 없음";
  for (const fontSize of TITLE_SIZES) {
    const measure = (line) => measureAtSize(line, fontSize);
    const lines = wrapTitle(text, measure, maxWidth);
    // 큰 글자는 두 줄까지, 40px부터는 세 줄을 허용한다. 세 줄을 쓸 수 있는데
    // 무조건 32px까지 줄여 버리는 것보다 피드 썸네일에서 훨씬 잘 읽힌다.
    const preferredLines = fontSize >= 44 ? 2 : maxLines;
    if (lines.length <= preferredLines) {
      return { lines, fontSize, lineHeight: fontSize + 8, truncated: false };
    }
  }

  const fontSize = TITLE_SIZES.at(-1);
  const measure = (line) => measureAtSize(line, fontSize);
  const wrapped = wrapTitle(text, measure, maxWidth);
  const lines = wrapped.slice(0, maxLines);
  lines[maxLines - 1] = ellipsize(wrapped.slice(maxLines - 1).join(" "), measure, maxWidth);
  return { lines, fontSize, lineHeight: fontSize + 8, truncated: true };
}
