import Link from "next/link";
import { getAllSongsRuntime } from "../../../lib/songs";
import { readRuntimeData } from "../../../lib/store";
import ArtworkReview from "../artwork-review";
import Backfill from "../backfill";
import BulkWork from "../bulk-work";
import Lint from "../lint";
import LyricsAudit from "../lyrics-audit";
import Requality from "../requality";

export const metadata = { title: "관리 도구 | Lyra" };
export const dynamic = "force-dynamic";

const tools = [
  {
    title: "누락 항목 보정",
    description: "한글 제목·가수 독음·태그·코멘트가 비어 있는 곡만 찾아 Gemini로 한 곡씩 채웁니다.",
    content: <Backfill />,
  },
  {
    title: "커버 검토",
    description: "자동 검색으로 확정하지 못한 앨범 커버를 직접 확인해 URL을 저장하거나 ‘커버 없음’으로 표시합니다.",
    content: null,
  },
  {
    title: "번역 형식 검사",
    description: "번역·독음 누락, 잘못 붙은 형식 마커, 비표준 장르를 전 곡에서 찾아 필요한 부분만 보정합니다.",
    content: <Lint />,
  },
  {
    title: "가사 정확성 검토",
    description: "저장된 가사를 공식 출처와 사람이 대조하고, 수정한 줄의 근거와 이력을 함께 남길 때 사용합니다.",
    content: <LyricsAudit />,
  },
  {
    title: "가사 품질 재검사",
    description: "현재 가사보다 더 온전한 전사를 찾습니다. 교체하면 기존 번역을 다시 생성하므로 필요할 때만 실행합니다.",
    content: <Requality />,
    caution: true,
  },
  {
    title: "대량 작업",
    description: "여러 곡의 누락 데이터를 외부 AI로 한꺼번에 보완할 때 작업 JSON을 내보내고 결과를 검증해 반영합니다.",
    content: <BulkWork />,
  },
];

export default async function AdminToolsPage() {
  const [songs, artworkAudit] = await Promise.all([
    getAllSongsRuntime(),
    readRuntimeData("artwork-backfill-audit.json", { items: [] }),
  ]);
  const auditStatus = new Map((artworkAudit.items || []).map((item) => [item.slug, item.status]));
  const artworkless = songs
    .filter((song) => !(song.artwork || "").startsWith("https") && !song.artwork_none)
    .map((song) => ({
      slug: song.slug,
      title: song.title,
      artist: song.artist,
      year: song.year || "",
      status: auditStatus.get(song.slug) || "",
    }));

  const entries = tools.map((tool) => {
    if (tool.title === "커버 검토") {
      return { ...tool, title: `커버 검토 (${artworkless.length})`, content: <ArtworkReview items={artworkless} /> };
    }
    return tool;
  });

  return (
    <>
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">관리 도구</h1>
        <Link href="/admin" className="text-sm text-muted transition hover:text-accent">← 곡 관리</Link>
        <Link href="/admin/movie" className="text-sm text-muted transition hover:text-accent">영화 관리</Link>
        <Link href="/admin/moments" className="text-sm text-muted transition hover:text-accent">장면 관리</Link>
      </div>
      <p className="mb-6 max-w-2xl text-sm leading-relaxed text-muted">
        평소에는 사용할 필요 없는 데이터 정비 기능입니다. 문제가 발견되거나 여러 곡을 한꺼번에 손볼 때만 해당 도구를 여세요.
      </p>
      <div className="max-w-3xl divide-y divide-line border-y border-line">
        {entries.map((tool) => (
          <details key={tool.title} className="group py-4">
            <summary className="cursor-pointer list-none pr-2 marker:content-none">
              <span className="flex items-center justify-between gap-4">
                <span>
                  <span className="font-semibold">{tool.title}</span>
                  {tool.caution && <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">주의</span>}
                  <span className="mt-1 block text-sm font-normal leading-relaxed text-muted">{tool.description}</span>
                </span>
                <span className="shrink-0 text-muted transition group-open:rotate-45" aria-hidden>＋</span>
              </span>
            </summary>
            <div className="mt-5 border-t border-line pt-5">{tool.content}</div>
          </details>
        ))}
      </div>
    </>
  );
}
