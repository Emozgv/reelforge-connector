import { useEffect, useState } from "react";
import {
  X,
  ExternalLink,
  Bookmark,
  FolderPlus,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Clock,
  CalendarDays,
  Sparkles,
} from "lucide-react";
import type { Creator, ReelVideo } from "../../types";
import { DEFAULT_THUMB_GRADIENT } from "../../data/mockData";
import { formatCompactNumber } from "../../lib/formatCount";
import { PlatformIcon } from "./PlatformIcon";

function StatRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | undefined }) {
  if (value === undefined) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 h-6 rounded-full bg-white/[0.05] flex items-center justify-center text-neutral-500 shrink-0">
        {icon}
      </span>
      <span className="text-[12.5px] text-neutral-300">{label}</span>
      <span className="ml-auto text-[12.5px] text-neutral-100 font-medium tabular-nums">
        {formatCompactNumber(value)}
      </span>
    </div>
  );
}

// A future-AI-tagging row — deliberately never shows a number or verdict
// today, only a muted "not analyzed yet" placeholder, so nothing here can be
// mistaken for a real score before that layer actually ships.
function AiPlaceholderRow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[12px] text-neutral-500">{label}</span>
      <span className="text-[11px] text-neutral-600 italic">Not analyzed yet</span>
    </div>
  );
}

