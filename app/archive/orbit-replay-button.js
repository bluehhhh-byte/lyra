"use client";

export function OrbitReplayButton() {
  const replay = (event) => {
    const figure = event.currentTarget.closest("figure");
    if (!figure) return;

    const animations = [...figure.querySelectorAll(".orbit-point, .orbit-segment, .orbit-start-halo, .orbit-turning-ring")]
      .flatMap((element) => element.getAnimations());

    for (const animation of animations) {
      animation.cancel();
      animation.play();
    }
  };

  return (
    <button
      type="button"
      onClick={replay}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-accent/60 px-3 py-1 text-[11px] font-medium text-accent transition-colors hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      aria-label="정서 지도 애니메이션을 1월부터 다시 재생"
    >
      <span aria-hidden className="text-base leading-none">↻</span>
      다시 재생
    </button>
  );
}
