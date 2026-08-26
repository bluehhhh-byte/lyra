import Link from "next/link";

export default function TranslationConsistency({ items }) {
  return (
    <section aria-label="아티스트별 번역 검토 후보">
      <p className="text-xs leading-relaxed text-muted">검토가 필요한 후보일 뿐 오류나 점수가 아닙니다. 자동으로 수정하지 않습니다.</p>
      {items.length ? (
        <div className="mt-4 max-h-[32rem] space-y-2 overflow-y-auto pr-2">
          {items.map((item) => (
            <details key={`${item.artist}:${item.original}`} className="rounded-lg border border-line bg-surface px-4 py-3">
              <summary className="cursor-pointer text-sm"><b>{item.artist}</b> · “{item.original}” <span className="text-muted">({item.songCount}곡)</span></summary>
              <ul className="mt-3 space-y-3 text-xs">
                {item.variants.map((variant) => (
                  <li key={variant.translation}>
                    <p className="text-muted">→ {variant.translation}</p>
                    <p className="mt-1 flex flex-wrap gap-2">
                      {variant.songs.map((song) => <Link key={song.slug} href={`/admin/edit/${song.slug}`} className="text-accent hover:underline">{song.title}</Link>)}
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      ) : <p className="mt-4 rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">현재 확인할 번역 검토 후보가 없습니다.</p>}
    </section>
  );
}
