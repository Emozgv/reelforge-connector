import { useEffect, useState } from "react";
import { ArrowLeft, Check, ImagePlus, Loader2, X } from "lucide-react";
import type { CreatorsStore } from "../../state/useCreatorsStore";
import type { Language } from "../../types";

const LANGUAGE_OPTIONS: (Language | "Any")[] = ["Any", "English", "Spanish", "German", "Non-verbal"];
const STEPS = ["Basics", "Reference photos", "Direction"] as const;

// A short guided setup instead of a bare "name + handle" form — mirrors the
// vision's Creator → Images → Content Direction → Ready flow, scoped down to
// what's actually useful up front (deeper fields still live on the profile).
export function CreatorSetupWizard({
  open,
  creatorsStore,
  onClose,
  onDone,
}: {
  open: boolean;
  creatorsStore: CreatorsStore;
  onClose: () => void;
  onDone: (creatorId: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language | "Any">("Any");
  const [contentDos, setContentDos] = useState("");
  const [contentDonts, setContentDonts] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep(0);
      setName("");
      setHandle("");
      setCreatorId(null);
      setLanguage("Any");
      setContentDos("");
      setContentDonts("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const creator = creatorId ? creatorsStore.creators.find((c) => c.id === creatorId) : undefined;

  async function handleBasicsNext() {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await creatorsStore.createCreator(name.trim(), handle.trim());
    setSubmitting(false);
    if (result.error || !result.id) {
      setError(result.error ?? "Couldn't create creator.");
      return;
    }
    setCreatorId(result.id);
    setStep(1);
  }

  async function handleReferenceUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !creatorId) return;
    setUploading(true);
    await creatorsStore.uploadReferencePhoto(creatorId, file);
    setUploading(false);
  }

  function handleFinish() {
    if (!creatorId) return;
    if (language !== "Any") creatorsStore.updateField(creatorId, "preferredLanguage", language);
    if (contentDos.trim()) creatorsStore.updateField(creatorId, "contentDos", contentDos.trim());
    if (contentDonts.trim()) creatorsStore.updateField(creatorId, "contentDonts", contentDonts.trim());
    onDone(creatorId);
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-black/70 backdrop-blur-[3px] animate-fade-in" />
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-[440px] rounded-2xl bg-[#141416] border border-white/[0.09] shadow-2xl animate-rise-in overflow-hidden">
          <div className="flex items-center justify-between px-5 h-14 border-b border-white/[0.07]">
            <div className="flex items-center gap-2.5">
              {step > 0 && (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-100 hover:bg-white/[0.06] transition-colors"
                >
                  <ArrowLeft size={13} />
                </button>
              )}
              <h2 className="text-[15px] font-serif font-medium text-neutral-50">New Creator</h2>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-100 hover:bg-white/[0.06] transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          <div className="flex items-center gap-1.5 px-5 pt-3.5">
            {STEPS.map((label, i) => (
              <div key={label} className="flex-1 flex items-center gap-1.5">
                <span
                  className={[
                    "text-[10.5px] tracking-wide uppercase",
                    i === step ? "text-[#e8c896]" : i < step ? "text-neutral-400" : "text-neutral-600",
                  ].join(" ")}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
          <div className="px-5 pt-2 pb-1 flex gap-1.5">
            {STEPS.map((label, i) => (
              <div
                key={label}
                className={["h-[2px] flex-1 rounded-full transition-colors duration-200", i <= step ? "bg-[#c99a5f]" : "bg-white/[0.08]"].join(" ")}
              />
            ))}
          </div>

          {step === 0 && (
            <div className="px-5 py-4 space-y-3.5">
              <div>
                <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">Name</label>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleBasicsNext();
                  }}
                  placeholder="e.g. Morgan Lee"
                  className="mt-1.5 w-full h-10 rounded-lg surface-field px-3 text-[13px] text-neutral-100 placeholder:text-neutral-600 outline-none focus-glow"
                />
              </div>
              <div>
                <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">Handle (optional)</label>
                <input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleBasicsNext();
                  }}
                  placeholder="@morganlee"
                  className="mt-1.5 w-full h-10 rounded-lg surface-field px-3 text-[13px] text-neutral-100 placeholder:text-neutral-600 outline-none focus-glow"
                />
              </div>
              {error && (
                <p className="text-[12px] text-rose-300/85 rounded-lg surface-field px-3 py-2 leading-relaxed">{error}</p>
              )}
            </div>
          )}

          {step === 1 && creator && (
            <div className="px-5 py-4 space-y-3">
              <p className="text-[11.5px] text-neutral-500 leading-relaxed">
                Up to 5 character-set references — the visual anchor Production works from. You can
                always add more later.
              </p>
              <div className="grid grid-cols-5 gap-2">
                {creator.referencePhotos.map((url) => (
                  <div key={url} className="group relative aspect-square rounded-lg overflow-hidden ring-1 ring-white/10">
                    <img src={url} alt="Reference" className="w-full h-full object-cover" />
                    <button
                      onClick={() => creatorsStore.removeReferencePhoto(creator.id, url)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
                {creator.referencePhotos.length < 5 && (
                  <label className="aspect-square rounded-lg border border-dashed border-white/15 flex items-center justify-center text-neutral-500 hover:text-neutral-300 hover:border-white/25 transition-colors duration-150 cursor-pointer">
                    {uploading ? (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    ) : (
                      <ImagePlus size={16} />
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={handleReferenceUpload} />
                  </label>
                )}
              </div>

              <div className="pt-1">
                <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">Preferred language</label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setLanguage(opt)}
                      className={[
                        "text-[12px] px-2.5 py-1.5 rounded-lg border transition-colors duration-150",
                        language === opt
                          ? "border-[#c99a5f]/40 bg-[#c99a5f]/12 text-[#e8c896]"
                          : "border-white/[0.07] text-neutral-400 hover:text-neutral-200",
                      ].join(" ")}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="px-5 py-4 space-y-3.5">
              <div>
                <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">Content do's</label>
                <textarea
                  value={contentDos}
                  onChange={(e) => setContentDos(e.target.value)}
                  rows={2}
                  placeholder="What always works..."
                  className="mt-1.5 w-full resize-none rounded-lg surface-field px-3 py-2 text-[12.5px] text-neutral-300 placeholder:text-neutral-600 outline-none focus-glow"
                />
              </div>
              <div>
                <label className="text-[10.5px] tracking-wide uppercase text-neutral-500">Content don'ts</label>
                <textarea
                  value={contentDonts}
                  onChange={(e) => setContentDonts(e.target.value)}
                  rows={2}
                  placeholder="What to avoid..."
                  className="mt-1.5 w-full resize-none rounded-lg surface-field px-3 py-2 text-[12.5px] text-neutral-300 placeholder:text-neutral-600 outline-none focus-glow"
                />
              </div>
              <p className="text-[11px] text-neutral-600 leading-relaxed">
                Everything else — body/identity notes, brand direction, full creative profile — lives
                on the Creator's page whenever you're ready.
              </p>
            </div>
          )}

          <div className="px-5 pb-5 pt-1">
            {step === 0 && (
              <button
                disabled={!name.trim() || submitting}
                onClick={handleBasicsNext}
                className="w-full h-10 rounded-lg flex items-center justify-center gap-2 bg-[#d7a463] text-[#0a0a0c] text-[13px] font-medium disabled:opacity-40 hover:bg-[#e2b57c] transition-colors press-feedback"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                {submitting ? "Creating..." : "Continue"}
              </button>
            )}
            {step === 1 && (
              <button
                onClick={() => setStep(2)}
                className="w-full h-10 rounded-lg flex items-center justify-center gap-2 bg-[#d7a463] text-[#0a0a0c] text-[13px] font-medium hover:bg-[#e2b57c] transition-colors press-feedback"
              >
                Continue
              </button>
            )}
            {step === 2 && (
              <button
                onClick={handleFinish}
                className="w-full h-10 rounded-lg flex items-center justify-center gap-2 bg-[#d7a463] text-[#0a0a0c] text-[13px] font-medium hover:bg-[#e2b57c] transition-colors press-feedback"
              >
                <Check size={14} />
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
