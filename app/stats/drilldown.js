"use client";
import { useState } from "react";
import { Bars } from "./charts";

// A stats section with a "보기 →" toggle that drills from a coarse view
// (decades, top tags) down to a fine one (exact years, all tags) in place.
// linkPrefix (a string) instead of a function — a server component can't pass a
// function across the client boundary. The row href is built here, client-side.
export default function DrillSection({ title, coarse, fine, fineLabel = "자세히", total, linkPrefix }) {
  const [open, setOpen] = useState(false);
  const data = open ? fine : coarse;
  // nothing more to show if the fine view isn't actually longer
  const canDrill = fine.length > coarse.length;
  const link = linkPrefix ? (label) => `${linkPrefix}${encodeURIComponent(label)}` : undefined;

  return (
    <section>
      <h2 className="mb-4 text-sm font-semibold">
        {title}
        {canDrill && (
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="ml-2 text-xs font-normal text-muted hover:text-accent"
          >
            {open ? "접기 ↑" : `${fineLabel} →`}
          </button>
        )}
      </h2>
      {data.length ? (
        <Bars data={data} total={total} link={link} />
      ) : (
        <p className="text-sm text-muted">데이터가 없습니다.</p>
      )}
    </section>
  );
}
