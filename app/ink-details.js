export function InkMark({ className = "h-8 w-8", title = "" }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      fill="none"
    >
      {title && <title>{title}</title>}
      {/* 고정 좌표로 약간 흔들린 340도 원을 만든다. 런타임 랜덤은 SSR과
          hydration 결과를 갈라놓으므로 쓰지 않는다. */}
      <path
        d="M72 16 C88 26 94 44 90 61 C86 79 71 91 53 92 C34 93 18 82 11 66 C4 49 10 31 24 20 C37 10 55 8 72 16"
        stroke="currentColor"
        strokeWidth="4.2"
        strokeLinecap="round"
      />
      <path
        d="M75 18 C82 23 87 30 89 37"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.45"
      />
      <circle cx="51" cy="51" r="5" fill="var(--color-accent)" />
    </svg>
  );
}

export function InkUnderline({ className = "mt-2 h-2 w-36" }) {
  return (
    <svg viewBox="0 0 180 12" className={className} aria-hidden fill="none" preserveAspectRatio="none">
      <path
        d="M2 8 C34 4 67 9 101 5 C129 2 154 7 178 3"
        stroke="var(--color-accent)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path d="M8 10 C51 7 101 10 165 6" stroke="currentColor" strokeWidth="0.7" opacity="0.28" />
    </svg>
  );
}

export function InkDivider({ className = "my-12 h-3 w-full" }) {
  return (
    <svg viewBox="0 0 800 14" className={className} aria-hidden fill="none" preserveAspectRatio="none">
      <path
        d="M2 8 C106 5 194 10 292 7 C418 3 526 10 798 5"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.38"
      />
      <path d="M632 8 C690 6 742 8 786 6" stroke="var(--color-accent)" strokeWidth="1.5" opacity="0.72" />
    </svg>
  );
}
