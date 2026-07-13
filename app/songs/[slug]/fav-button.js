"use client";
import { useEffect, useState } from "react";
import { readFavs, toggleFav } from "../../../lib/favs";

export default function FavButton({ slug }) {
  const [fav, setFav] = useState(false); // server renders ♡; real state after mount

  useEffect(() => {
    setFav(readFavs().has(slug));
  }, [slug]);

  return (
    <button
      onClick={() => setFav(toggleFav(slug).has(slug))}
      aria-label={fav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
      aria-pressed={fav}
      className={`rounded-full border px-3 py-1.5 text-xs transition ${
        fav
          ? "border-accent bg-accent font-semibold text-bg"
          : "border-line bg-bg/50 text-muted hover:text-accent"
      }`}
    >
      {fav ? "♥ 저장됨" : "♡ 저장"}
    </button>
  );
}
