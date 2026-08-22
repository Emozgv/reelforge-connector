import type { ContentStyle, Difficulty, Platform, Setting } from "../../types";

export interface HubFilters {
  length: "any" | "0-5" | "6-9" | "10-12";
  talking: "any" | "talking" | "nontalking";
  aiFriendly: boolean;
  difficulty: "any" | Difficulty;
  setting: "any" | Setting;
  contentStyle: "any" | ContentStyle;
  creatorFit: "any" | "high" | "medium";
  used: "any" | "used" | "unused";
  savedState: "any" | "saved" | "unsaved";
  platform: "all" | Platform;
  views: "any" | "10k" | "50k" | "100k";
  sort: "relevant" | "recent" | "trending";
}

export const DEFAULT_FILTERS: HubFilters = {
  length: "any",
  talking: "any",
  aiFriendly: false,
  difficulty: "any",
  setting: "any",
  contentStyle: "any",
  creatorFit: "any",
  used: "any",
  savedState: "any",
  platform: "all",
  views: "any",
  sort: "relevant",
};

export function countActiveFilters(f: HubFilters): number {
  let n = 0;
  if (f.length !== "any") n++;
  if (f.talking !== "any") n++;
  if (f.aiFriendly) n++;
  if (f.difficulty !== "any") n++;
  if (f.setting !== "any") n++;
  if (f.contentStyle !== "any") n++;
  if (f.creatorFit !== "any") n++;
  if (f.used !== "any") n++;
  if (f.savedState !== "any") n++;
  if (f.platform !== "all") n++;
  if (f.views !== "any") n++;
  if (f.sort !== "relevant") n++;
  return n;
}
