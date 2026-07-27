import fs from "fs";
import path from "path";
import { parseFrontmatter } from "./songs.js";

const COLLECTIONS_DIR = path.join(process.cwd(), "collections");

export function parseCollection(raw, slug = "") {
  const { meta, body } = parseFrontmatter((raw || "").replace(/\r\n/g, "\n"));
  return {
    slug,
    title: meta.title || slug,
    description: meta.description || "",
    visibility: meta.visibility === "private" ? "private" : "public",
    date: meta.date || "",
    updated: meta.updated || "",
    movieSlugs: body
      .split("\n")
      .map((line) => line.replace(/^\s*-\s*/, "").trim())
      .filter(Boolean),
  };
}

export function getAllCollections({ includePrivate = false } = {}) {
  if (!fs.existsSync(COLLECTIONS_DIR)) return [];
  return fs
    .readdirSync(COLLECTIONS_DIR)
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const slug = file.replace(/\.md$/, "");
      return parseCollection(fs.readFileSync(path.join(COLLECTIONS_DIR, file), "utf8"), slug);
    })
    .filter((collection) => includePrivate || collection.visibility === "public")
    .sort((a, b) => (b.updated || b.date).localeCompare(a.updated || a.date));
}

export function getCollection(slug, options) {
  return getAllCollections(options).find((collection) => collection.slug === slug) || null;
}
