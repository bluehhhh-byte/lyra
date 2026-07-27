import { getAllSongs } from "../lib/songs";
import { getAllMovies } from "../lib/movies";
import { getAllCollections } from "../lib/collections";
import { buildArchive } from "../lib/archive";
import { getAllPeople } from "../lib/people";
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
  const archive = buildArchive().map((entry) => ({
    url: `${SITE_URL}/archive/${entry.day}`,
    lastModified: entry.day,
  }));
  const people = getAllPeople().map((person) => ({
    url: `${SITE_URL}/people/${encodeURIComponent(person.name)}`,
  }));
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/movies`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/collections`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/archive`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/watchlist`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/people`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/recap`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/tags`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/stats`, changeFrequency: "weekly", priority: 0.4 },
    ...songs,
    ...movies,
    ...collections,
    ...archive,
    ...people,
  ];
}
