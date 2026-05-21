import type { MetadataRoute } from "next";

const SITE_URL = process.env.SITE_URL || "https://detailing.cwnel.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/booking`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
  ];
}
