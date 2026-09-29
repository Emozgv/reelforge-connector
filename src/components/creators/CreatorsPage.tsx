import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CalendarClock,
  ChevronDown,
  CircleSlash,
  LayoutGrid,
  List,
  Plus,
  Search,
  Users,
} from "lucide-react";
import type { CollectionsStore } from "../../state/useCollectionsStore";
import type { CreatorsStore } from "../../state/useCreatorsStore";
import type { CreatorPackage } from "../../types";
import { StarfieldBackground } from "../shared/StarfieldBackground";
import { CreatorCard, einrichtungsZustand } from "./CreatorCard";
import { computeCreatorStats } from "./creatorStats";
import { CreatorProfilePage } from "./CreatorProfilePage";
import { CreatorSetupWizard } from "./CreatorSetupWizard";

// Umsetzung des Referenzbildes (1695x928). Die Masse sind daran gemessen und
// mit 0,89 auf 1509 gebracht -- die Breite, auf der wirklich gearbeitet wird.
// Gemessen: Seitenleiste 242 von 1695 (14,3 %, genau wie in der App), Karten
// 670x210 mit 20 Abstand, Kennzahlenkaesten 60 hoch, Reiterleiste 54 hoch.
//
// Container und Kopfzeile sind dieselben wie in Library, Collections und
// Production -- Ueberschrift 36, Rubrik 11,5, Unterzeile 12,5 -- damit alle
// vier Seiten gleich beginnen. Der Creators-Entwurf traegt an der Stelle eine
// kleinere Ueberschrift (33 gegen 40 im Library-Entwurf); die Gleichheit
// zwischen den Seiten wiegt schwerer als der Unterschied zwischen zwei
// Entwuerfen.

// Die Tiefe aus der bestehenden DNA (Dashboard -> Research Accounts ->
// Collections -> Production -> Library): ein Hauch Glanz an der Oberkante
// und ein weicher Schatten darunter. Bewusst NUR die Tiefe -- die
// Flaechenfarben bleiben auf den am Entwurf gemessenen Werten.
const TIEFE = {
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02), 0 16px 32px -18px rgba(0,0,0,0.8)",
} as const;

const GOLD_CTA = {
  backgroundImage: "linear-gradient(90deg, #D39448, #EAC088)",
  boxShadow: "0 6px 20px -6px rgba(211,148,72,0.55)",
} as const;

type Reiter = "alle" | "fertig" | "offen" | "mit_plan" | "ohne_plan";

const REITER: { wert: Reiter; label: string }[] = [
  { wert: "alle", label: "All creators" },
  { wert: "fertig", label: "Setup complete" },
  { wert: "offen", label: "Setup incomplete" },
  { wert: "mit_plan", label: "Active plan" },
  { wert: "ohne_plan", label: "No plan" },
];

type Sortierung = "neu" | "alt" | "name";

const SORTIERUNGEN: { wert: Sortierung; label: string }[] = [
  { wert: "neu", label: "Newest" },
  { wert: "alt", label: "Oldest" },
  { wert: "name", label: "Name" },
];

function Kennzahlkasten({
  Zeichen,
  punkt,
  wert,
  label,
}: {
  Zeichen?: typeof Users;
  punkt?: string;
  wert: number;
  label: string;
}) {
  return (
    <div className="h-[53px] min-w-[116px] px-4 rounded-lg border border-[#0a0c0d] bg-[#030506] flex items-center gap-2.5 shrink-0" style={TIEFE}>
      {Zeichen ? (
        <Zeichen size={15} className="shrink-0 text-[#8c8d91]" />
      ) : (
        <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: punkt }} />
      )}
      <span className="min-w-0">
        <span className="block text-[13px] leading-[16px] text-[#efeff2]">{wert}</span>
        <span className="block text-[10.5px] leading-[13px] text-[#a8a9ad] whitespace-nowrap">{label}</span>
      </span>
    </div>
  );
}

