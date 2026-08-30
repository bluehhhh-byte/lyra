"use client";

import { useEffect, useRef } from "react";
import { createCanvasSurface } from "../lib/fable/wall";
import { createHand } from "../lib/fable/primitives";
import { hashSeed, PALETTE, stream } from "../lib/fable/core";

export default function FableLogo({ section = "lyra", className = "h-7 w-7" }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const surface = createCanvasSurface(canvas, { widthUnits: 100, heightUnits: 100 });
      const hand = createHand(surface);
      const random = stream(hashSeed(`logo:${section}`));
      const dark = document.documentElement.dataset.theme !== "light";
      hand.enso(random, 50, 50, 34, 0.88, dark ? PALETTE.CINK : PALETTE.INK, { w: 5.6, a: 0.9 });
      hand.spark(random, 50, 50, 9, { col: PALETTE.CLAY, a: 0.98, w: 1.8, nR: 7 });
    };
    draw();
    const observer = new MutationObserver(draw);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [section]);

  return <canvas ref={ref} className={className} data-fable-logo aria-hidden />;
}