export function ReelDetailModal({
  video,
  open,
  creator,
  onClose,
  onSaveClick,
  onAddToCollection,
}: {
  video: ReelVideo | null;
  open: boolean;
  creator?: Creator | null;
  onClose: () => void;
  onSaveClick: (video: ReelVideo) => void;
  onAddToCollection?: (video: ReelVideo) => void;
}) {
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    if (open) setVideoError(false);
  }, [open, video?.id]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !video) return null;

  const platformLabel = video.platform === "tiktok" ? "TikTok" : "Instagram";

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-black/75 backdrop-blur-[3px] animate-fade-in" />

      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none">
        <div className="pointer-events-auto relative max-w-[92vw] rounded-2xl bg-[#141416] border border-white/[0.09] shadow-2xl overflow-hidden animate-rise-in flex">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
          >
            <X size={15} />
          </button>

          {/* video — sized off its own aspect ratio against a capped height */}
          <div className="relative h-[min(85vh,720px)] aspect-[9/16] bg-black shrink-0">
            {video.videoUrl && !videoError ? (
              <video
                key={video.id}
                src={video.videoUrl}
                poster={video.thumbnailUrl}
                controls
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
                onError={() => setVideoError(true)}
              />
            ) : (
              <>
                {video.thumbnailUrl ? (
                  <img src={video.thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div
                    className="absolute inset-0"
                    style={{ background: video.thumbGradient ?? DEFAULT_THUMB_GRADIENT }}
                  />
                )}
                {/* Only reached when there's no playable video at all — a
                    real last resort, not the everyday path. */}
                <div className="absolute inset-0 bg-black/45 flex items-center justify-center">
                  <a
                    href={video.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 h-10 px-4 rounded-full bg-white/95 text-[#020508] text-[13px] font-medium hover:bg-white transition-colors"
                  >
                    <ExternalLink size={14} />
                    Watch on {platformLabel}
                  </a>
                </div>
              </>
            )}

            <div className="absolute top-3 left-3 flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full bg-black/45 backdrop-blur-md flex items-center justify-center border border-white/10">
                <PlatformIcon platform={video.platform} size={11} />
              </div>
              <span className="text-[10.5px] text-white/90 bg-black/45 backdrop-blur-md border border-white/10 rounded-full px-2 py-[2px] font-medium tabular-nums">
                {video.duration}
              </span>
            </div>

            {/* Secondary, deliberately small — playback inside the modal is
                the main way to watch now, this is just an escape hatch. */}
            {video.videoUrl && !videoError && (
              <a
                href={video.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={`Open on ${platformLabel}`}
                className="absolute top-3 right-3 flex items-center gap-1 text-[10px] text-white/75 bg-black/45 backdrop-blur-md border border-white/10 rounded-full px-2 py-[3px] font-medium hover:text-white hover:bg-black/60 transition-colors pointer-events-auto"
              >
                <ExternalLink size={9.5} />
                {platformLabel}
              </a>
            )}
          </div>

          {/* info panel */}
          <div className="w-[360px] shrink-0 h-[min(85vh,720px)] overflow-y-auto flex flex-col">
            <div className="px-5 pt-5 pb-4 border-b border-white/[0.07]">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-serif font-medium text-neutral-50 truncate">
                  @{video.username}
                </span>
                <a
                  href={video.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Open on ${platformLabel}`}
                  className="ml-auto w-7 h-7 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-100 hover:bg-white/[0.06] transition-colors shrink-0"
                >
                  <ExternalLink size={14} />
                </a>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => onSaveClick(video)}
                  className={[
                    "flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-[12.5px] font-medium transition-colors press-feedback",
                    video.saved
                      ? "bg-[#D39448] text-[#020508] hover:bg-[#e2b57c]"
                      : "surface-field text-neutral-200 hover:bg-white/[0.06]",
                  ].join(" ")}
                >
                  <Bookmark size={13} fill={video.saved ? "currentColor" : "none"} />
                  {video.saved ? "Saved" : "Save"}
                </button>
                {onAddToCollection && (
                  <button
                    onClick={() => onAddToCollection(video)}
                    className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg surface-field text-[12.5px] text-neutral-200 hover:bg-white/[0.06] transition-colors press-feedback"
                  >
                    <FolderPlus size={13} />
                    Add to collection
                  </button>
                )}
              </div>
            </div>

            <div className="px-5 py-4 border-b border-white/[0.07] space-y-2">
              <StatRow icon={<Eye size={12} />} label="Views" value={video.viewsRaw} />
              <StatRow icon={<Heart size={12} />} label="Likes" value={video.likes} />
              <StatRow icon={<MessageCircle size={12} />} label="Comments" value={video.comments} />
              <StatRow icon={<Share2 size={12} />} label="Shares" value={video.shares} />
              <div className="flex items-center gap-2 pt-1">
                <span className="w-6 h-6 rounded-full bg-white/[0.05] flex items-center justify-center text-neutral-500 shrink-0">
                  <Clock size={12} />
                </span>
                <span className="text-[12.5px] text-neutral-300">Duration</span>
                <span className="ml-auto text-[12.5px] text-neutral-100 font-medium tabular-nums">
                  {video.duration}
                </span>
              </div>
              {video.postedDaysAgo !== undefined && (
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-white/[0.05] flex items-center justify-center text-neutral-500 shrink-0">
                    <CalendarDays size={12} />
                  </span>
                  <span className="text-[12.5px] text-neutral-300">Posted</span>
                  <span className="ml-auto text-[12.5px] text-neutral-100 font-medium tabular-nums">
                    {video.postedDaysAgo === 0 ? "Today" : `${video.postedDaysAgo}d ago`}
                  </span>
                </div>
              )}
            </div>

            {(video.caption || video.tags.length > 0) && (
              <div className="px-5 py-4 border-b border-white/[0.07]">
                {video.caption && <p className="text-[12.5px] text-neutral-300 leading-relaxed">{video.caption}</p>}
                {video.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {video.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[11px] text-[#D39448]/90 bg-[#D39448]/[0.08] rounded-full px-2 py-[3px]"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Prepared for a future AI-tagging layer — intentionally shows no
                scores or verdicts yet, only the shape the UI will eventually fill. */}
            <div className="px-5 py-4 flex-1">
              <div className="flex items-center gap-2 mb-2.5">
                <Sparkles size={12} className="text-neutral-600" />
                <span className="text-[10.5px] tracking-wide uppercase text-neutral-500">AI Insights</span>
                <span className="ml-auto text-[10px] text-neutral-600 bg-white/[0.04] rounded-full px-2 py-[2px]">
                  Coming soon
                </span>
              </div>
              <div className="rounded-xl border border-dashed border-white/[0.09] px-3.5 py-1 divide-y divide-white/[0.05]">
                <AiPlaceholderRow label="Creator Fit" />
                <AiPlaceholderRow label={creator ? `Why it fits ${creator.name}` : "Why it fits this creator"} />
                <AiPlaceholderRow label="Hook" />
                <AiPlaceholderRow label="Setting" />
                <AiPlaceholderRow label="Recreation difficulty" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
