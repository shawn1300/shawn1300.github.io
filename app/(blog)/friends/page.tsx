import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "友链",
  description: "朋友们的网站",
};

interface FriendLink {
  name: string;
  url: string;
  description: string;
  avatar: string;
}

const friends: FriendLink[] = [
  {
    name: "橙子🍊",
    url: "https://www.nerocats.com",
    description: "重庆小王子，热爱探索新技术",
    avatar: "/alex.jpg",
  },
  {
    name: "莽新",
    url: "https://infinitentrophy.nloln.cn/",
    description: "经典社畜，金融巨鳄",
    avatar: "/mengxin.jpg",
  },
  {
    name: "天线宝宝",
    url: "https://www.yourwit.top/",
    description: "群友的万能「资源」库",
    avatar: "/baobao.jpg",
  },
  {
    name: "星河（YY）",
    url: "https://www.galaxyy.de5.net",
    description: "神级决策分析师，拿不定主意就问YY",
    avatar: "/YY.jpg",
  },
];

export default function FriendsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-12 sm:py-24">
      <div className="mb-12 space-y-2">
        <h1 className="text-sm font-medium tracking-tight text-foreground">
          友链
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          鸽子们 🕊️
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
                {friend.description}
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
