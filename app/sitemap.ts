import { getPublishedPosts } from "@/lib/posts";
import { getAllDiaries } from "@/lib/diaries";
import { localePath, routing, type Locale } from "@/i18n/routing";
import type { MetadataRoute } from "next";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const [posts, diaries] = await Promise.all([
    getPublishedPosts({ limit: 500 }),
    getAllDiaries(),
  ]);
  const locales = [...routing.locales] as Locale[];
  const staticPaths = ["/", "/categories", "/archive", "/diaries", "/gallery", "/friends", "/about"];

  const languageAlternates = (pathname: string) => ({
    languages: Object.fromEntries(
      locales.map((locale) => [locale, `${baseUrl}${localePath(locale, pathname)}`])
    ),
  });

  const localizedEntries = (
    pathname: string,
    options: Omit<MetadataRoute.Sitemap[number], "url" | "alternates">
  ): MetadataRoute.Sitemap =>
    locales.map((locale) => ({
      ...options,
      url: `${baseUrl}${localePath(locale, pathname)}`,
      alternates: languageAlternates(pathname),
    }));

  const postEntries = posts.flatMap((post) =>
    localizedEntries(`/posts/${post.slug}`, {
      lastModified: post.updated_at,
      changeFrequency: "weekly",
      priority: 0.7,
    })
  );
  const diaryEntries = diaries.flatMap((diary) =>
    localizedEntries(`/diaries/${diary.slug}`, {
      lastModified: diary.updated_at,
      changeFrequency: "monthly",
      priority: 0.5,
    })
  );
  const staticEntries = staticPaths.flatMap((pathname) =>
    localizedEntries(pathname, {
      lastModified: new Date(),
      changeFrequency: pathname === "/" ? "daily" : "weekly",
      priority: pathname === "/" ? 1 : 0.6,
    })
  );

  return [...staticEntries, ...postEntries, ...diaryEntries];
}
