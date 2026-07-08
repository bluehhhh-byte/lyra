import Link from "next/link";

export const metadata = { title: "없는 페이지 | Lyra" };

export default function NotFound() {
  return (
    <div className="py-28 text-center">
      <p className="text-5xl font-bold tracking-tight text-accent">404</p>
      <h1 className="mt-4 text-lg font-semibold">여기엔 아무 곡도 없습니다</h1>
      <p className="mt-2 text-sm text-muted">주소가 바뀌었거나 삭제된 곡일 수 있습니다.</p>
      <div className="mt-8 flex justify-center gap-3 text-sm">
        <Link href="/" className="rounded-lg border border-line bg-surface px-4 py-2 hover:border-accent">
          컬렉션으로
        </Link>
        <Link href="/tags" className="rounded-lg border border-line bg-surface px-4 py-2 hover:border-accent">
          태그 둘러보기
        </Link>
      </div>
    </div>
  );
}
