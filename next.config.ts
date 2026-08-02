import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Turbopack 排除 public/gallery/，避免 86 张大图拖垮文件监听
  // Windows 下对大目录的文件变更监听极其消耗资源
  turbopack: {
    resolveAlias: {},
  },
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
