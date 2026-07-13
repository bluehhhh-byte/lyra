import fs from "fs";
import path from "path";

// One .md with every song's raw file (frontmatter + interleaved lyrics),
// for offline data analysis. Prerendered at build time — the songs dir is
// only guaranteed on disk then, and every save redeploys, so it stays current.
export const dynamic = "force-static";

export async function GET() {
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
  const head = `<!-- Lyra 가사 아카이브 · ${files.length}곡 · ${new Date().toISOString().slice(0, 10)} 빌드 -->\n\n`;
  return new Response(head + body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="lyra-songs.md"',
    },
  });
}
