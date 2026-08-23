import type { Creator, ContentStyle, Language } from "../types";
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
  reference_photo_urls: string[];
  body_notes: string;
  tattoo_notes: string;
  identity_notes: string;
  preferred_outfits: string;
  setting_notes: string;
  preferred_language: Language | "Any";
  content_dos: string;
  content_donts: string;
  brand_direction: string;
  client_notes: string;
  ai_brain_enabled: boolean;
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
    referencePhotos: row.reference_photo_urls ?? [],
    bodyNotes: row.body_notes ?? "",
    tattooNotes: row.tattoo_notes ?? "",
    identityNotes: row.identity_notes ?? "",
    preferredOutfits: row.preferred_outfits ?? "",
    settingNotes: row.setting_notes ?? "",
    preferredLanguage: row.preferred_language ?? "Any",
    contentDos: row.content_dos ?? "",
    contentDonts: row.content_donts ?? "",
    brandDirection: row.brand_direction ?? "",
    clientNotes: row.client_notes ?? "",
    aiBrainEnabled: row.ai_brain_enabled ?? false,
  };
}

// Rule-based setup-completeness read — never stored, always derived so it
// can't drift from what's actually filled in.
export function creatorSetupStatus(creator: Creator): "draft" | "in_progress" | "ready" {
  const hasPhoto = !!creator.profileImage;
  const hasReferencePhotos = creator.referencePhotos.length >= 3;
  const hasIdentityNotes = creator.bodyNotes.trim() !== "" || creator.identityNotes.trim() !== "";
  const hasDirection = creator.contentDos.trim() !== "" || creator.contentDonts.trim() !== "" || creator.creativeDirection.trim() !== "";

  const filledCount = [hasPhoto, hasReferencePhotos, hasIdentityNotes, hasDirection].filter(Boolean).length;
  if (filledCount === 4) return "ready";
  if (filledCount === 0) return "draft";
  return "in_progress";
}
