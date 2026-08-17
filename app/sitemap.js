import { getAllSongsRuntime } from "../lib/songs";
import { getAllMoviesRuntime } from "../lib/movies";
import { buildArchiveRuntime } from "../lib/archive";
import { getAllPeopleRuntime } from "../lib/people";
import { SITE_URL } from "../lib/site";
import { getAllMomentsRuntime } from "../lib/moments";

export default async function sitemap() {
  const [allSongs, allMovies, allArchive, allPeople, allMoments] = await Promise.all([
    getAllSongsRuntime(),
    getAllMoviesRuntime(),
    buildArchiveRuntime(),
    getAllPeopleRuntime(),
    getAllMomentsRuntime(),
  ]);
  const songs = allSongs.map((s) => ({
    url: `${SITE_URL}/songs/${encodeURIComponent(s.slug)}`,
    lastModified: s.date || undefined,
  }));
  const movies = allMovies.map((movie) => ({
    url: `${SITE_URL}/movies/${encodeURIComponent(movie.slug)}`,
    lastModified: movie.date || undefined,
  }));
  const archive = allArchive.map((entry) => ({
    url: `${SITE_URL}/archive/${entry.day}`,
    lastModified: entry.day,
  }));
  const people = allPeople.map((person) => ({
    url: `${SITE_URL}/people/${encodeURIComponent(person.name)}`,
  }));
  const moments = allMoments.map((moment) => ({
    url: `${SITE_URL}/moments/${encodeURIComponent(moment.slug)}`,
    lastModified: moment.updatedAt || moment.startDate,
  }));
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/movies`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/archive`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/moments`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/people`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/recap`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/tags`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE_URL}/stats`, changeFrequency: "weekly", priority: 0.4 },
    ...songs,
    ...movies,
    ...archive,
    ...people,
    ...moments,
  ];
}