function Auswahlfeld({
  label,
  wert,
  breite,
  offen,
  setOffen,
  children,
}: {
  label: string;
  wert: string;
  breite: string;
  offen: boolean;
  setOffen: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`relative shrink-0 ${breite}`} data-menue>
      <button
        onClick={() => setOffen(!offen)}
        className="press-feedback w-full h-[48px] px-3 rounded-lg border border-[#0a0c0d] bg-[#030506] flex items-center gap-2 text-left hover:border-[#5a3b1b] transition-colors duration-150"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[9.5px] text-[#9a9ba0] leading-none">{label}</span>
          <span className="block mt-[3px] text-[12px] text-neutral-100 leading-none truncate">{wert}</span>
        </span>
        <ChevronDown size={13} className="shrink-0 text-[#939398]" />
      </button>
      {offen && (
        <div className="absolute left-0 top-[52px] z-30 w-full min-w-[150px] rounded-lg surface-panel-strong p-1 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}

function Menuepunkt({ label, gewaehlt, onClick }: { label: string; gewaehlt: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        "w-full text-left px-2.5 py-1.5 rounded-md text-[12px] transition-colors",
        gewaehlt ? "text-neutral-100 bg-white/[0.06]" : "text-neutral-300 hover:bg-white/[0.06]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

export function CreatorsPage({
  creatorsStore,
  collectionsStore,
  creatorPackages,
  onOpenCollection,
  onOpenBilling,
  openCreatorId,
  onOpenCreatorIdChange,
}: {
  creatorsStore: CreatorsStore;
  collectionsStore: CollectionsStore;
  creatorPackages: Map<string, CreatorPackage>;
  onOpenCollection: (collectionId: string) => void;
  onOpenBilling: () => void;
  openCreatorId: string | null;
  onOpenCreatorIdChange: (id: string | null) => void;
}) {
  const activeCreatorId = openCreatorId;
  const setActiveCreatorId = onOpenCreatorIdChange;
  const [createOpen, setCreateOpen] = useState(false);
  const [reiter, setReiter] = useState<Reiter>("alle");
  const [suche, setSuche] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("alle");
  const [sortierung, setSortierung] = useState<Sortierung>("neu");
  const [offen, setOffen] = useState<string | null>(null);

  useEffect(() => {
    if (!offen) return;
    function beiDruck(e: PointerEvent) {
      if (!(e.target as HTMLElement).closest("[data-menue]")) setOffen(null);
    }
    document.addEventListener("pointerdown", beiDruck);
    return () => document.removeEventListener("pointerdown", beiDruck);
  }, [offen]);

  const creators = creatorsStore.creators;

  const zahlen = useMemo(() => {
    const fertig = creators.filter((c) => einrichtungsZustand(c) === "fertig").length;
    const mitPlan = creators.filter((c) => creatorPackages.has(c.id)).length;
    return {
      gesamt: creators.length,
      fertig,
      offen: creators.length - fertig,
      mitPlan,
      ohnePlan: creators.length - mitPlan,
    };
  }, [creators, creatorPackages]);

  const planNamen = useMemo(() => {
    const s = new Set<string>();
    creators.forEach((c) => {
      const p = creatorPackages.get(c.id);
      if (p) s.add(p.planLabel);
    });
    return [...s].sort();
  }, [creators, creatorPackages]);

  const sichtbar = useMemo(() => {
    const begriff = suche.trim().toLowerCase();
    const gefiltert = creators.filter((c) => {
      const plan = creatorPackages.get(c.id);
      if (reiter === "fertig" && einrichtungsZustand(c) !== "fertig") return false;
      if (reiter === "offen" && einrichtungsZustand(c) !== "offen") return false;
      if (reiter === "mit_plan" && !plan) return false;
      if (reiter === "ohne_plan" && plan) return false;
      if (planFilter !== "alle" && plan?.planLabel !== planFilter) return false;
      if (!begriff) return true;
      return (
        c.name.toLowerCase().includes(begriff) ||
        c.handle.toLowerCase().includes(begriff) ||
        c.traits.some((t) => t.toLowerCase().includes(begriff))
      );
    });
    return gefiltert.sort((a, b) => {
      if (sortierung === "name") return a.name.localeCompare(b.name);
      const av = a.updatedAt ?? "";
      const bv = b.updatedAt ?? "";
      return sortierung === "alt" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [creators, creatorPackages, reiter, planFilter, suche, sortierung]);

  const activeCreator = creators.find((c) => c.id === activeCreatorId) ?? null;

  if (activeCreator) {
    return (
      <CreatorProfilePage
        creator={activeCreator}
        collections={collectionsStore.collections}
        creatorsStore={creatorsStore}
        plan={creatorPackages.get(activeCreator.id)}
        onOpenBilling={onOpenBilling}
        onBack={() => setActiveCreatorId(null)}
        onOpenCollection={onOpenCollection}
        onCreateCollection={collectionsStore.createCollection}
      />
    );
  }

  return (
    <div className="relative h-full overflow-y-auto" style={{ background: "#010304" }}>
      <style>{`
        .rf-creators-starfield .star-twinkle { opacity: 0.6 !important; box-shadow: 0 0 4px rgba(255,250,240,0.45) !important; transform: scale(0.85); }
        @media (prefers-reduced-motion: no-preference) {
          .rf-creators-starfield .star-twinkle { animation-name: star-twinkle-boosted !important; }
        }
      `}</style>

      <div className="relative max-w-[1900px] mx-auto px-6 xl:px-8 pt-8 pb-8">
        <div className="dashboard-starfield-boost rf-creators-starfield pointer-events-none absolute inset-x-0 top-0 h-[160px] overflow-hidden">
          <StarfieldBackground starCount={110} />
        </div>

        <div className="relative flex items-start justify-between gap-6">
          <div className="min-w-0">
            <span className="block text-[11.5px] tracking-[0.22em] uppercase text-[#D39448] font-medium">Creators</span>
            <h1 className="mt-1 font-serif font-medium text-[36px] tracking-[-0.6px] text-[#f2f0ef]">
              Your creator roster.
            </h1>
            <p className="mt-1.5 text-[12.5px] text-[#bdbdc1]">
              Manage all your creators, their content, and creative profiles — in one place.
            </p>
          </div>

          <button
            onClick={() => setCreateOpen(true)}
            className="shrink-0 h-9 px-4 rounded-lg flex items-center gap-2 text-[12.5px] font-medium text-[#020508] hover:brightness-110 transition-[filter] duration-150 press-feedback"
            style={GOLD_CTA}
          >
            <Plus size={14} strokeWidth={2.4} />
            New Creator
          </button>
        </div>

        {/* Kennzahlen und Suche -- im Entwurf eine Reihe, Kaesten 60 hoch. */}
        <div className="relative mt-6 flex items-center gap-[14px]">
          <Kennzahlkasten Zeichen={Users} wert={zahlen.gesamt} label="Total creators" />
          <Kennzahlkasten punkt="#3fd096" wert={zahlen.fertig} label="Setup complete" />
          <Kennzahlkasten punkt="#f2b552" wert={zahlen.offen} label="Setup incomplete" />
          <Kennzahlkasten punkt="#5eb1ff" wert={zahlen.mitPlan} label="With active plan" />
          <Kennzahlkasten punkt="#6f7075" wert={zahlen.ohnePlan} label="No plan" />

          <div className="relative flex-1 min-w-[140px] max-w-[470px]">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#a8a9ad]" />
            <input
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Search creators, @handles, or tags..."
              className="w-full h-[53px] pl-10 pr-3 rounded-lg border border-[#111111] bg-[#090909] text-[12.5px] text-neutral-100 placeholder:text-neutral-500 outline-none focus-glow"
            />
          </div>
        </div>

        {/* Reiter, Planfilter, Sortierung, Ansicht -- Leiste 54 hoch. */}
        <div className="relative mt-3 flex items-center gap-2.5">
          <div className="h-[48px] p-1 rounded-lg border border-[#0a0c0d] bg-[#030506] flex items-center gap-1 shrink-0" style={TIEFE}>
            {REITER.map((r) => (
              <button
                key={r.wert}
                onClick={() => setReiter(r.wert)}
                className={[
                  "press-feedback h-[38px] px-[22px] rounded-md text-[12.5px] whitespace-nowrap transition-colors duration-150",
                  reiter === r.wert
                    ? "text-[#EAC088] border border-[#5a3b1b] bg-[#2f2113]"
                    : "text-[#dcdcde] hover:text-white",
                ].join(" ")}
              >
                {r.label}
              </button>
            ))}
          </div>

          <Auswahlfeld
            label="Plan"
            wert={planFilter === "alle" ? "All plans" : planFilter}
            breite="w-[136px]"
            offen={offen === "plan"}
            setOffen={(v) => setOffen(v ? "plan" : null)}
          >
            <Menuepunkt label="All plans" gewaehlt={planFilter === "alle"} onClick={() => { setPlanFilter("alle"); setOffen(null); }} />
            {planNamen.map((n) => (
              <Menuepunkt key={n} label={n} gewaehlt={planFilter === n} onClick={() => { setPlanFilter(n); setOffen(null); }} />
            ))}
          </Auswahlfeld>

          <Auswahlfeld
            label="Sort by"
            wert={SORTIERUNGEN.find((s) => s.wert === sortierung)?.label ?? "Newest"}
            breite="w-[138px]"
            offen={offen === "sort"}
            setOffen={(v) => setOffen(v ? "sort" : null)}
          >
            {SORTIERUNGEN.map((s) => (
              <Menuepunkt key={s.wert} label={s.label} gewaehlt={sortierung === s.wert} onClick={() => { setSortierung(s.wert); setOffen(null); }} />
            ))}
          </Auswahlfeld>

          {/* Der Entwurf zeigt einen Umschalter zwischen Raster und Liste.
              Eine Listenansicht ist darin nicht gezeichnet; sie zu erfinden
              waere eine zweite Seite. Der Umschalter bleibt deshalb sichtbar
              und sagt das beim Darueberfahren. */}
          <div className="ml-auto shrink-0 h-[48px] p-1 rounded-lg border border-[#0a0c0d] bg-[#030506] flex items-center gap-1" style={TIEFE}>
            <span
              title="Grid view"
              className="w-[42px] h-[38px] rounded-md flex items-center justify-center text-[#EAC088] border border-[#5a3b1b] bg-[#20190d]"
            >
              <LayoutGrid size={15} />
            </span>
            <span
              title="List view isn't built yet"
              className="w-[42px] h-[38px] rounded-md flex items-center justify-center text-[#6f7075] cursor-default select-none"
            >
              <List size={15} />
            </span>
          </div>
        </div>

        {creatorsStore.error && (
          <p className="relative mt-4 text-[12px] text-rose-300/85 rounded-lg surface-field px-3 py-2 max-w-lg">
            Couldn't load Creators — {creatorsStore.error}
          </p>
        )}

        {!creatorsStore.error && sichtbar.length === 0 && (
          <div className="relative mt-4 rounded-xl border border-[#0f0c06] bg-[#050505] py-16 text-center">
            {creators.length === 0 ? (
              <>
                <Users size={20} className="mx-auto text-neutral-700 mb-2.5" />
                <p className="text-[13px] text-neutral-400">No creators yet.</p>
                <p className="text-[12px] text-neutral-600 mt-1">Add your first Creator to get started.</p>
              </>
            ) : (
              <>
                {reiter === "ohne_plan" ? (
                  <CircleSlash size={20} className="mx-auto text-neutral-700 mb-2.5" />
                ) : reiter === "mit_plan" ? (
                  <BadgeCheck size={20} className="mx-auto text-neutral-700 mb-2.5" />
                ) : (
                  <CalendarClock size={20} className="mx-auto text-neutral-700 mb-2.5" />
                )}
                <p className="text-[13px] text-neutral-400">No creator matches this filter.</p>
              </>
            )}
          </div>
        )}

        {/* Zwei Spalten wie im Entwurf, und zwar so lange wie irgend moeglich.
            Vorher brauchte eine Spalte 560 Punkte, dadurch kippte das Raster
            schon unter rund 1420 Fensterbreite auf eine einzige Karte, die
            sich dann ueber die volle Breite zog -- das sah aus wie
            hereingezoomt. Jetzt halten zwei Spalten bis 1380 durch --
            gemessen: darunter faellt die Karte unter 500 Punkte und Name,
            Handle und Beschriftungen fangen an abzuschneiden. Unterhalb
            bleibt die einzelne Karte auf Kartenbreite stehen statt sich
            ueber die ganze Breite zu strecken. */}
        <div className="relative mt-4 grid gap-x-[18px] gap-y-[11px] grid-cols-1 max-w-[640px] min-[1380px]:grid-cols-2 min-[1380px]:max-w-none">
          {sichtbar.map((creator) => (
            <CreatorCard
              key={creator.id}
              creator={creator}
              stats={computeCreatorStats(creator.id, collectionsStore.collections)}
              plan={creatorPackages.get(creator.id)}
              onOpen={() => setActiveCreatorId(creator.id)}
            />
          ))}
        </div>
      </div>

      <CreatorSetupWizard
        open={createOpen}
        creatorsStore={creatorsStore}
        onCreatorCreated={(creatorId) => void collectionsStore.syncQuickSavesForCreator(creatorId)}
        onClose={() => setCreateOpen(false)}
        onDone={(creatorId) => {
          setCreateOpen(false);
          setActiveCreatorId(creatorId);
        }}
      />
    </div>
  );
}
