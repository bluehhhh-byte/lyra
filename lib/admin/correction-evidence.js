import crypto from "node:crypto";

export const normalizeEvidenceUrl = (value) => String(value || "").trim();

export function correctionEvidenceState(item = {}) {
  const sourceUrl = normalizeEvidenceUrl(item.sourceUrl);
  if (!sourceUrl) return "missing";
  try {
    const parsed = new URL(sourceUrl);
    return ["http:", "https:"].includes(parsed.protocol) && parsed.hostname ? "documented" : "invalid";
  } catch {
    return "invalid";
  }
}

export function correctionEvidenceId(item = {}, index = -1) {
  const identity = [
    index,
    item.slug,
    item.type,
    item.field,
    item.lineIndex,
    item.beforeHash,
    item.afterHash,
    item.reviewedAt,
  ].map((value) => String(value ?? "")).join("\u0000");
  return crypto.createHash("sha1").update(identity).digest("hex").slice(0, 16);
}

export function correctionEvidenceSummary(items = []) {
  const summary = { total: items.length, documented: 0, missing: 0, invalid: 0 };
  for (const item of items) summary[correctionEvidenceState(item)]++;
  return summary;
}

export function correctionEvidenceRows(items = []) {
  return items.map((item, index) => ({
    ...item,
    evidenceId: correctionEvidenceId(item, index),
    evidenceState: correctionEvidenceState(item),
  }));
}
