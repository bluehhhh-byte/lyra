"use client";
import { useEffect, useState } from "react";
import { extractPalette } from "../lib/palette";

// resting palette until (or in case) extraction resolves — the site lavender family
const DEFAULT = ["#3a2f6b", "#1c1c30", "#4a4458"];

// Full-page (fixed) or section-scoped (absolute) ambient light from album colors.
// Pure decoration: aria-hidden, z-index -1, pointer-events none.
export default function Ambient({ artwork, slug, fixed = true }) {
  const [pal, setPal] = useState(DEFAULT);

  useEffect(() => {
    let live = true;
    extractPalette(artwork, slug)
      .then((p) => live && p?.length === 3 && setPal(p))
      .catch(() => {}); // CORS/decode failure — keep the default light
    return () => {
      live = false;
    };
  }, [artwork, slug]);

  return (
    <div
      aria-hidden
      className={`ambient ${fixed ? "ambient-fixed" : "ambient-abs"}`}
      style={{ "--amb1": pal[0], "--amb2": pal[1], "--amb3": pal[2] }}
    />
  );
}
