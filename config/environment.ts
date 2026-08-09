import type { EnvironmentConfiguration } from "@/lib/environment/config-schema";

export const environmentConfiguration = {
  locations: [
    {
      slug: "home",
      name: { zh: "家", en: "Home", ja: "自宅" },
      timezone: "Australia/Perth",
      public: true,
      enabled: true,
      order: 0,
      comparison: {
        indoorDevice: "home-indoor",
        outdoorDevice: "home-outdoor",
      },
    },
  ],
  sources: [
    {
      slug: "home-assistant",
      name: "Home Assistant",
      type: "home_assistant",
      enabled: true,
    },
  ],
  devices: [
    {
      slug: "home-indoor",
      location: "home",
      source: "home-assistant",
      name: { zh: "室内", en: "Indoor", ja: "室内" },
      placement: "indoor",
      enabled: true,
      order: 0,
      metrics: [
        { key: "temperatureC", enabled: true, order: 0 },
        { key: "humidityPercent", enabled: true, order: 1 },
        { key: "batteryPercent", enabled: true, order: 2 },
      ],
    },
    {
      slug: "home-outdoor",
      location: "home",
      source: "home-assistant",
      name: { zh: "室外", en: "Outdoor", ja: "屋外" },
      placement: "outdoor",
      enabled: true,
      order: 1,
      metrics: [
        { key: "temperatureC", enabled: true, order: 0 },
        { key: "humidityPercent", enabled: true, order: 1 },
        { key: "batteryPercent", enabled: true, order: 2 },
      ],
    },
  ],
} satisfies EnvironmentConfiguration;

