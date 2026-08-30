"use client";
import { useEffect, useState } from "react";
import { THEME_KEY } from "../lib/theme";

// Dark is the default; the OS preference is deliberately ignored.
const ICON = { dark: "☾", light: "☀" };
const TEXT = { dark: "다크", light: "라이트" };
const THEME_COLOR = { dark: "#12100e", light: "#f6f1e4" };

export function applyTheme(theme) {
  const el = document.documentElement;
  el.dataset.theme = theme;
  el.style.colorScheme = theme; // narrow the UA hint so native widgets follow
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLOR[theme];
  localStorage.setItem(THEME_KEY, theme);
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState("dark");
  const [mounted, setMounted] = useState(false);

  // the server can't know the reader's choice, so render the label only after mount
  useEffect(() => {
    setTheme(localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark");
    setMounted(true);
  }, []);

  const next = (e) => {
    const t = theme === "dark" ? "light" : "dark";
    const apply = () => {
      applyTheme(t);
      setTheme(t);
    };
    // circular reveal from the click point; plain swap where unsupported or
    // when the reader asked for reduced motion
    if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      apply();
      return;
    }
    // keyboard activation reports (0,0) — fall back to the toggle's corner
    const x = e.clientX || innerWidth - 40;
    const y = e.clientY || 40;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.startViewTransition(apply).ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        {
          duration: 500,
          easing: "cubic-bezier(0.23, 1, 0.32, 1)",
          pseudoElement: "::view-transition-new(root)",
        }
      );
    });
  };

  return (
    <button
      onClick={next}
      aria-label={`테마: ${TEXT[theme]}. 클릭하면 전환`}
      title="다크 ↔ 라이트"
      className="flex min-h-11 min-w-11 items-center justify-center gap-1  px-2 hover:bg-surface hover:text-accent"
    >
      <span aria-hidden>{mounted ? ICON[theme] : "☾"}</span>
      {/* 모바일은 아이콘만 — 헤더 오른쪽이 좁다 */}
      <span className="hidden sm:inline">{mounted ? TEXT[theme] : "다크"}</span>
    </button>
  );
}
