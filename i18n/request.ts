import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { routing } from "./routing";

const messageLoaders = {
  "zh-CN": () => import("../messages/zh-CN.json").then((module) => module.default),
  en: () => import("../messages/en.json").then((module) => module.default),
  ja: () => import("../messages/ja.json").then((module) => module.default),
} as const;

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: await messageLoaders[locale](),
    timeZone: "Asia/Shanghai",
  };
});
