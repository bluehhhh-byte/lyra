// Plain module — no "use client". A client module's non-component exports become
// client references on the server (THEME_KEY would read as undefined in layout.js),
// so the key the no-flash script reads has to live outside the client boundary.
export const THEME_KEY = "lyra_theme"; // "light" | "dark" | absent = follow the OS
