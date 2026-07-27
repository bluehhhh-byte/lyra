import { getAllMovies } from "./movies.js";

export const splitCast = (cast = "") =>
  String(cast)
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

export function getAllPeople(movies = getAllMovies()) {
  const people = new Map();
  const add = (name, role, movie) => {
    if (!name) return;
    if (!people.has(name)) people.set(name, { name, directed: [], acted: [] });
    const person = people.get(name);
    const list = role === "director" ? person.directed : person.acted;
    if (!list.some((item) => item.slug === movie.slug)) list.push(movie);
  };

  for (const movie of movies) {
    add(movie.director_ko || movie.director, "director", movie);
    for (const actor of splitCast(movie.cast)) add(actor, "actor", movie);
  }

  return [...people.values()]
    .map((person) => {
      const works = [...new Map([...person.directed, ...person.acted].map((movie) => [movie.slug, movie])).values()];
      const rated = works.filter((movie) => movie.rating != null);
      return {
        ...person,
        works,
        averageRating: rated.length
          ? rated.reduce((sum, movie) => sum + movie.rating, 0) / rated.length
          : null,
      };
    })
    .sort((a, b) => b.works.length - a.works.length || a.name.localeCompare(b.name));
}

export function getPerson(name, movies) {
  return getAllPeople(movies).find((person) => person.name === name) || null;
}
