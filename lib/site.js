// Vercel injects VERCEL_PROJECT_PRODUCTION_URL on every deployment, so the
// sitemap points at the production domain even from a preview build.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL &&
    `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  "http://localhost:3000";
