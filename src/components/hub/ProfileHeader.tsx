import { BadgeCheck, Users, Heart, Film } from "lucide-react";
import type { ReelProfileInfo } from "../../types";
import { formatCompactNumber } from "../../lib/formatCount";
import { PlatformIcon } from "./PlatformIcon";

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number | undefined; label: string }) {
  if (value === undefined) return null;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-neutral-500">{icon}</span>
      <span className="text-[13px] text-neutral-100 font-medium tabular-nums">{formatCompactNumber(value)}</span>
      <span className="text-[12px] text-neutral-500">{label}</span>
    </div>
  );
}

export function ProfileHeader({ profile }: { profile: ReelProfileInfo }) {
  return (
    <div className="mb-5 flex items-center gap-4 rounded-2xl surface-panel px-5 py-4">
      <div className="relative shrink-0">
        <div className="w-14 h-14 rounded-full overflow-hidden ring-1 ring-white/15 bg-white/[0.04]">
          {profile.avatarUrl && (
            <img src={profile.avatarUrl} alt={profile.username} className="w-full h-full object-cover" />
          )}
        </div>
        <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#141416] ring-2 ring-[#0a0b0d] flex items-center justify-center">
          <PlatformIcon platform={profile.platform} size={10} />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[14.5px] font-serif font-medium text-neutral-50 truncate">
            {profile.displayName || profile.username}
          </span>
          {profile.verified && <BadgeCheck size={14} className="shrink-0 text-[#D39448]" />}
        </div>
        <p className="text-[12.5px] text-neutral-500">@{profile.username}</p>
        {profile.bio && <p className="mt-1 text-[12px] text-neutral-400 line-clamp-1 max-w-md">{profile.bio}</p>}
      </div>

      <div className="hidden sm:flex items-center gap-5 pl-4 border-l border-white/[0.08] shrink-0">
        <Stat icon={<Users size={13} />} value={profile.followerCount} label="followers" />
        <Stat icon={<Heart size={13} />} value={profile.likesCount} label="likes" />
        <Stat icon={<Film size={13} />} value={profile.videoCount} label="videos" />
      </div>
    </div>
  );
}
