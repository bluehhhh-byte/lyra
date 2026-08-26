const channel = (value) => {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
};

export function relativeLuminance(hex) {
  const value = String(hex).replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(value)) throw new Error(`6자리 hex 색상이 아닙니다: ${hex}`);
  const [r, g, b] = value.match(/../g).map((pair) => channel(Number.parseInt(pair, 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(first, second) {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}
