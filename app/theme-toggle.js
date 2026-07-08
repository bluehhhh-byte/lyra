"use client";
import { useEffect, useState } from "react";
import { THEME_KEY } from "../lib/theme";

// null means "follow the OS" — cycling back to it is the only way to un-pin.
const CYCLE = [null, "light", "dark"];
const LABEL = { null: "◐ 시스템", light: "☀ 라이트", dark: "☾ 다크" };

export function applyTheme(theme) {
  const el = document.documentElement;
  if (theme) {
    el.dataset.theme = theme;
    el.style.colorScheme = theme; // narrow the UA hint so native widgets follow
    localStorage.setItem(THEME_KEY, theme);
  } else {
    delete el.dataset.theme;
    el.style.colorScheme = ""; // back to the <meta> "light dark"
    localStorage.removeItem(THEME_KEY);
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(null);
  const [mounted, setMounted] = useState(false);

  // the server can't know the reader's choice, so render the label only after mount
  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY);
    setTheme(saved === "light" || saved === "dark" ? saved : null);
    setMounted(true);
  }, []);

  const next = () => {
    const t = CYCLE[(CYCLE.indexOf(theme) + 1) % CYCLE.length];
    applyTheme(t);
    setTheme(t);
  };

  return (
    <button
      onClick={next}
      aria-label={`테마: ${LABEL[theme]}. 클릭하면 전환`}
      title="시스템 → 라이트 → 다크"
      className="w-[4.5rem] text-left tabular-nums hover:text-accent"
    >
      {mounted ? LABEL[theme] : "◐"}
    </button>
  );
}
