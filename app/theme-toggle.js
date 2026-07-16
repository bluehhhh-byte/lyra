"use client";
import { useEffect, useState } from "react";
import { THEME_KEY } from "../lib/theme";

// Dark is the default; the OS preference is deliberately ignored.
const LABEL = { dark: "☾ 다크", light: "☀ 라이트" };

export function applyTheme(theme) {
  const el = document.documentElement;
  el.dataset.theme = theme;
  el.style.colorScheme = theme; // narrow the UA hint so native widgets follow
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
      aria-label={`테마: ${LABEL[theme]}. 클릭하면 전환`}
      title="다크 ↔ 라이트"
      className="w-[4.5rem] text-left tabular-nums hover:text-accent"
    >
      {mounted ? LABEL[theme] : "☾ 다크"}
    </button>
  );
}
