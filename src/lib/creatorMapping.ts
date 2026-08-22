import type { Creator, ContentStyle } from "../types";
import { avatarColorForId } from "./avatarColor";

// Shape of a row from client_os.creators (snake_case, as returned by PostgREST).
export interface CreatorRow {
  id: string;
  workspace_id: string;
  name: string;
  handle: string | null;
  profile_image_url: string | null;
  traits: string[];
  creative_direction: string;
  preferred_styles: string[];
  avoided_styles: string[];
  preferred_talking: Creator["preferredTalking"];
  preferred_setting: Creator["preferredSetting"];
  created_at: string;
  updated_at: string;
}

export function creatorFromRow(row: CreatorRow): Creator {
  return {
    id: row.id,
    name: row.name,
    handle: row.handle ?? "",
    avatarColor: avatarColorForId(row.id),
    profileImage: row.profile_image_url ?? undefined,
    traits: row.traits ?? [],
    creativeDirection: row.creative_direction ?? "",
    preferredStyles: (row.preferred_styles ?? []) as ContentStyle[],
    avoidedStyles: row.avoided_styles ?? [],
    preferredTalking: row.preferred_talking,
    preferredSetting: row.preferred_setting,
  };
}
