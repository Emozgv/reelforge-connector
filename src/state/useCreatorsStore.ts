import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { creatorFromRow, type CreatorRow } from "../lib/creatorMapping";
import type { Creator, ContentStyle, Setting } from "../types";

// snake_case DB column for every generically-editable Creator field —
// keeps updateField's call sites short without losing type safety on `field`.
const FIELD_COLUMNS: Partial<Record<keyof Creator, string>> = {
  bodyNotes: "body_notes",
  tattooNotes: "tattoo_notes",
  identityNotes: "identity_notes",
  preferredOutfits: "preferred_outfits",
  settingNotes: "setting_notes",
  preferredLanguage: "preferred_language",
  contentDos: "content_dos",
  contentDonts: "content_donts",
  brandDirection: "brand_direction",
  clientNotes: "client_notes",
  aiBrainEnabled: "ai_brain_enabled",
};

/**
 * Creators for the active workspace, backed by client_os.creators.
 * Creative Profile edits (traits, direction, styles, talking/setting) are
 * applied optimistically for a responsive feel, then persisted — a failed
 * write rolls the local state back and surfaces `saveError`. Creation is a
 * plain confirmed write (simpler, and it's a rarer action).
 */
export function useCreatorsStore(workspaceId: string | undefined) {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const creatorsRef = useRef<Creator[]>([]);
  creatorsRef.current = creators;

  useEffect(() => {
    if (!workspaceId) {
      setCreators([]);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    (async () => {
      const { data, error: fetchError } = await supabase
        .schema("client_os")
        .from("creators")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("name", { ascending: true });

      if (!active) return;

      if (fetchError) {
        setError(fetchError.message);
        setCreators([]);
      } else {
        setCreators((data as CreatorRow[]).map(creatorFromRow));
      }
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [workspaceId]);

  async function applyUpdate(
    creatorId: string,
    patch: Partial<Creator>,
    dbPatch: Record<string, unknown>
  ) {
    const previous = creatorsRef.current;
    setCreators((prev) => prev.map((c) => (c.id === creatorId ? { ...c, ...patch } : c)));
    setSaveError(null);

    const { error: updateError } = await supabase
      .schema("client_os")
      .from("creators")
      .update(dbPatch)
      .eq("id", creatorId);

    if (updateError) {
      setCreators(previous);
      setSaveError("Couldn't save that change — please try again.");
    }
  }

  function updateTraits(creatorId: string, traits: string[]) {
    void applyUpdate(creatorId, { traits }, { traits });
  }

  function updateCreativeDirection(creatorId: string, creativeDirection: string) {
    void applyUpdate(creatorId, { creativeDirection }, { creative_direction: creativeDirection });
  }

  function updatePreferredStyles(creatorId: string, preferredStyles: ContentStyle[]) {
    void applyUpdate(creatorId, { preferredStyles }, { preferred_styles: preferredStyles });
  }

  function updateAvoidedStyles(creatorId: string, avoidedStyles: string[]) {
    void applyUpdate(creatorId, { avoidedStyles }, { avoided_styles: avoidedStyles });
  }

  function updatePreferredTalking(creatorId: string, preferredTalking: Creator["preferredTalking"]) {
    void applyUpdate(creatorId, { preferredTalking }, { preferred_talking: preferredTalking });
  }

  function updatePreferredSetting(creatorId: string, preferredSetting: Setting | "Any") {
    void applyUpdate(creatorId, { preferredSetting }, { preferred_setting: preferredSetting });
  }

  function updateField<K extends keyof Creator>(creatorId: string, field: K, value: Creator[K]) {
    const column = FIELD_COLUMNS[field];
    if (!column) return;
    void applyUpdate(creatorId, { [field]: value } as Partial<Creator>, { [column]: value });
  }

  async function uploadReferencePhoto(creatorId: string, file: File): Promise<{ error: string | null }> {
    if (!workspaceId) return { error: "No active workspace." };
    const current = creatorsRef.current.find((c) => c.id === creatorId);
    if (!current) return { error: "Creator not found." };
    if (current.referencePhotos.length >= 5) return { error: "Up to 5 reference photos." };

    const ext = file.name.split(".").pop() || "jpg";
    const path = `${workspaceId}/${creatorId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("client-os-creator-references")
      .upload(path, file, { cacheControl: "3600" });

    if (uploadError) return { error: uploadError.message };

    const { data: publicUrlData } = supabase.storage.from("client-os-creator-references").getPublicUrl(path);
    const referencePhotos = [...current.referencePhotos, publicUrlData.publicUrl];
    await applyUpdate(creatorId, { referencePhotos }, { reference_photo_urls: referencePhotos });
    return { error: null };
  }

  function removeReferencePhoto(creatorId: string, url: string) {
    const current = creatorsRef.current.find((c) => c.id === creatorId);
    if (!current) return;
    const referencePhotos = current.referencePhotos.filter((u) => u !== url);
    void applyUpdate(creatorId, { referencePhotos }, { reference_photo_urls: referencePhotos });
  }

  async function uploadProfileImage(creatorId: string, file: File): Promise<{ error: string | null }> {
    if (!workspaceId) return { error: "No active workspace." };

    const ext = file.name.split(".").pop() || "jpg";
    const path = `${workspaceId}/${creatorId}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("client-os-creator-avatars")
      .upload(path, file, { upsert: true, cacheControl: "3600" });

    if (uploadError) {
      return { error: uploadError.message };
    }

    const { data: publicUrlData } = supabase.storage.from("client-os-creator-avatars").getPublicUrl(path);
    // Cache-bust so the new image shows immediately even though the path is
    // stable (upsert overwrites the same object on re-upload).
    const url = `${publicUrlData.publicUrl}?v=${Date.now()}`;

    await applyUpdate(creatorId, { profileImage: url }, { profile_image_url: url });
    return { error: null };
  }

  async function createCreator(name: string, handle: string): Promise<{ id: string | null; error: string | null }> {
    if (!workspaceId) return { id: null, error: "No active workspace." };

    const { data, error: insertError } = await supabase
      .schema("client_os")
      .from("creators")
      .insert({ workspace_id: workspaceId, name, handle: handle || null })
      .select()
      .single();

    if (insertError || !data) {
      return { id: null, error: insertError?.message ?? "Couldn't create creator." };
    }

    const created = creatorFromRow(data as CreatorRow);
    setCreators((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return { id: created.id, error: null };
  }

  return {
    creators,
    loading,
    error,
    saveError,
    updateTraits,
    updateCreativeDirection,
    updatePreferredStyles,
    updateAvoidedStyles,
    updatePreferredTalking,
    updatePreferredSetting,
    updateField,
    uploadProfileImage,
    uploadReferencePhoto,
    removeReferencePhoto,
    createCreator,
  };
}

export type CreatorsStore = ReturnType<typeof useCreatorsStore>;
