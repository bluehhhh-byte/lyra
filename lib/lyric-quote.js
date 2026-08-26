export function formatLyricQuote(lines, song, source) {
  const quote = lines.flatMap((line) => [line.en, line.ko]).map((line) => String(line || "").trim()).filter(Boolean).join("\n");
  const credit = [song?.artist, song?.title].filter(Boolean).join(" — ");
  return [quote, credit && `— ${credit}`, source && `출처: ${source}`].filter(Boolean).join("\n\n");
}
