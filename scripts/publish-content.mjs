import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";
import { CONTENT_DATA_FILES } from "../lib/content-data-files.js";
import { parsePublishTargets } from "../lib/admin/content-publish.js";
import { readContentRow, readDataRow, writeContentRow, writeDataRow } from "../lib/content-db.js";

dotenv.config({ path: ".env.local", override: false, quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL이 없습니다");
const targets = parsePublishTargets(process.argv.slice(2), { dataAllowlist: CONTENT_DATA_FILES });
const digest = (raw) => crypto.createHash("sha256").update(raw).digest("hex");
let changed = 0;

for (const target of targets) {
  const absolute = path.join(process.cwd(), target.relativePath);
  if (!fs.existsSync(absolute)) throw new Error(`파일을 찾을 수 없습니다: ${target.relativePath}`);
  const raw = fs.readFileSync(absolute, "utf8").replace(/\r\n?/g, "\n");
  const before = target.type === "data"
    ? await readDataRow(target.name)
    : await readContentRow(target.type, target.slug);
  if (before?.raw !== raw) {
    if (target.type === "data") await writeDataRow(target.name, raw);
    else await writeContentRow(target.type, target.slug, raw);
    changed += 1;
  }
  const after = target.type === "data"
    ? await readDataRow(target.name)
    : await readContentRow(target.type, target.slug);
  if (!after || digest(after.raw) !== digest(raw)) throw new Error(`DB 검증 실패: ${target.relativePath}`);
  console.log(`${before?.raw === raw ? "unchanged" : "published"}: ${target.relativePath}`);
}

if (changed) {
  const site = process.env.LYRA_SITE_URL || "https://lyracyno.vercel.app";
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) throw new Error("DB 반영은 끝났지만 REVALIDATE_SECRET이 없어 사이트 캐시를 비우지 못했습니다");
  const response = await fetch(`${site}/api/revalidate`, { method: "POST", headers: { "x-revalidate-secret": secret } });
  if (!response.ok) throw new Error(`DB 반영은 끝났지만 캐시 무효화 실패: HTTP ${response.status}`);
}
console.log(`targeted publish verified: ${targets.length} target(s), ${changed} changed`);
