import { getAllSongs } from "../lib/songs";
import { getAllMovies } from "../lib/movies";
import { getAllCollections } from "../lib/collections";
import { SITE_URL } from "../lib/site";

export default function sitemap() {
  const songs = getAllSongs().map((s) => ({
    url: `${SITE_URL}/songs/${encodeURIComponent(s.slug)}`,
    lastModified: s.date || undefined,
  }));
  const movies = getAllMovies().map((movie) => ({
    url: `${SITE_URL}/movies/${encodeURIComponent(movie.slug)}`,
    lastModified: movie.date || undefined,
  }));
  const collections = getAllCollections().map((collection) => ({
    url: `${SITE_URL}/collections/${encodeURIComponent(collection.slug)}`,
    lastModified: collection.updated || collection.date || undefined,
  }));
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/movies`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/collections`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/tags`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/stats`, changeFrequency: "weekly", priority: 0.4 },
    ...songs,
    ...movies,
    ...collections,
  ];
}
