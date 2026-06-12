import type { MetadataRoute } from "next";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [members, votes] = await Promise.all([
    db.execute(sql`SELECT id FROM legislators WHERE in_office`),
    // Sitemaps allow up to 50,000 URLs per file; cap well under that.
    db.execute(
      sql`SELECT id FROM roll_calls ORDER BY vote_date DESC LIMIT 45000`,
    ),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/members`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/bills`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
  ];

  const memberRoutes = members.rows.map((r) => ({
    url: `${SITE_URL}/members/${(r as { id: string }).id}`,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));
  const voteRoutes = votes.rows.map((r) => ({
    url: `${SITE_URL}/votes/${(r as { id: string }).id}`,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...memberRoutes, ...voteRoutes];
}
