// Visitor favorites — localStorage only, no server. Plain module: call these
// inside effects/handlers (localStorage doesn't exist during SSR).
const KEY = "lyra_favs";

export function readFavs() {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || "[]"));
  } catch {
    return new Set(); // corrupt value — start over
  }
}

export function toggleFav(slug) {
  const favs = readFavs();
  favs.has(slug) ? favs.delete(slug) : favs.add(slug);
  localStorage.setItem(KEY, JSON.stringify([...favs]));
  return favs;
}
