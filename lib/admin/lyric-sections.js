// 가사에 구간 표시를 넣는 일만 한다. 원문·번역·독음은 한 글자도 바꾸지 않는다.
//
// 곡이 등록될 때마다 20줄 넘는 가사가 한 덩어리로 들어오는 일이 반복된다.
// 그때마다 사람이 손으로 `[Chorus]`를 끼워 넣으면 줄을 지우거나 순서를 흐트러뜨릴
// 여지가 생긴다 — 여기서는 삽입 결과를 원문 줄과 대조해 다르면 아예 거절한다.

// 본문 한 줄의 역할. 구간 경계가 될 수 있는 것은 원문 줄뿐이다.
export const isTranslationLine = (line) => line.startsWith("> ") || /^>\^\d+\s/.test(line);
export const isReadingLine = (line) => line.startsWith("+ ");
export const isCommentLine = (line) => line.startsWith("// ") || line.startsWith("🗨") || line.startsWith("✏");
export const isSectionLine = (line) => /^\[[^\]]+\]\s*$/.test(line);
export const isOriginalLine = (line) =>
  line.trim() !== "" && !isTranslationLine(line) && !isReadingLine(line) && !isCommentLine(line) && !isSectionLine(line);

// 화면에 번호와 함께 보여줄 원문 줄. 번호는 마킹에 쓰는 좌표이므로
// 저장된 본문에서 원문 줄만 세는 방식과 정확히 같아야 한다.
export function originalLines(body) {
  const out = [];
  let section = "";
  for (const line of String(body || "").split("\n")) {
    if (isSectionLine(line)) { section = line.trim().slice(1, -1); continue; }
    if (!isOriginalLine(line)) continue;
    out.push({ at: out.length, text: line, section });
    section = "";
  }
  return out;
}

const cleanLabel = (value) => String(value ?? "").replace(/[\[\]\n\r]/g, "").trim().slice(0, 40);

// marks: [{ at, section }] — at 번째 원문 줄 바로 앞에 [section] 을 넣는다.
// 빈 section 은 그 자리의 기존 구간 표시를 없앤다.
export function applySections(body, marks = []) {
  const lines = String(body || "").split("\n");
  const before = lines.filter(isOriginalLine);
  const wanted = new Map();
  for (const mark of marks) {
    const at = Number(mark?.at);
    if (!Number.isInteger(at) || at < 0) throw new Error("구간 위치가 올바르지 않습니다.");
    if (at >= before.length) throw new Error(`구간 위치 ${at}는 원문 ${before.length}줄을 넘습니다.`);
    wanted.set(at, cleanLabel(mark?.section));
  }

  const out = [];
  let n = 0;
  for (const line of lines) {
    // 기존 구간 표시는 일단 걷어낸다 — 어디에 둘지는 marks 가 정한다.
    if (isSectionLine(line)) continue;
    if (isOriginalLine(line)) {
      const label = wanted.get(n);
      if (label) {
        if (out.length && out.at(-1).trim() !== "") out.push("");
        out.push(`[${label}]`);
      }
      n += 1;
    }
    out.push(line);
  }

  const after = out.filter(isOriginalLine);
  if (before.length !== after.length || before.some((line, i) => line !== after[i]))
    throw new Error("원문 줄이 바뀌어 저장을 중단했습니다.");

  return out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "");
}
