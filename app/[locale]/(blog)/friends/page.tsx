import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { localizedAlternates } from "@/lib/i18n/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Friends" });
  return { title: t("title"), description: t("description"), alternates: localizedAlternates(locale, "/friends") };
}

const friends = [
  {
    name: "橙子🍊",
    url: "https://www.nerocats.com",
    descriptionKey: "alex",
    avatar: "/alex.jpg",
  },
  {
    name: "莽新",
    url: "https://infinitentrophy.nloln.cn/",
    descriptionKey: "mengxin",
    avatar: "/mengxin.jpg",
  },
  {
    name: "天线宝宝",
    url: "https://www.yourwit.top/",
    descriptionKey: "baobao",
    avatar: "/baobao.jpg",
  },
  {
    name: "星河（YY）",
    url: "https://www.galaxyy.de5.net",
    descriptionKey: "yy",
    avatar: "/YY.jpg",
  },
] as const;

export default async function FriendsPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Friends" });
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-12 sm:py-24">
      <div className="mb-12 space-y-2">
        <h1 className="text-sm font-medium tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t("description")}
        </p>
      </div>

      <div className="space-y-3">
        {friends.map((friend) => (
          <a
            key={friend.url}
            href={friend.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 p-4 rounded-lg border border-border/40 hover:border-border hover:bg-muted/50 transition-colors"
          >
            <Image
              src={friend.avatar}
              alt={friend.name}
              width={44}
              height={44}
              className="rounded-full shrink-0 object-cover border border-border/60"
            />
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-foreground">
                {friend.name}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {t(friend.descriptionKey)}
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
