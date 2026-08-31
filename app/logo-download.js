"use client";

import FableLogo from "./fable-logo";
import { createHand } from "../lib/fable/primitives";
import { hashSeed, PALETTE, rgba, stream } from "../lib/fable/core";

const PROFILE_SIZE = 1080;

// 헤더의 작은 캔버스를 늘리는 대신 같은 붓질을 1080px 캔버스에 다시 그린다.
// 정사각형의 안전 여백 안에 심벌을 두어 인스타그램의 원형 크롭에서도 잘리지 않는다.
export function drawProfileLogo(canvas, section = "lyra") {
  canvas.width = PROFILE_SIZE;
  canvas.height = PROFILE_SIZE;
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = rgba(PALETTE.VOID, 1);
  context.fillRect(0, 0, PROFILE_SIZE, PROFILE_SIZE);
  context.setTransform(PROFILE_SIZE / 100, 0, 0, PROFILE_SIZE / 100, 0, 0);
  context.lineCap = "round";
  context.lineJoin = "round";

  const surface = {
    emit(_y0, _y1, draw) { draw(context); },
  };
  const hand = createHand(surface);
  const random = stream(hashSeed(`logo:${section}`));
  hand.enso(random, 50, 50, 34, 0.88, PALETTE.CINK, { w: 5.6, a: 0.9 });
  hand.spark(random, 50, 50, 9, { col: PALETTE.VIOLET, a: 0.98, w: 1.8, nR: 7 });
  return canvas;
}

export default function LogoDownload({ section = "lyra" }) {
  const name = section === "cyno" ? "Cyno" : "Lyra";
  const download = () => {
    const canvas = drawProfileLogo(document.createElement("canvas"), section);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${section}-instagram-profile-1080.png`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  };

  return (
    <button
      type="button"
      onClick={download}
      aria-label={`${name} 인스타그램 프로필 로고 다운로드, PNG 1080×1080`}
      title={`${name} 프로필 로고 다운로드 · PNG 1080×1080`}
      className="group relative flex min-h-11 min-w-11 items-center justify-center text-ink hover:text-accent"
      data-logo-download
    >
      <FableLogo section={section} className="h-7 w-7" />
      <span
        aria-hidden
        className="absolute bottom-0.5 right-0.5 text-[9px] text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        ↓
      </span>
    </button>
  );
}
