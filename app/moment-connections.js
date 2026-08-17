import MomentCard from "./moment-card";

export default function MomentConnections({ moments, targetKind, targetSlug }) {
  if (!moments?.length) return null;
  return (
    <section className="mx-auto mt-16 max-w-2xl border-t border-line pt-8">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">Cultural biography</p>
      <h2 className="mb-5 text-lg font-semibold">이 작품이 남아 있는 장면</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {moments.map((moment) => {
          const link = moment.links.find((item) => item.targetKind === targetKind && item.targetSlug === targetSlug);
          return <div key={moment.slug}>
            <MomentCard moment={moment} compact />
            {(link?.excerpt || link?.note) && <div className="mx-3 border-x border-b border-line px-3 pb-3 pt-2 text-xs leading-relaxed text-muted">
              {link.excerpt && <blockquote className="mb-1 font-serif text-sm text-ink">“{link.excerpt}”</blockquote>}
              {link.note && <p>{link.note}</p>}
            </div>}
          </div>;
        })}
      </div>
    </section>
  );
}
