import fs from "fs";
import path from "path";
import { revalidatePath, revalidateTag } from "next/cache";
import {
  databaseContentEnabled,
  deleteMomentRow,
  listCachedMomentRows,
  writeMomentRow,
} from "./content-db.js";
import { normalizeMoment } from "./moments-core.js";

const LOCAL_FILE = path.join(process.cwd(), "data", "moments.json");

function localMoments() {
  try {
    const parsed = JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : parsed.moments || [];
  } catch {
    return [];
  }
}

function rowToMoment(row) {
  return {
    slug: row.slug,
    title: row.title,
    body: row.body,
    startDate: String(row.start_date || row.startDate || "").slice(0, 10),
    endDate: String(row.end_date || row.endDate || "").slice(0, 10),
    emotions: row.emotions || [],
    keywords: row.keywords || [],
    published: row.published !== false,
    links: (row.links || []).map((link) => ({
      targetKind: link.target_kind || link.targetKind,
      targetSlug: link.target_slug || link.targetSlug,
      excerpt: link.excerpt || "",
      note: link.note || "",
      position: Number(link.position || 0),
    })),
    createdAt: row.created_at || row.createdAt || "",
    updatedAt: row.updated_at || row.updatedAt || "",
  };
}

export async function getAllMomentsRuntime({ includeDrafts = false } = {}) {
  const rows = databaseContentEnabled() ? await listCachedMomentRows() : localMoments();
  return rows
    .map(rowToMoment)
    .filter((moment) => includeDrafts || moment.published)
    .sort((a, b) => b.startDate.localeCompare(a.startDate) || b.slug.localeCompare(a.slug));
}

export async function getMomentRuntime(slug, options) {
  return (await getAllMomentsRuntime(options)).find((moment) => moment.slug === slug) || null;
}

export async function getMomentsForTarget(targetKind, targetSlug) {
  return (await getAllMomentsRuntime()).filter((moment) =>
    moment.links.some((link) => link.targetKind === targetKind && link.targetSlug === targetSlug)
  );
}

export async function saveMoment(input, existingSlug = "") {
  const moment = normalizeMoment(input, existingSlug);
  if (!existingSlug) {
    const used = new Set((await getAllMomentsRuntime({ includeDrafts: true })).map((item) => item.slug));
    const base = moment.slug;
    let suffix = 2;
    while (used.has(moment.slug)) moment.slug = `${base}-${suffix++}`;
  }
  if (databaseContentEnabled()) {
    await writeMomentRow(moment, existingSlug);
  } else {
    const all = localMoments().map(rowToMoment);
    const index = all.findIndex((item) => item.slug === (existingSlug || moment.slug));
    if (index >= 0) all[index] = moment;
    else all.push(moment);
    fs.writeFileSync(LOCAL_FILE, `${JSON.stringify({ version: 1, moments: all }, null, 2)}\n`);
  }
  revalidateTag("lyra-moments");
  revalidatePath("/moments");
  revalidatePath(`/moments/${moment.slug}`);
  for (const link of moment.links) revalidatePath(`/${link.targetKind === "song" ? "songs" : "movies"}/${link.targetSlug}`);
  return moment;
}

export async function removeMoment(slug) {
  const current = await getMomentRuntime(slug, { includeDrafts: true });
  if (databaseContentEnabled()) await deleteMomentRow(slug);
  else {
    const moments = localMoments().map(rowToMoment).filter((item) => item.slug !== slug);
    fs.writeFileSync(LOCAL_FILE, `${JSON.stringify({ version: 1, moments }, null, 2)}\n`);
  }
  revalidateTag("lyra-moments");
  revalidatePath("/moments");
  if (current) for (const link of current.links) revalidatePath(`/${link.targetKind === "song" ? "songs" : "movies"}/${link.targetSlug}`);
}
