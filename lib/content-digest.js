import crypto from "node:crypto";

export const normalizeStoredContent = (raw) => String(raw ?? "").replace(/\r\n?/g, "\n");
export const contentDigest = (raw) => crypto.createHash("sha256").update(normalizeStoredContent(raw)).digest("hex");
export const sameStoredContent = (left, right) => contentDigest(left) === contentDigest(right);
