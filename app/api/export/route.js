import fs from "fs";
import path from "path";
import { kstToday } from "../../../lib/kst";
import { databaseContentEnabled, listCachedContentRows } from "../../../lib/content-db";

// One .md with every song's raw file (frontmatter + interleaved lyrics),
// for offline data analysis. Reads from Neon after cutover and from disk in
// local/file mode.
export const dynamic = "force-dynamic";

export async function GET() {
  if (databaseContentEnabled()) {
    const rows = await listCachedContentRows("song");
    const body = rows
      .map((row) => `<!-- ===== ${row.slug} ===== -->\n${row.raw.trim()}`)
      .join("\n\n");
    const head = `<!-- Lyra 가사 아카이브 · ${rows.length}곡 · ${kstToday()} 기준 -->\n\n`;
    return new Response(head + body, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": 'attachment; filename="lyra-songs.md"',
      },
    });
  }
  const dir = path.join(process.cwd(), "songs");
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort()
    : [];
  const body = files
    .map((f) => {
      const raw = fs.readFileSync(path.join(dir, f), "utf8").replace(/\r\n/g, "\n").trim();
      return `<!-- ===== ${f.replace(/\.md$/, "")} ===== -->\n${raw}`;
    })
    .join("\n\n");
  const head = `<!-- Lyra 가사 아카이브 · ${files.length}곡 · ${kstToday()} 빌드 -->\n\n`;
  return new Response(head + body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="lyra-songs.md"',
    },
  });
}
