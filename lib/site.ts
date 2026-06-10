// Canonical site origin, used for sitemap/robots/metadata.
// Set NEXT_PUBLIC_SITE_URL in production (e.g. https://hiddenfigures.vote).
// Falls back to the Vercel-provided URL, then localhost for dev.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const SITE_NAME = "Hidden Figures";
