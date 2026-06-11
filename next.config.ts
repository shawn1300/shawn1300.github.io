import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack 排除 public/gallery/，避免 86 张大图拖垮文件监听
  // Windows 下对大目录的文件变更监听极其消耗资源
  turbopack: {
    resolveAlias: {},
  },
};

export default nextConfig;
