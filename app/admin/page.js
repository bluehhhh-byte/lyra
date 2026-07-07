import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllSongs } from "../../lib/songs";
import AdminForm from "./form";

export const metadata = { title: "곡 추가 | Lyra" };

export default function AdminPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const songs = getAllSongs();
  return (
    <>
      <h1 className="mb-8 text-2xl font-bold">곡 추가</h1>
      <AdminForm />

      <h2 className="mb-3 mt-16 text-lg font-bold">등록된 곡 ({songs.length})</h2>
      <ul className="max-w-2xl divide-y divide-line rounded-lg border border-line">
        {songs.map((s) => (
          <li key={s.slug} className="flex items-center gap-3 px-3 py-2 text-sm">
            <img src={s.artwork} alt="" className="h-9 w-9 rounded" />
            <span className="flex-1">
              <span className="font-medium">{s.title}</span>
              <span className="text-muted"> — {s.artist}</span>
              <span className="ml-2 text-xs text-muted">{s.tags.join(", ")}</span>
            </span>
            <Link href={`/admin/edit/${s.slug}`} className="text-accent hover:underline">
              수정
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
