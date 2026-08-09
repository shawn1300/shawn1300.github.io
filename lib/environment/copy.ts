export type EnvironmentCopyKey = "home" | "dormitory" | "default";

export function environmentCopyKey(location: string): EnvironmentCopyKey {
  return location === "home" || location === "dormitory"
    ? location
    : "default";
}
