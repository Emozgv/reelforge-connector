// ReelForge Connector's live research session server.
//
// This is the actual architecture change behind "the real authenticated
// session is the source of truth for the active Research session, not a
// database of previously-synced reels." A Research Account's swipe
// experience used to be reconstructed from client_os.research_feed_items —
// a queue built and periodically refilled from past syncs. That meant
// "next"/"previous" were really just moving a pointer through a locally
// re-filtered array, which could (and did) shift underneath the VA as the
// underlying data changed. Here, ReelForge's web app talks to this server
// directly (http://127.0.0.1:PORT, no deep link, no relaunch) and every
// "next" into genuinely new territory is a real scroll on a real, still-
// open Instagram Reels tab, with a real network response read back — not a
// guess reconstructed from storage. Going backward replays this session's
// own history in memory (also real: it's exactly what was already
// extracted from the live page), never a database re-query.
//
// One Node process, spawned once when Connector starts (see lib.rs) and
// kept running for the app's lifetime. Sessions are held in memory only —
// nothing here is persisted to Supabase. A session with no heartbeat for
// SESSION_TIMEOUT_MS is closed automatically, so a VA who just closes the
// tab (crash, force-quit, forgot) never leaves a real logged-in browser
// context running forever.
import http from "node:http";
import { execFile } from "node:child_process";
import { appendFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

// Jede Protokollzeile bekommt die Uhrzeit auf die Millisekunde. Ohne sie
// laesst sich nicht sagen, wie lange ein Mitarbeiter auf einem Reel stand --
// und genau das ist die Frage bei der Verweildauer.
for (const art of ["log", "error"]) {
  const alt = console[art].bind(console);
  console[art] = (...teile) => alt(new Date().toISOString().slice(11, 23), ...teile);
}

const PORT = Number(process.env.REELFORGE_SESSION_SERVER_PORT ?? 48211);
const FETCH_SESSION_URL = process.env.REELFORGE_FETCH_SESSION_URL
  ?? "https://vbnilccvnygeedkdfbvd.supabase.co/functions/v1/fetch-research-account-session";
const SUBMIT_LIVE_REEL_URL = process.env.REELFORGE_SUBMIT_LIVE_REEL_URL
  ?? "https://vbnilccvnygeedkdfbvd.supabase.co/functions/v1/submit-research-live-reel";
const RESOLVE_TOKEN_URL = process.env.REELFORGE_RESOLVE_TOKEN_URL
  ?? "https://vbnilccvnygeedkdfbvd.supabase.co/functions/v1/resolve-live-session-token";
// How low `pending` must drop (right after a fresh delivery) before
// maybePrefetch() below fires a background top-up. Deliberately not the
// smallest value that would technically work (1) -- the V1 goal is making
// batch boundaries feel invisible despite real, sometimes-long Instagram
// refill latency, not minimizing prefetch nudges. Real [trace-prefetch]
// evidence showed successful prefetches take ~41-57s even starting from 3,
// so 3 rarely bought enough head start against faster swiping -- 10 is the
// V1 balance between enough lead time to hide that latency more often and
// staying reasonably close to recent interaction signals (Likes/Follows)
// rather than preloading excessively far ahead. Still env-overridable for
// local comparison if real usage ever shows a concrete reason to revisit it.
const PREFETCH_LOW_WATER_MARK = Number(process.env.REELFORGE_PREFETCH_THRESHOLD ?? 10);
// How long maybePrefetch() below keeps re-nudging (ArrowDown, then poll)
// before giving up, once triggered. Based on real [trace] evidence from an
// actual Connector run (session-server.log): once a batch was genuinely
// exhausted, real recovery took 7-8 consecutive nudge-and-wait cycles
// spread across roughly 60-70s before Instagram served anything new --
// nowhere close to the single ~4-8s attempt the original ensurePending()
// design assumed. 90s gives real margin above that observed worst case
// without looping indefinitely. Each cycle reuses ensurePending(4000)
// completely unmodified, so the actual nudge cadence (~1 press per ~4s)
// matches what was observed to eventually work.
const PREFETCH_MAX_DURATION_MS = 90_000;

// The web app heartbeats every 15s while the tab is active — but browsers
// throttle setInterval in a *backgrounded* tab (Chrome can drop to roughly
// one firing per minute after a few minutes hidden), which is the normal,
// harmless case of a VA just switching tabs, not an abandoned session. A
// too-tight timeout here was reaping perfectly live sessions out from under
// a VA who'd only tabbed away — root cause of "the feed gets stuck after
// switching tabs." 5 minutes comfortably outlasts realistic background
// throttling while still closing a genuinely abandoned session (tab closed,
// beforeunload/pagehide didn't get a chance to fire) in reasonable time.
// The web app's own visibilitychange handler (see useLiveResearchSession)
// is the fast path back for anything beyond this — it re-checks and
// recovers the instant a tab becomes visible again, rather than waiting.
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;

// Ist das naechste Reel noch nicht bereit, wartet ReelForge -- und zwar
// lange. Emres Regel vom 09.10.2026: "Wenn da keine Reels kommen, dann
// komme ich halt in dieses Fenster, wo es grau laedt, und warte einfach,
// egal wie lange." Es wird NIE ins Leere geklickt.
// Die Kette dahinter muss zusammenpassen, sonst bricht jemand frueher ab:
//   warten 55 s  <  Frist der Anfrage 60 s  <  Notbremse der Sperre 65 s
const WARTEN_AUF_REEL_MS = 55_000;
// Instagram/TikTok are otherwise identical from here down — this is the one
// map that actually varies per platform: where the live For-You/Reels
// surface lives, and which domain its own internal JSON responses come
// from (used below to scope response-sniffing per session).
const REEL_URL = { instagram: "https://www.instagram.com/reels/", tiktok: "https://www.tiktok.com/foryou" };
const PLATFORM_DOMAIN = { instagram: "instagram.com", tiktok: "tiktok.com" };

// Same reasoning as connect-worker.mjs: force English so the real Like
// button's accessible name ("Like"/"Unlike") is actually there to find,
// regardless of the host machine's own locale.
const AUTOMATION_CONTEXT_OPTIONS = {
  locale: "en-US",
  extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
};

// macOS doesn't bundle a downloaded Chromium (see prepare-bundled-runtime.mjs
// and connect-worker.mjs's IS_MAC — same reasoning) — every live Research
// session instead drives the VA's own already-installed Google Chrome.
// Windows keeps the bundled Chromium exactly as before.
const IS_MAC = process.platform === "darwin";

// Startet den Browser fuer alles, was eine echte Seite laden oder abspielen
// muss -- immer das vom Nutzer installierte Google Chrome.
//
// Warum nicht Playwrights mitgeliefertes Chromium: dem fehlen die
// proprietaeren Codecs. Nachgemessen (06.10.2026):
//
//   Google Chrome        H.264 "probably"  AAC "probably"
//   gebuendeltes Chromium  H.264 ---         AAC ---
//
// Instagram-Reels sind H.264/AAC. Auf Windows lief deshalb im Hintergrund
// nie ein Reel ab, waehrend es auf macOS lief -- nicht weil Windows anders
// gebaut werden sollte, sondern weil die macOS-Umstellung (Apple konnte
// Chromium nicht notarisieren) den Codec-Unterschied unbemerkt mitgebracht
// hat. Beide Plattformen laufen jetzt auf demselben Weg.
//
// Der Rueckfall gilt nur fuer Windows und nur, wenn dort gar kein Chrome
// installiert ist: dann laeuft es exakt so weiter wie bisher. Schlechter
// als heute kann es dadurch nicht werden. Auf macOS bleibt es beim harten
// Fehler, denn dort gibt es kein mitgeliefertes Chromium, auf das man
// zurueckfallen koennte.
async function starteBrowser(optionen = {}) {
  try {
    return await chromium.launch({ ...optionen, channel: "chrome" });
  } catch (err) {
    if (IS_MAC) throw err;
    console.log("[browser] Kein Google Chrome gefunden -- faellt auf das mitgelieferte Chromium zurueck (ohne H.264/AAC laeuft dort kein Reel-Video).");
    return await chromium.launch(optionen);
  }
}

// ===========================================================================
// DIE BUEHNE (V2)
//
// V1 reichte dem Kunden die Adresse der Videodatei durch, und ReelForge
// spielte eine eigene Kopie ab. Instagram sah davon nichts -- gemessen am
// 06.10.2026: 2 Minuten Sitzung, 9 Reels beim Kunden, und Instagram sah
// einen Account, der ein einziges Reel 13 Mal in Schleife ansieht.
//
// V2 reicht stattdessen Instagrams eigenes Video durch: Bild und Ton kommen
// als EIN Strom beim Kunden an, und seine Wische gehen in denselben Tab
// zurueck. Was der Mitarbeiter sieht, IST Instagram -- also zaehlt Instagram
// auch, was er tut.
//
// Der Weg ist captureStream() direkt am <video>, nicht das Abfilmen des Tabs.
// Beides wurde gemessen (06.10.2026), und der Unterschied ist deutlich:
//
//   Tab abfilmen        420x746 Fenster -> 420x458 Bild (schneidet ab),
//                       Ton gar nicht dabei (ein unsichtbarer Browser hat
//                       kein Tonausgabegeraet), und macOS verlangt die
//                       Berechtigung "Bildschirmaufnahme" mit Systemdialog
//                       und Neustart.
//   captureStream()     720x1280 in Originalgroesse, resizeMode "none",
//                       Ton direkt dabei (Pegel 0,50), keine Berechtigung,
//                       kein Dialog.
//
// Ohne --autoplay-policy spielt Instagram nur stumm; der Schalter hebt die
// Sperre auf, damit das Reel mit Ton laeuft.
// ===========================================================================
// Welches Reel kam wann, in welcher Sitzung?
//
// Emre hatte den Eindruck, ueber mehrere Neustarts hinweg dieselben Reels zu
// sehen (10.10.2026). Innerhalb EINER Sitzung faellt eine Wiederholung schon
// auf ([trace-dup]) -- ueber Sitzungsgrenzen hinweg wusste bisher niemand
// etwas. Deshalb dieses schlichte Heft: eine Zeile je ausgeliefertem Reel,
// ueber Neustarts hinweg. Es beantwortet die Frage, ohne irgendetwas am Feed
// zu aendern.
const REEL_HEFT = path.join(path.dirname(fileURLToPath(import.meta.url)), "reel-verlauf.jsonl");
const reelFrueher = new Map();
try {
  if (existsSync(REEL_HEFT)) {
    for (const zeile of readFileSync(REEL_HEFT, "utf8").split("\n")) {
      if (!zeile.trim()) continue;
      const e = JSON.parse(zeile);
      if (!reelFrueher.has(e.reel)) reelFrueher.set(e.reel, e);
    }
    console.log(`[reel-heft] ${reelFrueher.size} frueher gesehene Reels geladen.`);
  }
} catch (err) {
  console.log(`[reel-heft] nicht lesbar (${err?.message}) -- faengt neu an.`);
}

function reelNotieren(sitzung, reel) {
  try {
    const frueher = reelFrueher.get(reel);
    if (frueher && frueher.sitzung !== sitzung) {
      console.log(`[reel-wiederholung] ${reel} kam schon am ${frueher.zeit} in Sitzung ${frueher.sitzung} -- jetzt wieder in ${sitzung}.`);
    }
    const eintrag = { reel, sitzung, zeit: new Date().toISOString() };
    if (!frueher) reelFrueher.set(reel, eintrag);
    appendFileSync(REEL_HEFT, JSON.stringify(eintrag) + "\n");
  } catch {
    /* Mitschreiben darf den Feed nie aufhalten. */
  }
}

// Unser Erkennungszeichen auf dem unsichtbaren Chrome.
//
// Chrome ignoriert unbekannte Schalter, aber er steht danach in der
// Prozesszeile. Damit laesst sich zweifelsfrei sagen, welcher Chrome von
// uns stammt -- und nur solche werden spaeter weggeraeumt. Ohne den
// Stempel muesste man nach Mustern raten ("unsichtbar und alt"), und raten
// heisst hier: man koennte den eigenen Browser des Nutzers erwischen.
const CONNECTOR_STEMPEL = "--reelforge-connector";

const BUEHNE_ARGS = ["--autoplay-policy=no-user-gesture-required", CONNECTOR_STEMPEL];

// Liegengebliebene Browser von frueher wegraeumen.
//
// Eine Sitzung macht ihren Browser beim Beenden selbst zu, und wird der
// Connector normal beendet, schliesst er vorher alle Sitzungen. Nur wenn
// er HART abgeschossen wird, kommt niemand mehr dazu -- dann lebt der
// Browser weiter. Am 10.10.2026 lagen so sieben Stueck herum, ein bis zwei
// Tage alt, zusammen rund 2 GB Arbeitsspeicher.
//
// Gekehrt wird ausschliesslich BEIM START. In dem Moment gibt es noch
// keine Sitzung, also ist alles mit unserem Stempel zwingend eine Leiche
// von frueher. Im laufenden Betrieb wird nie gekehrt: dort koennte ein
// Browser zu einer offenen Sitzung gehoeren, und eine laufende Sitzung
// abzuwuergen ist das Schlimmste, was hier passieren darf.
function leichenWegraeumen() {
  execFile("/bin/ps", ["-Ao", "pid=,command="], (fehler, ausgabe) => {
    if (fehler) {
      console.log(`[aufraeumen] Prozessliste nicht lesbar (${fehler.message}) -- uebersprungen.`);
      return;
    }
    const leichen = [];
    for (const zeile of ausgabe.split("\n")) {
      // Nur unser Stempel zaehlt, und nur der Hauptprozess: Chromes
      // Unterprozesse tragen "--type=..." und gehen mit dem Hauptprozess
      // von selbst mit.
      if (!zeile.includes(CONNECTOR_STEMPEL) || zeile.includes("--type=")) continue;
      const pid = Number(zeile.trim().split(/\s+/)[0]);
      if (Number.isInteger(pid) && pid > 0 && pid !== process.pid) leichen.push(pid);
    }
    if (leichen.length === 0) return;
    let zu = 0;
    for (const pid of leichen) {
      try {
        process.kill(pid, "SIGTERM");
        zu++;
      } catch {
        /* schon weg, auch gut */
      }
    }
    console.log(`[aufraeumen] ${zu} liegengebliebene(n) Browser von frueher geschlossen.`);
  });
}

// Haelt ReelForge das Reel an, solange ein Profil offen ist?
//
// Am 10.10.2026 erst aus, dann wieder an.
//
// AUS, weil Emre direkt nach dem Einbau meldete, der Ton im Research laufe
// nicht mehr richtig. Verdaechtigt hatte ich B.tonAnklemmen: laesst
// Instagram ein Reel neu anlaufen, stirbt die Tonspur aus captureStream().
//
// WIEDER AN, weil kurz darauf im Protokoll ein anderer Fehler auftauchte,
// der denselben Eindruck erzeugt: Das Reel wurde angehalten und NIE wieder
// gestartet (ReelForge baut die Profil-Flaeche doppelt auf, das zweite
// Anhalten merkte sich faelschlich "lief vorher nicht"). Dann hoert man
// natuerlich nichts -- weil das Reel steht, nicht weil der Ton kaputt ist.
// Dieser Fehler ist seitdem behoben.
//
// Zu pruefen bleibt, ob der Ton nach dem Zurueckkommen wirklich wieder da
// ist. Falls nicht, war die erste Vermutung doch richtig -- dann hier
// wieder auf false.
const PROFIL_HAELT_REEL_AN = true;

// Die Research-Schicht auf dem Profil: Instagrams Raster bleibt Instagrams
// Raster, bekommt aber unsere Kennzahlen auf die Kacheln gelegt.
//
// Geht etwas schief, steht hier false und das Profil ist wieder blankes
// Instagram -- ohne dass irgendwo anders etwas angefasst werden muss.
const PROFIL_FORSCHUNG = true;
// Normales Rechnerfenster, nicht Handybreite.
//
// 08.10.2026: Mit 420 Pixeln Breite liefert Instagram das schmale Layout --
// und das hat KEINE Pfeil-Knoepfe (nachgewiesen: gefunden wurden nur Home,
// Search, Reels, New post, Messages, Like, Comment, Share, Save, More).
// Wir haben deshalb Tastatur-Pfeile hineingeschickt und gehofft, Instagram
// behandelt das wie einen echten Klick. Auf normaler Breite zeigt Instagram
// seine eigenen Pfeile am rechten Rand -- genau die, die Emre benutzt.
//
// Fuer das Bild aendert das nichts: abgegriffen wird das <video>-Element in
// seiner eigenen Aufloesung, nicht ein Fensterausschnitt.
const BUEHNE_FENSTER = { width: 1280, height: 860 };


// Laeuft IN der Instagram-Seite.
const BUEHNE_SKRIPT = () => {
  const B = (window.__buehne = { pc: null, protokoll: [] });
  const sag = (t) => B.protokoll.push(t);

  B.videoImBild = () => {
    const alle = [...document.querySelectorAll("video")];
    const sichtbar = alle.filter((v) => {
      const r = v.getBoundingClientRect();
      return r.height > 100 && r.top < innerHeight && r.bottom > 0;
    });
    return sichtbar.find((v) => !v.paused) ?? sichtbar[0] ?? null;
  };


  // EINE Tonleitung fuer die ganze Sitzung. Sie wird nie getauscht.
  //
  // 08.10.2026, in der Nachstellung GEMESSEN. Vorher wurde bei jedem
  // Reelwechsel auch die Tonspur ausgetauscht. Der Empfaenger haelt das
  // Bild daraufhin ein Stueck zurueck, damit es zum Ton passt -- und gibt
  // dieses Stueck nie wieder her. Ueber 60 Reelwechsel:
  //
  //      Tonspur wird getauscht   Rueckstand 0 -> 21 Bilder, Stau 7 -> 821 ms
  //      feste Tonleitung         Rueckstand 0 ->  0 Bilder, Stau 11 -> 22 ms
  //
  // Das ist Emres "es kippt irgendwann und kommt nicht mehr hoch": nicht
  // ein Ereignis, sondern sechzig kleine, die sich aufsummieren. Deshalb
  // half weder langsamer wischen noch eine Begrenzung der Bildrate, und
  // deshalb war auch die Bildspur unschuldig -- mit fester Bildleitung
  // (Leinwand) wuchs es genauso weiter, solange der Ton getauscht wurde.
  //
  // Dahinter wird nur noch umgesteckt, welches Reel hineinspielt.
  B.tonBus = () => {
    if (B.bus) return B.bus;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const ziel = ctx.createMediaStreamDestination();
    B.bus = { ctx, ziel, spur: ziel.stream.getAudioTracks()[0] ?? null };
    return B.bus;
  };

  // Dieses Reel in die Tonleitung stecken, das vorherige abziehen.
  // An Instagrams Player wird dabei NICHTS veraendert -- Begruendung unten.
  B.tonAnklemmen = async (v) => {
    const bus = B.tonBus();
    if (!bus.spur) return false;
    try { if (bus.ctx.state === "suspended") await bus.ctx.resume(); } catch { /* egal */ }
    // Schon angeklemmt? Nur dann aussteigen, wenn hinten auch wirklich noch
    // etwas hineinspielt.
    //
    // 08.10.2026, Emres Befund: "beim zweiten Anschauen desselben Reels ist
    // der Ton weg". Faengt Instagram das Reel von vorn an, bleibt das
    // Element dasselbe -- die Tonspur aus captureStream() stirbt dabei aber.
    // Mit einem blossen "ist ja schon angeklemmt" blieb die Leitung auf der
    // toten Spur haengen, und es war fuer immer still. Deshalb wird hier
    // zusaetzlich geprueft, ob die eingesteckte Spur noch lebt.
    if (B.tonQuelle === v && B.tonEingangSpur && B.tonEingangSpur.readyState === "live") {
      return true;
    }

    // Der Ton kommt aus captureStream(), NICHT direkt vom Element.
    //
    // 08.10.2026, zwei Anlaeufe gebraucht:
    //   1. Erst ueber createMediaElementSource am Element selbst. Instagrams
    //      Player ist aber stumm, und der haengt am AUSGANG des Elements --
    //      es kam gar kein Ton mehr.
    //   2. Dann den Stummschalter geloest. Darauf hat Instagrams Video
    //      AUFGEHOERT zu spielen (gemessen: quelleLaeuft=false, Zeit stand
    //      ueber zwei Minuten bei 0,97 s). Entstummen stoppt die Wiedergabe.
    //
    // captureStream() dagegen kommt am Stummschalter vorbei (gemessen am
    // 06.10.2026: Pegel 0,4966 stumm gegen 0,4514 entstummt) und laesst
    // Instagrams Player voellig unberuehrt. Genau das wird hier als Eingang
    // benutzt -- und hinten bleibt die Leitung dieselbe wie seit dem Start.
    let strom;
    try { strom = B.spurenVon(v).strom; } catch { return false; }
    if (!strom || strom.getAudioTracks().length === 0) return false;

    if (B.tonEingang) {
      try { B.tonEingang.disconnect(); } catch { /* egal */ }
      B.tonEingang = null;
    }
    try {
      B.tonEingang = bus.ctx.createMediaStreamSource(strom);
      B.tonEingang.connect(bus.ziel);
      B.tonEingangSpur = strom.getAudioTracks()[0] ?? null;
    } catch { return false; }
    B.tonQuelle = v;
    return true;
  };

  B.spurenVon = (v) => {
    if (!v.captureStream) throw new Error("captureStream gibt es in diesem Browser nicht");
    // Instagrams Player wird bewusst NICHT entstummt. Gemessen am
    // 06.10.2026: captureStream traegt den Ton auch von einem stummen
    // Element (Pegel 0,4966 gegen 0,4514 beim entstummten). Wir aendern an
    // deren Seite also gar nichts -- weniger Eingriff, weniger, das
    // kaputtgehen kann.
    const strom = v.captureStream();
    const bild = strom.getVideoTracks()[0] ?? null;
    // Instagram wirft Video-Elemente weg, wann es will -- beim Wischen, beim
    // Oeffnen der Kommentare, beim eigenen Nachladen. Stirbt das Element,
    // stirbt unsere Spur mit, der Strom versiegt und beim Mitarbeiter steht
    // das Bild. Gemessen am 06.10.2026: spur=ended, waehrend Instagram
    // laengst ein anderes Element abspielte.

    return { bild, ton: strom.getAudioTracks()[0] ?? null, strom };
  };

  // Wartet, bis Instagram ein Video hat, das sich wirklich abgreifen laesst.
  //
  // Ein einzelner Zugriff zum falschen Zeitpunkt war die Ursache dafuer,
  // dass die Buehne mit "Das Reel liefert keine Bildspur" aufgab und nie
  // wiederkam: solange das Vorspulen beim Start noch existierte, verging
  // genug Zeit, bis Instagram soweit war -- danach griff sie sofort zu.
  // Zeitpunkte sind nicht verlaesslich, Zustaende schon.
  B.warteAufVideo = async (hoechstens = 20000) => {
    const ende = Date.now() + hoechstens;
    let zuletzt = "kein Video gefunden";
    while (Date.now() < ende) {
      const v = B.videoImBild();
      if (v) {
        if (v.videoWidth > 0 && v.readyState >= 2) {
          try {
            if (v.captureStream().getVideoTracks()[0]) return { v };
            zuletzt = "Video liefert noch keine Bildspur";
          } catch (e) { zuletzt = String(e?.message ?? e); }
        } else {
          zuletzt = `Video noch nicht bereit (${v.videoWidth}x${v.videoHeight}, readyState ${v.readyState})`;
        }
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return { fehler: `Instagram hat in ${Math.round(hoechstens / 1000)}s kein abspielbares Reel geliefert (${zuletzt}).` };
  };

  B.starte = async () => {
    B.protokoll = [];
    const warte = await B.warteAufVideo();
    if (warte.fehler) return { fehler: warte.fehler };
    const v = warte.v;
    let spuren;
    try { spuren = B.spurenVon(v); }
    catch (e) { return { fehler: String(e?.message ?? e) }; }
    if (!spuren.bild) return { fehler: "Das Reel liefert keine Bildspur." };
    sag(`Quelle ${v.videoWidth}x${v.videoHeight}, Ton ${spuren.ton ? "dabei" : "FEHLT"}`);

    // Bewusst eine lokale Verbindung: liefe der Aufbau zweimal gleichzeitig
    // (React ruft Effekte im Entwicklungsmodus absichtlich doppelt auf),
    // dann schriebe der zweite Lauf B.pc um, waehrend der erste noch
    // aushandelt -- und dessen setLocalDescription landete auf der fremden
    // Verbindung. Genau das ist am 06.10.2026 passiert:
    // "The order of m-lines in subsequent offer doesn't match".
    B.strom = spuren.strom;
    B.quelle = v;
    // B.tonQuelle gehoert ab jetzt allein B.tonAnklemmen. Wurde es hier
    // vorab gesetzt, hielt sich tonAnklemmen fuer schon angeklemmt, stieg
    // sofort aus und legte den Abgriff nie an -- Ergebnis: voellige Stille,
    // ohne jede Fehlermeldung. (08.10.2026 in der Nachstellung gefunden.)

    // Bild und Ton kommen aus DERSELBEN Quelle -- Instagrams eigenem
    // <video>. Dadurch sind sie vom Browser zusammen getaktet und koennen
    // gar nicht auseinanderlaufen.
    //
    // Der Umweg ueber eine Zeichenflaeche (abmalen, neu kodieren) wurde
    // gebaut und wieder verworfen: er sollte das Vollbild-Warten beim
    // Elementwechsel vermeiden, nahm aber fuer das Bild einen laengeren Weg
    // als fuer den Ton. Gemessen am 07.10.2026, zehn Wische in einer
    // Sekunde, laengster Stillstand beim Zuschauer:
    //
    //     ueber die Zeichenflaeche   1200-1400 ms
    //     direkt vom Element                0 ms
    //
    // Das Vollbild-Warten war in Wahrheit nie das Problem. Es entstand
    // dadurch, dass beim schnellen Wischen mehrere Umhaengevorgaenge
    // gleichzeitig liefen und sich gegenseitig zerlegten -- siehe
    // B.nachfuehren, das jetzt nur noch eines zur Zeit zulaesst.
    const pc = new RTCPeerConnection();
    // Der Ton geht ueber die feste Leitung (siehe B.tonBus) und wird fuer
    // den Rest der Sitzung nicht mehr angefasst.
    const tonBus = B.tonBus();
    await B.tonAnklemmen(v);
    pc.addTrack(spuren.bild, spuren.strom);
    if (tonBus.spur) pc.addTrack(tonBus.spur, spuren.strom);

    // Ohne das regelt WebRTC die Aufloesung herunter, sobald es eng wird --
    // gemessen: 180x320 statt 720x1280. Beide Enden sitzen auf demselben
    // Rechner, eng wird es nie, und ein koerniges Reel kann der Mitarbeiter
    // nicht beurteilen.
    const sender = pc.getSenders().find((x) => x.track?.kind === "video");
    if (sender) {
      const par = sender.getParameters();
      par.degradationPreference = "maintain-resolution";
      par.encodings = [{ maxBitrate: 6000000, scaleResolutionDownBy: 1 }];
      try { await sender.setParameters(par); } catch { /* aeltere Chrome-Fassungen */ }
    }

    await pc.setLocalDescription(await pc.createOffer());
    // Ohne Trickle: beide Enden sitzen auf demselben Rechner, das Sammeln
    // dauert Millisekunden und spart eine zweite Leitung fuer Kandidaten.
    await new Promise((ok) => {
      if (pc.iceGatheringState === "complete") return ok();
      pc.addEventListener("icegatheringstatechange", () => pc.iceGatheringState === "complete" && ok());
      setTimeout(ok, 3000);
    });
    // Eine aeltere Verbindung, die noch offen ist, wird geschlossen -- sonst
    // laufen zwei Stroeme aus demselben Reel nebeneinander.
    if (B.pc && B.pc !== pc) { try { B.pc.close(); } catch {} }
    B.pc = pc;
    // Jeder Aufbau bekommt eine eigene Kennung. Eine Antwort, die zu einem
    // aelteren Angebot gehoert, wird dadurch erkannt und uebergangen --
    // sonst landete sie auf der neuen Verbindung und zerschoesse sie.
    B.aufbauId = Math.random().toString(36).slice(2, 10);
    B.starteWaechter();
    sag("Angebot fertig");
    return { ok: true, angebot: pc.localDescription.sdp, aufbauId: B.aufbauId, protokoll: B.protokoll };
  };

  B.antwort = async (sdp, aufbauId) => {
    if (!B.pc) return { fehler: "Die Buehne stand noch nicht, als die Antwort kam." };
    if (aufbauId && aufbauId !== B.aufbauId) return { ok: true, uebergangen: "veraltetes Angebot" };
    if (B.pc.signalingState !== "have-local-offer") return { ok: true, uebergangen: B.pc.signalingState };
    await B.pc.setRemoteDescription({ type: "answer", sdp });
    return { ok: true };
  };

  // Nach einem Wisch haengt Instagram ein anderes <video> ins Bild. Beide
  // Spuren werden auf das neue umgelegt -- ohne die Verbindung neu
  // aufzubauen, sonst gaebe es bei jedem Wisch ein schwarzes Loch.
  // Lebt die Spur, die wir gerade senden, ueberhaupt noch?
  B.spurLebt = () => {
    const t = B.pc?.getSenders().find((x) => x.track?.kind === "video")?.track;
    return !!t && t.readyState === "live";
  };

  // Immer nur ein Umhaengen gleichzeitig.
  //
  // Jeder Wisch stoesst eines an, und sie laufen absichtlich im Hintergrund,
  // damit der Wisch nicht warten muss. Beim schnellen Scrollen ueberlappten
  // sie sich dadurch: zwei gleichzeitige Spurwechsel auf derselben
  // Verbindung zerlegen Bild und Ton. Kommt waehrend eines Laufs ein
  // weiterer Wunsch, wird er gemerkt und EINMAL nachgeholt -- nicht
  // gestapelt, denn nur der letzte Stand zaehlt.
  B.nachfuehren = async () => {
    if (B.laeuftNach) { B.nochmalNachfuehren = true; return { ok: true, eingereiht: true }; }
    B.laeuftNach = true;
    try {
      let erg = await B.nachfuehrenEinzeln();
      while (B.nochmalNachfuehren) { B.nochmalNachfuehren = false; erg = await B.nachfuehrenEinzeln(); }
      return erg;
    } finally { B.laeuftNach = false; }
  };

  B.nachfuehrenEinzeln = async () => {
    if (!B.pc) return { fehler: "keine Buehne" };
    const v = B.videoImBild();
    if (!v) return { fehler: "kein Video im Bild" };
    // Zeigt Instagram noch dasselbe Element UND lebt die Spur, gibt es
    // nichts umzulegen -- jedes Umlegen unterbricht den Strom kurz, und das
    // sah man beim Scrollen als Durcheinander. Ist die Spur aber tot, muss
    // umgelegt werden, auch wenn es scheinbar dasselbe Element ist.
    if (B.quelle === v && B.spurLebt()) return { ok: true, unveraendert: true };
    // Nur auf ein Element umhaengen, das auch wirklich etwas liefert. Beim
    // schnellen Wischen ist Instagram noch am Laden -- haengt man dann um,
    // sendet man ein leeres Element und beim Mitarbeiter steht alles.
    {
      const ende = Date.now() + 2000;
      while (Date.now() < ende && !(v.videoWidth > 0 && v.readyState >= 2)) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!(v.videoWidth > 0 && v.readyState >= 2)) {
        // Nicht bereit: lieber beim alten Bild bleiben als auf ein leeres
        // umzuschalten. Der Waechter versucht es gleich wieder.
        return { ok: false, fehler: "Element noch nicht bereit", nochNichtBereit: true };
      }
    }

    let spuren;
    try { spuren = B.spurenVon(v); } catch (e) { return { fehler: String(e?.message ?? e) }; }

    // Auf die Tonspur warten, bevor umgehaengt wird.
    //
    // Ein frisch eingehaengtes Video hat oft noch keine Tonspur -- die
    // entsteht erst, wenn Instagram den Ton dekodiert. Wurde sofort
    // umgehaengt, wanderte das Bild auf das neue Reel, der Ton aber nicht
    // (es gab nichts, worauf man haette umhaengen koennen), und man hoerte
    // weiter das vorherige. Beim schnellen Wischen mehrfach hintereinander
    // -- genau das klang nach "der Ton haengt hinterher".
    if (!spuren.ton) {
      const ende = Date.now() + 1500;
      while (Date.now() < ende && !spuren.ton) {
        await new Promise((r) => setTimeout(r, 100));
        try { spuren = B.spurenVon(v); } catch { break; }
      }
    }

    B.quelle = v;
    // B.tonQuelle gehoert ab jetzt allein B.tonAnklemmen. Wurde es hier
    // vorab gesetzt, hielt sich tonAnklemmen fuer schon angeklemmt, stieg
    // sofort aus und legte den Abgriff nie an -- Ergebnis: voellige Stille,
    // ohne jede Fehlermeldung. (08.10.2026 in der Nachstellung gefunden.)
    B.strom = spuren.strom;
    // Nur das BILD wird umgehaengt. Die Tonspur bleibt dieselbe wie seit dem
    // Start -- sie wird hinten nur umgesteckt.
    const bildSender = B.pc.getSenders().find((x) => x.track?.kind === "video");
    await Promise.all([
      bildSender && spuren.bild ? bildSender.replaceTrack(spuren.bild) : null,
      B.tonAnklemmen(v),
    ].filter(Boolean));
    return { ok: true, groesse: `${v.videoWidth}x${v.videoHeight}`, ton: !!spuren.ton };
  };

  // Welches Reel ist gerade zu sehen? In V1 war das trivial -- der Server
  // gab aus, was er aus dem Puffer gereicht hatte. In V2 wischt der
  // Mitarbeiter in Instagram, also muss Instagram selbst befragt werden.
  // Drei Wege, vom verlaesslichsten zum letzten Strohhalm; welcher traegt,
  // ist an Instagram zu messen und steht hier bewusst nicht als Annahme.
  B.aktuellesReel = () => {
    const v = B.videoImBild();
    const wege = [];
    // 1. Der Link, der am sichtbaren Reel selbst haengt
    if (v) {
      const kasten = v.closest("article, [role=\'presentation\']") ?? v.parentElement?.parentElement;
      const a = kasten?.querySelector?.("a[href*='/reel/']");
      const m = a?.getAttribute("href")?.match(/\/reel\/([^/?#]+)/);
      if (m) wege.push({ weg: "Link am Reel", code: m[1] });
    }
    // 2. Die Adresszeile -- Instagram schreibt sie beim Scrollen mit
    const mu = location.pathname.match(/\/reels?\/([^/?#]+)/);
    if (mu && mu[1] !== "") wege.push({ weg: "Adresszeile", code: mu[1] });
    // 3. Irgendein Reel-Link im sichtbaren Bereich
    for (const a of document.querySelectorAll("a[href*='/reel/']")) {
      const r = a.getBoundingClientRect();
      if (r.top >= 0 && r.top < innerHeight) {
        const m = a.getAttribute("href").match(/\/reel\/([^/?#]+)/);
        if (m) { wege.push({ weg: "sichtbarer Link", code: m[1] }); break; }
      }
    }
    return { code: wege[0]?.code ?? null, weg: wege[0]?.weg ?? null, wege };
  };

  // Fuer die Fehlersuche: was macht die Quelle, und geht wirklich etwas
  // raus? Nur lesend, aendert nichts.
  // WELCHES Reel ist gerade zu sehen -- als Kennung, an der sich ein
  // Wechsel erkennen laesst.
  //
  // 08.10.2026: Das fehlende Stueck hinter drei Beschwerden auf einmal.
  // Bisher haben wir eine Taste geschickt und GEHOFFT -- wir wussten weder,
  // ob gewechselt wurde, noch auf was.
  // Instagrams EIGENE Pfeil-Knoepfe finden.
  //
  // 08.10.2026, Emres Einwand: Auf der Reels-Seite am Rechner gibt es
  // Pfeil-Knoepfe, und das ist dort die native Bedienung. Wir haben
  // stattdessen Tastatur-Pfeile geschickt und angenommen, Instagram
  // behandelt beides gleich. Das ist nicht gesagt -- anderes Einrasten,
  // andere Historie, anderes Nachladen. Wenn wir wollen, dass sich der Feed
  // eins zu eins wie bei einem Menschen verhaelt, muessen wir druecken, was
  // ein Mensch drueckt.
  //
  // Beim ersten Mal wird aufgeschrieben, was gefunden wurde -- Instagram
  // benennt seine Knoepfe je nach Sprache und Fassung anders, und raten
  // hilft hier nicht weiter.
  // Nur Messung, greift nicht ein: wie viele Pfeile dieser Richtung stehen
  // gerade im Fenster, wo sitzen sie, und welchen davon nimmt wischKnopf?
  // Verdacht (noch unbewiesen): Instagram haelt mehrere Reel-Behaelter
  // gleichzeitig im Fenster, jeder mit eigenem Pfeilpaar. Nach dem
  // Nachladen gibt es dann mehr als ein Paar, und wir druecken den Pfeil
  // eines Behaelters, der gerade NICHT zu sehen ist.
  B.knopfLage = (richtung) => {
    const passt = B.KNOPF_NAME[richtung] ?? B.KNOPF_NAME.weiter;
    const treffer = [];
    for (const el of document.querySelectorAll("button, [role='button'], svg[aria-label]")) {
      const name = el.getAttribute("aria-label") ??
        el.querySelector?.("svg[aria-label]")?.getAttribute("aria-label") ?? "";
      if (!name || !passt.test(name)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      treffer.push({ y: Math.round(r.top), x: Math.round(r.left) });
    }
    const v = B.videoImBild();
    const vr = v ? v.getBoundingClientRect() : null;
    return {
      anzahl: treffer.length,
      stellen: treffer.slice(0, 8),
      // Der genommene ist immer der erste in der Dokumentreihenfolge.
      genommen: treffer[0] ?? null,
      videoOben: vr ? Math.round(vr.top) : null,
      videoUnten: vr ? Math.round(vr.bottom) : null,
      fensterHoch: innerHeight,
    };
  };

  // Gemessen am 08.10.2026: Instagram nennt seine Pfeile "Navigate to next
  // Reel" und "Navigate to previous Reel". Die alten Muster waren am
  // Wortanfang verankert und konnten deshalb NIE greifen -- der Namensweg
  // war tot, und es lief nur ueber die Lage. Das ging gut, solange das Reel
  // formatfuellend war (Video y16..844). Bei einem anderen Bildformat
  // (gemessen: y214..646) ist der unterste runde Knopf am rechten Rand aber
  // nicht mehr der Weiter-Pfeil, sondern das Drei-Punkte-Menue -- und dann
  // oeffnete jeder Next-Versuch nur ein Menue ("NICHT GEWECHSELT [More]").
  B.KNOPF_NAME = {
    weiter: /navigate to next|next reel|n(ae|ä)chstes reel|scroll down|nach unten|^next$/i,
    zurueck: /navigate to previous|previous reel|vorheriges reel|scroll up|nach oben|^back$|^previous$/i,
  };
  // Runde Knoepfe am rechten Rand, die sicher KEINE Pfeile sind. Ohne diese
  // Sperre greift der Ersatzweg irgendwann daneben.
  B.KEIN_PFEIL = /more|options|mehr|like|comment|kommentar|share|teilen|send|audio|sound|mute|profile|follow|save|speichern|report/i;

  B.wischKnopf = (richtung) => {
    const passt = B.KNOPF_NAME[richtung] ?? B.KNOPF_NAME.weiter;
    const kandidaten = [];
    for (const el of document.querySelectorAll("button, [role='button'], svg[aria-label]")) {
      const name = el.getAttribute("aria-label") ?? el.querySelector?.("svg[aria-label]")?.getAttribute("aria-label") ?? "";
      if (!name) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      kandidaten.push({ name, oben: Math.round(r.top), links: Math.round(r.left) });
      if (passt.test(name.trim())) {
        // Bei einem <svg> den anklickbaren Vorfahren nehmen.
        B.letzterKnopfWeg = "Name";
        return el.tagName === "svg" ? (el.closest("button, [role='button']") ?? el.parentElement) : el;
      }
    }
    // Kein passender Name? Dann ueber Form und Lage: Instagram setzt die
    // beiden Pfeile als runde Knoepfe uebereinander an den rechten Rand,
    // etwa auf halber Hoehe. Namen aendern sich mit Sprache und Fassung,
    // die Anordnung nicht.
    const rund = [];
    for (const el of document.querySelectorAll("button, [role='button'], div[role='button']")) {
      const r = el.getBoundingClientRect();
      if (r.width < 28 || r.width > 72 || Math.abs(r.width - r.height) > 10) continue;
      if (r.left < innerWidth * 0.75) continue;             // rechter Rand
      if (r.top < innerHeight * 0.2 || r.top > innerHeight * 0.8) continue;
      // Traegt er den Namen einer anderen Funktion, ist er kein Pfeil.
      const wieHeisst = el.getAttribute("aria-label") ??
        el.querySelector?.("svg[aria-label]")?.getAttribute("aria-label") ?? "";
      if (wieHeisst && B.KEIN_PFEIL.test(wieHeisst)) continue;
      rund.push({ el, oben: r.top });
    }
    if (rund.length >= 2) {
      rund.sort((a, b) => a.oben - b.oben);
      if (!B.rundGemeldet) {
        B.rundGemeldet = true;
        B.rundListe = rund.map((x) => {
          const el = x.el;
          const n = el.getAttribute("aria-label") ??
            el.querySelector?.("svg[aria-label]")?.getAttribute("aria-label") ?? "(ohne Namen)";
          const r = el.getBoundingClientRect();
          return `"${n}" @ x${Math.round(r.left)} y${Math.round(r.top)}`;
        });
      }
      B.letzterKnopfWeg = `Lage, ${rund.length} runde Knoepfe am rechten Rand`;
      return richtung === "weiter" ? rund[rund.length - 1].el : rund[0].el;
    }
    if (!B.knopfProtokoll) {
      B.knopfProtokoll = kandidaten;
    }
    return null;
  };

  // Das Nachbar-Reel im Feed -- eines weiter oder eines zurueck.
  //
  // Die <video>-Elemente stehen im Dokument in Feed-Reihenfolge. Das
  // Nachbar-Element ist also schlicht das davor oder danach.
  B.nachbar = (richtung) => {
    const alle = [...document.querySelectorAll("video")];
    const jetzt = B.videoImBild();
    const i = alle.indexOf(jetzt);
    if (i < 0) return null;
    return richtung === "weiter" ? (alle[i + 1] ?? null) : (alle[i - 1] ?? null);
  };

  // EIN Schritt. Genau einer.
  //
  // 08.10.2026, der bewiesene Fehler: Beim Nachladen schiebt Instagram einen
  // Schwung neuer Reels ein, und ein einziger Klick landete am ENDE dieses
  // Schwungs. Gemessen an Emres Sitzung: ein Druck auf Weiter, und er war
  // SECHZEHN Reels weiter. Die uebersprungenen tauchten beim Zurueckgehen
  // als "nie gesehene Reels" auf.
  //
  // Dagegen hilft keine Bremse und keine Wartezeit, sondern nur, das Ziel
  // VORHER zu kennen und hinterher nachzusehen:
  //   1. welches Reel ist das Nachbar-Reel?
  //   2. warten, bis es wirklich da ist (statt in eine Luecke zu klicken)
  //   3. klicken
  //   4. pruefen, ob wir genau dort gelandet sind
  //   5. falls nicht: zurueckkorrigieren, bis wir es sind
  // EIN Schritt, in zwei Teilen -- damit der Tastatur-Rueckfall moeglich
  // bleibt: der Tastendruck muss von aussen kommen, der Rest passiert hier.
  //
  // 08.10.2026, der bewiesene Fehler: Beim Nachladen schiebt Instagram einen
  // Schwung neuer Reels ein, und ein einziger Klick landete am ENDE dieses
  // Schwungs -- gemessen an Emres Sitzung: ein Druck, SECHZEHN Reels weiter.
  // Die uebersprungenen tauchten beim Zurueckgehen als "nie gesehene Reels"
  // auf. Dagegen hilft nur, hinterher nachzusehen, ob es wirklich genau ein
  // Schritt war, und sonst zurueckzukorrigieren.
  B.schrittBeginnen = (richtung) => {
    const v = B.videoImBild();
    if (!v) return { ok: false, grund: "kein Video im Bild" };
    B.schrittVon = v;
    B.schrittRichtung = richtung;
    // Klicken ZUERST -- der Klick ist es, der Instagram zum Nachladen
    // bringt. Vorher auf den Nachbarn zu warten war falsch: am Feed-Ende
    // gibt es keinen, also wartete man ewig und loeste das Laden nie aus.
    const knopf = B.wischKnopf(richtung);
    if (!knopf) return { ok: true, keinKnopf: true };
    knopf.click();
    return { ok: true, keinKnopf: false };
  };

  B.schrittAbschliessen = async (hoechstens = 12000) => {
    const ende = Date.now() + hoechstens;
    const warte = (ms) => new Promise((r) => setTimeout(r, ms));
    const richtung = B.schrittRichtung;
    const vorher = B.schrittVon;
    const nachbarVon = (el) => {
      const liste = [...document.querySelectorAll("video")];
      const i = liste.indexOf(el);
      if (i < 0) return null;
      return richtung === "weiter" ? (liste[i + 1] ?? null) : (liste[i - 1] ?? null);
    };

    // Auf den Nachbarn warten -- beim Nachladen entsteht er erst jetzt.
    let ziel = nachbarVon(vorher);
    while (Date.now() < ende && !ziel) {
      await warte(80);
      ziel = nachbarVon(vorher);
    }
    if (!ziel) {
      return { ok: false, grund: "Instagram hat kein weiteres Reel geliefert", laedt: true,
               code: B.aktuellesReel().code };
    }

    // NICHT mehr zurueckkorrigieren.
    //
    // 08.10.2026, direkt an Emres Sitzung schiefgegangen: Die Korrektur
    // klickte bis zu 40 mal auf Zurueck, wenn sie das Ziel nicht erkannte.
    // Instagram tauscht die Elemente aber aus -- dann ist das gemerkte Ziel
    // nie mehr dasselbe Objekt, die Bedingung wird nie wahr, und der Player
    // lief von selbst bis zum ersten Reel zurueck. Schlimmer als der Fehler,
    // den es beheben sollte.
    //
    // Es wird nur noch ABGEWARTET und MITGESCHRIEBEN, ob es ein Schritt war.
    // Geklickt wird nichts von allein.
    const ruhe = Date.now() + 1500;
    while (Date.now() < ruhe) {
      if (B.videoImBild() === ziel) break;
      await warte(60);
    }
    const korrigiert = 0;
    const angekommen = B.videoImBild() === ziel;
    return { ok: angekommen, korrigiert, code: B.aktuellesReel().code,
             grund: angekommen ? null : "Ziel nicht erreicht" };
  };

  // Bequemer Einzelaufruf fuer die Pruefungen -- im Produkt wird wegen des
  // Tastatur-Rueckfalls zweiteilig gearbeitet.
  B.einSchritt = async (richtung, hoechstens = 12000) => {
    const start = B.schrittBeginnen(richtung);
    if (!start.ok) return start;
    if (start.keinKnopf) {
      const v = B.schrittVon;
      // Ohne Knopf bleibt nur ein Tastendruck in der Seite selbst.
      v.dispatchEvent(new KeyboardEvent("keydown", { key: richtung === "weiter" ? "ArrowDown" : "ArrowUp", bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: richtung === "weiter" ? "ArrowDown" : "ArrowUp", bubbles: true }));
    }
    return await B.schrittAbschliessen(hoechstens);
  };

  // Welche Reels stehen GERADE als Element in der Seite, in welcher
  // Reihenfolge, und an welcher Stelle darin sind wir?
  //
  // Hintergrund (Emre, 08.10.2026, bestaetigt durch zwei Messungen): Beim
  // Nachladen schiebt Instagram den neuen Stapel MITTEN HINEIN, nicht
  // hinten dran. Die vorher gesehenen Reels sind noch vorhanden -- aber
  // zwischen ihnen und der aktuellen Stelle liegen rund fuenfzehn neue.
  // Deshalb landet "Zurueck" in frischem Material statt in der Historie.
  //
  // Diese Messung entscheidet die Loesung: Stehen die alten Reels als
  // Element da, koennen wir in EINEM Sprung dorthin. Stehen sie nicht da,
  // muessen wir die Historie selbst fuehren. Nur Lesen, greift nicht ein.
  B.listeImDom = () => {
    // Erster Versuch ging ueber Reel-Links -- die gibt es auf Instagrams
    // Reels-Seite gar nicht (deshalb liest die Kennung die Adresszeile).
    // Gemessen: 0 Treffer. Also ueber die Videoelemente selbst, die
    // nachweislich da sind (gemessen: 11 Stueck).
    const fingerabdruck = (v) => {
      const q = v.currentSrc || v.src || "";
      if (!q) return null;
      let h = 0;
      for (let i = 0; i < q.length; i++) h = (h * 31 + q.charCodeAt(i)) | 0;
      return "v" + (h >>> 0).toString(36);
    };
    const jetzt = B.videoImBild();
    const liste = [...document.querySelectorAll("video")].map((v) => {
      const r = v.getBoundingClientRect();
      return {
        f: fingerabdruck(v),
        oben: Math.round(r.top),
        hier: v === jetzt,
        laeuft: !v.paused,
      };
    }).sort((a, b) => a.oben - b.oben);
    return {
      anzahl: liste.length,
      stelle: liste.findIndex((x) => x.hier),
      eintraege: liste.map((x) => `${x.hier ? ">" : ""}${x.f ?? "-"}@${x.oben}`),
    };
  };

  B.kennung = () => {
    const v = B.videoImBild();
    const code = B.aktuellesReel().code;
    // Rein textlich, damit die Kennung aus der Seite herausgereicht werden
    // kann. Das Element bekommt beim ersten Sehen eine eigene Nummer -- so
    // laesst sich ein Wechsel auch dann erkennen, wenn Instagram gerade
    // keinen Reel-Link hergibt.
    if (v && !v.__rfNr) v.__rfNr = "e" + (++B.elementZaehler || (B.elementZaehler = 1));
    // Die abgespielte Videodatei als unbestechliche Kennung.
    //
    // 08.10.2026: Der Code kommt bei Instagram fast immer aus der
    // ADRESSZEILE (der Link am Reel selbst ist nicht zu finden) -- und die
    // ist ein globaler Wert, den Instagram setzt, wann es will. Damit
    // laesst sich NICHT beweisen, welches Reel wirklich zu sehen war. Die
    // Videodatei dagegen haengt direkt am gezeigten Element. Nur ein kurzer
    // Fingerabdruck davon, die Adressen sind riesig.
    let datei = null;
    const quelle = v ? (v.currentSrc || v.src || "") : "";
    if (quelle) {
      let h = 0;
      for (let i = 0; i < quelle.length; i++) h = (h * 31 + quelle.charCodeAt(i)) | 0;
      datei = "v" + (h >>> 0).toString(36);
    }
    return { code: code ?? null, datei, zeichen: code ?? (v ? v.__rfNr : null) };
  };

  // Warten, bis Instagram wirklich gewechselt hat UND das neue Reel da ist.
  //
  // Zwei Bedingungen, nicht eine: Instagram wechselt sofort, laedt das Video
  // aber erst danach. Wartete man nur auf den Wechsel, ging die Sperre
  // sofort wieder auf -- der Mitarbeiter sah weiter das alte Bild, hielt es
  // fuer "nichts passiert", drueckte nochmal, und war am Ende acht Reels
  // weiter, obwohl jeder einzelne Druck korrekt war. Das war Emres
  // "Multi-Skip": kein Stapeln, sondern fehlende Rueckmeldung.
  //
  // Die Obergrenze erzwingt nichts -- sie sagt nur ehrlich "hat nicht
  // gewechselt" zurueck, statt blind etwas nachzuholen.
  B.warteAufWechsel = async (vorher, hoechstens = 8000) => {
    const start = Date.now();
    const ende = start + hoechstens;
    while (Date.now() < ende) {
      const jetzt = B.kennung();
      const v = B.videoImBild();
      const bereit = !!v && v.videoWidth > 0 && v.readyState >= 2;
      if (jetzt.zeichen && jetzt.zeichen !== vorher.zeichen && bereit) {
        return { gewechselt: true, code: jetzt.code, dauer: Date.now() - start };
      }
      await new Promise((r) => setTimeout(r, 60));
    }
    return { gewechselt: false, code: B.kennung().code, dauer: Date.now() - start };
  };

  // Zaehlt, wie oft Chrome die Seite in 300 ms zeichnen laesst. Das ist der
  // Takt, in dem Instagrams EIGENER Code laeuft -- wird eine Seite als
  // unsichtbar behandelt, drosselt Chrome ihn auf etwa 1/s, und dann merkt
  // Instagram sehr wohl, dass hier niemand zuschaut. Nur Zaehlen.
  B.zeichenrate = () =>
    new Promise((fertig) => {
      let n = 0;
      const start = performance.now();
      const tick = () => {
        n += 1;
        if (performance.now() - start >= 300) {
          fertig(Math.round((n * 1000) / (performance.now() - start)));
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      setTimeout(() => fertig(n === 0 ? 0 : null), 1200);
    });

  B.diagnose = async () => {
    const v = B.videoImBild();
    const spur = B.pc?.getSenders().find((x) => x.track?.kind === "video")?.track;
    let gesendet = null, bilder = null;
    if (B.pc) {
      const st = await B.pc.getStats();
      st.forEach((x) => { if (x.type === "outbound-rtp" && x.kind === "video") { gesendet = x.bytesSent; bilder = x.framesSent; } });
    }
    return {
      quelleLaeuft: v ? !v.paused : null,
      quelleZeit: v ? +v.currentTime.toFixed(2) : null,
      quelleBereit: v ? v.readyState : null,
      quelleGroesse: v ? `${v.videoWidth}x${v.videoHeight}` : null,
      spurZustand: spur ? `${spur.readyState}/${spur.muted ? "stumm" : "offen"}` : null,
      // Die TONspur des Senders. Bisher meldete der Blick nur die Bildspur
      // -- beim "kein Ton nach dem Neuaufbau" war damit genau die Stelle
      // blind, auf die es ankommt (09.10.2026).
      tonSpur: (() => {
        const t = B.pc?.getSenders().find((x) => x.track?.kind === "audio")?.track;
        return t ? `${t.readyState}/${t.enabled ? "an" : "aus"}/${t.muted ? "stumm" : "offen"}` : "KEINE";
      })(),
      tonAusgang: (() => {
        const t = B.bus?.spur;
        return t ? `${t.readyState}/${t.enabled ? "an" : "aus"}/${t.muted ? "stumm" : "offen"}` : "kein Bus";
      })(),
      verbindung: B.pc?.connectionState ?? "-",
      gesendet, bilder,
      videosImDom: document.querySelectorAll("video").length,
      amRichtigenElement: B.quelle === v,
      letzteHeilung: B.letzteHeilung ?? null,
      tonAmRichtigenElement: B.tonQuelle === B.quelle,
      letzteTonHeilung: B.letzteTonHeilung ?? null,
      // Die einzigen drei Dinge, die Instagram von unserem Aufbau
      // ueberhaupt bemerken KANN: haelt sich die Seite fuer sichtbar, hat
      // sie den Tastaturfokus, und wird ihr Bild ueberhaupt gezeichnet.
      // captureStream und das Auslesen des DOM sind fuer die Seite
      // unsichtbar -- das hier ist es nicht. Nur Lesen, greift nicht ein.
      sichtbar: document.visibilityState,
      fokus: document.hasFocus(),
      bilderProSekunde: await B.zeichenrate(),
    };
  };


  // Der Waechter. Instagram tauscht beim Reels-Scrollen staendig
  // Video-Elemente aus, und es gibt keinen verlaesslichen Hinweis darauf:
  //
  //   * Manchmal wirft es das Element weg -> die Spur endet (gemessen:
  //     spur=ended, Bild stand still).
  //   * Manchmal laesst es das Element leben und haelt es nur an, waehrend
  //     es in einem anderen weiterspielt (gemessen: spur=live/offen, Bilder
  //     standen trotzdem bei 710 fest, 17 Videos im DOM).
  //
  // Auf einzelne Ereignisse zu horchen, deckt deshalb immer nur einen der
  // Faelle ab. Der Waechter prueft stattdessen die einzige Frage, auf die es
  // ankommt: haengen wir noch an dem Element, das Instagram gerade zeigt,
  // und laeuft es? Wenn nicht, wird umgehaengt.
  // Zieht NUR den Ton nach. Es kommt vor, dass ein frisch eingehaengtes
  // Element beim Umhaengen noch keine Tonspur hatte -- dann blieb der
  // Tonsender auf der alten, inzwischen toten Spur haengen und es war
  // dauerhaft still, waehrend das Bild einwandfrei lief. Nachgemessen in der
  // Pruefung vom 07.10.2026: 619 Bilder, 30/s, Ton 0 Prozent.
  B.tonNachziehen = async () => {
    if (!B.pc || !B.quelle) return { ok: false };
    // Die Tonspur selbst wird NICHT getauscht -- nur umgesteckt.
    return { ok: await B.tonAnklemmen(B.quelle) };
  };

  B.starteWaechter = () => {
    if (B.waechter) return;
    B.waechter = setInterval(async () => {
      if (!B.pc || B.heiltGerade) return;
      const jetzt = B.videoImBild();
      if (!jetzt) return;
      const spur = B.pc.getSenders().find((x) => x.track?.kind === "video")?.track;
      const tonSpur = B.pc.getSenders().find((x) => x.track?.kind === "audio")?.track;
      const falschesElement = B.quelle !== jetzt;
      const spurTot = !spur || spur.readyState !== "live";

      // Der Ton wird getrennt geprueft: er kann allein wegbrechen, ohne dass
      // am Bild etwas auffaellt -- und dann merkt es niemand.
      if (!falschesElement && !spurTot) {
        // Die gesendete Tonspur ist seit dem Umbau FEST -- sie stirbt nie,
        // egal was Instagram tut. Entscheidend ist deshalb, ob hinten noch
        // etwas in die Leitung hineinspielt: genau das stirbt, wenn
        // Instagram ein Reel von vorn anfaengt (Emres "beim zweiten
        // Anschauen ist der Ton weg", 08.10.2026).
        const eingangTot = !B.tonEingangSpur || B.tonEingangSpur.readyState !== "live";
        const tonTot = eingangTot || !tonSpur || tonSpur.readyState !== "live";
        const tonVomFalschenElement = B.tonQuelle !== B.quelle;
        if (tonTot || tonVomFalschenElement) {
          B.heiltGerade = true;
          const erg = await B.tonNachziehen().catch(() => ({ ok: false }));
          B.letzteTonHeilung = { tonTot, tonVomFalschenElement, erfolg: !!erg.ok, zeit: Date.now() };
          B.heiltGerade = false;
        }
      }
      // Bewusst NICHT geheilt wird, wenn unser Element zwar steht, aber das
      // ist, was Instagram gerade zeigt: dann hat jemand auf Pause gedrueckt,
      // und genau das soll stehenbleiben. Nur wenn Instagram woanders
      // weiterspielt, haengen wir an der falschen Stelle.
      // Steht die Quelle still, obwohl sie laufen soll? Das passiert beim
      // schnellen Wischen, wenn umgehaengt wurde, bevor Instagram fertig
      // geladen hatte: Spur lebt, richtiges Element -- und trotzdem kommt
      // nichts an. Ohne diese Pruefung merkt es niemand.
      let stehtStill = false;
      if (!falschesElement && !spurTot && B.quelle && !B.quelle.paused) {
        const zeit = B.quelle.currentTime;
        if (B.letzteZeit !== undefined && B.letzteZeit === zeit) {
          B.stillSeit = (B.stillSeit ?? 0) + 1;
          stehtStill = B.stillSeit >= 4;   // rund zwei Sekunden
        } else {
          B.stillSeit = 0;
        }
        B.letzteZeit = zeit;
      } else {
        B.stillSeit = 0;
        B.letzteZeit = undefined;
      }

      if (!falschesElement && !spurTot && !stehtStill) return;
      if (stehtStill) { B.quelle = null; B.stillSeit = 0; }   // erzwingt neues Anhaengen
      B.heiltGerade = true;
      B.letzteHeilung = { falschesElement, spurTot, stehtStill, zeit: Date.now() };
      try { await B.nachfuehren(); } catch {} finally { B.heiltGerade = false; }
    }, 500);
  };


  // Like und Follow direkt in dem Tab, den der Mitarbeiter sieht.
  //
  // In V1 war dafuer eine zweite Seite noetig: der Feed-Tab war der Anker
  // des Puffers, und ein Like durfte dessen Scrollposition nicht
  // verschieben. In V2 ist genau dieser Tab das, was der Mitarbeiter
  // anschaut -- der Umweg hat seinen Grund verloren und war der letzte
  // Punkt, an dem V2 nicht eins zu eins war: Instagram sah einen
  // Seitenaufruf mit anschliessendem Like statt eines Herzens im Feed.
  //
  // Das Herz wird ueber sein aria-label gefunden ("Like" bzw. "Unlike") --
  // das ist der eine Teil von Instagrams Markup, der nicht verschleiert ist,
  // und dieselbe Kennung, die der bisherige Weg schon benutzt hat. Von
  // mehreren im DOM wird das genommen, das wirklich im Bild steht.
  B.knopfImBild = (namen) => {
    const treffer = [];
    for (const n of namen) {
      for (const el of document.querySelectorAll(`svg[aria-label="${n}" i]`)) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.top >= 0 && r.bottom <= innerHeight + 4) treffer.push({ el, name: n, oben: r.top });
      }
    }
    if (!treffer.length) return null;
    // Das unterste im Bild: die Leiste des sichtbaren Reels sitzt unten.
    treffer.sort((a, b) => b.oben - a.oben);
    return treffer[0];
  };

  B.herzDruecken = async () => {
    const vorher = B.knopfImBild(["Like", "Unlike"]);
    if (!vorher) return { ok: false, fehler: "Kein Herz im Bild gefunden." };
    const warGeliked = vorher.name.toLowerCase() === "unlike";
    const knopf = vorher.el.closest("[role=button], button") ?? vorher.el.parentElement;
    knopf?.click?.();
    // Nachsehen, ob es wirklich umgesprungen ist -- nicht annehmen, dass ein
    // Klick gewirkt hat.
    const ende = Date.now() + 2500;
    while (Date.now() < ende) {
      await new Promise((r) => setTimeout(r, 120));
      const jetzt = B.knopfImBild(["Like", "Unlike"]);
      if (!jetzt) continue;
      const istGeliked = jetzt.name.toLowerCase() === "unlike";
      if (istGeliked !== warGeliked) return { ok: true, geliked: istGeliked };
    }
    return { ok: false, fehler: "Das Herz hat nicht reagiert.", warGeliked };
  };

  // Repost: Instagrams eigener Knopf in der Leiste des sichtbaren Reels.
  // Dieselbe Regel wie beim Herz -- erst melden, wenn nachweislich
  // umgesprungen ist, nie weil ein Klick abgeschickt wurde.
  //
  // UNBEWIESEN (10.10.2026): wie Instagram den Knopf genau benennt, ist
  // nicht gemessen. Findet sich keiner der Namen, schreibt die Antwort
  // auf, wie die Knoepfe im Bild wirklich heissen -- dann steht es nach
  // EINEM Durchlauf im Protokoll und muss nicht geraten werden.
  B.REPOST_AUS = ["Repost", "Erneut posten"];
  B.REPOST_AN = ["Reposted", "Remove repost", "Undo repost", "Repost entfernen", "Erneut gepostet"];

  B.repostDruecken = async () => {
    const alle = [...B.REPOST_AUS, ...B.REPOST_AN];
    const istAn = (name) => B.REPOST_AN.some((n) => n.toLowerCase() === name.toLowerCase());

    const vorher = B.knopfImBild(alle);
    if (!vorher) {
      const gesehen = [...document.querySelectorAll("svg[aria-label]")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight + 4;
        })
        .map((el) => el.getAttribute("aria-label"));
      return { ok: false, fehler: "Kein Repost-Knopf im Bild gefunden.", gesehen: [...new Set(gesehen)] };
    }

    const warRepostet = istAn(vorher.name);
    const knopf = vorher.el.closest("[role=button], button") ?? vorher.el.parentElement;
    // Die Zahl unter dem Knopf als zweiter Zeuge: springt der Name nicht um,
    // verraet die Zahl trotzdem, ob Instagram es angenommen hat.
    const zahlVorher = knopf?.parentElement?.textContent?.trim() ?? null;
    knopf?.click?.();

    const ende = Date.now() + 3500;
    while (Date.now() < ende) {
      await new Promise((r) => setTimeout(r, 120));
      const jetzt = B.knopfImBild(alle);
      if (jetzt && istAn(jetzt.name) !== warRepostet) {
        return { ok: true, repostet: istAn(jetzt.name), weg: "Name" };
      }
      const zahlJetzt = knopf?.parentElement?.textContent?.trim() ?? null;
      if (zahlVorher !== null && zahlJetzt !== null && zahlJetzt !== zahlVorher) {
        return { ok: true, repostet: !warRepostet, weg: "Zahl" };
      }
    }
    return { ok: false, fehler: "Der Repost-Knopf hat nicht reagiert.", warRepostet };
  };

  B.folgen = async () => {
    const kandidaten = [...document.querySelectorAll("button, [role=button]")].filter((b) => {
      const t = (b.textContent ?? "").trim().toLowerCase();
      if (t !== "follow" && t !== "folgen") return false;
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight + 4;
    });
    if (!kandidaten.length) return { ok: false, fehler: "Kein Folgen-Knopf im Bild gefunden." };
    kandidaten[kandidaten.length - 1].click();
    const ende = Date.now() + 2500;
    while (Date.now() < ende) {
      await new Promise((r) => setTimeout(r, 120));
      const noch = [...document.querySelectorAll("button, [role=button]")].some((b) => {
        const t = (b.textContent ?? "").trim().toLowerCase();
        if (t !== "follow" && t !== "folgen") return false;
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight + 4;
      });
      if (!noch) return { ok: true };
    }
    return { ok: false, fehler: "Der Folgen-Knopf hat nicht reagiert." };
  };

  // Das Reel anhalten und wieder laufen lassen.
  //
  // Bewusst KEIN Antippen: Antippen schaltet um, und wer nicht weiss, wie
  // es gerade steht, schaltet es womoeglich falsch herum. Hier wird
  // ausdruecklich angehalten bzw. fortgesetzt -- zweimal anhalten schadet
  // also nicht.
  B.anhalten = async () => {
    const v = B.quelle;
    if (!v) return { ok: false, fehler: "Kein Reel im Bild." };
    const liefVorher = !v.paused;
    try { v.pause(); } catch { /* egal */ }
    return { ok: true, liefVorher };
  };

  B.fortsetzen = async () => {
    const v = B.quelle;
    if (!v) return { ok: false, fehler: "Kein Reel im Bild." };
    try { await v.play(); } catch { /* Instagram startet es selbst neu */ }
    return { ok: true, laeuft: !v.paused };
  };

  B.zustand = () => ({
    verbindung: B.pc?.connectionState ?? "-",
    spuren: B.strom ? `${B.strom.getVideoTracks().length}/${B.strom.getAudioTracks().length}` : "-",
  });
};

function looksLikeInstagramMedia(node) {
  return (
    node &&
    typeof node === "object" &&
    typeof node.code === "string" &&
    (node.image_versions2?.candidates?.length || node.video_versions?.length)
  );
}

function parseInstagramMedia(node) {
  try {
    const videoVersions = node.video_versions;
    const videoUrl = Array.isArray(videoVersions) && videoVersions.length ? videoVersions[0].url : null;
    const thumbCandidates = node.image_versions2?.candidates;
    const thumbnailUrl = Array.isArray(thumbCandidates) && thumbCandidates.length ? thumbCandidates[0].url : null;
    if (!videoUrl && !thumbnailUrl) return null;

    // MESSUNG (09.10.2026): Wir sehen fuer die Aufrufzahl nur in play_count
    // und view_count nach, und dort steht oft nichts. Emres Erweiterung
    // zeigt aber eine Zahl an -- holt sie also irgendwoher. Also einmal pro
    // Sitzung auflisten, welche Felder Instagram ueberhaupt mitschickt.
    // Nur die NAMEN, keine Werte.
    const takenAt = typeof node.taken_at === "number" ? node.taken_at : null;
    const postedDaysAgo = takenAt ? Math.max(0, Math.floor((Date.now() / 1000 - takenAt) / 86400)) : null;

    return {
      id: `instagram:${node.code}`,
      sourceUrl: `https://www.instagram.com/reel/${node.code}/`,
      thumbnailUrl,
      videoUrl,
      caption: typeof node.caption?.text === "string" ? node.caption.text : null,
      username: node.user?.username ?? node.owner?.username ?? null,
      // Confirmed via live capture: Instagram's own Reels response regularly
      // sends view_count as an explicit null (not merely absent) rather than
      // a real number — this endpoint often just doesn't expose a view
      // count for a Reel at all. null here means exactly that: no real
      // count was available, never faked as 0.
      viewsRaw: typeof node.play_count === "number" ? node.play_count : (typeof node.view_count === "number" ? node.view_count : null),
      // Manche Konten blenden ihre Like-Zahl aus. Instagram zeigt dann gar
      // nichts an -- wir zeigten eine Zahl, die nichts bedeutet (ein Reel
      // mit 668.000 Aufrufen stand auf "3 Likes"), und rechneten daraus
      // auch noch eine Engagement-Rate. Am 10.10.2026 von Emre gemeldet.
      likesVerborgen: node.like_and_view_counts_disabled === true,
      likes: typeof node.like_count === "number" ? node.like_count : null,
      comments: typeof node.comment_count === "number" ? node.comment_count : null,
      durationSec: typeof node.video_duration === "number" ? Math.round(node.video_duration) : 0,
      // Instagram nennt sie media_repost_count -- in der Oberflaeche sind
      // das die Reposts neben Likes und Kommentaren. Gefunden am
      // 09.10.2026, als Emre fragte, woher seine Erweiterung die Zahl holt.
      reposts: typeof node.media_repost_count === "number" ? node.media_repost_count : null,
      // Instagrams interne Nummer. Nur damit laesst sich die Aufrufzahl
      // nachfragen -- im Feed liefert Instagram sie nicht mit (gemessen am
      // 09.10.2026: 190 Antworten, 5 Reels, kein einziges Aufruf-Feld).
      pk: node.pk != null ? String(node.pk) : null,
      postedDaysAgo,
      // Der genaue Zeitpunkt, nicht nur "vor X Tagen". Fuers Panel im
      // Session-Kontext, das Datum UND Uhrzeit zeigt (09.10.2026).
      takenAt,
    };
  } catch {
    return null;
  }
}

// TikTok's web client loads its own For You feed the same way Instagram
// does — internal JSON API calls (api/recommend/item_list and friends)
// rather than server-rendered HTML — so this uses the exact same
// sniff-the-response-traffic approach as Instagram above, just matched
// against TikTok's own stable item shape: an `id` alongside a `video`
// object carrying `playAddr`, and an `author` object carrying `uniqueId`.
// That shape has stayed the durable part of TikTok's feed item across the
// wrapper/endpoint churn the same way Instagram's `code` + version
// candidates has.
function looksLikeTikTokMedia(node) {
  return (
    node &&
    typeof node === "object" &&
    typeof node.id === "string" &&
    node.video &&
    typeof node.video === "object" &&
    typeof node.video.playAddr === "string" &&
    node.author &&
    typeof node.author === "object" &&
    typeof node.author.uniqueId === "string"
  );
}

function parseTikTokMedia(node) {
  try {
    const video = node.video ?? {};
    const author = node.author ?? {};
    const stats = node.stats ?? {};
    const videoUrl = typeof video.playAddr === "string" ? video.playAddr : null;
    const thumbnailUrl = typeof video.cover === "string" ? video.cover : (typeof video.originCover === "string" ? video.originCover : null);
    if (!videoUrl && !thumbnailUrl) return null;

    const username = typeof author.uniqueId === "string" ? author.uniqueId : null;
    const createTime = typeof node.createTime === "number" ? node.createTime : null;
    const postedDaysAgo = createTime ? Math.max(0, Math.floor((Date.now() / 1000 - createTime) / 86400)) : null;

    return {
      id: `tiktok:${node.id}`,
      sourceUrl: username ? `https://www.tiktok.com/@${username}/video/${node.id}` : `https://www.tiktok.com/video/${node.id}`,
      thumbnailUrl,
      videoUrl,
      caption: typeof node.desc === "string" ? node.desc : null,
      username,
      // Same rule as Instagram's parser above: only a real number counts —
      // never fabricated as 0 when TikTok's own stats object doesn't carry it.
      viewsRaw: typeof stats.playCount === "number" ? stats.playCount : null,
      likes: typeof stats.diggCount === "number" ? stats.diggCount : null,
      comments: typeof stats.commentCount === "number" ? stats.commentCount : null,
      durationSec: typeof video.duration === "number" ? Math.round(video.duration) : 0,
      postedDaysAgo,
    };
  } catch {
    return null;
  }
}

const MEDIA_ADAPTER = {
  instagram: { looksLikeMedia: looksLikeInstagramMedia, parseMedia: parseInstagramMedia },
  tiktok: { looksLikeMedia: looksLikeTikTokMedia, parseMedia: parseTikTokMedia },
};

// katalog sammelt JEDES gelesene Reel, auch die, die der Puffer verwirft.
// Verworfen wird, was der Account schon gesehen hat -- in V1 richtig, damit
// der Puffer nichts doppelt ausliefert. In V2 sieht der Mitarbeiter aber
// Instagrams Feed direkt, bekannte Reels eingeschlossen, und zu denen
// fehlten dann Name, Caption und der Like-Knopf (gemessen am 06.10.2026:
// die ersten beiden Reels leer, ab dem dritten wieder da).
function collectMediaFrom(node, out, seenIds, adapter, depth = 0, stats, katalog) {
  if (depth > 24 || !node) return;
  if (Array.isArray(node)) {
    for (const item of node) collectMediaFrom(item, out, seenIds, adapter, depth + 1, stats, katalog);
    return;
  }
  if (typeof node !== "object") return;
  if (adapter.looksLikeMedia(node)) {
    const parsed = adapter.parseMedia(node);
    if (parsed) {
      // DIAGNOSTIC (temporary): stats is only ever passed by the trace
      // instrumentation below -- no behavior change when omitted.
      if (stats) stats.candidates++;
      if (katalog) katalog.set(parsed.id, parsed);
      if (!seenIds.has(parsed.id)) {
        out.push(parsed);
      } else if (stats) {
        stats.rejected++;
        stats.rejectedIds.push(parsed.id);
      }
    }
  }
  for (const key of Object.keys(node)) collectMediaFrom(node[key], out, seenIds, adapter, depth + 1, stats, katalog);
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

// Comments are read-only in ReelForge and only ever fetched on demand (see
// Session.comments() below). Four real attempts at sniffing Instagram's own
// network traffic for a comments-shaped response never found one — every
// GraphQL call captured was ordinary feed/clips pagination, not comments,
// and nothing in the traffic was ever named or shaped like comment data.
// Rather than keep guessing at Instagram's private API, this parses the
// page's OWN rendered text instead (see Session.comments(), which diffs
// document.body.innerText before/after opening the panel — whatever's new
// on screen IS the comment content by definition). Real Instagram comment
// rendering puts each commenter's username alone on its own line
// (usernames can only contain letters/digits/periods/underscores, so
// that's a reliable-enough marker), followed by the comment text, followed
// by metadata lines (timestamp, like count, "Reply") that aren't part of
// the comment itself and get filtered out here.
const USERNAME_LINE_RE = /^[a-zA-Z0-9_.]{1,30}$/;
// A relative-timeago token ("1w", "2h", "3d") immediately follows every real
// username line in Instagram's rendered comment list -- unlike the username
// pattern alone (which e.g. the panel's own "Comments" header also matches),
// this pair reliably confirms a line actually starts a new comment. Verified
// against a real captured comment list (reel instagram:DcHVbYbRCWj) before
// shipping this pattern.
const TIMEAGO_LINE_RE = /^\d+\s*[hdwmy]$/i;
// Comma-grouped counts ("12,565 likes") need their own pattern -- \d+ alone
// doesn't span the comma, so a plain \d+-based check silently fails to
// recognize these as metadata and lets them leak into comment text instead.
const LIKE_COUNT_LINE_RE = /^([\d,]+)\s*(like|likes)$/i;
// Instagrams eigene Bedienelemente, die in innerText als eigene Zeile
// mitten im Kommentar stehen. Sie gehoeren NICHT zum Kommentar -- bisher
// landeten sie im Text, und in der Oberflaeche stand dann
// "...bro was born to smile through the pain See translation"
// (09.10.2026 von Emre gemeldet). Deutsch und Englisch, weil die
// Oberflaeche der Sitzung in beiden Sprachen laufen kann.
const UI_LINE_RE = /^(see (translation|original)|translated (by|from) [a-z]+|(originaltext|original) anzeigen|(\u00fcbersetzung|\u00fcbersetzen) (anzeigen|ansehen)|\u00fcbersetzt von [a-z]+|antworten|mehr ansehen|see more|hide replies|antworten ausblenden)$/i;
const METADATA_LINE_RE = /^(\d+\s*[hdwmy]|[\d,]+\s*(like|likes)|[\d,]+\s*„?gef\u00e4llt mir"?-angaben?|verified|reply|view (all|replies).*|alle (\d+ )?antworten ansehen.*|•)$/i;

function isCommentStart(lines, index) {
  return USERNAME_LINE_RE.test(lines[index] ?? "") && TIMEAGO_LINE_RE.test(lines[index + 1] ?? "");
}

function parseCommentLines(lines) {
  const comments = [];
  let i = 0;
  while (i < lines.length) {
    if (!isCommentStart(lines, i)) {
      i++;
      continue;
    }
    const username = lines[i];
    let j = i + 2; // skip the username and its timeago line
    const textParts = [];
    // The like count, when Instagram shows one, always renders as the first
    // metadata line right after a comment's text (before "Reply"/"View
    // replies") -- confirmed across every real captured sample. Only that
    // first metadata line is ever checked, so a later unrelated number
    // (e.g. from "View all N replies") can never be mistaken for it.
    let likeCount = null;
    let sawMetadata = false;
    while (j < lines.length && !isCommentStart(lines, j) && textParts.length < 5) {
      const line = lines[j];
      if (UI_LINE_RE.test(line)) {
        // Reines Bedienelement: weder Text noch Metadaten, einfach weg.
      } else if (METADATA_LINE_RE.test(line)) {
        if (!sawMetadata) {
          const match = line.match(LIKE_COUNT_LINE_RE);
          if (match) likeCount = parseInt(match[1].replace(/,/g, ""), 10);
          sawMetadata = true;
        }
      } else {
        textParts.push(line);
      }
      j++;
    }
    const text = textParts.join(" ").trim();
    // avatar: der abgelesene Bildschirmtext traegt kein Bild (10.10.2026).
    if (text) comments.push({ id: `${username}-${i}`, username, text, postedAt: null, likeCount, avatar: null, verifiziert: false, gif: null });
    i = j > i ? j : i + 1;
  }
  return comments;
}

// Best-effort click to open each platform's own native comments panel —
// same accessible-name/attribute pattern already used for Like above.
// Never throws: a failed click just means no comments response gets
// sniffed, which Session.comments() below already treats as "unavailable"
// rather than an error.
async function openInstagramComments(page) {
  const commentIcon = page.locator('svg[aria-label="Comment" i]').first();
  if (!(await commentIcon.isVisible().catch(() => false))) return { found: false, clicked: false };
  let clicked = true;
  await commentIcon
    .locator("xpath=ancestor::*[@role='button' or self::button][1]")
    .first()
    .click()
    .catch(async () => {
      await commentIcon.click().catch(() => {
        clicked = false;
      });
    });
  return { found: true, clicked };
}

async function openTikTokComments(page) {
  const commentIcon = page.locator('[data-e2e="comment-icon"], [data-e2e="browse-comment-icon"]').first();
  const found = await commentIcon.isVisible().catch(() => false);
  let clicked = false;
  if (found) clicked = await commentIcon.click().then(() => true).catch(() => false);
  return { found, clicked };
}

const COMMENTS_OPEN_HANDLER = { instagram: openInstagramComments, tiktok: openTikTokComments };

// Instagram's web client labels the like control's accessible name "Like"
// (unliked) / "Unlike" (already liked) — the one part of its otherwise-
// obfuscated class names that's stayed stable and is meaningful to target on
// purpose, since it's the same thing a screen reader user relies on.
// AUTOMATION_CONTEXT_OPTIONS forces English so that's actually true. The
// attribute-selector fallback covers the case where the label lives
// directly on the svg icon rather than propagating up to something
// Playwright's role engine recognizes as a button. Success is only ever
// reported once the click provably flipped the real button's state — never
// assumed just because a click was dispatched.
async function likeInstagram(page) {
  async function isUnlikedVisible() {
    if (await page.getByRole("button", { name: "Like", exact: true }).first().isVisible().catch(() => false)) return true;
    return page.locator('svg[aria-label="Like" i]').first().isVisible().catch(() => false);
  }
  async function isLikedVisible() {
    if (await page.getByRole("button", { name: "Unlike", exact: true }).first().isVisible().catch(() => false)) return true;
    return page.locator('svg[aria-label="Unlike" i]').first().isVisible().catch(() => false);
  }
  async function clickLike() {
    const roleButton = page.getByRole("button", { name: "Like", exact: true }).first();
    if (await roleButton.isVisible().catch(() => false)) {
      await roleButton.click();
      return true;
    }
    const svgIcon = page.locator('svg[aria-label="Like" i]').first();
    if (await svgIcon.isVisible().catch(() => false)) {
      await svgIcon.locator("xpath=ancestor::*[@role='button' or self::button][1]").first().click().catch(async () => {
        await svgIcon.click();
      });
      return true;
    }
    return false;
  }

  if (await isLikedVisible()) return { liked: true };
  if (!(await isUnlikedVisible())) return { liked: false, error: "Couldn't find a real Like button on this reel's page." };
  if (!(await clickLike())) return { liked: false, error: "Couldn't find a real Like button on this reel's page." };
  await sleep(1500);
  const liked = await isLikedVisible();
  return liked ? { liked: true } : { liked: false, error: "Clicked Like, but Instagram's real button didn't confirm it." };
}

// TikTok's web client doesn't swap a clean "Like"/"Unlike" accessible name
// the way Instagram does — the like control keeps the same "Like video"
// label either way, and its liked state shows up as a class/style change on
// the icon plus the visible like count ticking up by one. Verifying via the
// count (rather than trying to read a CSS class, which is far more likely
// to silently break across a TikTok frontend deploy) is the more durable
// signal here, mirroring the same "only report success once the real state
// provably changed" rule Instagram's handler follows. data-e2e attributes
// are TikTok's own QA hooks and have stayed stable far longer than their
// obfuscated class names.
async function likeTikTok(page) {
  const likeButton = page.locator('[data-e2e="like-icon"], [data-e2e="browse-like-icon"]').first();
  const countEl = page.locator('[data-e2e="like-count"], [data-e2e="browse-like-count"]').first();

  if (!(await likeButton.isVisible().catch(() => false))) {
    return { liked: false, error: "Couldn't find a real Like button on this video's page." };
  }

  const ariaPressedBefore = await likeButton.getAttribute("aria-pressed").catch(() => null);
  if (ariaPressedBefore === "true") return { liked: true };
  const countBefore = await countEl.textContent().catch(() => null);

  await likeButton.click().catch(() => {});
  await sleep(1500);

  const ariaPressedAfter = await likeButton.getAttribute("aria-pressed").catch(() => null);
  if (ariaPressedAfter === "true") return { liked: true };

  const countAfter = await countEl.textContent().catch(() => null);
  if (countAfter !== null && countAfter !== countBefore) return { liked: true };

  return { liked: false, error: "Clicked Like, but TikTok's real button didn't confirm it." };
}

const LIKE_HANDLER = { instagram: likeInstagram, tiktok: likeTikTok };

// A real Follow on the actual connected account, same rule as Like/Block:
// only report success once the platform's own UI provably confirms it, not
// just because a click was dispatched. Runs on the reel's own page (same
// page Like already uses) since both Instagram and TikTok show the
// Follow/Following control right in that page's header — no separate
// profile-page navigation needed the way Block requires.
async function followInstagram(page) {
  async function isFollowingVisible() {
    if (await page.getByRole("button", { name: "Following", exact: true }).first().isVisible().catch(() => false)) return true;
    return page.getByRole("button", { name: "Requested", exact: true }).first().isVisible().catch(() => false);
  }
  if (await isFollowingVisible()) return { following: true };
  const followButton = page.getByRole("button", { name: "Follow", exact: true }).first();
  if (!(await followButton.isVisible().catch(() => false))) {
    return { following: false, error: "Couldn't find a real Follow button on this reel's page." };
  }
  await followButton.click();
  await sleep(1500);
  const following = await isFollowingVisible();
  return following ? { following: true } : { following: false, error: "Clicked Follow, but Instagram's real button didn't confirm it." };
}

// TikTok's follow control on a video page carries a stable data-e2e hook
// (same convention as its like button/count above) and its own text swaps
// to "Following"/"Friends" once the follow lands — checked the same way
// likeTikTok verifies via its like count, not a CSS class.
async function followTikTok(page) {
  const followButton = page.locator('[data-e2e="follow-button"], [data-e2e="browse-follow-icon"]').first();
  if (!(await followButton.isVisible().catch(() => false))) {
    return { following: false, error: "Couldn't find a real Follow button on this video's page." };
  }
  async function isFollowingText() {
    const text = await followButton.textContent().catch(() => null);
    return !!text && /following|friends/i.test(text);
  }
  if (await isFollowingText()) return { following: true };
  await followButton.click().catch(() => {});
  await sleep(1500);
  return (await isFollowingText())
    ? { following: true }
    : { following: false, error: "Clicked Follow, but TikTok's real button didn't confirm it." };
}

const FOLLOW_HANDLER = { instagram: followInstagram, tiktok: followTikTok };

// A genuine platform block — not a ReelForge-only blacklist. Runs on the
// creator's real profile page (not the reel), because that's where
// Instagram's/TikTok's own Block control actually lives. Same rule as
// Like: only ever report success once the platform's own UI provably
// confirms the block took effect, never just because a click was
// dispatched — a block silently not landing would be worse than an honest
// failure, since the VA would believe this creator's content is gone from
// recommendations when it isn't.
async function blockInstagram(page) {
  // Verified live against a real account: the block itself takes effect
  // immediately, but the confirm dialog's own state update lags slightly
  // behind — an exact-match check right after clicking confirm can miss a
  // genuinely-succeeded block. A case-insensitive fallback plus a longer
  // settle window (see the sleep before the final check below) is what
  // actually catches it reliably instead of reporting a false failure.
  async function isBlockedVisible() {
    if (await page.getByRole("button", { name: "Unblock", exact: true }).first().isVisible().catch(() => false)) return true;
    if (await page.getByText("Unblock", { exact: true }).first().isVisible().catch(() => false)) return true;
    return page.getByText(/unblock/i).first().isVisible().catch(() => false);
  }
  async function openOptionsMenu() {
    const optionsButton = page.getByRole("button", { name: "Options", exact: true }).first();
    if (await optionsButton.isVisible().catch(() => false)) {
      await optionsButton.click();
      return true;
    }
    const svgIcon = page.locator('svg[aria-label="Options" i]').first();
    if (await svgIcon.isVisible().catch(() => false)) {
      await svgIcon.locator("xpath=ancestor::*[@role='button' or self::button][1]").first().click().catch(async () => {
        await svgIcon.click();
      });
      return true;
    }
    return false;
  }

  if (await isBlockedVisible()) return { blocked: true };
  if (!(await openOptionsMenu())) return { blocked: false, error: "Couldn't find this profile's Options menu." };
  await sleep(1000);

  // The menu's own "Block" item opens a confirmation dialog whose own
  // confirm button is also labeled "Block" — scoping to [role="dialog"]
  // for the second click is what tells them apart.
  const menuBlockItem = page.getByRole("button", { name: "Block", exact: true }).first();
  if (!(await menuBlockItem.isVisible().catch(() => false))) {
    return { blocked: false, error: "Couldn't find Block in this profile's Options menu." };
  }
  await menuBlockItem.click();
  await sleep(1000);

  const dialog = page.getByRole("dialog").first();
  const confirmButton = dialog.getByRole("button", { name: "Block", exact: true }).first();
  if (await confirmButton.isVisible().catch(() => false)) {
    await confirmButton.click();
  } else {
    // Some variants ask for a second confirmation step ("Yes, I'm sure").
    const secondConfirm = dialog.getByRole("button", { name: /yes|confirm/i }).first();
    if (await secondConfirm.isVisible().catch(() => false)) await secondConfirm.click();
    else return { blocked: false, error: "Couldn't find the Block confirmation button." };
  }

  await sleep(2500);
  let blocked = await isBlockedVisible();
  if (!blocked) {
    // Belt-and-suspenders: a full reload reflects the real server-side
    // state directly rather than waiting on the SPA's own re-render, which
    // is what live testing showed lagging behind the block actually having
    // already taken effect.
    await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
    await sleep(1500);
    blocked = await isBlockedVisible();
  }
  return blocked ? { blocked: true } : { blocked: false, error: "Clicked Block, but Instagram's real profile didn't confirm it." };
}

// Not yet verified against a real, connected TikTok account (see the
// TikTok live-session work — no TikTok Research Account has actually been
// connected and tested end-to-end yet). Written to the same real-action,
// verify-before-reporting-success shape as Instagram's handler, using
// TikTok's own stable data-e2e QA hooks where they're documented to exist,
// but this needs a real account to confirm the selectors still match
// TikTok's current profile page before it can be trusted.
async function blockTikTok(page) {
  async function isBlockedVisible() {
    return page.getByText(/^unblock$/i).first().isVisible().catch(() => false);
  }
  async function openMoreMenu() {
    const moreButton = page.locator('[data-e2e="user-more-menu"], [data-e2e="user-more"]').first();
    if (await moreButton.isVisible().catch(() => false)) {
      await moreButton.click();
      return true;
    }
    return false;
  }

  if (await isBlockedVisible()) return { blocked: true };
  if (!(await openMoreMenu())) return { blocked: false, error: "Couldn't find this profile's more-options menu." };
  await sleep(1000);

  const blockItem = page.locator('[data-e2e="block-icon"]').first().or(page.getByText(/^block$/i).first());
  if (!(await blockItem.isVisible().catch(() => false))) {
    return { blocked: false, error: "Couldn't find Block in this profile's menu." };
  }
  await blockItem.click();
  await sleep(1000);

  const confirmButton = page.getByRole("button", { name: /^block$/i }).first();
  if (await confirmButton.isVisible().catch(() => false)) await confirmButton.click();
  else return { blocked: false, error: "Couldn't find the Block confirmation button." };

  await sleep(1500);
  const blocked = await isBlockedVisible();
  return blocked ? { blocked: true } : { blocked: false, error: "Clicked Block, but TikTok's real profile didn't confirm it." };
}

const BLOCK_HANDLER = { instagram: blockInstagram, tiktok: blockTikTok };

// This process must never outlive Connector itself — otherwise quitting the
// app (by any means: normal quit, force-quit, crash) stops actually meaning
// "no live feed available," because a plain spawn() on the Rust side doesn't
// tie this child's lifetime to its parent. Polling for the parent PID is
// the robust way to enforce that regardless of *how* the parent went away:
// `kill(pid, 0)` sends no signal, it only reports whether the process still
// exists, and throws ESRCH the moment it doesn't.
const PARENT_PID = process.env.REELFORGE_PARENT_PID ? Number(process.env.REELFORGE_PARENT_PID) : null;
if (PARENT_PID) {
  setInterval(() => {
    try {
      process.kill(PARENT_PID, 0);
    } catch {
      console.log(`[session] parent process ${PARENT_PID} is gone — shutting down`);
      for (const session of sessions.values()) void session.close();
      process.exit(0);
    }
  }, 4000).unref();
}

/** @type {Map<string, Session>} */
const sessions = new Map();

// Set only via POST /update-status (lib.rs's spawn_update_check) -- see
// that route and /health above. Always starts false: a fresh process (the
// normal case, and also what a post-restart relaunch is) never carries a
// stale "updating" flag over from before.
let connectorUpdating = false;

// research_accounts.sync_token is a single shared column per account -- a
// second live session started for the same account (another tab, a
// reconnect, another staff member) overwrites it in the DB, silently
// invalidating this session's own cached token for every archive write from
// that point on. This used to be undetectable: the old version never
// checked the response status at all, so a 403 looked identical to success.
// Now: check res.ok, and on exactly one 403 retry with the account's
// CURRENT token (see resolve-live-session-token) -- no mint, no loop. A
// successful retry updates session.token so every later archive call this
// session reuses the fresh value instead of re-hitting the same 403 every
// time. Never blocks or slows the live feed either way -- still
// fire-and-forget from next()'s point of view.
async function submitLiveReel(accountId, token, reel) {
  return fetch(SUBMIT_LIVE_REEL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, token, reel }),
  });
}

async function resolveCurrentSyncToken(accountId, lockSecret) {
  try {
    const res = await fetch(RESOLVE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, lockSecret }),
    });
    const body = await res.json().catch(() => ({}));
    return res.ok && body.token ? body.token : null;
  } catch {
    return null;
  }
}

async function archiveLiveReel(session, reel) {
  try {
    let res = await submitLiveReel(session.accountId, session.token, reel);

    if (res.status === 403) {
      const freshToken = await resolveCurrentSyncToken(session.accountId, session.lockSecret);
      if (!freshToken) {
        console.error(`[archive] session ${session.id} reel ${reel.id}: token rejected (403) and no fresh token could be resolved.`);
        return;
      }
      res = await submitLiveReel(session.accountId, freshToken, reel);
      if (res.ok) session.token = freshToken;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error(`[archive] session ${session.id} reel ${reel.id} failed (${res.status}): ${body.error ?? "(no error message)"}`);
    } else {
      // Erfolg wurde bisher gar nicht protokolliert -- dadurch liess sich
      // "hat geschrieben" nicht von "ist stillschweigend nichts passiert"
      // unterscheiden (09.10.2026).
      console.log(`[archive] ${reel.id} geschrieben.`);
    }
  } catch (err) {
    // A real network failure, not a rejected token -- archive is
    // cache/history only, never load-bearing for the live feed.
    console.error(`[archive] session ${session.id} reel ${reel.id} failed: ${err?.message ?? err}`);
  }
}

class Session {
  constructor(id, secret, accountId, platform, token, lockSecret, browser, context, page, initialSeenIds) {
    this.id = id;
    this.secret = secret;
    this.accountId = accountId;
    this.platform = platform;
    // Kept only to authenticate this session's own best-effort archive
    // writes for its whole lifetime (see archiveLiveReel) — the live feed
    // itself never depends on it again after the initial storageState
    // fetch in startSession().
    this.token = token;
    // The capability minted alongside this account's live-research lock —
    // proves to resolve-live-session-token that this session actually
    // holds the lock, not just that some session exists for the account.
    // Only ever needed for the token-recovery retry in archiveLiveReel.
    this.lockSecret = lockSecret;
    this.browser = browser;
    this.context = context;
    this.page = page;
    // Alles, was je mitgelesen wurde -- unabhaengig davon, ob der Puffer es
    // verworfen hat. Dient nur dem Nachschlagen von Angaben, nie der
    // Auslieferung.
    this.katalog = new Map();
    this.history = []; // reels already shown this session, in order
    this.cursor = -1;
    this.pending = []; // extracted-but-not-yet-shown, a natural read-ahead
    // Seeded from Archive's own permanent record (research_feed_items), not
    // just this Session instance's own memory -- Archive already knows every
    // reel id ever shown for this account, across every past session, so a
    // reel Instagram re-serves (same continuous session after a silent
    // recovery, or a brand new session days later) gets rejected here before
    // it ever reaches pending, the same way an id this Session itself
    // already showed always has been. Falls back to empty exactly like
    // before if the caller has nothing to seed with (e.g. a genuinely new
    // account, or the archive lookup failing) -- never a behavior change on
    // its own, only ever narrows what gets shown.
    this.seenIds = new Set(initialSeenIds ?? []);
    this.lastHeartbeat = Date.now();
    this.closed = false;
    // Guards maybePrefetch() so at most one background top-up is ever in
    // flight per session -- see maybePrefetch() below.
    this.prefetching = false;

    const domain = PLATFORM_DOMAIN[platform];
    const adapter = MEDIA_ADAPTER[platform];

    // --- Netzmessung (08.10.2026) -----------------------------------
    // Die eine offene Frage: Hoert Instagram am Umbruchpunkt auf, neue
    // Reels ANZUFRAGEN -- oder fragt es weiter und bekommt nichts
    // Brauchbares? Gemessen ist bisher nur die Folge: Der Vorrat unter uns
    // sinkt 5-4-3-2-1-0, dann setzt Instagram die Liste neu auf.
    //
    // Deshalb hier BEIDE Richtungen mitschreiben, und zwar nur den Kopf:
    // Pfad, Status, Groesse. Keine Koerper, nichts aus dem Browser
    // gezogen -- das war schon einmal der Grund fuer 683 ms Verzoegerung
    // pro Wisch. Reine Buchfuehrung, greift nirgends ein.
    this.netzZaehler = 0;
    // MESSUNG (09.10.2026, Emres Frage "worauf wuerde die Anzeige stehen?"):
    // Der zweite moegliche Kanal fuer Verweildauer. Das Video wird
    // stueckweise nachgeladen, waehrend es laeuft -- wer lange schaut, holt
    // mehr Stuecke. Instagram sieht das auf seiner Seite, ganz ohne eine
    // eigene Meldung. Diese Anfragen hatte ich bisher ausgefiltert, es kann
    // also sein, dass die eigentliche Watchtime hier laeuft und nicht in
    // den Meldungen, die ich dafuer gehalten habe.
    this.videoStuecke = 0;
    this.videoBytes = 0;
    this.feldNamenGemeldet = false;
    const istMedien = (u) => /\.(mp4|m4a|webm|jpg|jpeg|png|webp|heic|svg|css|js|woff2?)(\?|$)/i.test(u)
      || u.includes("cdninstagram") || u.includes("fbcdn");
    const kurz = (u) => {
      try {
        const x = new URL(u);
        return x.pathname + (x.search ? x.search.slice(0, 60) : "");
      } catch { return u.slice(0, 90); }
    };
    context.on("request", (req) => {
      try {
        const u = req.url();
        // Videostuecke zaehlen, statt sie wie bisher nur zu verwerfen.
        if (/\.mp4|\.m4s|video\/|bytestart|efg=/i.test(u) && (u.includes("cdninstagram") || u.includes("fbcdn"))) {
          this.videoStuecke += 1;
          return;
        }
        if (!u.includes(domain) || istMedien(u)) return;
        if (req.method() !== "POST" && !/graphql|\/api\/|reels_media|clips/i.test(u)) return;
        // Bei Instagrams eigener Wiedergabemeldung zusaetzlich die GROESSE
        // des Pakets. Darin steckt, was der Player ueber die Wiedergabe
        // berichtet -- je laenger geschaut, desto mehr Ereignisse. Bewusst
        // NUR die Groesse: in den Paketen stehen Sitzungsmerkmale, und die
        // haben in einem Protokoll nichts verloren.
        let zusatz = "";
        if (/unified_cvc|logging_client_events/.test(u)) {
          const d = req.postData();
          zusatz = d ? ` ${d.length}B` : "";
          // EINMAL pro Sitzung: nur die FELDNAMEN. Keine Werte -- darin
          // stehen Sitzungsmerkmale. Damit laesst sich beantworten, ob in
          // diesen Paketen ueberhaupt etwas ueber die Wiedergabedauer
          // steht, oder ob meine Deutung des Pfadnamens danebenlag.
          if (!this.feldNamenGemeldet && d && /unified_cvc/.test(u)) {
            this.feldNamenGemeldet = true;
            const namen = [...new Set(d.split("&").map((x) => decodeURIComponent(x.split("=")[0])))];
            console.log(`[felder] unified_cvc hat ${namen.length} Felder: ${namen.join(", ").slice(0, 900)}`);
          }
        }
        console.log(`[netz->] #${++this.netzZaehler} ${req.method()} ${kurz(u)}${zusatz}`);
      } catch {}
    });
    context.on("requestfailed", (req) => {
      try {
        const u = req.url();
        if (!u.includes(domain) || istMedien(u)) return;
        console.log(`[netz-X] FEHLGESCHLAGEN ${kurz(u)} -- ${req.failure()?.errorText ?? "?"}`);
      } catch {}
    });

    context.on("response", async (response) => {
      try {
        const u0 = response.url();
        if (u0.includes(domain) && !istMedien(u0)) {
          const laenge = response.headers()["content-length"] ?? "?";
          console.log(`[netz<-] ${response.status()} ${kurz(u0)} ${laenge}B`);
        }
      } catch {}
      return await this.__netzAlt(response);
    });
    this.__netzAlt = (async (response) => {
      try {
        const url = response.url();
        if (!url.includes(domain)) return;

        // Instagram liefert die ERSTEN Reels fertig in der Seite mit --
        // eingebettet in <script type="application/json">-Bloecke. Erst was
        // beim Scrollen nachgeladen wird, kommt als eigene JSON-Antwort.
        //
        // response.json() scheitert an HTML und verwarf die Seite deshalb
        // komplett. Genau daher hatten immer exakt die ersten beiden Reels
        // keine Angaben (@unknown, keine Like-Zahl), ab dem dritten war
        // alles da -- nachgemessen am 07.10.2026.
        // ERST nachsehen, was es ist -- dann erst den Inhalt holen.
        //
        // 08.10.2026, gemessen. Hier stand direkt response.json(), fuer
        // JEDE Antwort von instagram.com. Und "instagram.com" steckt auch
        // in cdninstagram.com -- also in den Reel-Videos selbst. Um die
        // Frage "bist du JSON?" zu beantworten, muss Playwright aber den
        // GANZEN Koerper aus dem Browser durch die Steuerleitung ziehen.
        // Bei einem Reel sind das mehrere Megabyte, und durch dieselbe
        // Leitung geht der Tastendruck des Mitarbeiters.
        //
        // Nachgestellt mit echten Dateien, schlimmster Wisch:
        //
        //     10 Dateien    133 ms    42 MB durch die Leitung
        //     30 Dateien    604 ms   126 MB
        //     60 Dateien    683 ms   206 MB
        //     mit dieser Vorpruefung: 5 bis 20 ms, 0 MB
        //
        // Das ist Emres "ich druecke Next und es passiert nichts", genau in
        // dem Moment, in dem Instagram nachlaedt.
        //
        // Bewusst NICHT auf "nur application/json" gefiltert: Instagram
        // liefert Daten auch mal mit einem untypischen Inhaltstyp aus, und
        // dann fehlten Name und Like-Zahl. Uebersprungen wird nur, was
        // sicher nie Daten enthaelt.
        const inhaltstyp = (response.headers()["content-type"] ?? "").toLowerCase();
        if (/^(image|video|audio|font)\//.test(inhaltstyp) || inhaltstyp.includes("text/css")) return;

        let body = await response.json().catch(() => null);
        const koerper = [];
        if (body) {
          koerper.push(body);
        } else {
          if (!inhaltstyp.includes("text/html")) return;
          const html = await response.text().catch(() => "");
          // Bewusst nur die ausgewiesenen JSON-Bloecke, nicht das ganze
          // Dokument: alles andere waere Rateraten im Markup.
          for (const m of html.matchAll(/<script[^>]+type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
            if (koerper.length >= 40) break;
            try { koerper.push(JSON.parse(m[1])); } catch { /* kein brauchbarer Block */ }
          }
          if (koerper.length === 0) return;
          console.log(`[seite] ${koerper.length} eingebettete Datenbloecke aus dem HTML gelesen.`);
        }
        body = koerper.length === 1 ? koerper[0] : koerper;
        const found = [];
        // DIAGNOSTIC (temporary): proves the seenIds filter is actively
        // rejecting candidates (from this session's own history, or seeded
        // from Archive), not just that Instagram happened not to re-serve
        // anything already known this time.
        const stats = { candidates: 0, rejected: 0, rejectedIds: [] };
        collectMediaFrom(body, found, this.seenIds, adapter, 0, stats, this.katalog);
        if (stats.rejected > 0) {
          console.log(`[trace-reject] session ${this.id}: response had ${stats.candidates} candidate(s), REJECTED ${stats.rejected} already-seen id(s): ${stats.rejectedIds.join(", ")}`);
        }
        // DIAGNOSTIC (temporary): does a single response ever contain the
        // same id twice before seenIds gets updated below? collectMediaFrom
        // only checks against seenIds as it walks, not against `found`
        // itself, so this is the one place a same-response internal
        // duplicate could slip past undetected.
        const idsThisResponse = found.map((f) => f.id);
        const internalDupes = idsThisResponse.filter((id, i) => idsThisResponse.indexOf(id) !== i);
        if (internalDupes.length > 0) {
          console.error(`[trace-dup] session ${this.id}: response itself contained duplicate id(s) within one body: ${[...new Set(internalDupes)].join(", ")} (url=${url.slice(0, 80)})`);
        }
        if (found.length > 0) {
          console.log(`[trace] session ${this.id}: response -> ${found.length} new id(s): ${idsThisResponse.join(", ")}`);
        }
        for (const item of found) {
          // DIAGNOSTIC (temporary): pending should never already contain
          // this id if seenIds is doing its job -- direct sanity check.
          if (this.pending.some((p) => p.id === item.id)) {
            console.error(`[trace-dup] session ${this.id}: ${item.id} was about to be pushed to pending but is ALREADY in pending`);
          }
          this.seenIds.add(item.id);
          this.pending.push(item);
        }
      } catch (err) {
        console.error(`[trace-error] session ${this.id}: response handler failed: ${err?.message ?? err}`);
      }
    });
  }


  // --- Buehne (V2) ---------------------------------------------------
  // Zwei Aufbauten gleichzeitig gibt es nicht: der zweite wartet auf den
  // ersten. Ohne diese Reihenfolge ueberholen sich die beiden Aushandlungen.
  async buehneStarten() {
    this.buehneAufbau = (this.buehneAufbau ?? Promise.resolve()).catch(() => {}).then(() => this.buehneStartenEinzeln());
    return await this.buehneAufbau;
  }

  async buehneStartenEinzeln() {
    // Das Skript nur einmal pro Seite einsetzen. Es jedes Mal neu
    // einzusetzen, setzte window.__buehne zurueck -- und eine Antwort, die
    // in genau diesem Moment eintraf, fand dann nichts mehr vor
    // ("keine Buehne", gemessen am 06.10.2026). Instagram tauscht beim
    // Wischen zwar Elemente aus, aber nicht das Fenster, also ueberlebt das
    // Skript die ganze Sitzung.
    const schonDa = await this.page.evaluate(() => !!window.__buehne).catch(() => false);
    if (!schonDa) await this.page.evaluate(BUEHNE_SKRIPT);
    const erg = await this.page.evaluate(() => window.__buehne.starte());
    console.log(`[buehne] session ${this.id}: ${erg.ok ? "steht -- " + (erg.protokoll ?? []).join(", ") : "FEHLER " + erg.fehler}`);
    this.buehneSteht = !!erg.ok;
    if (erg.ok) this.starteBeobachtung();
    return erg;
  }

  // Schreibt alle 3 Sekunden mit, was die Quelle tut und ob wirklich Bilder
  // rausgehen. Nur fuer die Fehlersuche -- greift nirgends ein.
  starteBeobachtung() {
    if (this.beobachtung) return;
    this.beobachtung = setInterval(async () => {
      if (this.closed) return;
      const d = await this.page.evaluate(() => window.__buehne?.diagnose?.()).catch((e) => ({ fehler: e.message }));
      console.log(`[buehne-blick] ${JSON.stringify(d)}`);
      // Selbstheilung: ist die Spur gestorben, sofort auf das Element
      // umlegen, das Instagram jetzt zeigt. Ohne das bleibt das Bild beim
      // Mitarbeiter stehen, obwohl Instagram munter weiterspielt.
      if (d && typeof d.spurZustand === "string" && d.spurZustand.startsWith("ended")) {
        const erg = await this.buehneNachfuehren();
        console.log(`[buehne-heilung] Spur war tot -> ${JSON.stringify(erg)}`);
      }
    }, 3000);
  }

  async buehneAntwort(sdp, aufbauId) {
    const erg = await this.page
      .evaluate(({ x, id }) => (window.__buehne ? window.__buehne.antwort(x, id) : { fehler: "Buehne war nicht mehr da" }), { x: sdp, id: aufbauId })
      .catch((e) => ({ fehler: String(e?.message ?? e) }));
    console.log(`[buehne] session ${this.id}: Antwort ${erg?.ok ? (erg.uebergangen ? "uebergangen (" + erg.uebergangen + ")" : "angenommen") : "ABGELEHNT -- " + erg?.fehler}`);
    return erg;
  }

  async buehneNachfuehren() {
    if (!this.buehneSteht) return { ok: false, fehler: "keine Buehne" };
    return await this.page.evaluate(() => window.__buehne.nachfuehren()).catch((e) => ({ fehler: e.message }));
  }

  // Liefert zu dem, was gerade auf der Buehne laeuft, die Metadaten -- aus
  // dem, was beim Mitlesen der Antworten ohnehin eingesammelt wurde. Findet
  // sich nichts, wird das ehrlich gesagt statt geraten.
  async buehneAktuell() {
    const sicht = await this.page.evaluate(() => window.__buehne.aktuellesReel()).catch(() => ({ code: null, wege: [] }));
    if (!sicht.code) return { reel: null, code: null, wege: sicht.wege ?? [] };
    const id = `instagram:${sicht.code}`;
    const nachschlagen = () =>
      this.history.find((r) => r.id === id) ??
      this.pending.find((r) => r.id === id) ??
      this.katalog.get(id) ??
      null;
    let bekannt = nachschlagen();

    // Beim ersten Reel einer Sitzung ist Instagrams Antwort oft noch gar
    // nicht mitgelesen -- nachgemessen am 07.10.2026: gefragt wurde in
    // Protokollzeile 13, die Daten kamen in Zeile 21. Wer hier sofort
    // aufgibt, zeigt dauerhaft @unknown, obwohl die Angaben Sekunden spaeter
    // dastehen. Also einmal pro Reel kurz warten -- danach nie wieder, damit
    // sich die Abfragen des Kunden nicht stauen.
    this.__gewartetFuer = this.__gewartetFuer ?? new Set();
    if (!bekannt && !this.__gewartetFuer.has(id)) {
      this.__gewartetFuer.add(id);
      const ende = Date.now() + 4000;
      while (Date.now() < ende && !bekannt) {
        await sleep(200);
        bekannt = nachschlagen();
      }
      if (bekannt) console.log(`[aktuell] ${sicht.code}: Angaben kamen nach dem Warten.`);
    }
    if (!bekannt) {
      // Letzter Ausweg: direkt von der Seite ablesen, was dort steht. Das
      // deckt Reels ab, die in keiner mitgelesenen Antwort vorkamen --
      // etwa weil Instagram sie aus seinem eigenen Zwischenspeicher zeigt.
      const vonDerSeite = await this.page.evaluate((code) => {
        // Vom Video aus nach oben gehen, bis ein Vorfahre einen Profillink
        // enthaelt. Eine feste Tiefe zu raten ging schief -- Instagram
        // schachtelt seine Reels unterschiedlich tief, und auf /reels/ gibt
        // es nicht einmal zuverlaessig ein <article>.
        const istProfil = (h) => {
          const m = (h ?? "").match(/^\/([A-Za-z0-9._]{2,30})\/$/);
          return m && !["explore", "reels", "accounts", "direct", "p", "stories"].includes(m[1]) ? m[1] : null;
        };
        const sucheIn = (wurzel) => {
          for (const a of wurzel.querySelectorAll("a[href]")) {
            const n = istProfil(a.getAttribute("href"));
            if (n) return n;
          }
          return null;
        };
        const v = window.__buehne?.videoImBild?.();
        let knoten = v?.parentElement ?? null;
        for (let i = 0; i < 8 && knoten; i++, knoten = knoten.parentElement) {
          const n = sucheIn(knoten);
          if (n) return { nutzer: n, weg: `Profillink ${i + 1} Ebene(n) ueber dem Video` };
        }
        // Zweiter Weg: beim Link, der auf genau dieses Reel zeigt, nachsehen.
        if (code) {
          const reelLink = document.querySelector(`a[href*="/reel/${code}"]`);
          let k = reelLink?.parentElement ?? null;
          for (let i = 0; i < 6 && k; i++, k = k.parentElement) {
            const n = sucheIn(k);
            if (n) return { nutzer: n, weg: "Profillink neben dem Reel-Link" };
          }
        }
        // Nichts gefunden: aufschreiben, was ueberhaupt dasteht. Zweimal
        // habe ich hier einen Selektor geraten und zweimal danebengelegen --
        // der dritte wird aus echten Daten gebaut, nicht aus einer Annahme.
        const probe = [];
        let k2 = v?.parentElement ?? null;
        for (let i = 0; i < 8 && k2 && probe.length < 14; i++, k2 = k2.parentElement) {
          for (const a of k2.querySelectorAll("a[href]")) {
            const h = a.getAttribute("href") ?? "";
            if (probe.length < 14) probe.push(`${i}:${h.slice(0, 48)}`);
          }
        }
        const kopftext = (v?.closest("div")?.parentElement?.innerText ?? "").slice(0, 160).replace(/\n/g, " | ");
        return { nutzer: null, weg: "nichts gefunden", probe, kopftext };
      }, sicht.code).catch(() => null);
      if (vonDerSeite && !vonDerSeite.nutzer && !this.__probeGeloggt?.has?.(sicht.code)) {
        this.__probeGeloggt = this.__probeGeloggt ?? new Set();
        this.__probeGeloggt.add(sicht.code);
        console.log(`[probe] ${sicht.code} kein Name. Links in der Naehe: ${JSON.stringify(vonDerSeite.probe)}`);
        console.log(`[probe] ${sicht.code} Text drumherum: ${vonDerSeite.kopftext}`);
      }
      if (vonDerSeite) {
        bekannt = {
          id,
          platform: "instagram",
          username: vonDerSeite.nutzer,
          weg: vonDerSeite.weg,
          sourceUrl: `https://www.instagram.com/reel/${sicht.code}/`,
          thumbnailUrl: null,
          videoUrl: null,
          caption: null,
          vonDerSeite: true,
        };
      }
    }
    if (!this.__letzterAktuellLog || this.__letzterAktuellLog !== sicht.code) {
      this.__letzterAktuellLog = sicht.code;
      console.log(
        `[aktuell] code=${sicht.code ?? "-"} weg=${sicht.wege?.[0]?.weg ?? "-"} ` +
          `verzeichnis=${this.katalog.size} gefunden=${bekannt ? (bekannt.vonDerSeite ? "von der Seite: " + (bekannt.username ?? "kein Name") : "im Verzeichnis") : "NEIN"}`
      );
    }
    // Am ersten Reel der Sitzung ist nach oben Schluss -- Emres Vorgabe
    // ("Am ersten Reel ist Schluss nach oben"). Bewusst am ZUSTAND
    // festgemacht, nicht an einem mitgezaehlten Schrittzaehler: ein
    // verworfener oder fehlgeschlagener Wisch wuerde den Zaehler
    // verschieben, und dann waere "Zurueck" irgendwann falsch gesperrt
    // oder falsch freigegeben. Der Code des ersten Reels dagegen stimmt
    // immer.
    this.erstesReel = this.erstesReel ?? sicht.code;
    // Aufrufe nachfragen. Instagram liefert sie im Feed nicht mit; die
    // einzige Stelle ist seine eigene Adresse /api/v1/media/<nr>/info/.
    // Genau das tut auch die Erweiterung, die Emre im Browser benutzt
    // (09.10.2026 in deren Code nachgelesen, inklusive der funf Feldnamen).
    //
    // Pro Reel genau EINE Anfrage: Das Ergebnis wird gemerkt, die Abfrage
    // des Kunden laeuft alle zwei Sekunden und darf das nicht jedes Mal
    // ausloesen. Scheitert sie, wird nichts erfunden -- dann bleibt die
    // Zahl leer.
    this.__aufrufe = this.__aufrufe ?? new Map();
    const nr = bekannt?.pk ?? null;
    if (nr && !this.__aufrufe.has(nr)) {
      this.__aufrufe.set(nr, null); // Platz belegen, damit es nur einmal laeuft
      const geholt = await this.page
        .evaluate(async (id) => {
          try {
            const r = await fetch(`/api/v1/media/${id}/info/`, {
              headers: { "X-IG-App-ID": "936619743392459" },
              credentials: "include",
            });
            if (!r.ok) return { fehler: `HTTP ${r.status}` };
            const j = await r.json();
            const m = j?.items?.[0] ?? {};
            for (const k of ["play_count", "ig_play_count", "view_count", "video_view_count", "content_views_count"]) {
              if (typeof m[k] === "number") return { wert: m[k], feld: k };
            }
            return { fehler: "kein Aufruf-Feld in der Antwort" };
          } catch (e) { return { fehler: String(e?.message ?? e) }; }
        }, nr)
        .catch((e) => ({ fehler: String(e?.message ?? e) }));
      if (typeof geholt?.wert === "number") {
        this.__aufrufe.set(nr, geholt.wert);
        console.log(`[aufrufe] ${sicht.code}: ${geholt.wert} (${geholt.feld})`);
      } else {
        console.log(`[aufrufe] ${sicht.code}: nicht bekommen -- ${geholt?.fehler ?? "?"}`);
      }
    }
    const aufrufe = nr ? this.__aufrufe.get(nr) : null;

    // Die Laenge steht nicht in Instagrams Antwort (gemessen am 09.10.2026:
    // video_duration fehlt in jedem Reel). Das laufende Video kennt sie aber
    // selbst -- also dort ablesen statt in der Antwort zu suchen.
    const laenge = await this.page
      .evaluate(() => {
        const v = window.__buehne?.videoImBild?.();
        return v && isFinite(v.duration) && v.duration > 0 ? Math.round(v.duration) : null;
      })
      .catch(() => null);
    // Ins Archiv schreiben, was der Mitarbeiter wirklich gesehen hat.
    //
    // In V1 geschah das in next() -- und das ruft in V2 niemand mehr auf.
    // Dadurch sammelte das Archiv seit der Umstellung nur noch, was beim
    // Verbinden oder beim Resync eingelesen wurde, nicht die Reels der
    // laufenden Sitzung (09.10.2026 von Emre gemeldet).
    //
    // Einmal pro Reel und Sitzung: diese Abfrage laeuft alle zwei Sekunden,
    // ohne Gedaechtnis wuerde dasselbe Reel staendig erneut geschrieben.
    // Wie ueberall beim Archiv ohne Warten und ohne Folgen fuer die Bild-
    // uebertragung -- es ist Verlauf, nichts, woran der Feed haengt.
    this.__archiviert = this.__archiviert ?? new Set();
    if (bekannt && !this.__archiviert.has(bekannt.id)) {
      this.__archiviert.add(bekannt.id);
      // Einmal pro Sitzung: wie lange haelt die Bildadresse? Instagram
      // unterschreibt sie mit einem Ablaufzeitpunkt (Emres Frage vom
      // 09.10.2026). Nur Lesen, nur einmal.
      if (!this.__ablaufGemeldet && bekannt.thumbnailUrl) {
        this.__ablaufGemeldet = true;
        try {
          const u = new URL(bekannt.thumbnailUrl);
          const hex = u.searchParams.get("oe");
          const exp = u.searchParams.get("_nc_exp");
          const bis = hex ? parseInt(hex, 16) * 1000 : exp ? Number(exp) : null;
          console.log(
            bis
              ? `[thumbnail] gueltig bis ${new Date(bis).toISOString()} -- noch ${Math.round((bis - Date.now()) / 86400000)} Tage`
              : `[thumbnail] kein Ablauf in der Adresse gefunden (${[...u.searchParams.keys()].join(", ")})`,
          );
        } catch (e) { console.log(`[thumbnail] Adresse nicht lesbar: ${e?.message ?? e}`); }
      }
      void archiveLiveReel(this, bekannt);
    }

    const angereichert = bekannt
      ? { ...bekannt, ...(laenge ? { durationSec: laenge } : {}), ...(typeof aufrufe === "number" ? { viewsRaw: aufrufe } : {}) }
      : bekannt;
    return { reel: angereichert, code: sicht.code, wege: sicht.wege, amAnfang: sicht.code === this.erstesReel };
  }

  async buehneZustand() {
    if (!this.buehneSteht) return { verbindung: "-", spuren: "-" };
    return await this.page.evaluate(() => window.__buehne.zustand()).catch(() => ({ verbindung: "?", spuren: "?" }));
  }

  // Eine Eingabe des Mitarbeiters geht in GENAU DEN Tab, den er sieht.
  // Das ist der ganze Unterschied zu V1: dort wischte er in unserem eigenen
  // Player, hier wischt er in Instagram.
  // Eingaben laufen strikt hintereinander. Zwei gleichzeitig bedeuteten zwei
  // ueberlappende Spurwechsel, und genau das sah man beim Scrollen als
  // Durcheinander aus auftauchenden Videos.
  async eingabe(art) {
    // Ein Wisch zur Zeit -- und was waehrenddessen kommt, wird VERWORFEN,
    // nicht aufgehoben.
    //
    // 08.10.2026, Emres Befund: "man kann den Next-Knopf so krass
    // durchspammen, dass man auf einmal acht Videos ueberspringt". Genau
    // das war der Grund: jeder Tastendruck wurde hier an die Kette
    // gehaengt. Zehnmal druecken hiess zehn Wische -- sie kamen nur
    // spaeter, alle auf einmal. Und acht Reelwechsel in einem Rutsch sind
    // acht Neuansaetze fuer den Entpacker beim Mitarbeiter; daraus entsteht
    // der Bildstapel, der die Sitzung danach traege macht.
    //
    // Instagram verhaelt sich genauso: was waehrend eines laufenden
    // Wechsels gedrueckt wird, ist weg. Ein Wisch ist kein Auftrag, der
    // abgearbeitet werden muss, sondern eine Geste -- und eine Geste, die
    // ins Leere geht, wiederholt man einfach.
    // Ein Wisch bringt ein neues Reel -- eine Pause von vorher gilt dafuer
    // nicht mehr.
    if (art === "weiter" || art === "zurueck") this.vomNutzerAngehalten = false;

    if (art === "weiter" || art === "zurueck") {
      // Instagrams eigenen Pfeil druecken und warten, bis gewechselt ist.
      //
      // Die Schritt-Pruefung ("war es genau EIN Reel?") ist am 08.10.2026
      // zweimal hintereinander schiefgegangen und wurde deshalb wieder
      // entfernt:
      //   1. Sie korrigierte selbstaendig zurueck -- und weil Instagram die
      //      Elemente austauscht, wurde die Bedingung nie wahr: der Player
      //      lief von allein bis zum ersten Reel.
      //   2. Ohne Korrektur meldete sie staendig "Ziel nicht erreicht" und
      //      blieb stehen, sobald das Video pausiert war (dann greift die
      //      Erkennung, welches Element dran ist, daneben).
      // Der Multi-Skip beim Nachladen bleibt damit offen -- aber er ist
      // deutlich weniger schlimm als ein Player, der sich selbst verstellt
      // oder gar nicht mehr weitergeht.
      const vorher = await this.page.evaluate(() => window.__buehne.kennung())
        .catch(() => ({ zeichen: null, code: null }));

      const lage = await this.page
        .evaluate((richtung) => window.__buehne.knopfLage(richtung), art)
        .catch(() => null);
      let dom = await this.page
        .evaluate(() => window.__buehne.listeImDom())
        .catch(() => null);

      // --- Nicht ins Leere klicken (08.10.2026) ------------------------
      // Gemessen: Instagram fragt rechtzeitig nach Nachschub (bei Vorrat 4
      // ging POST /graphql/query raus) und bekommt auch eine gueltige
      // Antwort -- aber bis sie da ist, ist der Mitarbeiter vier Reels
      // weiter und steht bei Vorrat 0. Der Stapel, der dann ankommt,
      // landet ZWISCHEN ihm und seinen bereits gesehenen Reels. Genau das
      // ist der Grund, warum "Zurueck" danach fremde Reels zeigt.
      //
      // Auf instagram.com passiert das nicht, weil dort niemand im
      // 125-ms-Takt klickt -- die Antwort ist laengst da, bevor der Vorrat
      // aufgebraucht ist.
      //
      // Also: Ist unter uns nichts mehr vorbereitet, wird NICHT geklickt,
      // sondern gewartet, bis Instagram geliefert hat. Der Kunde zeigt
      // dabei seinen Ladezustand (ab 350 ms) und bricht erst nach 12 s ab,
      // deshalb hier hoechstens 9 s. Danach wird trotzdem geklickt --
      // lieber ein unsauberer Schritt als ein Mitarbeiter, der feststeckt.
      // Produktregel (Emre, 09.10.2026): Ist das naechste Reel noch nicht
      // bereit, wartet ReelForge. Es wird NICHT ins Leere geklickt -- auch
      // nicht nach Ablauf der Frist. Vorher wurde nach 9 s trotzdem
      // geklickt; gemessen am 08.10.2026 waren danach alle sechs
      // Videoelemente ausgetauscht, auch die fuenf ueber dem laufenden, und
      // "Zurueck" fuehrte in nie gesehene Reels.
      //
      // Die Frist liegt unter der 12-s-Grenze der Anfrage, damit der Kunde
      // eine ordentliche Antwort bekommt statt eines Abbruchs. Laeuft sie
      // ab, passiert gar nichts: dasselbe Reel bleibt stehen, der
      // Mitarbeiter kann erneut druecken.
      const vorratUnten = (d) => (d && d.stelle >= 0 ? d.anzahl - d.stelle - 1 : null);
      if (art === "weiter" && vorratUnten(dom) === 0) {
        const start = Date.now();
        const bis = start + WARTEN_AUF_REEL_MS;
        while (Date.now() < bis) {
          await sleep(150);
          const neu = await this.page
            .evaluate(() => window.__buehne.listeImDom())
            .catch(() => null);
          if (vorratUnten(neu) > 0) { dom = neu; break; }
          dom = neu ?? dom;
        }
        const gewartet = Date.now() - start;
        const jetzt = vorratUnten(dom);
        if (!(jetzt > 0)) {
          console.log(`[warten] ${gewartet}ms gewartet, Instagram hat nichts bereitgestellt -- es wird NICHT geklickt.`);
          await this.buehneNachfuehren().catch(() => {});
          return { ok: true, gewechselt: false, nichtBereit: true, code: vorher.code ?? null };
        }
        console.log(`[warten] ${gewartet}ms gewartet, danach ${jetzt} Reels unter uns`);
      }

      const perKnopf = await this.page
        .evaluate((richtung) => {
          const k = window.__buehne.wischKnopf(richtung);
          if (!k) return { ok: false };
          const name =
            k.getAttribute("aria-label") ??
            k.querySelector?.("svg[aria-label]")?.getAttribute("aria-label") ??
            "(ohne Namen)";
          k.click();
          return { ok: true, name };
        }, art)
        .catch(() => ({ ok: false }));
      if (!perKnopf.ok) {
        await this.page.keyboard.press(art === "weiter" ? "ArrowDown" : "ArrowUp");
      }

      const wechsel = await this.page
        .evaluate((v) => window.__buehne.warteAufWechsel(v), vorher)
        .catch(() => ({ gewechselt: false, code: null }));

      console.log(
        `[wisch] ${art}: ${vorher.code ?? "?"} -> ${wechsel.code ?? "?"}` +
          ` (${wechsel.gewechselt ? `${wechsel.dauer}ms` : "NICHT GEWECHSELT, Instagram laedt vermutlich noch"})` +
          (perKnopf.ok ? ` [${perKnopf.name}]` : " [Tastatur]") +
          (lage ? ` {Pfeile:${lage.anzahl} genommen@y${lage.genommen?.y ?? "?"}` +
            ` Video y${lage.videoOben}..${lage.videoUnten} von ${lage.fensterHoch}` +
            ` alle:${lage.stellen.map((p) => "y" + p.y).join(",")}}` : "")
      );
      if (dom) {
        console.log(`[liste] ${dom.anzahl} Videos in der Seite, wir auf Platz ${dom.stelle}` +
          ` | vorher=${vorher.datei ?? "?"} | ${dom.eintraege.join(" ")}`);
      }
      // Was hat das gerade verlassene Reel an Videostuecken gekostet?
      console.log(`[video] vorheriges Reel: ${this.videoStuecke} Stuecke nachgeladen`);
      this.videoStuecke = 0;

      // Erst wenn der Wechsel steht, die Buehne umhaengen -- so kommen Bild
      // und Angaben gemeinsam an.
      await this.buehneNachfuehren().catch(() => {});
      return { ok: true, gewechselt: !!wechsel.gewechselt, code: wechsel.code ?? null };
    }
    if (art === "tippen") {
      // Mitte des Fensters -- Instagram haelt damit an bzw. spielt weiter,
      // genau wie ein Fingertipp auf dem Handy.
      // Der Zustand VOR dem Klick -- und zwar wirklich vorher.
      //
      // Hier wurde erst geklickt und danach "vorher" gelesen. Damit stand in
      // "vorher" schon der Zustand NACH dem Klick, die Schleife wartete auf
      // eine Aenderung, die laengst passiert war, und lief immer die vollen
      // 1000 ms leer. Jeder Tipp kostete also eine geschlagene Sekunde,
      // bevor ReelForge erfuhr, dass pausiert wurde -- und weil Eingaben
      // streng hintereinander laufen, blockierte das auch alles dahinter.
      // Ein Klick hinter schnellen Wischen: zwei bis drei Sekunden, bis
      // Pause ankam. Gemeldet von Emre am 07.10.2026.
      const vorher = await this.page
        .evaluate(() => { const v = window.__buehne?.videoImBild?.(); return v ? v.paused : null; })
        .catch(() => null);
      await this.page.mouse.click(Math.round(BUEHNE_FENSTER.width / 2), Math.round(BUEHNE_FENSTER.height / 2));
      // Nicht blind warten und dann ablesen -- wie lange Instagram braucht,
      // weiss niemand. Stattdessen nachsehen, bis sich der Zustand wirklich
      // geaendert hat. Das ist jetzt nach wenigen Zehntelsekunden der Fall.
      let pausiert = vorher;
      const ende = Date.now() + 1000;
      while (Date.now() < ende) {
        pausiert = await this.page
          .evaluate(() => { const v = window.__buehne?.videoImBild?.(); return v ? v.paused : null; })
          .catch(() => null);
        if (pausiert !== vorher) break;
        await sleep(25);
      }
      // Merken, ob der Mitarbeiter SELBST angehalten hat. Nur das darf
      // dazu fuehren, dass das Reel nach einem Profilbesuch stehen bleibt
      // -- "lief gerade nicht" allein reicht nicht, denn das heisst auch
      // "war noch am Anlaufen" (10.10.2026).
      this.vomNutzerAngehalten = pausiert === true;
      return { ok: true, pausiert };
    }
    return { ok: false, fehler: "unbekannte Eingabe" };
  }

  current() {
    return this.cursor >= 0 && this.cursor < this.history.length ? this.history[this.cursor] : null;
  }

  async ensurePending(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    if (this.pending.length > 0) return;
    // Nudge the real feed forward — this is the one moment "next" genuinely
    // touches the live Instagram session rather than replaying memory. Real
    // per-reel navigation (ArrowDown), not a raw wheel-scroll jump: directly
    // confirmed that repeated identical wheel jumps plateau after the first
    // batch or two regardless of how many times they're repeated, while
    // real per-reel navigation reliably triggers Instagram's own
    // threshold-based FYP refill as it's exercised further into the
    // currently loaded set -- matching how a genuine viewer actually
    // advances, not an arbitrary large scroll delta.
    await this.page.keyboard.press("ArrowDown").catch(() => {});
    while (this.pending.length === 0 && Date.now() < deadline) {
      await sleep(300);
    }
  }

  // Best-effort, fire-and-forget: called right after next() delivers a
  // fresh reel, so the *next* time the VA reaches the end of pending,
  // pending may already be topped up and next() returns instantly instead
  // of making them wait through a live refill. Never awaited by next()/the
  // HTTP handler, and failure here is completely invisible to the VA.
  //
  // Deliberately does NOT call ensurePending() -- that function only ever
  // nudges when `pending` is fully empty (`if (this.pending.length > 0)
  // return`), which is right for a real next() call (no need to nudge if
  // there's already something to serve) but wrong here: maybePrefetch is
  // meant to start EARLY, while pending still has up to
  // PREFETCH_LOW_WATER_MARK items left, specifically to get ahead of
  // exhaustion. Routing through ensurePending's own guard would make it a
  // silent no-op until pending hit literal 0, defeating the whole point of
  // triggering early. So this presses ArrowDown itself (same primitive,
  // same real per-reel navigation ensurePending uses -- see its own
  // comment above) and polls for `pending` to grow past whatever it was
  // when this started, not just "become non-zero".
  //
  // Keeps re-nudging every ~4s for up to PREFETCH_MAX_DURATION_MS instead
  // of trying once and giving up, because real [trace] evidence showed a
  // single ~4-8s attempt is nowhere near enough: genuine post-exhaustion
  // recovery took 7-8 such cycles over ~60-70s in an actual session. Stops
  // the instant pending grows (from this loop, or from anything else --
  // e.g. a real next() call's own nudge landing a response first, which
  // races harmlessly with this) or the session closes -- never spins past
  // either.
  maybePrefetch() {
    if (this.closed || this.prefetching || this.pending.length > PREFETCH_LOW_WATER_MARK) return;
    this.prefetching = true;
    const startedAt = Date.now();
    const deadline = startedAt + PREFETCH_MAX_DURATION_MS;
    const startingPendingCount = this.pending.length;
    console.log(`[trace-prefetch] session ${this.id}: buffer low (pending=${startingPendingCount}, threshold=${PREFETCH_LOW_WATER_MARK}), starting background prefetch (bounded ${PREFETCH_MAX_DURATION_MS}ms)`);
    (async () => {
      try {
        while (!this.closed && this.pending.length <= startingPendingCount && Date.now() < deadline) {
          await this.page.keyboard.press("ArrowDown").catch(() => {});
          const cycleDeadline = Math.min(deadline, Date.now() + 4000);
          while (!this.closed && this.pending.length <= startingPendingCount && Date.now() < cycleDeadline) {
            await sleep(300);
          }
        }
        if (this.pending.length > startingPendingCount) {
          console.log(`[trace-prefetch] session ${this.id}: prefetch succeeded after ${Date.now() - startedAt}ms, pending=${this.pending.length}`);
        } else if (this.closed) {
          console.log(`[trace-prefetch] session ${this.id}: prefetch stopped after ${Date.now() - startedAt}ms -- session closed`);
        } else {
          console.log(`[trace-prefetch] session ${this.id}: prefetch gave up after ${Date.now() - startedAt}ms (bounded window exhausted), pending still at ${this.pending.length} -- normal refill path is unaffected`);
        }
      } catch (err) {
        // Same "best-effort, never lets this take anything else down"
        // shape as archiveLiveReel/releaseLock elsewhere in this file --
        // most relevant case is the session closing (browser.close())
        // mid-loop.
        console.log(`[trace-prefetch] session ${this.id}: prefetch failed (${err?.message ?? err}) -- normal refill path is unaffected`);
      } finally {
        this.prefetching = false;
      }
    })();
  }

  async next() {
    if (this.cursor < this.history.length - 1) {
      this.cursor += 1;
      const reel = this.current();
      console.log(`[trace] session ${this.id} next(): REWIND to ${reel?.id} at history position ${this.cursor} (fresh=false, this is the user's own prev/next replay, not a new capture)`);
      return { reel, fresh: false };
    }
    const t0 = Date.now();
    await this.ensurePending(4000);
    let waitedTwice = false;
    if (this.pending.length === 0) {
      // Try once more with a longer wait rather than reporting failure
      // immediately — Instagram's own response can just be slow.
      waitedTwice = true;
      await this.ensurePending(4000);
    }
    if (this.pending.length === 0) {
      console.log(`[trace] session ${this.id} next(): feed exhausted after ${Date.now() - t0}ms (waitedTwice=${waitedTwice}), pending still empty, history so far=${this.history.length}`);
      return { reel: null, fresh: false };
    }
    const reel = this.pending.shift();
    // DIAGNOSTIC (temporary): the ground-truth check -- has this exact id
    // ever been delivered before in this Session's history? seenIds/pending
    // should make this structurally impossible, but this proves it directly
    // rather than assuming the upstream guards are airtight.
    const priorIndex = this.history.findIndex((h) => h.id === reel.id);
    if (priorIndex !== -1) {
      console.error(`[trace-dup] session ${this.id}: DUPLICATE DELIVERED -- ${reel.id} was already shown at history position ${priorIndex}, now being delivered again at position ${this.history.length} (gap: ${this.history.length - priorIndex})`);
    }
    this.history.push(reel);
    this.cursor = this.history.length - 1;
    console.log(`[trace] session ${this.id} next(): delivered ${reel.id} at history position ${this.cursor} (fresh=true, waitedMs=${Date.now() - t0}, pendingRemaining=${this.pending.length})`);
    // The VA is now genuinely seeing this reel for the first time this
    // session — exactly the moment Archive is supposed to pick it up.
    // Fire-and-forget: never lets a slow/failed archive write hold up the
    // live feed the VA is actually looking at.
    reelNotieren(this.id, reel.id);
    void archiveLiveReel(this, reel);
    this.maybePrefetch();
    return { reel, fresh: true };
  }

  prev() {
    if (this.cursor > 0) this.cursor -= 1;
    return this.current();
  }

  // Auf welches Reel wirkt eine Handlung? In V1 ist das der Pufferstand, den
  // der Kunde gerade sieht. In V2 sieht er Instagrams eigenen Tab, und der
  // Puffer steht noch ganz woanders -- ein Like wuerde dann das falsche Reel
  // treffen. Deshalb entscheidet bei laufender Buehne Instagram selbst.
  //
  // Laesst sich nicht sicher sagen, was im Bild ist, wird abgebrochen. Lieber
  // keine Handlung als die falsche auf einem echten Account.
  // Eine Nebenseite fuer Like, Follow, Block oder Kommentare.
  //
  // Zwei Dinge, die V2 noetig gemacht hat:
  //
  // 1. Sie bekommt ausdruecklich die Schreibtischbreite zurueck. Die
  //    Reels-Seite laeuft in V2 in Reel-Form (420 breit), und eine neue
  //    Seite erbt dieses Mass vom Kontext. Instagram rendert bei 420 ein
  //    anderes Layout -- das Kommentar-Lesen vergleicht den sichtbaren Text
  //    vor und nach dem Oeffnen und griff dort nur noch Wiederholungen
  //    ("jeder Kommentar sagt Video", 06.10.2026).
  //
  // 2. Die Reels-Seite wird sofort wieder nach vorn geholt. Eine neu
  //    geoeffnete Seite wird aktiv, und die Reels-Seite gilt dann als
  //    versteckt -- ein versteckter Tab drosselt sein Video, und damit
  //    genau den Strom, den der Mitarbeiter gerade sieht. Playwright kann
  //    die Nebenseite auch im Hintergrund bedienen, Vordergrund braucht sie
  //    nicht.
  async nebenseite() {
    const seite = await this.context.newPage();
    await seite.setViewportSize({ width: 1280, height: 800 }).catch(() => {});
    await this.page.bringToFront().catch(() => {});
    return seite;
  }

  async handlungsZiel() {
    if (!this.buehneSteht) return { reel: this.current(), fehler: null };
    const { reel, code } = await this.buehneAktuell();
    if (reel) return { reel, fehler: null };
    if (code) {
      return {
        reel: { id: `instagram:${code}`, sourceUrl: `https://www.instagram.com/reel/${code}/`, username: null },
        fehler: null,
      };
    }
    return { reel: null, fehler: "Instagram verraet gerade nicht, welches Reel zu sehen ist. Einmal weiterwischen und erneut versuchen." };
  }

  async like() {
    // V2: direkt im Tab, den der Mitarbeiter sieht -- ohne Umweg ueber eine
    // zweite Seite. Das ist derselbe Griff, den ein Mensch tut, und macht
    // den Like genauso eins zu eins wie das Bild.
    if (this.buehneSteht) {
      const erg = await this.page.evaluate(() => window.__buehne.herzDruecken()).catch((e) => ({ ok: false, fehler: e.message }));
      const was = await this.buehneAktuell().catch(() => ({ code: null }));
      console.log(`[herz] session ${this.id}: reel=${was.code ?? "?"} -> ${erg.ok ? (erg.geliked ? "geliked" : "ENTLIKED") : "FEHLER " + erg.fehler}`);
      if (erg.ok) return { liked: !!erg.geliked, inTab: true, reelCode: was.code ?? null };
      // Faellt zurueck auf den alten Weg, statt den Mitarbeiter stehenzulassen.
      console.log(`[herz] fallback auf die zweite Seite: ${erg.fehler}`);
    }
    const { reel, fehler } = await this.handlungsZiel();
    if (fehler) return { liked: false, error: fehler };
    if (!reel) return { liked: false, error: "No reel is currently in view." };

    // A real, separate page in the SAME authenticated context — this
    // reuses the session's real cookies without disturbing the Reels/For-You
    // tab's own scroll position (liking a reel the VA has scrolled back to
    // review shouldn't move the live feed out from under them).
    const likePage = await this.nebenseite();
    let result;
    try {
      await likePage.goto(reel.sourceUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await sleep(2000);
      result = await LIKE_HANDLER[this.platform](likePage);
    } catch (err) {
      result = { liked: false, error: err?.message ?? "Something went wrong while liking this reel." };
    } finally {
      await likePage.close().catch(() => {});
    }

    return result;
  }

  // Repost auf dem verbundenen Konto -- dieselbe Regel wie Like/Follow/Block:
  // Erfolg wird nur gemeldet, wenn Instagrams eigener Knopf nachweislich
  // umgesprungen ist. Bewusst OHNE den Umweg ueber eine zweite Seite: der
  // Repost gehoert zu dem Reel, das der Mitarbeiter gerade sieht, und ohne
  // Buehne gibt es kein sichtbares Reel.
  async repost() {
    if (!this.buehneSteht) return { reposted: false, error: "No reel is currently in view." };
    const erg = await this.page
      .evaluate(() => window.__buehne.repostDruecken())
      .catch((e) => ({ ok: false, fehler: e.message }));
    const was = await this.buehneAktuell().catch(() => ({ code: null }));
    if (erg.ok) {
      console.log(`[repost] session ${this.id}: reel=${was.code ?? "?"} -> ${erg.repostet ? "repostet" : "zurueckgenommen"} (erkannt an: ${erg.weg}).`);
      return { reposted: !!erg.repostet, reelCode: was.code ?? null };
    }
    console.log(`[repost] session ${this.id}: reel=${was.code ?? "?"} FEHLER ${erg.fehler}${erg.gesehen ? ` | Knoepfe im Bild: ${erg.gesehen.join(" | ")}` : ""}`);
    return { reposted: false, error: erg.fehler ?? "Couldn't confirm the repost." };
  }

  // ---------------------------------------------------------------------
  // ZWEITE BUEHNE: das Profil eines Creators, ohne den Feed anzufassen.
  //
  // Die laufende Buehne DARF dafuer nicht navigiert werden -- sie traegt
  // Reihenfolge, Historie und Position der Sitzung. Deshalb bekommt das
  // Profil eine eigene Seite im selben angemeldeten Browser.
  //
  // Warum Bilder statt eines Live-Stroms wie beim Reel: ein Reel bewegt
  // sich 30-mal pro Sekunde, eine Profilseite steht still, bis jemand
  // scrollt oder klickt. Ein zweiter Live-Strom haette dauerhaft neben dem
  // Feed gelaufen; ein Bild nach jeder Bedienung kostet nur dann etwas,
  // wenn wirklich etwas passiert. Faellt das Scrollen zu zaeh aus, laesst
  // sich immer noch auf einen echten Strom umstellen -- dann wissen wir
  // wenigstens, wofuer wir ihn brauchen.
  // ---------------------------------------------------------------------
  // Wie viele Tabs hat dieser Browser gerade? Soll IMMER 1 sein (die
  // Buehne), und nur solange ein Profil offen ist 2. Steht etwas anderes
  // im Protokoll, bleibt irgendwo etwas haengen -- genau das wollte Emre
  // nachpruefbar haben (10.10.2026).
  tabs() {
    try { return this.context.pages().filter((s) => !s.isClosed()).length; } catch { return -1; }
  }

  // Macht jeden Profil-Tab zu ausser dem, der gerade gelten soll.
  async profilTabsAufraeumen(behalten) {
    const offen = [...(this.profilTabs ?? [])];
    for (const s of offen) {
      if (s === behalten) continue;
      this.profilTabs.delete(s);
      if (!s.isClosed()) await s.close().catch(() => {});
    }
    if (behalten && behalten.isClosed()) this.profilTabs.delete(behalten);
  }

  async profilBild() {
    if (!this.profilSeite) return null;
    const roh = await this.profilSeite
      .screenshot({ type: "jpeg", quality: 92 })
      .catch(() => null);
    return roh ? `data:image/jpeg;base64,${roh.toString("base64")}` : null;
  }

  async profilOeffnen(username, breite, hoehe, anzeige) {
    const name = String(username ?? "").replace(/^@/, "").trim();
    if (!/^[A-Za-z0-9._]{1,40}$/.test(name)) {
      console.log(`[profil] session ${this.id}: abgelehnt, "${username}" ist kein Profilname.`);
      return { ok: false, fehler: "Unknown profile." };
    }

    const w = Math.max(600, Math.min(Number(breite) || 1440, 2000));
    const h = Math.max(400, Math.min(Number(hoehe) || 900, 1400));

    // Jedes Oeffnen bekommt eine EIGENE frische Seite und eine Kennung.
    //
    // Vorher gab es eine gemeinsame Seite und einen Zaehler, den auch das
    // Schliessen hochgezaehlt hat. Beim ersten Klick baut React die Ansicht
    // im Entwicklungsmodus absichtlich zweimal auf -- auf, zu, auf. Das
    // Zumachen des ersten Aufbaus traf dann den zweiten, und der meldete
    // "Cancelled", obwohl der Mitarbeiter nur einmal geklickt hatte
    // (10.10.2026 von Emre beim ersten Reel gesehen).
    //
    // Jetzt gilt: wer eine Seite oeffnet, arbeitet nur auf seiner eigenen.
    // Taucht inzwischen eine neuere auf, steigt der aeltere still aus.
    const meinLauf = String((this.profilLauf = (this.profilLauf ?? 0) + 1));
    const ueberholt = () => this.profilSeite !== seite;

    // Das Reel SOFORT anhalten -- bevor ueberhaupt eine Seite geoeffnet
    // wird. Vorher geschah das erst, wenn das Profil fertig geladen war:
    // der Ladekringel stand schon da, und dahinter lief die Musik des
    // Reels weiter (10.10.2026 von Emre gemeldet). Ausdruecklich anhalten,
    // nicht umschalten.
    // ZURUECKGENOMMEN am 10.10.2026.
    //
    // Das Reel beim Profilbesuch anzuhalten war gut gemeint -- aber Emre
    // meldete sofort, dass der Ton im Research danach nicht mehr so lief
    // wie vorher. Unser eigener Code warnt genau davor (siehe
    // B.tonAnklemmen): laesst Instagram ein Reel neu anlaufen, stirbt die
    // Tonspur aus captureStream(), obwohl das Element dasselbe bleibt.
    // Anhalten und Fortsetzen loest genau das aus.
    //
    // Der Ton im Research ist wichtiger als die Stille waehrend eines
    // Profilbesuchs. B.anhalten/B.fortsetzen bleiben stehen, damit das
    // spaeter mit einem sauberen Weg nachgeholt werden kann.
    if (PROFIL_HAELT_REEL_AN && this.buehneSteht) {
      const erg = await this.page.evaluate(() => window.__buehne.anhalten()).catch(() => null);
      // "Lief es vorher?" nur beim ERSTEN Anhalten merken.
      //
      // ReelForge oeffnet die Profil-Flaeche beim ersten Mal doppelt, also
      // kam auch das Anhalten zweimal. Beim zweiten Mal stand das Reel
      // natuerlich schon -- und ReelForge merkte sich "lief nicht" und
      // liess es danach angehalten. Im Protokoll fehlte das "Reel laeuft
      // wieder" (10.10.2026 beim Nachzaehlen der Tabs aufgefallen).
      if (!this.reelDurchProfilAngehalten) {
        this.reelDurchProfilAngehalten = true;
        // Entscheidend ist NICHT, ob es gerade lief, sondern ob der
        // Mitarbeiter es selbst angehalten hat. "Lief nicht" heisst sonst
        // auch "war noch am Anlaufen" -- und dann kam er zurueck und das
        // Reel stand still, ohne dass er etwas angehalten hatte.
        this.reelLiefVorProfil = this.vomNutzerAngehalten !== true;
        console.log(`[profil] Reel angehalten (vom Nutzer pausiert: ${this.vomNutzerAngehalten === true}).`);
      } else {
        console.log(`[profil] Reel war schon durch uns angehalten -- Merker bleibt.`);
      }
    }

    let seite = null;
    try {
      await this.profilStromStoppen();
      seite = await this.context.newPage();
      (this.profilTabs ??= new Set()).add(seite);

      // ZURUECKGENOMMEN am 10.10.2026, noch am selben Tag.
      //
      // Hier stand eine Wache, die jedes Video drueben stumm hielt, plus
      // eine CSS-Regel, die Instagrams eigenen Lautsprecher ausblendete.
      // Beides zusammen liess das Profil quaelend langsam laden -- die
      // Ausblend-Regel muss der Browser bei jeder Stilberechnung ueber die
      // ganze Seite pruefen, und eine Instagram-Seite berechnet dauernd neu.
      //
      // Emre hat es sofort bemerkt und zugleich den besseren Einwand
      // gebracht: so verhaelt sich sonst niemand auf Instagram. Ein
      // falscher Knopfdruck ist leichter zu ertragen als eine Seite, die
      // nicht laedt.
      //
      // Was bleibt: Instagrams Lautsprecher ist sichtbar und zeigt den
      // Zustand SEINES Players, nicht unseren. Wird er gedrueckt, haelt das
      // Video drueben an (am 08.10.2026 auf der Buehne gemessen). Wer das
      // spaeter angehen will, braucht einen Weg ohne dauerhafte Last --
      // zum Beispiel einmalig nach dem Laden statt in einer Dauerschleife.
      this.profilSeite = seite;
      this.profilKennung = meinLauf;
      // ALLE anderen Profil-Tabs zumachen, nicht nur den zuletzt bekannten.
      //
      // Vorher stand hier "schliesse this.profilSeite von vorhin". Beim
      // ersten Klick baut React die Ansicht zweimal auf, und beide
      // Oeffnungsvorgaenge lasen dieses Feld, BEVOR einer von ihnen es
      // gesetzt hatte -- beide sahen "nichts da" und machten nichts zu. Der
      // erste Tab blieb liegen: im Protokoll "Tabs offen: 3" statt 2
      // (10.10.2026, Emre wollte genau das nachgeprueft haben).
      await this.profilTabsAufraeumen(seite);
      // Ab hier NUR noch ueber die oertliche Variable arbeiten.
      //
      // Vorher stand hier this.profilSeite.goto(...). Schloss der
      // Mitarbeiter das Fenster, waehrend ein Oeffnen noch lief, setzte
      // profilSchliessen() das Feld auf null -- und der laufende Vorgang
      // fiel mit "Cannot read properties of null (reading 'goto')" auf die
      // Nase (10.10.2026 von Emre gemeldet: Profil auf, zu, wieder auf).
      await seite.setViewportSize({ width: w, height: h }).catch(() => {});
      this.profilBreite = w;
      this.profilHoehe = h;
      // Um wie viel wird das Bild bei uns verkleinert? Genau um diesen
      // Faktor werden die Schilder groesser gebaut.
      const gezeigt = Number(anzeige) > 0 ? Number(anzeige) : w;
      this.profilVergroesserung = Math.max(1, Math.min(w / gezeigt, 2.5));

      // Instagram leitet beim Oeffnen eines Profils intern weiter; die erste
      // Navigation wird dadurch abgebrochen und Playwright meldet
      // ERR_ABORTED, obwohl die Seite danach normal laedt. Deshalb: auf
      // "commit" warten statt auf das fertige Dokument, und einen
      // Fehlschlag einmal wiederholen.
      // Mitlesen starten, BEVOR geladen wird. Faengt man erst danach an,
      // ist Instagrams erste Antwort -- die mit den meisten Beitraegen --
      // schon durch.
      if (PROFIL_FORSCHUNG) await this.profilNetzBeobachten(seite, name);

      // Die Schicht nach JEDEM Seitenwechsel neu setzen. Instagram wechselt
      // beim Oeffnen eines Beitrags und beim Zurueckgehen die Seite, und
      // dabei geht alles verloren, was in ihr stand.
      if (PROFIL_FORSCHUNG) {
        seite.on("framenavigated", async (rahmen) => {
          if (rahmen !== seite.mainFrame()) return;
          await sleep(700);
          if (this.profilSeite !== seite || seite.isClosed()) return;
          await this.profilSchichtEinsetzen(seite);
          await this.profilSchichtFuettern();
        });
      }

      // ERST das normale Raster, DANN der Reels-Reiter.
      //
      // Das sieht nach einem Umweg aus, ist aber der Kern der Sache.
      // Instagram schickt die Zahlen -- Likes, Kommentare, Reposts, Datum --
      // mit der Antwort des normalen Rasters, und zwar fuer alle Beitraege
      // einschliesslich der Reels. Die Reels-Seite allein schickt sie
      // nicht: dort stehen nur die Aufrufe auf der Kachel.
      //
      // Emre hat das selbst herausgefunden (10.10.2026): oeffnete er das
      // Profil direkt im Reels-Reiter, blieben die Kacheln leer; wechselte
      // er kurz auf den normalen Feed und zurueck, waren alle Zahlen da.
      // Gemessen passt es: im Raster kamen 156 Beitraege, im Reels-Reiter
      // zweimal 12.
      //
      // Also machen wir genau das, was er von Hand gemacht hat.
      const hin = () => seite.goto(`https://www.instagram.com/${name}/`, { waitUntil: "commit", timeout: 30000 });
      try {
        await hin();
      } catch (ersterFehler) {
        if (ueberholt() || seite.isClosed()) { console.log(`[profil] ${name}: waehrend des Ladens abgebrochen.`); return { ok: false, fehler: "Cancelled.", lauf: meinLauf }; }
        console.log(`[profil] ${name}: erster Versuch abgebrochen (${String(ersterFehler?.message ?? "").split("\n")[0]}) -- einmal nachfassen.`);
        await sleep(600);
        await hin();
      }

      if (ueberholt() || seite.isClosed()) { console.log(`[profil] ${name}: ueberholt, steige aus.`); return { ok: false, fehler: "Cancelled.", lauf: meinLauf }; }

      // Die Buehne gehoert wieder nach vorn, sonst drosselt Chrome ihre
      // Wiedergabe -- dasselbe, was nebenseite() schon tut.
      await this.page.bringToFront().catch(() => {});
      // 700 statt 1800 ms. Das Warten war Vorsicht, keine Notwendigkeit:
      // direkt danach laeuft das Vorladen, und das wartet ohnehin zwischen
      // seinen Runden. Gemessen am 10.10.2026 -- das Oeffnen brauchte 8
      // Sekunden, davon war nur ein Drittel noetig.
      await sleep(700);
      if (ueberholt() || seite.isClosed()) return { ok: false, fehler: "Cancelled.", lauf: meinLauf };

      if (PROFIL_FORSCHUNG) {
        clearInterval(this.forschungPuls);
        this.forschungPuls = setInterval(async () => {
          const s = this.profilSeite;
          if (!s || s.isClosed()) { clearInterval(this.forschungPuls); return; }
          const d = await s
            .evaluate(() => {
              const RF = window.__rfForschung;
              if (!RF) return { da: false };
              // Nicht nur "beschriftet", sondern VOLLSTAENDIG.
              //
              // "Beschriftet" zaehlt auch ein halbes Schild. Emre sieht
              // aber genau die halben (10.10.2026): Engagement, Likes,
              // Kommentare, Aufrufe -- aber kein Datum, keine Reposts.
              // Deshalb wird hier gezaehlt, bei wie vielen sichtbaren
              // Kacheln wirklich alles dasteht.
              let sichtbar = 0;
              let mitDatum = 0;
              let unbekannt = 0;
              for (const a of document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')) {
                const r = a.getBoundingClientRect();
                if (r.width < 120 || r.height < 120) continue;
                const m = (a.getAttribute("href") || "").match(/\/(?:p|reel)\/([^/?#]+)/);
                if (!m) continue;
                sichtbar++;
                const b = RF.daten.get(m[1]);
                if (!b) unbekannt++;
                else if (b.zeitpunkt) mitDatum++;
              }
              return {
                da: true,
                stand: RF.stand,
                sichtbar,
                mitDatum,
                unbekannt,
                letztesZeichnen: RF.zuletztGezeichnet ? Date.now() - RF.zuletztGezeichnet : null,
              };
            })
            .catch(() => null);
          console.log(`[puls] ${JSON.stringify(d)}`);
        }, 3000);

        // Zweiter Schritt: hinueber in den Reels-Reiter. Die eingesammelten
        // Zahlen liegen beim Connector und werden danach wieder in die
        // Seite gegeben -- sie gehen beim Wechsel also nicht verloren.
        // Zuerst das NORMALE Raster einmal durchladen.
        //
        // Das ist die eigentliche Quelle: seine Antworten tragen ALLE
        // Felder -- Datum, Uhrzeit, Laenge, Reposts, Likes, Kommentare,
        // Aufrufe -- und sie decken die Reels mit ab. Die Antworten des
        // Reels-Reiters tragen Datum, Laenge und Reposts NICHT; deshalb
        // hatten dort nur die obersten Kacheln den vollen Satz
        // (10.10.2026 an Emres Bildern abgelesen).
        //
        // Es ist derselbe Handgriff, den er von Hand gefunden hat -- kurz
        // auf den normalen Feed und zurueck --, nur vollstaendig statt
        // einmal. Und es braucht dafuer KEINE Anfrage bei Instagram, kann
        // also auch nicht mit 429 abgewiesen werden.
        await this.profilVorladen(seite, `${name} (Raster)`);

        // Danach noch die Reels-Liste direkt erfragen, falls Instagram
        // gerade mit uns redet. Tut es das nicht, ist nichts verloren --
        // die Zahlen stehen oben schon.
        await this.profilReelsHolen(seite, name);

        await seite
          .goto(`https://www.instagram.com/${name}/reels/`, { waitUntil: "commit", timeout: 20000 })
          .catch((e) => console.log(`[forschung] ${name}: Wechsel in den Reels-Reiter ging nicht (${e?.message?.split("\n")[0]})`));
        await sleep(600);
        if (ueberholt() || seite.isClosed()) return { ok: false, fehler: "Cancelled.", lauf: meinLauf };

        await this.profilSchichtEinsetzen(seite);
        // Hier reichen zwei Runden. Im Reels-Reiter geht es nur noch
        // darum, dass Kacheln dastehen -- die Zahlen hat das Raster oben
        // schon geliefert. Fuenf Runden waren 2,4 Sekunden Wartezeit fuer
        // nichts.
        await this.profilVorladen(seite, name, 2);
        await this.profilSchichtFuettern();
        console.log(`[forschung] ${name}: Schilder ${JSON.stringify(this.profilSchichtStand ?? null)}`);
        // Ab hier im Hintergrund weitersammeln -- ohne darauf zu warten.
        void this.profilNachladen(name, meinLauf);
        const warum = await seite.evaluate(() => window.__rfForschung?.warum()).catch(() => null);
        console.log(`[forschung] ${name}: Kachelsuche ${JSON.stringify(warum)}`);
      }

      const bild = await this.profilBild();
      if (!bild) {
        console.error(`[profil] session ${this.id}: ${name} -- kein Bild von der Seite bekommen.`);
        return { ok: false, fehler: "Couldn't capture the profile.", lauf: meinLauf };
      }
      console.log(`[profil] session ${this.id}: ${name} geoeffnet (${w}x${h}), Kennung ${meinLauf} | Tabs offen: ${this.tabs()}`);
      return { ok: true, bild, username: name, lauf: meinLauf };
    } catch (err) {
      console.error(`[profil] session ${this.id}: ${name} FEHLER ${err?.message} | Seite ${seite ? (seite.isClosed() ? "geschlossen" : "offen") : "fehlt"}, ueberholt=${ueberholt()} | Tabs offen: ${this.tabs()}`);
      return { ok: false, fehler: err?.message ?? "Couldn't open this profile.", lauf: meinLauf };
    }
  }

  // Was liegt drueben unter einer Stelle?
  //
  // Zum Mitlesen, nicht zum Steuern: beschreibt in Alltagssprache, was der
  // Zeiger gerade beruehrt. Ohne das sah ich im Protokoll nur Zahlenpaare
  // und musste raten, worauf Emre eigentlich war -- genau daran ist die
  // Ecken-Sache (Zeiger auf 1,1 = Instagrams Seitenleiste) zu lange
  // unentdeckt geblieben (10.10.2026).
  async profilWasIstDa(x, y) {
    if (!this.profilSeite || this.profilSeite.isClosed()) return "kein Profil offen";
    return await this.profilSeite
      .evaluate(
        ([px, py]) => {
          const beruehrt = document.querySelectorAll(":hover").length;
          const el = document.elementFromPoint(px, py);
          if (!el) return `nichts (draussen) | beruehrt: ${beruehrt}`;
          const kachel = el.closest('a[href*="/p/"], a[href*="/reel/"]');
          if (kachel) {
            const code = (kachel.getAttribute("href") || "").match(/\/(?:p|reel)\/([^/?#]+)/);
            const alle = [...document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')];
            return `Kachel ${alle.indexOf(kachel) + 1}/${alle.length} (${code ? code[1] : "?"}) | beruehrt: ${beruehrt}`;
          }
          const leiste = el.closest("nav");
          if (leiste) {
            const link = el.closest("a");
            return `Seitenleiste${link ? ` -- ${(link.innerText || link.getAttribute("aria-label") || "").trim().slice(0, 28)}` : ""} | beruehrt: ${beruehrt}`;
          }
          const knopf = el.closest('a[href], button, [role="button"]');
          const wort = (knopf?.innerText || knopf?.getAttribute("aria-label") || el.tagName).trim().slice(0, 32);
          return `${knopf ? "Knopf" : "Flaeche"} ${wort.replace(/\s+/g, " ")} | beruehrt: ${beruehrt}`;
        },
        [x, y]
      )
      .catch((e) => `nicht lesbar (${e?.message?.slice(0, 40)})`);
  }

  // ===================================================================
  // Research-Schicht auf dem Profil
  // ===================================================================
  //
  // Zwei getrennte Haelften, und die Trennung ist Absicht:
  //
  //   1. SAMMELN passiert AUSSERHALB der Seite. Wir lesen Instagrams eigene
  //      Antworten mit, so wie ein Protokoll mitliest. An der Seite wird
  //      dabei nichts veraendert, nichts ersetzt, nichts ueberschrieben.
  //      Zwei frueere Versuche, von innen an Instagram zu drehen, haben die
  //      Seite lahmgelegt (10.10.2026) -- daher diese Regel.
  //
  //   2. ZEICHNEN passiert in der Seite, aber nur additiv: wir haengen
  //      eigene Elemente an die Kacheln und raeumen sie wieder weg. Kein
  //      Element von Instagram wird entfernt, umgehaengt oder umgestellt.

  async profilNetzBeobachten(seite, name) {
    const cdp = await this.context.newCDPSession(seite).catch(() => null);
    if (!cdp) {
      console.log(`[forschung] ${name}: kein Zugang zum Netzverkehr -- keine Kennzahlen.`);
      return;
    }
    this.profilNetzCdp = cdp;
    this.profilBeitraege = new Map();
    this.profilName = name;
    this.aufrufeGemeldet = false;
    this.reelsAntwortGemeldet = false;
    await cdp.send("Network.enable").catch(() => {});

    const zahl = (...k) => k.find((x) => typeof x === "number") ?? null;

    // Instagram benennt dieselbe Zahl je nach Antwort anders. Hier wird auf
    // EINE Form gebracht; der Rest muss davon nichts wissen.
    const auswerten = (e) => {
      const code = e.code ?? e.shortcode ?? null;
      if (!code) return null;
      // Hat der Creator Likes und Aufrufe ausgeblendet, liefert Instagram
      // trotzdem eine Zahl mit -- aber sie bedeutet nichts. Am 10.10.2026
      // stand deshalb auf fast jeder Kachel eines solchen Profils "3".
      // Eine Zahl, die nichts bedeutet, ist schlimmer als keine: wir
      // zeigen sie nicht.
      const verborgen = e.like_and_view_counts_disabled === true;
      return {
        code,
        likes: verborgen ? null : zahl(e.like_count, e.edge_liked_by?.count, e.edge_media_preview_like?.count),
        kommentare: zahl(e.comment_count, e.edge_media_to_comment?.count),
        aufrufe: verborgen ? null : zahl(e.play_count, e.ig_play_count, e.video_view_count),
        reposts: zahl(e.media_repost_count),
        zeitpunkt: zahl(e.taken_at, e.taken_at_timestamp),
        dauer: typeof e.video_duration === "number" ? Math.round(e.video_duration) : null,
        // Versteckte Zahlen bleiben versteckt -- nichts schaetzen.
        verborgen,
      };
    };

    const sammeln = (wert, tiefe) => {
      if (!wert || typeof wert !== "object" || tiefe > 8) return;
      if (Array.isArray(wert)) {
        for (const e of wert) {
          const b = e && typeof e === "object" ? auswerten(e.node ?? e.media ?? e) : null;
          // Nur zum Nachsehen (10.10.2026): Emre fragt, warum die Aufrufe
          // oft fehlen. Hier wird EINMAL je Profil aufgeschrieben, welche
          // Felder Instagram fuer einen Beitrag ohne Aufrufe ueberhaupt
          // mitschickt. Fliegt danach wieder raus.
          if (b && b.aufrufe === null && !this.aufrufeGemeldet) {
            this.aufrufeGemeldet = true;
            const roh = e.node ?? e.media ?? e;
            const felder = Object.keys(roh).filter((k) =>
              /count|view|play|disabled|product_type|media_type/i.test(k)
            );
            console.log(
              `[aufrufe] ohne Aufrufe: ${b.code} | product_type=${roh.product_type} media_type=${roh.media_type} | ` +
                `passende Felder: ${felder.map((k) => `${k}=${JSON.stringify(roh[k])}`).join(", ")}`
            );
          }
          if (b && (b.likes !== null || b.kommentare !== null || b.aufrufe !== null || b.verborgen)) {
            const alt = this.profilBeitraege.get(b.code);
            // Spaeter eintreffende, vollstaendigere Angaben gewinnen -- aber
            // ein vorhandener Wert wird nie durch null ersetzt.
            this.profilBeitraege.set(
              b.code,
              alt ? { ...alt, ...Object.fromEntries(Object.entries(b).filter(([, v]) => v !== null)) } : b
            );
          } else if (e && typeof e === "object") sammeln(e.node ?? e.media ?? e, tiefe + 1);
        }
        return;
      }
      // AUCH ein einfaches Objekt kann ein Beitrag sein.
      //
      // Hier lag der Fehler (10.10.2026): geprueft wurde nur, was in einer
      // Liste steht. Im normalen Raster liegt der Beitrag direkt unter
      // edges[].node -- das ist ein Listeneintrag, also klappte es. Bei den
      // REELS liegt er eine Ebene tiefer unter edges[].node.media, und
      // "media" ist ein gewoehnliches Objekt. Der Leser lief daran vorbei,
      // obwohl code, play_count, like_count und comment_count alle
      // dastanden. Ergebnis: beim Scrollen im Reels-Reiter vierzehn
      // Antworten und null Ausbeute.
      const selbst = auswerten(wert);
      if (selbst && (selbst.likes !== null || selbst.kommentare !== null || selbst.aufrufe !== null || selbst.verborgen)) {
        const alt = this.profilBeitraege.get(selbst.code);
        this.profilBeitraege.set(
          selbst.code,
          alt ? { ...alt, ...Object.fromEntries(Object.entries(selbst).filter(([, v]) => v !== null)) } : selbst
        );
      }
      for (const k of Object.keys(wert)) sammeln(wert[k], tiefe + 1);
    };

    // Derselbe Sammler auch fuer die Liste, die wir uns gleich SELBST
    // holen -- eine Normalisierung, nicht zwei.
    this.profilSammeln = (inhalt) => sammeln(inhalt, 0);

    let zuletzt = 0;
    const adressen = new Map();

    cdp.on("Network.responseReceived", (e) => {
      const adresse = e?.response?.url ?? "";
      if (!/instagram\.com\/(api\/v1|graphql)/.test(adresse)) return;
      adressen.set(e.requestId, adresse);
    });

    // WICHTIG: den Inhalt erst holen, wenn die Antwort VOLLSTAENDIG da ist.
    // Beim blossen Ankuendigen hat Chrome ihn meist noch nicht und meldet
    // "kein Inhalt zu dieser Kennung" -- am 10.10.2026 kostete genau das
    // einen ganzen Durchlauf mit null gesammelten Beitraegen.
    cdp.on("Network.loadingFinished", async (e) => {
      const adresse = adressen.get(e.requestId);
      if (!adresse) return;
      adressen.delete(e.requestId);
      try {
        const { body } = await cdp.send("Network.getResponseBody", { requestId: e.requestId });
        const inhalt = JSON.parse(body);
        const vorher = this.profilBeitraege.size;
        sammeln(inhalt, 0);
        const dazu = this.profilBeitraege.size - vorher;
        console.log(`[antwort] ${adresse.split("?")[0]} -> ${dazu} neue Beitraege (${JSON.stringify(Object.keys(inhalt)).slice(0, 90)})`);
        const jetzt = this.profilBeitraege.size;
        if (jetzt > zuletzt) {
          zuletzt = jetzt;
          // Nur zum Nachsehen (10.10.2026): Emre sieht Kacheln, die
          // Kommentare und Reposts zeigen, aber keine Likes und keine
          // Aufrufe. Hier wird gezaehlt, ob Instagram sie ausgeblendet hat
          // oder ob wir sie verlieren. Fliegt danach raus.
          const alle = [...this.profilBeitraege.values()];
          const ohneLikes = alle.filter((b) => b.likes === null);
          const verborgen = alle.filter((b) => b.verborgen);
          console.log(
            `[forschung] ${name}: ${jetzt} Beitraege mit Zahlen bekannt. ` +
              `| ohne Likes: ${ohneLikes.length} (davon verborgen: ${ohneLikes.filter((b) => b.verborgen).length}) ` +
              `| ohne Aufrufe: ${alle.filter((b) => b.aufrufe === null).length} ` +
              `| verborgen gesamt: ${verborgen.length}` +
              (ohneLikes.length && !ohneLikes[0].verborgen
                ? ` | Beispiel ohne Likes und nicht verborgen: ${JSON.stringify(ohneLikes[0])}`
                : "")
          );
          void this.profilSchichtFuettern();
        }
      } catch {
        /* Nicht lesbare Antwort -- es kommen genug andere. */
      }
    });
  }

  // Die Schicht in die Seite setzen. Mehrfaches Aufrufen schadet nicht:
  // sie setzt sich nur einmal und meldet sich danach selbst als vorhanden.
  // Die vollstaendige Reels-Liste SELBST holen, statt auf Instagrams
  // Antworten zu warten.
  //
  // Das ist der Unterschied zwischen "wir hoeren mit, was zufaellig
  // vorbeikommt" und "wir fragen". Mitgehoert wird je nach Reiter anders
  // geliefert, kommt zu spaet und unvollstaendig -- am 10.10.2026 stand
  // die Zahl im Reels-Reiter bei zwoelf und wuchs nicht, egal wie weit
  // Emre scrollte. Gefragt bekommen wir alles auf einmal, bevor er
  // ueberhaupt scrollt.
  //
  // Gefragt wird AUS DER SEITE heraus: damit gelten die Anmeldung, die
  // Keks-Angaben und die Kopfzeilen des Research-Accounts, ohne dass wir
  // irgendetwas nachbauen. Genau so holen wir seit heute Nachmittag die
  // Kommentare.
  //
  // Hoeflich fragen: Seiten zu 50, kleine Pause dazwischen, harte
  // Obergrenze. Instagram bremst, wer zu schnell zu viel will -- das ist
  // uns heute schon einmal passiert (HTTP 429).
  // Das Raster EINMAL komplett durchscrollen, bevor der Mitarbeiter es
  // sieht.
  //
  // Das ist die Antwort auf "es muss live sein". Nicht schneller
  // nachladen, sondern vorher laden: Instagram liefert seine Zahlen genau
  // dann, wenn es nachlaedt -- also lassen wir es einmal bis zum Ende
  // nachladen, waehrend die Flaeche beim Mitarbeiter noch gar nicht steht.
  // Unser Mithoeren faengt dabei alles ein. Danach geht es zurueck nach
  // oben, und er sieht ein fertiges Raster statt eines, das sich unter ihm
  // fuellt.
  //
  // Braucht kein Fragen bei Instagram und kann deshalb auch nicht mit 429
  // abgewiesen werden -- genau das ist uns am 10.10.2026 passiert, als wir
  // zu oft direkt gefragt haben.
  async profilVorladen(seite, name, runden = 5) {
    if (!seite || seite.isClosed()) return;
    const t0 = Date.now();
    let gelaufen = 0;
    let leerlauf = 0;

    // Gemessen wird, ob neue BEITRAEGE dazukommen -- nicht, ob neue
    // Kacheln sichtbar werden.
    //
    // Mit Kacheln gemessen brach das Vorladen ab, sobald Instagram einen
    // Moment brauchte: am 10.10.2026 nach zwei Runden und 1094 ms, und es
    // blieb bei 13 von 55 Beitraegen mit Datum. Kacheln sagen nichts
    // darueber, ob die Antwort mit den Zahlen schon da ist -- die
    // Beitragszahl schon. Damit ist es auch egal, wie schnell die Seite
    // beim Start ist.
    for (let i = 0; i < runden; i++) {
      if (seite.isClosed()) break;
      const vorher = this.profilBeitraege?.size ?? 0;
      await seite
        .evaluate(async () => {
          window.scrollTo(0, document.body.scrollHeight);
          await new Promise((f) => setTimeout(f, 650));
        })
        .catch(() => {});
      // Der Antwort noch einen Moment geben, bevor gezaehlt wird.
      await sleep(350);
      gelaufen++;
      if ((this.profilBeitraege?.size ?? 0) > vorher) {
        leerlauf = 0;
        continue;
      }
      if (++leerlauf >= 2) break;
    }

    await seite.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
    await sleep(200);
    console.log(
      `[vorladen] ${name}: ${gelaufen} Runden in ${Date.now() - t0}ms -> ${this.profilBeitraege?.size ?? 0} Beitraege bekannt`
    );
    await this.profilSchichtFuettern();
  }

  // Im HINTERGRUND weitersammeln, solange das Profil offen ist.
  //
  // Emres Vorgabe (10.10.2026): "Je weiter ich runterscrolle, desto mehr
  // sollen nachladen." Das Raster ist die einzige Quelle mit ALLEN Feldern
  // -- Datum, Uhrzeit, Laenge, Reposts --, und es weit durchzuladen dauert
  // zu lange, um es beim Oeffnen abzuwarten.
  //
  // Also laeuft es in einem eigenen, unsichtbaren Tab weiter, waehrend
  // vorne schon die Reels stehen. Was ankommt, wird laufend auf die
  // Kacheln nachgetragen.
  //
  // WICHTIG, und hier lag der Fehler beim ersten Versuch: gemessen wird,
  // ob neue BEITRAEGE dazukommen -- nicht, ob neue Kacheln sichtbar
  // werden. Kacheln sagen nichts darueber, ob die Antwort mit den Zahlen
  // schon da ist. Deshalb galt das Raster damals nach zwei Runden als
  // "durch", und es blieb bei der Haelfte.
  //
  // Der Tab geht in jedem Fall wieder zu -- auch bei Profilwechsel.
  async profilNachladen(name, lauf) {
    if (!PROFIL_FORSCHUNG) return;
    let hilfsSeite = null;
    try {
      hilfsSeite = await this.context.newPage();
      this.profilHilfsSeite = hilfsSeite;
      await hilfsSeite.setViewportSize({ width: 1280, height: 1600 }).catch(() => {});

      const cdp = await this.context.newCDPSession(hilfsSeite).catch(() => null);
      if (cdp) {
        await cdp.send("Network.enable").catch(() => {});
        const adressen = new Map();
        cdp.on("Network.responseReceived", (e) => {
          const a = e?.response?.url ?? "";
          if (/instagram\.com\/(api\/v1|graphql)/.test(a)) adressen.set(e.requestId, a);
        });
        cdp.on("Network.loadingFinished", async (e) => {
          if (!adressen.has(e.requestId)) return;
          adressen.delete(e.requestId);
          try {
            const { body } = await cdp.send("Network.getResponseBody", { requestId: e.requestId });
            const vorher = this.profilBeitraege?.size ?? 0;
            this.profilSammeln?.(JSON.parse(body));
            if ((this.profilBeitraege?.size ?? 0) > vorher) void this.profilSchichtFuettern();
          } catch {
            /* eine unlesbare Antwort darf den Rest nicht stoppen */
          }
        });
      }

      await hilfsSeite
        .goto(`https://www.instagram.com/${name}/`, { waitUntil: "commit", timeout: 30000 })
        .catch(() => {});
      await sleep(1500);

      const laeuftNoch = () => this.profilKennung === lauf && !hilfsSeite.isClosed();
      const eineRunde = async () => {
        const vorher = this.profilBeitraege?.size ?? 0;
        await hilfsSeite
          .evaluate(async () => {
            window.scrollTo(0, document.body.scrollHeight);
            await new Promise((f) => setTimeout(f, 1200));
          })
          .catch(() => {});
        await sleep(600);
        return (this.profilBeitraege?.size ?? 0) - vorher;
      };

      let runden = 0;
      let leerlauf = 0;
      let gemeldet = false;
      while (laeuftNoch()) {
        const dazu = await eineRunde();
        if (dazu > 0) {
          runden++;
          leerlauf = 0;
          continue;
        }
        // Erst nach DREI Runden ohne Zuwachs gilt das Raster als durch.
        // Einmal nichts heisst bei Instagram oft nur "gleich".
        if (++leerlauf < 3) continue;

        if (!gemeldet) {
          gemeldet = true;
          console.log(
            `[nachladen] ${name}: Raster durch nach ${runden} Runden -- ${this.profilBeitraege?.size ?? 0} Beitraege, ` +
              `davon mit Datum ${[...(this.profilBeitraege?.values() ?? [])].filter((b) => b.zeitpunkt).length}. Wachdienst laeuft.`
          );
        }

        // Nicht aufhoeren, nur leise werden.
        //
        // "Durch" heisst bei uns nur: Instagram hat dreimal nichts Neues
        // geschickt. Das kann auch heissen, dass es gerade bremst. Deshalb
        // bleibt der Tab offen und sieht alle paar Sekunden nach, ob beim
        // Mitarbeiter Kacheln OHNE Zahlen stehen -- und laedt nur dann
        // nochmal nach. Kein Scrollen auf Verdacht (Emres Frage,
        // 10.10.2026: "was ist mit denen dann?").
        leerlauf = 0;
        await sleep(6000);
        if (!laeuftNoch()) break;

        const fehlen = await this.profilSeite
          ?.evaluate(() => {
            const RF = window.__rfForschung;
            if (!RF) return 0;
            let offen = 0;
            for (const a of document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')) {
              const m = (a.getAttribute("href") || "").match(/\/(?:p|reel)\/([^/?#]+)/);
              if (m && !RF.daten.has(m[1])) offen++;
            }
            return offen;
          })
          .catch(() => 0);

        if (fehlen > 0) {
          console.log(`[nachladen] ${name}: ${fehlen} Kachel(n) ohne Zahlen -- wird nachgefasst.`);
          gemeldet = false;
        }
      }
    } catch (err) {
      console.log(`[nachladen] ${name}: abgebrochen (${err?.message?.split("\n")[0]})`);
    } finally {
      if (this.profilHilfsSeite === hilfsSeite) this.profilHilfsSeite = null;
      await hilfsSeite?.close().catch(() => {});
      await this.profilSchichtFuettern();
    }
  }

  async profilReelsHolen(seite, name) {
    if (!seite || seite.isClosed()) return;
    // Nach einer Abweisung eine Viertelstunde Ruhe geben. Wer nach einem
    // 429 weiterfragt, macht es schlimmer -- und wir brauchen es nicht
    // dringend, weil das Vorladen dieselben Zahlen liefert.
    if (Session.reelsSperreBis && Date.now() < Session.reelsSperreBis) {
      console.log(`[reels-liste] ${name}: uebersprungen, Instagram hat zuletzt abgewiesen.`);
      return;
    }
    const t0 = Date.now();
    const erg = await seite
      .evaluate(
        async ([nutzer, seiten, proSeite]) => {
          const kopf = { "X-IG-App-ID": "936619743392459" };
          const kekse = Object.fromEntries(
            document.cookie.split("; ").map((s) => [s.split("=")[0], s.split("=").slice(1).join("=")])
          );
          if (kekse.csrftoken) kopf["X-CSRFToken"] = kekse.csrftoken;
          const warte = (ms) => new Promise((f) => setTimeout(f, ms));

          // Schritt 1: die Kennung des Creators.
          let id = null;
          try {
            const r = await fetch(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(nutzer)}`, {
              headers: kopf,
              credentials: "include",
            });
            if (!r.ok) return { fehler: `Profilauskunft HTTP ${r.status}` };
            id = (await r.json())?.data?.user?.id ?? null;
          } catch (e) {
            return { fehler: `Profilauskunft: ${e?.message}` };
          }
          if (!id) return { fehler: "keine Kennung im Profil gefunden" };

          const stuecke = [];
          const fehler = [];
          let seitenGesamt = 0;

          // Schritt 2: der vollstaendige Beitrags-Strom des Creators.
          //
          // Diese Quelle traegt ALLE Felder, die wir anzeigen: taken_at
          // (Datum und Uhrzeit), video_duration, media_repost_count, dazu
          // Likes, Kommentare und Aufrufe. Die reine Reels-Liste darunter
          // bringt zwar auch Zahlen, aber ohne Datum, Laenge und Reposts --
          // genau das fehlte Emre beim Oeffnen (10.10.2026).
          let weiter = null;
          for (let i = 0; i < seiten; i++) {
            try {
              const u = `/api/v1/feed/user/${id}/?count=${proSeite}${weiter ? `&max_id=${encodeURIComponent(weiter)}` : ""}`;
              const r = await fetch(u, { headers: kopf, credentials: "include" });
              if (!r.ok) { fehler.push(`Beitragsstrom HTTP ${r.status}`); break; }
              const j = await r.json();
              stuecke.push(j);
              seitenGesamt++;
              weiter = j?.next_max_id ?? null;
              if (!j?.more_available || !weiter) break;
              await warte(400);
            } catch (e) {
              fehler.push(`Beitragsstrom: ${e?.message}`);
              break;
            }
          }

          // Schritt 3: zusaetzlich die reine Reels-Liste.
          //
          // Sie deckt Reels ab, die im Beitragsstrom weiter hinten liegen,
          // und kostet wenig. Was sie bringt, wird mit dem Vorhandenen
          // verschmolzen -- ein vorhandener Wert wird dabei nie durch einen
          // fehlenden ersetzt.
          weiter = null;
          for (let i = 0; i < seiten; i++) {
            try {
              const koerper = new URLSearchParams({
                target_user_id: id,
                page_size: String(proSeite),
                include_feed_video: "true",
              });
              if (weiter) koerper.set("max_id", weiter);
              const r = await fetch("/api/v1/clips/user/", {
                method: "POST",
                headers: { ...kopf, "Content-Type": "application/x-www-form-urlencoded" },
                body: koerper.toString(),
                credentials: "include",
              });
              if (!r.ok) { fehler.push(`Reels-Liste HTTP ${r.status}`); break; }
              const j = await r.json();
              stuecke.push(j);
              seitenGesamt++;
              weiter = j?.paging_info?.max_id ?? null;
              if (!j?.paging_info?.more_available || !weiter) break;
              await warte(400);
            } catch (e) {
              fehler.push(`Reels-Liste: ${e?.message}`);
              break;
            }
          }

          return { stuecke, seiten: seitenGesamt, fehler };
        },
        [name, 6, 50]
      )
      .catch((e) => ({ fehler: e?.message }));

    // Ein Fehlschlag ist kein Drama: das Mithoeren laeuft weiter und
    // fuellt nach. Verschwiegen wird er trotzdem nicht.
    const gemeldet = typeof erg?.fehler === "string" ? [erg.fehler] : erg?.fehler ?? [];
    if (gemeldet.length) console.log(`[reels-liste] ${name}: ${gemeldet.join(" | ")}`);
    if (gemeldet.some((f) => String(f).includes("429"))) {
      Session.reelsSperreBis = Date.now() + 15 * 60 * 1000;
      console.log(`[reels-liste] ${name}: abgewiesen -- 15 Minuten Ruhe, das Vorladen reicht derweil.`);
    }
    const vorher = this.profilBeitraege?.size ?? 0;
    for (const stueck of erg?.stuecke ?? []) {
      try {
        this.profilSammeln?.(stueck);
      } catch {
        /* eine kaputte Seite darf den Rest nicht verhindern */
      }
    }
    const jetzt = this.profilBeitraege?.size ?? 0;
    console.log(
      `[reels-liste] ${name}: ${erg?.seiten ?? 0} Seite(n) in ${Date.now() - t0}ms -> ${jetzt - vorher} neue, ${jetzt} insgesamt` +
        ` | mit Datum: ${[...(this.profilBeitraege?.values() ?? [])].filter((b) => b.zeitpunkt).length}`
    );
    await this.profilSchichtFuettern();
  }

  async profilSchichtEinsetzen(seite) {
    if (!seite || seite.isClosed()) return false;
    return await seite
      .evaluate((vergroesserung) => {
        if (window.__rfForschung) {
          window.__rfForschung.groesse = vergroesserung;
          return true;
        }

        const RF = (window.__rfForschung = { daten: new Map(), stand: null });

        const kurz = (n) => {
          if (n === null || n === undefined) return null;
          if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
          if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
          return String(n);
        };
        const dauerText = (s) => (s == null ? null : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
        const datumText = (t) => (t ? new Date(t * 1000).toLocaleDateString("de-DE") : null);

        // Engagement = (Likes + Kommentare) / Aufrufe. Ohne Aufrufe gibt es
        // keine vergleichbare Rate -- dann steht da NICHTS, nicht null
        // Prozent. Nichts schaetzen.
        const rate = (b) => {
          if (!b.aufrufe || b.aufrufe <= 0) return null;
          if (b.likes === null && b.kommentare === null) return null;
          return `${((((b.likes ?? 0) + (b.kommentare ?? 0)) / b.aufrufe) * 100).toFixed(1)}%`;
        };

        const GOLD = "#EAC088";
        const RF_ZEICHEN = "<g id=\"image\"> <path id=\"Vector\" d=\"M10.5675 -0.0493019C11.0464 -0.0610019 11.6633 0.0075006 12.1512 0.0476006C14.4093 1.7119 15.2749 4.536 14.6466 7.2327C14.2647 8.8719 12.5435 10.0918 11.1701 10.8877C12.3702 12.1897 15.3516 17.6277 15.9944 19.6258C16.028 19.7302 15.8725 19.8172 15.761 19.911C15.2174 20.0725 14.3985 20.0522 13.8515 19.8992C12.9339 19.6427 9.5776 13.5208 8.9327 12.3818C7.7341 10.5061 7.7211 10.7666 5.7661 10.1874C5.2931 10.0472 4.3051 8.2138 4.4837 7.6494C6.4184 7.2786 9.3768 8.1231 11.6275 7.0652C12.0475 5.5903 11.9625 4.7612 11.637 3.2932C10.9324 3.1075 10.2431 2.8994 9.5105 2.8784C8.1031 2.8381 2.6326 3.6354 1.822 2.9021C1.7446 2.8321 0.00489944 0.5505 -0.0156006 0.501C-0.0411006 0.4393 -0.0212997 0.367698 -0.0240997 0.301098C0.5428 -0.210202 2.9791 -0.0232021 3.8193 -0.0239021L10.5675 -0.0493019Z\" fill=\"#D28E4E\"/> <path id=\"Vector_2\" d=\"M16.2054 1.3185C16.4104 0.3232 16.6969 0.0518997 17.7447 -0.000900333C19.1155 -0.0698003 20.4966 0.00180081 21.8695 -0.0140992C23.218 0.0226008 24.7326 -0.0753008 26.0314 -0.0264008L26.0219 2.792C23.7052 2.8062 21.2586 2.7838 18.9513 2.8592C18.8627 4.5077 18.8768 5.562 19.0169 7.2235C20.5046 7.6126 23.5544 7.3852 25.1038 7.1776C24.7023 7.9229 23.7135 10.0291 22.9246 10.3692C22.3208 10.6294 19.6063 10.1755 19.21 10.4952C19.341 11.2892 19.3372 15.6072 18.9992 16.1811L18.9903 16.2743C18.4937 16.9509 17.5838 18.2448 17.0148 18.767C16.8097 18.8801 16.8028 18.8879 16.5795 18.8551C16.3679 18.6326 16.3547 18.1811 16.31 17.8538C16.1288 17.4528 16.0618 17.0073 16.0411 16.5704C15.8286 12.0968 15.9978 7.6179 16.006 3.1418C16.0071 2.5261 16.043 1.9144 16.2054 1.3185Z\" fill=\"#D28E4E\"/> <path id=\"Vector_3\" d=\"M16.2054 1.3185C16.5723 1.7617 16.4136 4.2574 16.3756 4.9188C16.1413 8.9979 16.4688 13.075 16.4942 17.1526C16.4952 17.3386 16.3815 17.6848 16.31 17.8538C16.1288 17.4528 16.0618 17.0073 16.0411 16.5704C15.8286 12.0968 15.9978 7.6179 16.006 3.1418C16.0071 2.5261 16.043 1.9144 16.2054 1.3185Z\" fill=\"#B77835\"/> <path id=\"Vector_4\" d=\"M19.21 10.4952C19.341 11.2892 19.3372 15.6072 18.9992 16.1811C18.6435 15.692 18.8942 11.0082 19.21 10.4952Z\" fill=\"#B77835\"/> </g>";
        const uhrzeitText = (t) => (t ? new Date(t * 1000).toLocaleTimeString("de-DE") : null);

        // Das Bild der Seite wird bei uns verkleinert gezeigt. Damit die
        // Schilder lesbar ankommen, werden sie um genau diesen Faktor
        // groesser gebaut. RF.groesse setzt der Connector.
        RF.groesse = vergroesserung || 1;
        const px = (n) => `${(n * RF.groesse).toFixed(1)}px`;

        // Wie gross das Schild auf der Kachel ist -- EINE Zahl fuer alles.
        //
        // Stand 10.10.2026: erst auf 0.45 ("5x kleiner"), dann auf
        // Emres Wunsch wieder das Anderthalbfache davon. Groesser oder
        // kleiner ist allein diese Zahl, nichts sonst: alle
        // Schriftgroessen, Hoehen, Abstaende und Zeichen haengen daran.
        const SCHILD = 0.675;
        const pxS = (n) => px(n * SCHILD);

        // Das Schild auf der Kachel: einzelne RUNDE Pillen, untereinander
        // gestapelt, ALLE GLEICH BREIT, unten links. Oben die
        // Engagement-Rate farbig abgesetzt, darunter je eine Zeile mit
        // gefuelltem Zeichen und Zahl (nach Emres Nahaufnahme vom
        // 10.10.2026, in unseren Farben statt deren Rosa/Violett).
        const ZEICHEN = {
          herz: '<path d="M8 14.2S2 10.4 2 6.9A3.1 3.1 0 0 1 8 5.4a3.1 3.1 0 0 1 6 1.5c0 3.5-6 7.3-6 7.3z"/>',
          sprechblase: '<path d="M3 2.4h10A1.6 1.6 0 0 1 14.6 4v5.6a1.6 1.6 0 0 1-1.6 1.6H6.6l-3.1 2.6v-2.6H3a1.6 1.6 0 0 1-1.6-1.6V4A1.6 1.6 0 0 1 3 2.4z"/>',
          teilen: '<circle cx="12.4" cy="3.4" r="2"/><circle cx="3.6" cy="8" r="2"/><circle cx="12.4" cy="12.6" r="2"/><path d="M5.4 7 10.6 4.3M5.4 9l5.2 2.7" stroke="currentColor" stroke-width="1.5" fill="none"/>',
          auge: '<path d="M8 3.4c3.4 0 5.9 2.8 6.6 4.6-.7 1.8-3.2 4.6-6.6 4.6S2.1 9.8 1.4 8C2.1 6.2 4.6 3.4 8 3.4z"/><circle cx="8" cy="8" r="2.1" fill="#111114"/>',
          uhr: '<path d="M8 1.6a6.4 6.4 0 1 0 0 12.8A6.4 6.4 0 0 0 8 1.6zm.7 6.1 2.4 1.4-.7 1.2-3.1-1.8V4.2h1.4z"/>',
          kalender: '<path d="M5 1.5v1.2h6V1.5h1.5v1.2H13A1.5 1.5 0 0 1 14.5 4.2v8.3A1.5 1.5 0 0 1 13 14H3a1.5 1.5 0 0 1-1.5-1.5V4.2A1.5 1.5 0 0 1 3 2.7h.5V1.5zM3 6.4v6.1h10V6.4z"/>',
        };

        function schild(b) {
          const stapel = document.createElement("div");
          stapel.style.cssText =
            `display:flex;flex-direction:column;align-items:stretch;gap:${pxS(4)};` +
            `font:700 ${pxS(13)}/1 -apple-system,BlinkMacSystemFont,system-ui,sans-serif`;

          const pille = (kinder, farbig) => {
            const z = document.createElement("div");
            z.style.cssText =
              `display:flex;align-items:center;gap:${pxS(7)};` +
              `padding:0 ${pxS(11)};height:${pxS(farbig ? 21 : 26)};border-radius:${pxS(999)};` +
              "white-space:nowrap;font-variant-numeric:tabular-nums;" +
              (farbig
                ? // Die Rate sitzt oben als schmaleres, farbiges Band ueber
                  // die volle Breite des Stapels -- wie in der Vorlage.
                  `background:linear-gradient(180deg,#EAC088,#D39448);color:#231704;` +
                  `font-weight:800;font-size:${pxS(12)};`
                : "background:rgba(17,17,20,.86);color:#fff;border:1px solid rgba(255,255,255,.08);");
            z.append(...kinder);
            return z;
          };

          const bildEl = (name) => {
            const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            s.setAttribute("viewBox", "0 0 16 16");
            s.setAttribute("width", pxS(13.5));
            s.setAttribute("height", pxS(13.5));
            s.setAttribute("fill", "currentColor");
            s.style.cssText = "flex:none";
            s.innerHTML = ZEICHEN[name];
            return s;
          };
          const textEl = (wert) => {
            const s = document.createElement("span");
            s.textContent = wert;
            return s;
          };

          const r = rate(b);
          if (r) stapel.appendChild(pille([textEl(r)], true));

          const zeilen = [
            ["herz", kurz(b.likes)],
            ["sprechblase", kurz(b.kommentare)],
            ["teilen", kurz(b.reposts)],
            ["auge", kurz(b.aufrufe)],
            ["uhr", dauerText(b.dauer)],
            ["kalender", datumText(b.zeitpunkt)],
            ["uhr", uhrzeitText(b.zeitpunkt)],
          ];
          let hatZahlen = false;
          for (const [name, wert] of zeilen) {
            if (!wert) continue;
            if (name !== "uhr" && name !== "kalender") hatZahlen = true;
            stapel.appendChild(pille([bildEl(name), textEl(wert)]));
          }

          // Instagram versteckt die Zahlen dieses Beitrags. Das sagen wir
          // so -- statt eine Null hinzuschreiben, die es nicht gibt.
          if (!hatZahlen && b.verborgen) {
            const h = pille([textEl("Zahlen verborgen")]);
            h.style.fontWeight = "600";
            h.style.opacity = ".8";
            stapel.insertBefore(h, stapel.firstChild);
          }
          return stapel;
        }

        // ---------------------------------------------------------------
        // Zeichnen -- und die Identitaetsgarantie
        // ---------------------------------------------------------------
        //
        // Jede Kachel wird bei JEDEM Durchgang neu ueber den Code in ihrem
        // Link bestimmt. Nie ueber die Position, nie ueber etwas Gemerktes.
        // Zusaetzlich traegt jedes Schild den Code, zu dem es gehoert: passt
        // er nicht mehr zur Kachel, fliegt das Schild weg und wird neu
        // gebaut. Damit kann Instagrams Wiederverwenden von Kacheln beim
        // Scrollen kein fremdes Schild stehenlassen.
        RF.zeichnen = function () {
          let kacheln = 0;
          let beschriftet = 0;
          for (const link of document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')) {
            const treffer = (link.getAttribute("href") || "").match(/\/(?:p|reel)\/([^/?#]+)/);
            const code = treffer ? treffer[1] : null;
            // "Kachel" heisst: gross genug UND das Bild ist wirklich schon
            // da. Ohne die zweite Bedingung lag das Schild auf der noch
            // leeren Kachel -- die Pillen standen frei im Weissen
            // (10.10.2026 von Emre gemeldet).
            const gross = link.getBoundingClientRect();
            const bildDa = (() => {
              const i = link.querySelector("img");
              if (i && i.complete && i.naturalWidth > 0) return true;
              // Im REELS-Reiter ist das Vorschaubild kein <img>, sondern
              // ein Hintergrundbild auf einem div (10.10.2026 gemessen:
              // "mitBild: 0", obwohl die Kachel samt Bild da war). Nur die
              // unmittelbaren Kinder ansehen -- tiefer zu suchen kostet
              // Rechenzeit, und dort liegt es ohnehin nicht.
              for (const kind of link.children) {
                const hg = getComputedStyle(kind).backgroundImage;
                if (hg && hg !== "none" && hg.includes("url(")) return true;
              }
              return false;
            })();
            const istKachel = gross.width >= 120 && gross.height >= 120 && bildDa;
            let vorhanden = link.querySelector(":scope > .rf-schild");

            if (!istKachel || !code) {
              if (vorhanden) vorhanden.remove();
              continue;
            }
            kacheln++;
            let b = RF.daten.get(code);

            // Noch keine Zahlen von Instagrams Antwort? Dann nehmen wir das,
            // was auf der Kachel ohnehin schon steht.
            //
            // Im REELS-Reiter schreibt Instagram die Aufrufe selbst auf
            // jede Kachel, lange bevor seine Antwort mit den uebrigen
            // Zahlen eintrifft. Im normalen Raster kommen alle Zahlen mit
            // der ersten Antwort, im Reels-Reiter erst Sekunden spaeter und
            // nicht fuer alle -- deshalb blieben dort Kacheln leer
            // (10.10.2026 gemessen: 15 Kacheln, 0 bekannt).
            //
            // Das ist keine Schaetzung: es ist Instagrams eigene Zahl,
            // abgelesen statt erfunden. Sobald die richtige Antwort da ist,
            // ersetzt sie diese Notloesung.
            if (!b) {
              const roh = link.innerText || "";
              const treffer = roh.match(/(\d[\d.,]*)\s*([KMB])?/);
              if (treffer) {
                const grund = parseFloat(treffer[1].replace(/,/g, ""));
                const faktor = { K: 1e3, M: 1e6, B: 1e9 }[treffer[2]] ?? 1;
                if (Number.isFinite(grund) && grund > 0) {
                  b = { code, likes: null, kommentare: null, reposts: null,
                        aufrufe: Math.round(grund * faktor), zeitpunkt: null,
                        dauer: null, verborgen: false, vonDerKachel: true };
                }
              }
            }

            // Immer noch nichts -> kein Schild. Lieber nichts als Falsches.
            if (!b) {
              if (vorhanden) vorhanden.remove();
              continue;
            }
            // Gehoert das Schild noch zu diesem Beitrag?
            if (vorhanden && vorhanden.dataset.code !== code) {
              vorhanden.remove();
              vorhanden = null;
            }
            const stand = [code, b.likes, b.kommentare, b.aufrufe, b.reposts, b.zeitpunkt, b.dauer, b.vonDerKachel].join("|");
            if (vorhanden && vorhanden.dataset.stand === stand) {
              beschriftet++;
              continue;
            }
            if (!vorhanden) {
              vorhanden = document.createElement("div");
              vorhanden.className = "rf-schild";
              vorhanden.style.cssText = `position:absolute;left:${pxS(10)};bottom:${pxS(10)};z-index:20;pointer-events:none`;
              if (getComputedStyle(link).position === "static") link.style.position = "relative";
              link.appendChild(vorhanden);
            }
            vorhanden.dataset.code = code;
            vorhanden.dataset.stand = stand;
            vorhanden.textContent = "";
            vorhanden.appendChild(schild(b));
            beschriftet++;
          }
          RF.stand = { kacheln, beschriftet, bekannt: RF.daten.size };
          RF.zuletztGezeichnet = Date.now();
          try { RF.leisteSetzen(); } catch { /* Darstellung darf nie stoeren */ }
          try { RF.sortierungAnwenden(); } catch { /* dito */ }
        };

        // ---------------------------------------------------------------
        // Wie ist Instagrams Raster aufgebaut?
        // ---------------------------------------------------------------
        //
        // Nur zum Nachsehen. Davon haengt ab, ob sich spaeter sortieren
        // laesst, ohne Instagrams Layout anzufassen -- und das wird
        // gemessen, nicht vermutet.
        RF.spalten = function () {
          const kacheln = [...document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')].filter((a) => {
            const r = a.getBoundingClientRect();
            return r.width >= 100 && r.height >= 100;
          });
          if (!kacheln.length) return 0;
          const oben = Math.round(kacheln[0].getBoundingClientRect().top);
          return kacheln.filter((a) => Math.abs(Math.round(a.getBoundingClientRect().top) - oben) < 8).length;
        };

        // ===============================================================
        // Sortieren -- ohne Instagrams Aufbau anzufassen
        // ===============================================================
        //
        // Gemessen am 10.10.2026: Instagrams Raster ist KEIN flaches
        // Raster, sondern ein Stapel von Reihen. Kacheln zwischen Reihen
        // umzuhaengen waere der naheliegende Weg -- und der gefaehrlichste:
        // React baut staendig neu auf, und umgehaengte Knoten sind genau
        // die Stelle, an der Zahlen auf der falschen Kachel landen.
        //
        // Deshalb wird NICHTS umgehaengt. Die Reihen bekommen nur
        // display:contents, der Behaelter wird fuer diese Zeit ein Raster,
        // jede Kachel bekommt eine Ordnungszahl. Reine Darstellung.
        //
        // Ohne Sortierung wird gar nichts angefasst: dann ist es blankes
        // Instagram.
        RF.sortierung = { feld: null, richtung: "ab" };

        const FELDER = [
          { schluessel: null, name: "Aus" },
          { schluessel: "aufrufe", name: "Aufrufe" },
          { schluessel: "likes", name: "Likes" },
          { schluessel: "kommentare", name: "Kommentare" },
          { schluessel: "eng", name: "Engagement" },
          { schluessel: "zeitpunkt", name: "Datum" },
        ];

        const wertVon = (b, feld) => {
          if (!b) return null;
          if (feld === "eng") {
            if (!b.aufrufe || b.aufrufe <= 0) return null;
            return ((b.likes ?? 0) + (b.kommentare ?? 0)) / b.aufrufe;
          }
          return typeof b[feld] === "number" ? b[feld] : null;
        };

        function behaelterFinden() {
          const kacheln = [...document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')].filter((x) => {
            const r = x.getBoundingClientRect();
            return r.width >= 120 && r.height >= 120;
          });
          if (kacheln.length < 2) return { kacheln: [], behaelter: null };
          let behaelter = kacheln[0].parentElement;
          while (behaelter && !kacheln.every((k) => behaelter.contains(k))) behaelter = behaelter.parentElement;
          return { kacheln, behaelter };
        }

        RF.sortierungAufheben = function () {
          const { behaelter } = behaelterFinden();
          if (behaelter && behaelter.dataset.rfUmgestellt) {
            behaelter.style.display = behaelter.dataset.rfDisplay || "";
            behaelter.style.gridTemplateColumns = "";
            behaelter.style.gap = "";
            delete behaelter.dataset.rfUmgestellt;
            delete behaelter.dataset.rfDisplay;
          }
          for (const el of document.querySelectorAll("[data-rf-reihe]")) {
            el.style.display = el.dataset.rfReiheDisplay || "";
            delete el.dataset.rfReihe;
            delete el.dataset.rfReiheDisplay;
          }
          for (const el of document.querySelectorAll("[data-rf-ordnung]")) {
            el.style.order = "";
            delete el.dataset.rfOrdnung;
          }
        };

        RF.sortierungAnwenden = function () {
          const feld = RF.sortierung.feld;
          if (!feld) {
            RF.sortierungAufheben();
            return;
          }
          const { kacheln, behaelter } = behaelterFinden();
          if (!behaelter || kacheln.length < 2) return;

          let abstand = "4px";
          for (const kind of behaelter.children) {
            const g = getComputedStyle(kind).columnGap;
            if (g && g !== "normal") { abstand = g; break; }
          }
          if (!behaelter.dataset.rfUmgestellt) {
            behaelter.dataset.rfDisplay = behaelter.style.display || "";
            behaelter.dataset.rfUmgestellt = "1";
          }
          behaelter.style.display = "grid";
          behaelter.style.gridTemplateColumns = `repeat(${RF.spalten() || 4}, minmax(0, 1fr))`;
          behaelter.style.gap = abstand;

          for (const kind of behaelter.children) {
            if (kind.dataset.rfReihe) continue;
            kind.dataset.rfReihe = "1";
            kind.dataset.rfReiheDisplay = kind.style.display || "";
            kind.style.display = "contents";
          }

          // Die Zuordnung laeuft ueber den Code im Link -- genau wie bei den
          // Schildern, nie ueber die Position.
          const liste = kacheln.map((a) => {
            const treffer = (a.getAttribute("href") || "").match(/\/(?:p|reel)\/([^/?#]+)/);
            const code = treffer ? treffer[1] : null;
            let traeger = a;
            while (traeger.parentElement && !traeger.parentElement.dataset.rfReihe) traeger = traeger.parentElement;
            return { traeger, wert: wertVon(code ? RF.daten.get(code) : null, feld) };
          });
          // Ohne Wert ans Ende -- nie raten, nie mit null mitsortieren.
          const mitWert = liste.filter((e) => e.wert !== null);
          const ohneWert = liste.filter((e) => e.wert === null);
          mitWert.sort((x, y) => (RF.sortierung.richtung === "auf" ? x.wert - y.wert : y.wert - x.wert));
          [...mitWert, ...ohneWert].forEach((e, i) => {
            e.traeger.dataset.rfOrdnung = "1";
            e.traeger.style.order = String(i);
          });
        };

        // ===============================================================
        // Die Research-Leiste ueber dem Raster
        // ===============================================================
        RF.leisteSetzen = function () {
          const { behaelter } = behaelterFinden();
          if (!behaelter || !behaelter.parentElement) return;
          let leiste = document.getElementById("rf-leiste");
          if (!leiste) {
            // Die Leiste ist Stueck fuer Stueck nach Emres Vorlage gebaut
            // (10.10.2026, Bild 3): flacher, stark abgerundeter Balken;
            // links ein Punkt und der Name, daneben die Schalter als
            // vollrunde Pillen, rechts die Werkzeuge als runde Knoepfe,
            // abgetrennt durch einen feinen Strich. Nur die Farben sind
            // unsere: neutrales Schwarz statt Weiss, Gold statt Blau.
            //
            // ACHTUNG: Datumsbereich, Automatische Analyse und die
            // Werkzeuge rechts sind bisher NUR DARSTELLUNG -- dahinter
            // liegt noch keine Funktion. Emre wollte die Leiste zuerst
            // vollstaendig sehen und danach entscheiden, was bleibt.
            const WERKZEUG = {
              kalender: '<path d="M5 1.5v1.2h6V1.5h1.5v1.2H13A1.5 1.5 0 0 1 14.5 4.2v8.3A1.5 1.5 0 0 1 13 14H3a1.5 1.5 0 0 1-1.5-1.5V4.2A1.5 1.5 0 0 1 3 2.7h.5V1.5zM3 6.4v6.1h10V6.4z"/>',
              saeulen: '<path d="M2 9h2.4v5H2zM6.8 5h2.4v9H6.8zM11.6 2H14v12h-2.4z"/>',
              schichten: '<path d="M8 1.5 15 5.2 8 8.9 1 5.2zM1 8l7 3.7L15 8l-1.9-1L8 9.6 2.9 7zM1 10.8l7 3.7 7-3.7-1.9-1L8 12.4l-5.1-2.6z"/>',
              stift: '<path d="M8 1.5a2.3 2.3 0 0 1 2.3 2.3v3.4a2.3 2.3 0 0 1-4.6 0V3.8A2.3 2.3 0 0 1 8 1.5zM3.6 7.2h1.5a2.9 2.9 0 0 0 5.8 0h1.5a4.4 4.4 0 0 1-3.6 4.3v1.6h2v1.4H5.2v-1.4h2v-1.6a4.4 4.4 0 0 1-3.6-4.3z"/>',
              raster: '<path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z"/>',
              runter: '<path d="M7.3 1.5h1.4v8.2l3-3 1 1L8 12.4 3.3 7.7l1-1 3 3zM2.5 13h11v1.4h-11z"/>',
              rauf: '<path d="M8 1.6l4.7 4.7-1 1-3-3V12.5H7.3V4.3l-3 3-1-1zM2.5 13.6h11V15h-11z"/>',
            };

            const bildchen = (name, farbe) => {
              const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
              s.setAttribute("viewBox", "0 0 16 16");
              s.setAttribute("width", px(13));
              s.setAttribute("height", px(13));
              s.setAttribute("fill", farbe || "currentColor");
              s.style.cssText = "flex:none";
              s.innerHTML = WERKZEUG[name];
              return s;
            };

            leiste = document.createElement("div");
            leiste.id = "rf-leiste";
            leiste.style.cssText =
              `display:flex;align-items:center;gap:${px(7)};flex-wrap:nowrap;` +
              `max-width:100%;overflow:hidden;` +
              `margin:${px(9)} 0;padding:${px(6)} ${px(11)};border-radius:${px(13)};` +
              "background:#0b0b0d;border:1px solid rgba(255,255,255,.08);" +
              `box-shadow:0 ${px(4)} ${px(14)} rgba(0,0,0,.35);` +
              `font:500 ${px(13)}/1 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;color:#fff`;

            // --- links: Punkt + Name ---------------------------------
            const kopf = document.createElement("div");
            kopf.style.cssText = `display:flex;align-items:center;gap:${px(8)};margin-right:${px(2)};flex:none`;
            // Unser eigenes Zeichen statt des Punktes -- derselbe Platz, an
            // dem die Vorlage ihr blaues Puenktchen hat. Der Pfad ist hier
            // fest eingebaut, weil die Seite drueben Instagram gehoert und
            // unsere Dateien dort nicht erreichbar sind.
            const zeichen = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            zeichen.setAttribute("viewBox", "0 0 26 20");
            zeichen.setAttribute("width", px(17));
            zeichen.setAttribute("height", px(13));
            zeichen.setAttribute("fill", "none");
            zeichen.style.cssText = "flex:none";
            zeichen.innerHTML = RF_ZEICHEN;
            const marke = document.createElement("div");
            marke.textContent = "ReelForge Research";
            marke.style.cssText = `color:#fff;font-weight:700;font-size:${px(11.5)};letter-spacing:.01em;white-space:nowrap`;
            kopf.append(zeichen, marke);

            // --- die Pillen -------------------------------------------
            const pilleKnopf = (text, zeichen) => {
              const b2 = document.createElement("button");
              b2.type = "button";
              b2.style.cssText =
                `display:flex;align-items:center;gap:${px(6)};flex:none;` +
                `padding:0 ${px(13)};height:${px(29)};border-radius:${px(999)};cursor:pointer;` +
                "background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.10);" +
                `color:rgba(255,255,255,.92);font:600 ${px(13)}/1 inherit;white-space:nowrap`;
              if (zeichen) b2.appendChild(bildchen(zeichen));
              const s = document.createElement("span");
              s.textContent = text;
              b2.appendChild(s);
              b2.__text = s;
              return b2;
            };

            const feldKnopf = pilleKnopf("Deaktiviert");
            const richtungKnopf = pilleKnopf("Aufsteigend");
            const datumKnopf = pilleKnopf("Beliebiges Datum", "kalender");

            // --- der hervorgehobene Knopf (bei ihnen blau) -------------
            const analyse = document.createElement("button");
            analyse.type = "button";
            analyse.style.cssText =
              `display:flex;align-items:center;gap:${px(6)};margin-left:auto;flex:none;` +
              `padding:0 ${px(14)};height:${px(29)};border-radius:${px(999)};cursor:pointer;` +
              "background:linear-gradient(180deg,#EAC088,#D39448);border:1px solid rgba(0,0,0,.2);" +
              `color:#231704;font:600 ${px(13)}/1 inherit;white-space:nowrap`;
            analyse.appendChild(bildchen("saeulen", "#231704"));
            const analyseText = document.createElement("span");
            analyseText.textContent = "Automatische Analyse";
            analyse.appendChild(analyseText);

            // --- die runden Werkzeuge ---------------------------------
            const rundKnopf = (zeichen, gefuellt) => {
              const b2 = document.createElement("button");
              b2.type = "button";
              b2.style.cssText =
                `display:flex;align-items:center;justify-content:center;flex:none;` +
                `width:${px(29)};height:${px(29)};border-radius:${px(999)};cursor:pointer;border:none;` +
                (gefuellt
                  ? "background:linear-gradient(180deg,#EAC088,#D39448);color:#231704;"
                  : "background:transparent;color:rgba(255,255,255,.62);");
              b2.appendChild(bildchen(zeichen, gefuellt ? "#231704" : "#fff"));
              return b2;
            };

            const strich = document.createElement("span");
            strich.style.cssText =
              `width:1px;height:${px(18)};background:rgba(255,255,255,.12);margin:0 ${px(3)};flex:none`;

            // --- Verhalten: nur die beiden echten Schalter -------------
            const feldZeigen = (name, an) => {
              feldKnopf.__text.textContent = name;
              feldKnopf.style.background = an ? GOLD : "rgba(255,255,255,.04)";
              feldKnopf.style.borderColor = an ? GOLD : "rgba(255,255,255,.12)";
              feldKnopf.style.color = an ? "#231704" : "#fff";
              feldKnopf.style.fontWeight = an ? "700" : "500";
            };

            feldKnopf.addEventListener("click", (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              const i = FELDER.findIndex((f) => f.schluessel === RF.sortierung.feld);
              const naechste = FELDER[(i + 1) % FELDER.length];
              RF.sortierung.feld = naechste.schluessel;
              feldZeigen(naechste.schluessel ? naechste.name : "Deaktiviert", !!naechste.schluessel);
              RF.sortierungAnwenden();
            });

            richtungKnopf.addEventListener("click", (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              RF.sortierung.richtung = RF.sortierung.richtung === "ab" ? "auf" : "ab";
              richtungKnopf.__text.textContent = RF.sortierung.richtung === "ab" ? "Absteigend" : "Aufsteigend";
              RF.sortierungAnwenden();
            });
            richtungKnopf.__text.textContent = RF.sortierung.richtung === "ab" ? "Absteigend" : "Aufsteigend";

            // Gruppen statt einer Reihe gleicher Abstaende -- genau wie in
            // der Vorlage: der hervorgehobene Knopf und der gefuellte
            // Schichten-Knopf gehoeren zusammen, die drei schlichten
            // Werkzeuge stehen dicht daneben, und die letzten beiden
            // sitzen abgetrennt in einem eigenen Rahmen.
            const gruppe = (abstand) => {
              const g = document.createElement("div");
              g.style.cssText = `display:flex;align-items:center;gap:${px(abstand)};flex:none`;
              return g;
            };

            const rechts = gruppe(5);
            rechts.style.marginLeft = "auto";
            analyse.style.marginLeft = "0";
            const werkzeuge = gruppe(1);
            werkzeuge.append(rundKnopf("saeulen"), rundKnopf("stift"), rundKnopf("raster"));
            rechts.append(analyse, rundKnopf("schichten", true), werkzeuge);

            const letzte = gruppe(1);
            letzte.style.cssText +=
              `;padding:${px(2)};border-radius:${px(999)};border:1px solid rgba(255,255,255,.10)`;
            letzte.append(rundKnopf("runter"), rundKnopf("rauf"));

            leiste.append(kopf, feldKnopf, richtungKnopf, datumKnopf, rechts, strich, letzte);
            // Der Stand haengt jetzt unter der Leiste, weil rechts kein
            // Platz mehr ist -- die Vorlage hat ihn dort auch nicht.
            RF.leisteStand = null;
          }
          if (leiste.nextElementSibling !== behaelter) behaelter.parentElement.insertBefore(leiste, behaelter);
          if (RF.leisteStand && RF.stand) {
            RF.leisteStand.textContent = `${RF.stand.beschriftet} von ${RF.stand.kacheln} Kacheln mit Daten`;
          }
        };

        // Nur zum Nachsehen (10.10.2026): im Reels-Reiter fand die Schicht
        // null Kacheln. Hier wird Stufe fuer Stufe gezaehlt, woran es
        // scheitert -- Link, Groesse oder Bild. Fliegt danach raus.
        RF.warum = function () {
          const links = [...document.querySelectorAll("a[href]")];
          const aufBeitrag = links.filter((a) => /\/(p|reel)\//.test(a.getAttribute("href") || ""));
          const kacheln = aufBeitrag.filter((a) => {
            const r = a.getBoundingClientRect();
            if (r.width < 120 || r.height < 120) return false;
            const i = a.querySelector("img");
            if (i && i.complete && i.naturalWidth > 0) return true;
            for (const kind of a.children) {
              const hg = getComputedStyle(kind).backgroundImage;
              if (hg && hg !== "none" && hg.includes("url(")) return true;
            }
            return false;
          });
          const codes = kacheln.map((a) => {
            const m = (a.getAttribute("href") || "").match(/\/(?:p|reel)\/([^/?#]+)/);
            return m ? m[1] : null;
          });
          const fehlen = codes.filter((c) => c && !RF.daten.has(c));
          return {
            aufBeitrag: aufBeitrag.length,
            kacheln: kacheln.length,
            bekannt: RF.daten.size,
            ohneZahlen: fehlen.length,
            beispieleOhneZahlen: fehlen.slice(0, 5),
          };
        };

        RF.aufbau = function () {
          const kacheln = [...document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')].filter((a) => {
            const r = a.getBoundingClientRect();
            return r.width >= 120 && r.height >= 120;
          });
          if (kacheln.length < 2) return { kacheln: kacheln.length };
          // Gemeinsamer Vorfahr aller Kacheln.
          let behaelter = kacheln[0].parentElement;
          while (behaelter && !kacheln.every((k) => behaelter.contains(k))) behaelter = behaelter.parentElement;
          if (!behaelter) return { kacheln: kacheln.length, behaelter: "keiner" };
          // Auf welches direkte Kind des Behaelters faellt jede Kachel?
          const kinder = kacheln.map((k) => {
            let n = k;
            while (n.parentElement && n.parentElement !== behaelter) n = n.parentElement;
            return n;
          });
          const verschieden = new Set(kinder).size;
          const s = getComputedStyle(behaelter);
          return {
            kacheln: kacheln.length,
            behaelter: behaelter.tagName,
            kinderDesBehaelters: behaelter.children.length,
            kachelnAufVerschiedeneKinder: verschieden,
            flach: verschieden === kacheln.length,
            anzeige: s.display,
            spalten: s.gridTemplateColumns ? s.gridTemplateColumns.split(" ").length : null,
          };
        };

        // Zeichnen, wenn sich etwas tut -- plus ruhiger Takt, falls
        // Instagram beim Neuzeichnen ein Schild entfernt.
        let gleich = null;
        // ===============================================================
        // Wann wird gezeichnet -- und warum das die heikelste Stelle ist
        // ===============================================================
        //
        // Hier stand eine Schleife, die sich SELBST angetrieben hat:
        // "aendert sich irgendwas auf der Seite, zeichne neu" -- und das
        // Zeichnen aendert die Seite. Also zeichnen, Beobachter schlaegt
        // an, 120 ms spaeter wieder zeichnen, endlos, auch wenn niemand
        // etwas tut. Jeder Durchgang misst jede Kachel aus und zwingt den
        // Browser zur kompletten Layout-Rechnung.
        //
        // Das erklaert alles, was Emre am 10.10.2026 gemeldet hat: Bilder
        // luden nicht (Instagram kam nie zur Ruhe), Schilder waren halb
        // gezeichnet (die Aufnahme traf die Seite mitten im Neuaufbau),
        // Zahlen standen doppelt uebereinander, Scrollen ruckelte, und
        // selbst die Kommentare im Research kamen ins Stocken.
        //
        // Deshalb: waehrend wir zeichnen, hoert der Beobachter NICHT zu.
        // Er wird erst im naechsten Bildrahmen wieder angeschaltet -- dann
        // sind unsere eigenen Aenderungen durch und koennen uns nicht mehr
        // selbst antreiben. Nur echte Aenderungen von Instagram loesen
        // noch etwas aus.
        let ichZeichne = false;
        const beobachter = new MutationObserver(() => anstossen());
        const zuhoeren = () => beobachter.observe(document.body, { childList: true, subtree: true });

        function zeichnenGeschuetzt() {
          if (ichZeichne) return;
          ichZeichne = true;
          beobachter.disconnect();
          try {
            RF.zeichnen();
          } catch {
            /* Darstellung darf die Seite nie aufhalten */
          }
          requestAnimationFrame(() => {
            zuhoeren();
            ichZeichne = false;
          });
        }

        function anstossen() {
          if (ichZeichne) return;
          clearTimeout(gleich);
          gleich = setTimeout(zeichnenGeschuetzt, 300);
        }

        RF.anstossen = anstossen;
        // Auch der Connector zeichnet nur ueber den geschuetzten Weg --
        // sonst stoesst sein Fuettern die Schleife von der anderen Seite an.
        RF.jetztZeichnen = zeichnenGeschuetzt;
        zuhoeren();
        // Ruhiger Grundtakt, falls Instagram beim Neuaufbau ein Schild
        // entfernt hat, ohne dass der Beobachter es gemeldet hat.
        setInterval(zeichnenGeschuetzt, 1500);
        return true;
      }, this.profilVergroesserung ?? 1)
      .catch((err) => {
        console.log(`[forschung] Schicht konnte nicht gesetzt werden: ${err?.message}`);
        return false;
      });
  }

  // Die gesammelten Zahlen in die Seite geben und zeichnen lassen.
  async profilSchichtFuettern() {
    const seite = this.profilSeite;
    if (!PROFIL_FORSCHUNG || !seite || seite.isClosed() || !this.profilBeitraege?.size) return;
    const daten = [...this.profilBeitraege.values()];
    const stand = await seite
      .evaluate((liste) => {
        const RF = window.__rfForschung;
        if (!RF) return null;
        for (const b of liste) RF.daten.set(b.code, b);
        (RF.jetztZeichnen ?? RF.zeichnen)();
        return RF.stand;
      }, daten)
      .catch(() => null);
    if (stand) this.profilSchichtStand = stand;
    console.log(`[forschung] gefuettert mit ${daten.length} -> ${JSON.stringify(stand)}`);
  }

  async profilBedienen(art, x, y) {
    if (!this.profilSeite || this.profilSeite.isClosed()) return { ok: false, fehler: "No profile is open." };
    try {
      if (art === "scrollen") {
        // Kein Warten und kein Bild danach: der laufende Bildstrom zeigt das
        // Ergebnis ohnehin. Hier standen frueher 420 ms Pause plus ein
        // Bildschirmfoto -- aus der Zeit, als es den Strom noch nicht gab.
        // Das deckelte das Scrollen auf gut zwei Schritte pro Sekunde und
        // war die zweite Haelfte des Ruckelns (10.10.2026).
        await this.profilSeite.mouse.wheel(0, Number(y) || 0);
        // Scrollen kommt im Schwall. Eine Zeile je Rad-Schritt waere
        // unlesbar, deshalb nur eine Bilanz je Sekunde.
        this.scrollSumme = (this.scrollSumme || 0) + (Number(y) || 0);
        this.scrollSchritte = (this.scrollSchritte || 0) + 1;
        if (Date.now() - (this.scrollGemeldet || 0) > 1000) {
          this.scrollGemeldet = Date.now();
          console.log(
            `[profil-spur] gescrollt: ${this.scrollSchritte} Schritte, ${Math.round(this.scrollSumme)} Punkte ${this.scrollSumme > 0 ? "runter" : "hoch"}`
          );
          this.scrollSumme = 0;
          this.scrollSchritte = 0;
        }
        return { ok: true };
      }
      if (art === "schweben") {
        // Mausbewegung durchreichen.
        //
        // Ohne sie steht der Zeiger drueben still, und Instagram hat keinen
        // Anlass, beim Drueberfahren Likes und Kommentare einzublenden --
        // bei uns passierte beim Schweben also nichts.
        //
        // Bewusst ohne Warten und ohne Bild: der laufende Bildstrom zeigt
        // das Ergebnis, und Mausbewegungen kommen viel zu oft, um jede
        // einzeln zu quittieren.
        //
        // Eine negative Stelle heisst "die Maus ist weg" -- siehe unten.
        const weg = Number(x) < 0 || Number(y) < 0;

        if (weg) {
          // Die Maus hat das Bild verlassen: Zeiger drueben aus dem Fenster
          // heraus. NICHT in eine Ecke -- oben links liegt Instagrams
          // Seitenleiste, und die klappt beim Drueberfahren auf (so stand
          // es hier zuerst, und bei jedem Weggehen ging die Leiste auf).
          //
          // Dass Instagrams Einblendung danach trotzdem stehen bleibt,
          // liegt nicht hieran: sie bleibt auch mitten im Bild stehen,
          // wenn man einen Beitrag auf- und zumacht. Ein Versuch, den
          // Zeiger wie eine echte Maus erst ueber den Rand wandern zu
          // lassen, hat daran nichts geaendert und ist wieder raus
          // (10.10.2026).
          const zielX = (this.profilBreite || 1040) + 200;
          const zielY = (this.profilHoehe || 712) + 200;
          await this.profilSeite.mouse.move(zielX, zielY);
          this.schwebtAuf = null;
          console.log(`[profil-spur] Maus raus -- Zeiger auf ${zielX},${zielY} | danach drueben: ${await this.profilWasIstDa(zielX, zielY)}`);

          return { ok: true };
        }

        const zielX = Number(x) || 0;
        const zielY = Number(y) || 0;
        await this.profilSeite.mouse.move(zielX, zielY);

        // Beim Schweben NICHT jede Bewegung melden -- eine Maus meldet sich
        // hundertmal je Sekunde. Nur, wenn sich aendert, WORAUF sie liegt.
        if (Date.now() - (this.schwebeGeprueft || 0) > 350) {
          this.schwebeGeprueft = Date.now();
          const da = await this.profilWasIstDa(zielX, zielY);
          const kurz = da.split(" | ")[0];
          if (kurz !== this.schwebtAuf) {
            this.schwebtAuf = kurz;
            console.log(`[profil-spur] Maus auf ${zielX},${zielY} -- ${da}`);
          }
        }
        return { ok: true };
      }
      if (art === "klick") {
        // Erst nachsehen, worauf geklickt wird -- hinterher ist die Seite
        // womoeglich eine andere und die Stelle sagt nichts mehr aus.
        const vorher = this.profilSeite.url();
        console.log(`[profil-spur] KLICK auf ${x},${y} -- ${await this.profilWasIstDa(Number(x) || 0, Number(y) || 0)}`);
        await this.profilSeite.mouse.click(Number(x) || 0, Number(y) || 0);
        // Ein Klick kann eine neue Seite laden (Reiter, Highlight, Beitrag).
        await sleep(1400);
        const nachher = this.profilSeite.url();
        console.log(
          nachher === vorher
            ? `[profil-spur] nach dem Klick: dieselbe Seite (${nachher.replace("https://www.instagram.com", "")})`
            : `[profil-spur] nach dem Klick: neue Seite ${nachher.replace("https://www.instagram.com", "")}`
        );
      } else if (art === "zurueck") {
        // (Zurueck laedt eine andere Seite -- hier lohnt das Warten.)
        await this.profilSeite.goBack({ waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
        await sleep(1200);
        console.log(`[profil-spur] zurueck -- jetzt auf ${this.profilSeite.url().replace("https://www.instagram.com", "")}`);
      }
      await this.page.bringToFront().catch(() => {});
      const bild = await this.profilBild();
      return bild ? { ok: true, bild } : { ok: false, fehler: "Couldn't capture the profile." };
    } catch (err) {
      console.error(`[profil] session ${this.id}: ${art} FEHLER ${err?.message}`);
      return { ok: false, fehler: err?.message ?? "Something went wrong on the profile." };
    }
  }

  // Ton von der Profilseite.
  //
  // Das Bild kommt als Bildfolge -- da ist kein Ton drin. Der wird deshalb
  // getrennt geholt, mit genau demselben Griff, den die Buehne seit Wochen
  // benutzt: der Ton wird NICHT am Element abgegriffen (Instagrams Player
  // ist stumm, und Entstummen haelt die Wiedergabe an), sondern ueber
  // captureStream(). Dahinter eine feste Tonleitung, in die immer nur
  // umgesteckt wird, welches Video gerade spielt.
  async profilTonStarten() {
    if (!this.profilSeite || this.profilSeite.isClosed()) return { fehler: "No profile is open." };
    const erg = await this.profilSeite.evaluate(() => {
      const P = (window.__profilTon ??= {});

      P.bus = () => {
        if (P._bus) return P._bus;
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const ziel = ctx.createMediaStreamDestination();
        P._bus = { ctx, ziel, spur: ziel.stream.getAudioTracks()[0] ?? null };
        return P._bus;
      };

      // Welches Video spielt gerade und ist im Bild?
      P.videoImBild = () => {
        const alle = [...document.querySelectorAll("video")];
        const sichtbar = alle.filter((v) => {
          const r = v.getBoundingClientRect();
          return r.width > 40 && r.height > 40 && r.bottom > 0 && r.top < innerHeight;
        });
        return sichtbar.find((v) => !v.paused) ?? sichtbar[0] ?? null;
      };

      P.anklemmen = async (v) => {
        const bus = P.bus();
        if (!bus.spur || !v) return false;
        try { if (bus.ctx.state === "suspended") await bus.ctx.resume(); } catch { /* egal */ }
        // Schon angeklemmt UND die Spur lebt noch? Dann nichts tun.
        if (P.quelle === v && P.eingang && P.eingang.readyState === "live") return true;
        let strom;
        try { strom = v.captureStream ? v.captureStream() : v.mozCaptureStream(); }
        catch { return false; }
        const spur = strom.getAudioTracks()[0];
        if (!spur) return false;
        try { P.knoten?.disconnect(); } catch { /* egal */ }
        const quelle = bus.ctx.createMediaStreamSource(new MediaStream([spur]));
        quelle.connect(bus.ziel);
        P.knoten = quelle;
        P.quelle = v;
        P.eingang = spur;
        return true;
      };

      // Auf der Profilseite wechseln Videos staendig (Story weiter, anderer
      // Beitrag). Deshalb regelmaessig nachsehen und umstecken, statt die
      // Verbindung neu aufzubauen.
      P.wachen = () => {
        if (P.wache) return;
        P.wache = setInterval(() => {
          const v = P.videoImBild();
          if (v && (v !== P.quelle || !P.eingang || P.eingang.readyState !== "live")) void P.anklemmen(v);
        }, 700);
      };

      P.starte = async () => {
        const bus = P.bus();
        if (!bus.spur) return { fehler: "Keine Tonleitung moeglich." };
        const pc = new RTCPeerConnection();
        pc.addTrack(bus.spur, bus.ziel.stream);
        const angebot = await pc.createOffer();
        await pc.setLocalDescription(angebot);
        await new Promise((fertig) => {
          if (pc.iceGatheringState === "complete") return fertig();
          const sehen = () => { if (pc.iceGatheringState === "complete") { pc.removeEventListener("icegatheringstatechange", sehen); fertig(); } };
          pc.addEventListener("icegatheringstatechange", sehen);
          setTimeout(fertig, 1500);
        });
        P.pc = pc;
        void P.anklemmen(P.videoImBild());
        P.wachen();
        return { ok: true, angebot: pc.localDescription.sdp };
      };

      P.antwort = async (sdp) => {
        if (!P.pc) return { fehler: "Keine Tonverbindung." };
        if (P.pc.signalingState !== "have-local-offer") return { ok: true, uebergangen: P.pc.signalingState };
        await P.pc.setRemoteDescription({ type: "answer", sdp });
        // MESSUNG (10.10.2026): Ob die Verbindung WIRKLICH zustande kommt.
        //
        // Vorher meldete der Connector "Tonleitung steht", sobald das
        // Angebot gemacht war -- auch wenn danach nie etwas zustande kam.
        // Genau so war es: die Antwort kam ohne Verbindungsadressen, es
        // blieb still, und im Protokoll stand trotzdem alles in Ordnung.
        P.pc.addEventListener("connectionstatechange", () => {
          P.stand = P.pc.connectionState;
        });
        // Hat die Antwort ueberhaupt Adressen dabei?
        P.adressenInAntwort = (sdp.match(/a=candidate/g) ?? []).length;
        return { ok: true, adressen: P.adressenInAntwort };
      };

      return P.starte();
    }).catch((e) => ({ fehler: String(e?.message ?? e) }));

    if (erg?.ok) console.log(`[profil] Tonangebot gemacht -- ob es wirklich traegt, sagt erst die naechste Zeile.`);
    else console.log(`[profil] Ton nicht moeglich: ${erg?.fehler ?? "?"}`);
    return erg;
  }

  async profilTonAntwort(sdp) {
    if (!this.profilSeite || this.profilSeite.isClosed()) return { fehler: "No profile is open." };
    const erg = await this.profilSeite
      .evaluate((s) => window.__profilTon.antwort(s), sdp)
      .catch((e) => ({ fehler: String(e?.message ?? e) }));
    console.log(`[profil] Ton-Antwort angenommen: ${erg?.ok ? "ja" : "NEIN (" + (erg?.fehler ?? "?") + ")"} | Adressen in der Antwort: ${erg?.adressen ?? "?"}`);
    // Kurz nachsehen, ob die Verbindung wirklich steht -- "Angebot gemacht"
    // allein hat uns schon einmal getaeuscht.
    setTimeout(async () => {
      const stand = await this.profilSeite
        ?.evaluate(() => window.__profilTon?.pc?.connectionState ?? "-")
        .catch(() => "-");
      console.log(`[profil] Tonverbindung nach 3s: ${stand}`);
    }, 3000);
    return erg;
  }

  // Laufendes Bild der Profilseite.
  //
  // Chrome kann eine Seite von sich aus als Bildfolge ausgeben (Screencast)
  // -- dieselbe Technik, mit der Entwicklerwerkzeuge eine Seite aus der
  // Ferne zeigen. Das ist KEINE Tab-Aufnahme mit Ton, sondern nur das Bild;
  // der Ton kommt getrennt, ueber denselben Griff wie bei der Buehne.
  //
  // Die Bilder gehen als Strom an die App: eine Antwort, die offen bleibt,
  // Zeile fuer Zeile ein Bild. Kein zweiter Kanal noetig.
  async profilStromStarten(res) {
    if (!this.profilSeite || this.profilSeite.isClosed()) return false;
    await this.profilStromStoppen();

    const cdp = await this.context.newCDPSession(this.profilSeite).catch(() => null);
    if (!cdp) return false;
    this.profilCdp = cdp;
    this.profilRes = res;

    // MESSUNG: wie viele Bilder gehen wirklich raus und wie gross sind sie?
    // Ohne das waeren "es ruckelt" und "es liegt an deinem Browser" beides
    // nur Behauptungen (10.10.2026, Emre wollte Protokolle zum Nachlesen).
    let zaehler = 0;
    let bytes = 0;
    const seit = Date.now();
    this.profilTakt = setInterval(() => {
      if (!zaehler) return;
      const s = (Date.now() - seit) / 1000;
      console.log(`[profil] Bildstrom: ${zaehler} Bilder in ${s.toFixed(0)}s (${(zaehler / s).toFixed(1)}/s), im Schnitt ${Math.round(bytes / zaehler / 1024)} KB.`);
    }, 5000);

    cdp.on("Page.screencastFrame", async (bild) => {
      // Bestaetigen MUSS sein, sonst schickt Chrome nach wenigen Bildern
      // nichts mehr.
      cdp.send("Page.screencastFrameAck", { sessionId: bild.sessionId }).catch(() => {});
      if (this.profilRes !== res || res.writableEnded) return;
      // Als echte Bilddaten, nicht als Text.
      //
      // Chrome liefert das Bild base64-kodiert. Schickten wir es so weiter,
      // musste der Browser drueben jedes Bild Zeichen fuer Zeichen
      // zurueckrechnen -- bei 20 Bildern je Sekunde und ~111 KB je Bild
      // waren das Millionen Schritte pro Sekunde auf demselben Faden, der
      // auch zeichnen soll. Genau das hat geruckelt (10.10.2026 gemessen).
      // Jetzt: vier Bytes Laenge, dann das Bild. Spart zusaetzlich das
      // Drittel, das die Textform aufschlaegt.
      const roh = Buffer.from(bild.data, "base64");
      const kopf = Buffer.alloc(4);
      kopf.writeUInt32BE(roh.length, 0);
      zaehler++;
      bytes += roh.length;
      res.write(kopf);
      res.write(roh);
    });

    // Scharf statt sparsam.
    //
    // Hier stand zuerst eine Notbremse: kleiner uebertragen (1100 Punkte
    // breit) und schwach komprimiert (55), weil das Ruckeln sonst zu stark
    // war. Die eigentliche Ursache lag aber woanders -- die Bilder kamen
    // als Text an und mussten bei jedem einzelnen zurueckgerechnet werden.
    // Seit sie als echte Bilddaten kommen, ist die Menge kein Problem mehr,
    // und die Notbremse kostete nur noch Schaerfe (10.10.2026 von Emre
    // bemerkt: "die Aufloesung ist einfach nicht HD").
    //
    // Doppelte Punktdichte: Die Seite wird genauso gelegt wie vorher, aber
    // mit doppelt so vielen Bildpunkten gezeichnet. Auf einem feinen
    // Bildschirm ist das der Unterschied zwischen scharf und weich -- ohne
    // dass sich am Aussehen der Seite etwas aendert.
    await cdp
      .send("Emulation.setDeviceMetricsOverride", {
        width: this.profilBreite ?? 1440,
        height: this.profilHoehe ?? 900,
        deviceScaleFactor: 2,
        mobile: false,
      })
      .catch((e) => console.log(`[profil] doppelte Punktdichte nicht moeglich: ${e?.message}`));

    await cdp
      // Qualitaet 92 statt 72.
      //
      // Die Aufloesung war nie das Problem: mit doppelter Punktdichte
      // gehen 3840 Bildpunkte raus, Emres Flaeche zeigt rund 2860. Was die
      // Seite billig aussehen liess, war die Komprimierung -- 72 macht
      // Schrift matschig und ruhige Flaechen fleckig (10.10.2026 von ihm
      // gemeldet, hier nachgemessen).
      //
      // Der Preis sind groessere Bilder. Das faellt nicht ins Gewicht: der
      // Strom laeuft ueber den eigenen Rechner, nicht uebers Netz.
      .send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 })
      .catch(() => {});
    console.log(`[profil] session ${this.id}: Bildstrom laeuft.`);
    return true;
  }

  async profilStromStoppen() {
    if (this.profilTakt) { clearInterval(this.profilTakt); this.profilTakt = null; }
    if (this.profilCdp) {
      await this.profilCdp.send("Page.stopScreencast").catch(() => {});
      await this.profilCdp.detach().catch(() => {});
      this.profilCdp = null;
    }
    if (this.profilRes && !this.profilRes.writableEnded) this.profilRes.end();
    this.profilRes = null;
  }

  async profilSchliessen(lauf) {
    // Nur zumachen, was der Aufrufer auch gemeint hat. Ohne diese Pruefung
    // schloss ein verspaetetes "zu" vom ersten Aufbau die Seite des
    // zweiten (siehe profilOeffnen).
    if (lauf && this.profilKennung && String(lauf) !== String(this.profilKennung)) {
      console.log(`[profil] session ${this.id}: Schliessen fuer ${lauf} verworfen, offen ist ${this.profilKennung}.`);
      return { ok: true, uebersprungen: true };
    }
    await this.profilStromStoppen();
    // Mitlesen beenden und die gesammelten Zahlen vergessen -- sie gehoeren
    // zu genau diesem Profil.
    if (this.profilNetzCdp) {
      await this.profilNetzCdp.detach().catch(() => {});
      this.profilNetzCdp = null;
    }
    clearInterval(this.forschungPuls);
    this.forschungPuls = null;
    if (this.profilHilfsSeite) {
      const h = this.profilHilfsSeite;
      this.profilHilfsSeite = null;
      await h.close().catch(() => {});
    }
    this.profilBeitraege = null;
    this.profilSchichtStand = null;
    const seite = this.profilSeite;
    this.profilSeite = null;
    this.profilKennung = null;
    // Alle Profil-Tabs weg, nicht nur der zuletzt gemerkte.
    await this.profilTabsAufraeumen(null);
    // ... und wieder laufen lassen -- aber nur, wenn es vorher auch lief.
    // Hatte der Mitarbeiter das Reel selbst angehalten, bleibt es angehalten.
    if (PROFIL_HAELT_REEL_AN && seite && this.buehneSteht && this.reelDurchProfilAngehalten) {
      if (this.reelLiefVorProfil !== false) {
        await this.page.evaluate(() => window.__buehne.fortsetzen()).catch(() => null);
        console.log(`[profil] Reel laeuft wieder.`);
      } else {
        console.log(`[profil] Reel bleibt angehalten -- der Mitarbeiter hatte es selbst pausiert.`);
      }
      this.reelDurchProfilAngehalten = false;
    }
    if (seite) console.log(`[profil] session ${this.id}: geschlossen | Tabs offen: ${this.tabs()}`);
    await this.page.bringToFront().catch(() => {});
    return { ok: true };
  }

  // Alle Antworten auf einen Kommentar holen.
  //
  // Eine Handvoll liefert Instagram schon beim Lesen der Kommentare mit;
  // das hier ist fuer "alle ansehen". UNBEWIESEN (10.10.2026): die Adresse
  // dafuer ist nicht gemessen. Scheitert sie, bleibt die Vorschau stehen,
  // die ohnehin schon da ist -- es geht also nichts verloren, und im
  // Protokoll steht, was Instagram geantwortet hat.
  async antworten(reelId, kommentarId) {
    if (!this.buehneSteht) return { available: false, comments: [] };
    const bekannt =
      this.history.find((r) => r.id === reelId) ??
      this.pending.find((r) => r.id === reelId) ??
      this.katalog.get(reelId) ??
      null;
    if (!bekannt?.pk || !kommentarId) return { available: false, comments: [] };

    const erg = await this.page
      .evaluate(async ({ nr, kid }) => {
        try {
          const r = await fetch(`/api/v1/media/${nr}/comments/${kid}/child_comments/`, {
            headers: { "X-IG-App-ID": "936619743392459" },
            credentials: "include",
          });
          if (!r.ok) return { fehler: `HTTP ${r.status}` };
          const j = await r.json();
          const roh = Array.isArray(j?.child_comments) ? j.child_comments : [];
          return {
            ok: true,
            kommentare: roh
              .map((c) => ({
                id: String(c.pk ?? c.id ?? ""),
                username: c.user?.username ?? null,
                text: typeof c.text === "string" ? c.text : "",
                likeCount: typeof c.comment_like_count === "number" ? c.comment_like_count : null,
                postedAt: typeof c.created_at === "number" ? c.created_at : null,
                avatar: typeof c.user?.profile_pic_url === "string" ? c.user.profile_pic_url : null,
                verifiziert: c.user?.is_verified === true,
                gif: null,
              }))
              .filter((c) => c.text && c.username),
          };
        } catch (e) { return { fehler: String(e?.message ?? e) }; }
      }, { nr: bekannt.pk, kid: String(kommentarId) })
      .catch((e) => ({ fehler: String(e?.message ?? e) }));

    if (erg?.ok) {
      console.log(`[antworten] ${reelId}/${kommentarId}: ${erg.kommentare.length} geholt.`);
      return { available: true, comments: erg.kommentare };
    }
    console.log(`[antworten] ${reelId}/${kommentarId}: FEHLER ${erg?.fehler ?? "?"}`);
    return { available: false, comments: [], error: erg?.fehler ?? "Couldn't load the replies." };
  }

  // Einen echten Kommentar vom verbundenen Konto schreiben.
  //
  // Ueber dieselbe Adresse, ueber die wir die Kommentare auch LESEN -- aus
  // der Buehne heraus, mit deren Anmeldung. Der Weg ueber Instagrams
  // sichtbares Eingabefeld waere der andere, haette aber einen Haken: das
  // Kommentarfenster muesste drueben aufgehen, und der Mitarbeiter saehe es
  // mitten in seinem Bild.
  //
  // UNBEWIESEN (10.10.2026): Adresse und Kopfzeilen zum Schreiben sind
  // nicht gemessen, nur die zum Lesen. Deshalb schreibt die Antwort im
  // Fehlerfall auf, was Instagram zurueckgegeben hat -- dann steht es nach
  // EINEM Versuch im Protokoll.
  async kommentieren(reelId, text) {
    const sauber = String(text ?? "").trim();
    if (!sauber) return { posted: false, error: "There's nothing to post." };
    if (!this.buehneSteht) return { posted: false, error: "No reel is currently in view." };

    const bekannt =
      this.history.find((r) => r.id === reelId) ??
      this.pending.find((r) => r.id === reelId) ??
      this.katalog.get(reelId) ??
      null;
    if (!bekannt?.pk) return { posted: false, error: "Couldn't tell which reel this comment belongs to." };

    const erg = await this.page
      .evaluate(async ({ nr, text }) => {
        try {
          const csrf = document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? "";
          if (!csrf) return { fehler: "Kein csrftoken in der Sitzung gefunden." };
          const r = await fetch(`/api/v1/web/comments/${nr}/add/`, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "X-CSRFToken": csrf,
              "X-IG-App-ID": "936619743392459",
              "X-Requested-With": "XMLHttpRequest",
            },
            credentials: "include",
            body: new URLSearchParams({ comment_text: text }).toString(),
          });
          const roh = await r.text();
          let j = null;
          try { j = JSON.parse(roh); } catch { /* Instagram antwortete nicht mit Daten */ }
          if (!r.ok || j?.status === "fail") {
            return { fehler: `HTTP ${r.status}${j?.message ? ` -- ${j.message}` : ""}`, antwort: roh.slice(0, 300) };
          }
          const c = j?.comment ?? null;
          return {
            ok: true,
            // MESSUNG (10.10.2026): Der Kommentar ging nachweislich raus,
            // aber in der Antwort stand er nicht dort, wo ich ihn erwartet
            // habe -- deshalb erschien er nicht oben in der Liste. Hier die
            // tatsaechlichen Felder mitschreiben, dann muss es nicht
            // geraten werden.
            felder: j && typeof j === "object" ? Object.keys(j) : [],
            kommentar: c
              ? {
                  id: String(c.pk ?? c.id ?? Date.now()),
                  username: c.user?.username ?? null,
                  text: typeof c.text === "string" ? c.text : text,
                  likeCount: 0,
                  postedAt: typeof c.created_time === "number" ? c.created_time : Math.floor(Date.now() / 1000),
                  avatar: typeof c.user?.profile_pic_url === "string" ? c.user.profile_pic_url : null,
                  verifiziert: c.user?.is_verified === true,
                }
              : null,
          };
        } catch (e) { return { fehler: String(e?.message ?? e) }; }
      }, { nr: bekannt.pk, text: sauber })
      .catch((e) => ({ fehler: String(e?.message ?? e) }));

    if (erg?.ok) {
      console.log(`[kommentar] session ${this.id}: ${reelId} -- geschrieben.${erg.kommentar ? "" : ` Antwort trug keinen fertigen Kommentar; Felder: ${(erg.felder ?? []).join(", ") || "(keine)"}`}`);
      return { posted: true, comment: erg.kommentar };
    }
    console.log(`[kommentar] session ${this.id}: ${reelId} FEHLER ${erg?.fehler ?? "?"}${erg?.antwort ? ` | Antwort: ${erg.antwort}` : ""}`);
    return { posted: false, error: erg?.fehler ?? "Instagram didn't accept the comment." };
  }

  async follow() {
    if (this.buehneSteht) {
      const erg = await this.page.evaluate(() => window.__buehne.folgen()).catch((e) => ({ ok: false, fehler: e.message }));
      if (erg.ok) {
        console.log(`[folgen] session ${this.id}: im Tab gefolgt.`);
        return { following: true, inTab: true };
      }
      console.log(`[folgen] fallback auf die zweite Seite: ${erg.fehler}`);
    }
    const { reel, fehler } = await this.handlungsZiel();
    if (fehler) return { following: false, error: fehler };
    if (!reel) return { following: false, error: "No reel is currently in view." };

    const followPage = await this.nebenseite();
    let result;
    try {
      await followPage.goto(reel.sourceUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await sleep(2000);
      result = await FOLLOW_HANDLER[this.platform](followPage);
    } catch (err) {
      result = { following: false, error: err?.message ?? "Something went wrong while following this creator." };
    } finally {
      await followPage.close().catch(() => {});
    }

    return result;
  }

  async block() {
    const { reel, fehler } = await this.handlungsZiel();
    if (fehler) return { blocked: false, error: fehler };
    // Blocken braucht den Namen, nicht nur den Reel-Code -- ohne Namen gibt
    // es kein Profil, das man blocken koennte.
    if (!reel || !reel.username) return { blocked: false, error: "No reel is currently in view." };

    const profileUrl = this.platform === "instagram"
      ? `https://www.instagram.com/${reel.username}/`
      : `https://www.tiktok.com/@${reel.username}`;

    const blockPage = await this.nebenseite();
    let result;
    try {
      await blockPage.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await sleep(2000);
      result = await BLOCK_HANDLER[this.platform](blockPage);
    } catch (err) {
      result = { blocked: false, error: err?.message ?? "Something went wrong while blocking this creator." };
    } finally {
      await blockPage.close().catch(() => {});
    }

    return result;
  }

  // Read-only, on-demand only (see the web app's CommentsPanel — it only
  // calls this once the VA has stayed on a reel for a few seconds with the
  // panel open, never for every reel while scrolling). A real, separate
  // page in the same authenticated context, exactly like like()/follow()/
  // block() above — the live Reels/For-You tab's own scroll position is
  // never touched. `reelId`/`sourceUrl` come from the client's own
  // already-known current reel rather than this.current(), so a slow
  // fetch that resolves after the VA has already moved on can't silently
  // attach comments to the wrong reel — the client checks the id itself.
  async comments(reelId, sourceUrl, abMarke, sortierung) {
    if (!sourceUrl) return { available: false, comments: [] };

    // SCHNELLER WEG (09.10.2026, Emres Idee): Kommentare ueber Instagrams
    // eigene Adresse holen, genauso wie die Aufrufzahl -- statt eine zweite
    // Seite zu oeffnen und deren Text abzulesen.
    //
    // Das Oeffnen kostet mehrere Sekunden und ist der letzte Punkt, an dem
    // wir uns anders verhalten als ein Mensch. Die Anfrage laeuft dagegen
    // aus der Buehne selbst, mit deren Anmeldung, und bringt die Kommentare
    // als saubere Daten statt als abgelesenen Bildschirmtext.
    //
    // Klappt sie nicht, bleibt der alte Weg darunter unveraendert stehen.
    // Der schnelle Weg braucht zweierlei: Instagrams Nummer zum Reel und
    // eine stehende Buehne. Beides ist beim Sitzungsstart einen Moment lang
    // noch nicht da -- und genau dann sprang frueher sofort der alte
    // Ableseweg ein. Der liefert Kommentare ohne Profilbild, ohne Alter und
    // ohne Nachladen; beim ersten Reel einer Sitzung sah man das (von Emre
    // am 10.10.2026 gemeldet).
    //
    // Jetzt wird gewartet, statt etwas Schlechteres zu tun. Erst wenn nach
    // 15 Sekunden immer noch nichts da ist, greift der alte Weg -- so von
    // Emre festgelegt.
    const KOMMENTARE_FRIST_MS = 15_000;
    const warte = (ms) => new Promise((r) => setTimeout(r, ms));
    const nachschlagen = () =>
      this.history.find((r) => r.id === reelId) ??
      this.pending.find((r) => r.id === reelId) ??
      this.katalog.get(reelId) ??
      null;

    let bekannt = nachschlagen();
    if (!bekannt?.pk || !this.buehneSteht) {
      const beginn = Date.now();
      while ((!bekannt?.pk || !this.buehneSteht) && Date.now() - beginn < KOMMENTARE_FRIST_MS) {
        await warte(150);
        bekannt = nachschlagen();
      }
      const gedauert = Date.now() - beginn;
      if (bekannt?.pk && this.buehneSteht) {
        console.log(`[kommentare] ${reelId}: ${gedauert}ms gewartet, dann schneller Weg.`);
      } else {
        console.log(`[kommentare] ${reelId}: nach ${gedauert}ms immer noch nichts (pk=${bekannt?.pk ?? "fehlt"}, buehneSteht=${this.buehneSteht}) -- alter Ableseweg.`);
      }
    }
    // "For you" ist Instagrams Normalfall -- ohne Zusatz. Die beiden
    // anderen bekommen einen Zusatz mit; ob Instagram genau darauf hoert,
    // ist noch nicht gemessen (siehe Hinweis weiter unten).
    const sortParam =
      sortierung === "neueste" ? "sort_order=recent" :
      sortierung === "meta-verified" ? "sort_order=meta_verified" :
      null;

    if (bekannt?.pk && this.buehneSteht) {
      const schnell = await this.page
        .evaluate(async ({ nr, abMarke, sortParam }) => {
          try {
            // Instagram gibt zu jeder Antwort eine Marke mit, ab der die
            // naechsten Kommentare beginnen. Damit laesst sich beim Scrollen
            // nachladen, genau wie Instagram es selbst tut (09.10.2026).
            const teile = [];
            // Ohne diesen Zusatz liefert Instagram zu einem Kommentar KEINE
            // Antworten mit -- ein Kommentar mit 29 Antworten kam bei uns
            // ohne eine einzige an (10.10.2026 von Emre an gregoryisbored
            // nachgewiesen). Instagrams eigene Seite schickt ihn mit.
            // UNBEWIESEN, dass genau das die Ursache ist: direkt darunter
            // schreibt der Aufrufer mit, welche Felder wirklich ankommen.
            teile.push("can_support_threading=true");
            if (abMarke) teile.push(`min_id=${encodeURIComponent(abMarke)}`);
            // Instagrams eigene Sortierung. "For you" ist der Normalfall und
            // braucht keinen Zusatz -- genau das holen wir schon immer.
            // BELEGT am 10.10.2026, gleiches Reel, Sekunden auseinander:
            // For you brachte 5 von 15 Kommentaren mit blauem Haken,
            // Meta Verified 12 von 12. Newest liefert sichtbar die
            // juengsten. Alle drei wirken also wirklich.
            // Beim Nachladen gilt das nur, solange Instagram noch passende
            // hat -- danach fuellt es mit gewoehnlichen auf.
            if (sortParam) teile.push(sortParam);
            const adresse = `/api/v1/media/${nr}/comments/${teile.length ? `?${teile.join("&")}` : ""}`;
            const r = await fetch(adresse, {
              headers: { "X-IG-App-ID": "936619743392459" },
              credentials: "include",
            });
            if (!r.ok) return { fehler: `HTTP ${r.status}` };
            const j = await r.json();
            const roh = Array.isArray(j?.comments) ? j.comments : [];

            // GIF-Kommentare: Instagram legt das Bild unter giphy_media_info
            // ab und laesst text leer (10.10.2026 gemessen -- vorher sind
            // diese Kommentare stillschweigend verschwunden). Giphy benennt
            // seine Groessen je nach Antwort unterschiedlich, deshalb der
            // Reihe nach durchprobieren.
            const gifAus = (g) => {
              if (!g || typeof g !== "object") return null;
              const b = g.images ?? g.image ?? null;
              const kandidaten = [
                b?.fixed_height?.webp, b?.fixed_height?.url,
                b?.fixed_height_downsampled?.webp, b?.fixed_height_downsampled?.url,
                b?.downsized?.url, b?.fixed_width?.webp, b?.fixed_width?.url,
                b?.original?.webp, b?.original?.url,
                g.url, g.gif_url,
              ];
              for (const k of kandidaten) if (typeof k === "string" && k.startsWith("http")) return k;
              return null;
            };
            // Ein Kommentar in unsere Form bringen -- fuer Kommentare UND
            // fuer Antworten darauf, die genauso aufgebaut sind.
            const machKommentar = (c) => ({
              id: String(c.pk ?? c.id ?? ""),
              username: c.user?.username ?? null,
              text: typeof c.text === "string" ? c.text : "",
              likeCount: typeof c.comment_like_count === "number" ? c.comment_like_count : null,
              postedAt: typeof c.created_at === "number" ? c.created_at : null,
              // Das Profilbild liegt der Antwort bei und wurde hier
              // frueher einfach weggeworfen (10.10.2026, Emres Frage).
              // Die Adresse ist befristet wie alle Instagram-Bilder --
              // fuer die laufende Sitzung reicht das, denn die Kommentare
              // werden ohnehin nur jetzt angezeigt und nicht archiviert.
              avatar: typeof c.user?.profile_pic_url === "string" ? c.user.profile_pic_url : null,
              // Das blaue Haekchen. Liegt derselben Antwort bei und macht
              // ueberhaupt erst nachpruefbar, wen Instagram bei
              // "Meta Verified" zurueckgibt (10.10.2026, Emres Einwand:
              // ohne Haeckchen laesst sich nicht beweisen, dass der
              // Filter wirklich greift).
              verifiziert: c.user?.is_verified === true,
              gif: gifAus(c.giphy_media_info),
            });

            return {
              naechste: typeof j?.next_min_id === "string" ? j.next_min_id : null,
              // Keine eigene Obergrenze: Instagram bestimmt selbst, wie
              // viele es pro Antwort schickt. Hier stand frueher
              // slice(0, 30) -- das warf weg, was schon da war, und holte
              // es beim Scrollen ein zweites Mal (09.10.2026).
              kommentare: roh.map((c) => ({
                ...machKommentar(c),
                // Antworten auf diesen Kommentar. Eine Handvoll schickt
                // Instagram in derselben Antwort mit (preview_child_comments)
                // -- die kosten nichts. Wie viele es insgesamt sind, steht
                // in child_comment_count; fehlt das Feld, nehmen wir die
                // Vorschau als Anzahl, statt eine zu erfinden.
                antworten: Array.isArray(c.preview_child_comments)
                  ? c.preview_child_comments.map(machKommentar).filter((a) => (a.text || a.gif) && a.username)
                  : [],
                antwortenAnzahl:
                  typeof c.child_comment_count === "number"
                    ? c.child_comment_count
                    : (Array.isArray(c.preview_child_comments) ? c.preview_child_comments.length : 0),
              })).filter((c) => (c.text || c.gif) && c.username),
              // MESSUNG (10.10.2026, Emres Frage nach GIFs): Kommentare
              // OHNE Text werfen wir hier weg. Ein GIF-Kommentar hat
              // vermutlich genau das -- kein Text, dafuer ein Bild in einem
              // Feld, dessen Namen wir nicht kennen. Hier die Feldnamen
              // solcher Kommentare mitschreiben, dann steht nach EINEM
              // Durchlauf im Protokoll, wo das GIF steckt.
              // Bleibt als Messung drin, aber enger: nur noch Kommentare,
              // die weder Text NOCH ein erkanntes GIF haben. Dann steht im
              // Protokoll, was uns sonst noch entgeht.
              // MESSUNG (10.10.2026): Welche Felder tragen die Kommentare
              // wirklich? Nur so laesst sich sehen, ob die Antworten jetzt
              // mitkommen -- und unter welchem Namen.
              felderProbe: roh.slice(0, 1).map((c) => Object.keys(c).filter((k) => /child|thread|repl/i.test(k)).join(",") || "(keine Antwort-Felder)"),
              ohneInhalt: roh
                .filter((c) => c.user?.username && !(typeof c.text === "string" && c.text) && !gifAus(c.giphy_media_info))
                .slice(0, 2)
                .map((c) => (c.giphy_media_info ? `GIF unbekannt: ${JSON.stringify(c.giphy_media_info).slice(0, 300)}` : Object.keys(c).join(","))),
            };
          } catch (e) { return { fehler: String(e?.message ?? e) }; }
        }, { nr: bekannt.pk, abMarke, sortParam })
        .catch((e) => ({ fehler: String(e?.message ?? e) }));
      // Wichtig: "keine Kommentare" ist kein Fehlschlag. Ein Reel ohne
      // Kommentare liefert eine leere Liste -- faellt man darauf zurueck,
      // oeffnet ReelForge eine zweite Seite fuer nichts. Nur ein echter
      // Fehler fuehrt zum alten Weg (Emres Einwand, 09.10.2026).
      if (Array.isArray(schnell?.kommentare)) {
        // MESSUNG (10.10.2026): die ersten Nummern mitschreiben. Nur daran
        // laesst sich sehen, ob eine andere Sortierung wirklich eine andere
        // Reihenfolge bringt -- oder ob Instagram den Zusatz ignoriert.
        const erste = schnell.kommentare.slice(0, 3).map((k) => k.id).join(",");
        const haken = schnell.kommentare.filter((k) => k.verifiziert).length;
        const mitAntworten = schnell.kommentare.filter((k) => (k.antwortenAnzahl ?? 0) > 0).length;
        console.log(`[kommentare] ${reelId}: ${mitAntworten} mit Antworten | Antwort-Felder am ersten Kommentar: ${(schnell.felderProbe ?? []).join(" | ")}`);
        const mitGif = schnell.kommentare.filter((k) => k.gif).length;
        if (mitGif) console.log(`[kommentare] ${reelId}: davon ${mitGif} mit GIF.`);
        if (schnell.ohneInhalt?.length) {
          console.log(`[kommentare] ${reelId}: ${schnell.ohneInhalt.length} Kommentar(e) ohne Text und ohne erkennbares GIF weggelassen -- ${schnell.ohneInhalt.join(" || ")}`);
        }
        console.log(`[kommentare] ${reelId}: ${schnell.kommentare.length} ueber die Adresse geholt${schnell.naechste ? ", weitere vorhanden" : ""} | sortierung=${sortierung ?? "fuer-dich"} | verifiziert=${haken}/${schnell.kommentare.length} | erste=${erste}`);
        return { available: true, comments: schnell.kommentare, reelId, naechste: schnell.naechste ?? null };
      }

      // Scheitert es MIT Sortierung, liegt es sehr wahrscheinlich am
      // unbewiesenen Zusatz. Dann lieber einmal ohne ihn nachfragen, als
      // eine zweite Instagram-Seite zu oeffnen -- das kostet Sekunden.
      if (sortParam) {
        console.log(`[kommentare] ${reelId}: mit sortierung=${sortierung} fehlgeschlagen (${schnell?.fehler ?? "?"}) -- einmal ohne Sortierung.`);
        const ohne = await this.comments(reelId, sourceUrl, abMarke, null);
        return { ...ohne, sortierungUnwirksam: true };
      }

      console.log(`[kommentare] ${reelId}: schneller Weg fehlgeschlagen (${schnell?.fehler ?? "?"}) -- zweite Seite wird geoeffnet.`);
    }

    // Real network sniffing (four live attempts) never found a
    // "/comment"-named endpoint, and every GraphQL response seen turned out
    // to be ordinary feed/clips pagination -- Instagram's private API
    // shape for this isn't something worth continuing to guess at. This
    // reads whatever the VA would actually SEE instead: opens the same
    // real comments panel Like/Follow already click into on this exact
    // page, and diffs the page's own rendered text before vs. after
    // opening it. Whatever's new on screen IS the comments content by
    // definition, with zero assumption about Instagram's internal API or
    // DOM class names (which are obfuscated and rotate) -- the same
    // "trust only what's provably true, not what a click probably did"
    // rule Like/Follow already follow, just applied to reading instead of
    // clicking.
    const commentsPage = await this.nebenseite();
    try {
      await commentsPage.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await sleep(1500);

      const beforeText = await commentsPage.evaluate(() => document.body.innerText).catch(() => "");
      const openResult = await COMMENTS_OPEN_HANDLER[this.platform](commentsPage).catch(() => ({ found: false, clicked: false }));
      if (!openResult.found || !openResult.clicked) {
        return { available: false, comments: [] };
      }

      await sleep(3000);
      const afterText = await commentsPage.evaluate(() => document.body.innerText).catch(() => "");

      const beforeLines = new Set(beforeText.split("\n").map((l) => l.trim()).filter(Boolean));
      const newLines = afterText
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !beforeLines.has(l));

      const comments = parseCommentLines(newLines);

      // Going beyond this first batch was investigated and dropped: scrolling
      // the comment thread's own container -- even anchored to a DOM node
      // holding a real, already-extracted comment -- reliably surfaced
      // unrelated feed content (other reels' captions/like counts) instead of
      // more of the same thread, across two independent real reels; and no
      // stable native "load more comments" control (button/link, as opposed
      // to scroll-triggered pagination) was found in the opened panel either.
      // So this only ever returns the first batch that's already visible
      // when the panel opens -- typically 8-10 top-level comments in real
      // testing, occasionally fewer.
      if (comments.length === 0) return { available: false, comments: [] };
      return { available: true, comments: comments.slice(0, 50), reelId };
    } catch (err) {
      console.error(`[comments] reel ${reelId}: ${err?.message}`);
      return { available: false, comments: [], error: err?.message ?? "Couldn't load comments for this reel." };
    } finally {
      await commentsPage.close().catch(() => {});
    }
  }

  async close() {
    if (this.closed) return;
    if (this.beobachtung) clearInterval(this.beobachtung);
    this.closed = true;
    await this.browser.close().catch(() => {});
  }
}

async function startSession(accountId, token, lockSecret, modus) {
  // Diagnostic-only timing, no behavior change -- lets us see which of the
  // four real steps (Supabase session fetch, Chromium launch, page
  // navigation, first-reel polling) is actually slow on a given "Loading
  // your feed…" report, instead of guessing at a single timeout constant.
  const t0 = Date.now();
  const sessionRes = await fetch(FETCH_SESSION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, token }),
  });
  const sessionBody = await sessionRes.json().catch(() => ({}));
  if (!sessionRes.ok) {
    throw new Error(sessionBody.error ?? "Couldn't load this account's session.");
  }
  const { platform, storageState, seenReelIds } = sessionBody;
  if (!REEL_URL[platform]) throw new Error("This platform isn't supported for live research sessions yet.");
  console.log(`[timing] fetch-research-account-session: ${Date.now() - t0}ms`);
  console.log(`[session] account ${accountId}: seeding with ${seenReelIds?.length ?? 0} already-archived id(s)`);

  const t1 = Date.now();
  let browser;
  try {
    // Die zwei Schalter sind das, was V2 ueberhaupt erst moeglich macht:
    // ohne den ersten startet Instagram sein Video nur stumm, ohne den
    // zweiten fragt Chrome bei der Tab-Aufnahme nach einem Dialog, den in
    // einem unsichtbaren Browser niemand wegklicken kann.
    browser = await starteBrowser({ headless: true, args: BUEHNE_ARGS });
  } catch (err) {
    if (IS_MAC) {
      throw new Error("Research needs Google Chrome installed on this Mac. Install Chrome, then try again.");
    }
    throw err;
  }
  // Fenster in Reel-Form statt Schreibtischbreite: was aufgenommen wird, ist
  // genau dieses Fenster. Bei 1280x720 sass das Reel als Briefmarke in der
  // Mitte -- gemessen kam das Bild dann als 1280x520 heraus.
  const context = await browser.newContext({
    storageState, ...AUTOMATION_CONTEXT_OPTIONS, viewport: { ...BUEHNE_FENSTER },
  });
  console.log(`[timing] chromium launch + context: ${Date.now() - t1}ms`);

  // TikTok specifically: storageState is a frozen snapshot (captured at
  // login, only ever refreshed by an explicit Resync) — every new session
  // otherwise replays that exact same localStorage every time, and TikTok's
  // web client keeps its own feed-continuation state in there, so it just
  // resumes from the same pinned point instead of seeding a real fresh For
  // You feed (confirmed as the cause of "same first reel every session").
  // Login itself lives in cookies (see hasRealSession, connect-worker.mjs),
  // never localStorage, so clearing it can't affect being logged in.
  // Instagram doesn't show this symptom and isn't touched.
  if (platform === "tiktok") {
    await context.addInitScript(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {}
    });
  }

  const page = await context.newPage();

  const id = randomUUID();
  const secret = randomUUID();
  const session = new Session(id, secret, accountId, platform, token, lockSecret, browser, context, page, seenReelIds);
  sessions.set(id, session);
  console.log(`[session] started ${id} for account ${accountId} (${platform})`);
  // Nur im Entwicklungslauf von Nutzen: damit sich das Wischen von aussen
  // kontrolliert durchspielen laesst, statt es am Mausrad zu raten.
  console.log(`[session-zugang] id=${id} secret=${secret}`);

  const t2 = Date.now();
  try {
    await page.goto(REEL_URL[platform], { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (err) {
    sessions.delete(id);
    await browser.close().catch(() => {});
    throw new Error("Couldn't open the real Reels session. Check your internet connection and try again.");
  }
  console.log(`[timing] page.goto navigation: ${Date.now() - t2}ms`);

  // Steht der Account ueberhaupt noch zur Verfuegung? Bisher gab es dafuer
  // gar keine Pruefung: Bei einem gesperrten Account lief der Start normal
  // weiter, fand 20 Sekunden lang kein Reel und meldete dann "Instagram hat
  // kein abspielbares Reel geliefert" -- was nach einem technischen Problem
  // klingt, obwohl der Account das Problem ist.
  //
  // Zuerst die ADRESSE pruefen, denn Instagram leitet in diesen Faellen um,
  // und eine Adresse ist unabhaengig von der Sprache. Der Text dient nur als
  // zweites Netz und ist bewusst eng gehalten -- lieber eine Sperre
  // uebersehen als einen funktionierenden Start abwuergen.
  const zustand = await page
    .evaluate(() => {
      const weg = location.pathname + location.search;
      const txt = (document.body?.innerText ?? "").slice(0, 4000);
      return { weg, txt };
    })
    .catch(() => null);
  if (zustand) {
    const gesperrtWeg = /\/(challenge|accounts\/suspended|accounts\/disabled)/i.test(zustand.weg);
    // Bewusst nur Wendungen, in denen das KONTO vorkommt. Ein blosses
    // "eingeschraenkt" oder "restricted" steht auch mal in einer Caption
    // oder einem Kommentar -- und ein falscher Treffer wuerde einen
    // funktionierenden Start abwuergen. Lieber eine Sperre uebersehen.
    const gesperrtText = /(suspended your account|your account has been (disabled|restricted|suspended)|we (have )?restricted your account|dein konto wurde (gesperrt|deaktiviert|eingeschr(ä|ae)nkt)|wir haben dein konto gesperrt)/i.test(zustand.txt);
    const abgemeldet = /\/accounts\/login/i.test(zustand.weg);
    if (gesperrtWeg || gesperrtText) {
      console.error(`[zugang] Account gesperrt -- Adresse "${zustand.weg}"`);
      sessions.delete(id);
      await browser.close().catch(() => {});
      throw new Error("Account got restricted, please check your account.");
    }
    if (abgemeldet) {
      console.error(`[zugang] nicht angemeldet -- Adresse "${zustand.weg}"`);
      sessions.delete(id);
      await browser.close().catch(() => {});
      throw new Error("This account is signed out of Instagram. Reconnect it and try again.");
    }
  }

  const t3 = Date.now();
  let reel = null;
  if (modus === "V2") {
    // In V2 darf hier NICHTS gedrueckt werden. next() holt ueber
    // ensurePending ein ArrowDown -- in V1 war das noetig, um das erste Reel
    // in den Puffer zu bekommen. In V2 gibt es keinen Puffer, der
    // Mitarbeiter sieht Instagrams Feed direkt, und dieser eine Tastendruck
    // liess ihn auf Reel 2 starten. Sein Pfeil nach oben fuehrte dann zu
    // Reel 1, das er nie gesehen hatte, und von dort ging es nicht weiter
    // hoch -- so gefunden am 06.10.2026.
    //
    // Was Instagram beim Laden von selbst anzeigt, IST das erste Reel. Die
    // Angaben dazu holt sich der Kunde ueber buehne-aktuell, sobald die
    // Buehne steht.
    console.log(`[session] ${id}: V2 -- kein Vorspulen, der Feed bleibt, wo Instagram ihn geoeffnet hat.`);
  } else {
    ({ reel } = await session.next());
    console.log(`[timing] first-reel polling (session.next): ${Date.now() - t3}ms`);
    // Makes the first reel's real provenance independently checkable from the
    // log alone — this is a brand-new page.goto() + scroll on a fresh
    // browser/context created above, never a replay of any prior session's
    // history (each Session instance's history/pending/seenIds start empty).
    console.log(`[session] ${id} first reel: ${reel ? `${reel.id} ${reel.sourceUrl}` : "(none — feed returned nothing)"}`);
  }
  console.log(`[timing] startSession total: ${Date.now() - t0}ms`);
  return { session, reel };
}

// Sessions nobody is heartbeating anymore get closed — a VA who just closes
// the tab (crash, force-quit, navigated away) never leaves a real logged-in
// browser sitting open indefinitely without knowing it.
setInterval(() => {
  const now = Date.now();
  for (const session of sessions.values()) {
    if (!session.closed && now - session.lastHeartbeat > SESSION_TIMEOUT_MS) {
      console.log(`[session] ${session.id} (account ${session.accountId}) timed out (no heartbeat for ${SESSION_TIMEOUT_MS}ms) — closing, delivered ${session.history.length} reel(s) this session`);
      void session.close();
      sessions.delete(session.id);
    }
  }
}, 15000).unref();

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function requireSession(res, id, secret) {
  const session = sessions.get(id);
  if (!session || session.closed || session.secret !== secret) {
    json(res, 403, { error: "This research session has ended. Reopen the account to start a new one." });
    return null;
  }
  session.lastHeartbeat = Date.now();
  return session;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    json(res, 200, {});
    return;
  }

  try {
    if (req.method === "GET" && req.url === "/health") {
      // activeSessions lets the Connector's own updater (see lib.rs's
      // spawn_update_check) know whether it's safe to restart right now --
      // a genuine addition to what /health already reports, not a new
      // endpoint or a change to what any existing caller (the web app's own
      // checkHealth()) already does with this response. `updating` is the
      // reverse direction of the same idea: lib.rs posts to /update-status
      // (below) right before it actually starts installing an update it's
      // already decided is safe to install now, so the web app can show a
      // clear "Connector is updating" state instead of misreading the
      // restart that follows as a generic failure.
      json(res, 200, { ok: true, activeSessions: sessions.size, updating: connectorUpdating });
      return;
    }

    if (req.method === "POST" && req.url === "/update-status") {
      // Local-only signal from lib.rs, not from the web app -- no
      // sessionSecret to check, same trust level as this server itself
      // (both only ever bind 127.0.0.1). Never touches sessions/locks.
      const { updating } = await readBody(req);
      connectorUpdating = !!updating;
      console.log(`[update] connectorUpdating=${connectorUpdating}`);
      json(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && req.url === "/sessions") {
      const { accountId, token, lockSecret, modus } = await readBody(req);
      if (!accountId || !token) return json(res, 400, { error: "Missing required fields." });
      try {
        const { session, reel } = await startSession(accountId, token, lockSecret, modus);
        return json(res, 200, { sessionId: session.id, sessionSecret: session.secret, reel });
      } catch (err) {
        return json(res, 502, { error: err?.message ?? "Couldn't start a research session." });
      }
    }

    const match = req.url?.match(/^\/sessions\/([^/]+)\/(next|prev|like|follow|block|repost|kommentar|antworten|profil-oeffnen|profil-strom|profil-ton|profil-ton-antwort|profil-bedienen|profil-schliessen|comments|heartbeat|end|buehne|buehne-antwort|eingabe|buehne-zustand|buehne-aktuell|teilen-oeffnen|teilen-suchen|teilen-senden|teilen-schliessen)$/);
    if (req.method === "POST" && match) {
      const [, id, action] = match;
      const { sessionSecret, reelId, sourceUrl, sdp, art, aufbauId, wert, sortierung, breite, hoehe, anzeige, x, y } = await readBody(req);
      const session = requireSession(res, id, sessionSecret);
      if (!session) return;

      // --- Buehne (V2) ---
      if (action === "buehne") {
        const erg = await session.buehneStarten();
        return erg.ok ? json(res, 200, { angebot: erg.angebot, aufbauId: erg.aufbauId }) : json(res, 502, { error: erg.fehler });
      }
      if (action === "buehne-antwort") {
        if (!sdp) return json(res, 400, { error: "Missing sdp." });
        const erg = await session.buehneAntwort(sdp, aufbauId);
        return erg.fehler ? json(res, 502, { error: erg.fehler }) : json(res, 200, { ok: true });
      }
      if (action === "eingabe") {
        // MESSUNG (09.10.2026): Jede eintreffende Eingabe, bevor
        // irgendetwas damit passiert. Ohne das war nicht zu sehen, ob eine
        // Eingabe ueberhaupt ankam oder ReelForge sie schon vorher verwarf.
        console.log(`[eingabe->] ${art}`);
        const erg = await session.eingabe(art);
        if (!erg.ok) return json(res, 400, { error: erg.fehler });
        // Bewusst OHNE die Reel-Angaben: buehneAktuell wartet bis zu vier
        // Sekunden, falls Instagram die Daten noch nicht geschickt hat, und
        // ReelForge haelt den Wisch gesperrt, bis diese Antwort da ist.
        // Dadurch fuehlte sich das Weiterwischen gelegentlich an, als haenge
        // es -- obwohl der Bildstrom nachweislich ohne eine einzige Luecke
        // weiterlief (95 Messpunkte, 0 Einbrueche am 07.10.2026). Die
        // Angaben holt der Kunde ohnehin alle zwei Sekunden im Hintergrund.
        return json(res, 200, { ok: true });
      }
      if (action === "buehne-zustand") {
        return json(res, 200, await session.buehneZustand());
      }
      if (action === "buehne-aktuell") {
        return json(res, 200, await session.buehneAktuell());
      }

      if (action === "next") {
        const { reel } = await session.next();
        return json(res, 200, { reel, hasPrev: session.cursor > 0 });
      }
      if (action === "prev") {
        const reel = session.prev();
        return json(res, 200, { reel, hasPrev: session.cursor > 0 });
      }
      if (action === "like") {
        const result = await session.like();
        return json(res, 200, result);
      }
      if (action === "follow") {
        const result = await session.follow();
        if (!result.following) console.error(`[follow] session ${id} failed: ${result.error ?? "(no error message)"}`);
        return json(res, 200, result);
      }
      if (action === "block") {
        const result = await session.block();
        // Diagnostic-only, no behavior change -- block() already returns a
        // specific error string on failure, but nothing ever logged it, so
        // every failure looked identical from the outside ("Retry").
        if (!result.blocked) console.error(`[block] session ${id} failed: ${result.error ?? "(no error message)"}`);
        return json(res, 200, result);
      }
      if (action === "repost") {
        const result = await session.repost();
        if (!result.reposted) console.error(`[repost] session ${id} failed: ${result.error ?? "(no error message)"}`);
        return json(res, 200, result);
      }
      if (action === "kommentar") {
        const result = await session.kommentieren(reelId, wert);
        if (!result.posted) console.error(`[kommentar] session ${id} failed: ${result.error ?? "(no error message)"}`);
        return json(res, 200, result);
      }
      if (action === "profil-oeffnen") {
        const erg = await session.profilOeffnen(wert, breite, hoehe, anzeige);
        // Auch im Fehlerfall die Kennung mitgeben: nur damit kann die App
        // eine halb geoeffnete Seite drueben wieder schliessen lassen.
        return erg.ok ? json(res, 200, erg) : json(res, 502, { error: erg.fehler, lauf: erg.lauf ?? null });
      }
      if (action === "profil-strom") {
        res.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
          "X-Accel-Buffering": "no",
        });
        const lief = await session.profilStromStarten(res);
        if (!lief) { res.end(); return; }
        req.on("close", () => { void session.profilStromStoppen(); });
        return;
      }
      if (action === "profil-ton") {
        const erg = await session.profilTonStarten();
        return erg?.ok ? json(res, 200, erg) : json(res, 502, { error: erg?.fehler ?? "No audio." });
      }
      if (action === "profil-ton-antwort") {
        const erg = await session.profilTonAntwort(sdp);
        return erg?.ok ? json(res, 200, erg) : json(res, 502, { error: erg?.fehler ?? "No audio." });
      }
      if (action === "profil-bedienen") {
        const erg = await session.profilBedienen(art, x, y);
        return erg.ok ? json(res, 200, erg) : json(res, 502, { error: erg.fehler });
      }
      if (action === "profil-schliessen") {
        return json(res, 200, await session.profilSchliessen(wert));
      }
      if (action === "antworten") {
        const result = await session.antworten(reelId, wert);
        return json(res, 200, result);
      }
      if (action === "comments") {
        const result = await session.comments(reelId, sourceUrl, wert ?? null, sortierung ?? null);
        if (!result.available) console.error(`[comments] session ${id} unavailable for reel ${reelId ?? "(unknown)"}: ${result.error ?? "no comments response captured"}`);
        return json(res, 200, result);
      }
      // --- Teilen (09.10.2026) ----------------------------------------
      // Instagrams eigenes Teilen-Fenster, nachgebaut in ReelForge. Der
      // Mitarbeiter sieht Instagrams Seite nicht, sondern nur den Bildstrom
      // des Reels -- das Fenster muss also hier gezeichnet werden.
      //
      // Das Fenster bleibt drueben OFFEN, solange der Mitarbeiter darin
      // arbeitet. Anders ginge keine echte Suche: Oeffnen, Tippen, Lesen
      // und Schliessen dauert zusammen mehrere Sekunden -- viel zu lang,
      // um beim Tippen mitzukommen.
      //
      // Vier Schritte, bewusst getrennt, damit Lesen nie versehentlich
      // etwas verschickt: oeffnen, suchen, senden, schliessen.
      if (action.startsWith("teilen-")) {
        const schritt = action.slice("teilen-".length);
        const erg = await session.page
          .evaluate(async ({ schritt, ziel, text }) => {
            const warte = (ms) => new Promise((r) => setTimeout(r, ms));
            const klick = (el) => (el?.closest("button, [role='button'], div[role='button']") ?? el?.parentElement)?.click();
            const dlg = () => document.querySelector("div[role='dialog']");
            // Instagram baut Startliste und Suchtreffer unterschiedlich auf:
            // oben anklickbare Eintraege mit Bild, nach der Suche Zeilen mit
            // einem Auswahlfeld ("Radio selection").
            const zeileVon = (el) => {
              let n = el;
              for (let i = 0; i < 6 && n; i++) {
                n = n.parentElement;
                if (n && n.querySelector("img") && (n.innerText || "").trim()) return n;
              }
              return el.parentElement;
            };
            const zeilen = (d) => {
              const r = [...d.querySelectorAll("input[aria-label='Radio selection']")].map(zeileVon).filter(Boolean);
              return r.length ? r : [...d.querySelectorAll("div[role='button']")].filter((x) => x.querySelector("img"));
            };
            const lies = (el) => {
              const t = (el.innerText || "").trim().split("\n").map((x) => x.trim()).filter(Boolean);
              return { name: t[0] ?? "", kennung: t[1] ?? "", bild: el.querySelector("img")?.src ?? null };
            };
            const schliesse = () => {
              const d = dlg(); if (!d) return;
              const zu = [...d.querySelectorAll("svg[aria-label]")].find((x) => /close|schlie/i.test(x.getAttribute("aria-label") ?? ""));
              klick(zu);
            };
            const tippe = (feld, wert) => {
              const proto = feld.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
              Object.getOwnPropertyDescriptor(proto, "value").set.call(feld, wert);
              feld.dispatchEvent(new Event("input", { bubbles: true }));
            };

            if (schritt === "schliessen") { schliesse(); return { ok: true }; }

            // Noch zu? Dann aufmachen.
            if (!dlg()) {
              const teilenKnopf = [...document.querySelectorAll("svg[aria-label]")]
                .find((x) => /^share$|teilen/i.test(x.getAttribute("aria-label") ?? ""));
              if (!teilenKnopf) return { ok: false, fehler: "Instagram zeigt gerade keinen Teilen-Knopf." };
              klick(teilenKnopf);
              await warte(1600);
            }
            let d = dlg();
            if (!d) return { ok: false, fehler: "Das Teilen-Fenster ging nicht auf." };

            if (schritt === "oeffnen") {
              // Instagram rendert nur die ersten paar Kontakte und laedt den
              // Rest beim Scrollen nach.
              const roller = [...d.querySelectorAll("div")]
                .filter((x) => x.scrollHeight > x.clientHeight + 20)
                .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
              const gesammelt = new Map();
              const einsammeln = () => {
                for (const z of zeilen(d)) { const k = lies(z); if (k.name) gesammelt.set(`${k.name}|${k.kennung}`, k); }
              };
              einsammeln();
              if (roller) {
                for (let i = 0; i < 8 && gesammelt.size < 40; i++) {
                  roller.scrollTop = roller.scrollHeight;
                  await warte(650);
                  d = dlg(); if (!d) break;
                  einsammeln();
                }
              }
              return { ok: true, kontakte: [...gesammelt.values()].slice(0, 40) };
            }

            const suchfeld = d.querySelector("input");
            if (!suchfeld) return { ok: false, fehler: "Kein Suchfeld im Teilen-Fenster." };

            if (schritt === "suchen") {
              tippe(suchfeld, ziel);
              await warte(1800);
              d = dlg(); if (!d) return { ok: false, fehler: "Fenster ist zugegangen." };
              return { ok: true, kontakte: zeilen(d).map(lies).filter((x) => x.name).slice(0, 25) };
            }

            if (schritt === "senden") {
              // Immer frisch suchen, damit wirklich der Gemeinte getroffen
              // wird und nicht, was zufaellig noch in der Liste stand.
              tippe(suchfeld, ziel);
              await warte(2000);
              d = dlg();
              const treffer = zeilen(d);
              const passend = treffer.find((x) => (x.innerText || "").toLowerCase().includes(String(ziel).toLowerCase()));
              if (!passend) { return { ok: false, fehler: `Instagram findet "${ziel}" nicht.` }; }
              const wer = lies(passend);
              passend.click();
              await warte(900);
              d = dlg();
              if (text) {
                const feld = [...d.querySelectorAll("input,textarea")].find((i) => /write a message|nachricht/i.test(i.placeholder ?? ""));
                if (feld) { tippe(feld, text); await warte(400); d = dlg(); }
              }
              const sendKnopf = [...d.querySelectorAll("button, [role='button'], div[role='button']")]
                .find((b) => /^(send|senden)$/i.test((b.innerText || "").trim()));
              if (!sendKnopf) { return { ok: false, fehler: "Kein Senden-Knopf gefunden." }; }
              sendKnopf.click();
              await warte(2200);
              schliesse();
              return { ok: true, gesendet: true, an: wer };
            }

            return { ok: false, fehler: "unbekannter Schritt" };
          }, { schritt, ziel: reelId ?? "", text: wert ?? "" })
          .catch((e) => ({ ok: false, fehler: String(e?.message ?? e) }));
        console.log(`[teilen] ${schritt}: ${JSON.stringify(erg).slice(0, 220)}`);
        return json(res, erg.ok ? 200 : 502, erg);
      }

      if (action === "heartbeat") {
        return json(res, 200, { ok: true });
      }
      if (action === "end") {
        console.log(`[session] ${id} (account ${session.accountId}) ended explicitly, delivered ${session.history.length} reel(s) this session`);
        await session.close();
        sessions.delete(id);
        return json(res, 200, { ok: true });
      }
    }

    json(res, 404, { error: "Not found." });
  } catch (err) {
    json(res, 500, { error: err?.message ?? "Unexpected error." });
  }
});

// An update's restart kills the old Connector process and relaunches the
// new one almost immediately -- far faster than the OLD process's own
// orphaned session-server child can notice (it only polls for its parent's
// death every 4000ms, see PARENT_PID above) and free this exact port. Real
// testing of the update flow (see lib.rs's spawn_update_check) hit this
// directly: the new process's one and only listen() attempt landed on the
// still-held port, and with no error handler an unhandled 'error' event
// crashed this whole process outright -- leaving the freshly-updated
// Connector with no live session server at all, forever, since nothing
// here ever retried. Retrying for up to twice the old child's own poll
// interval is what actually recovers instead of crashing on this race.
function bindSessionServer(deadline) {
  function onError(err) {
    if (err.code === "EADDRINUSE" && Date.now() < deadline) {
      setTimeout(() => bindSessionServer(deadline), 500);
      return;
    }
    throw err;
  }
  server.once("error", onError);
  server.listen(PORT, "127.0.0.1", () => {
    server.removeListener("error", onError);
    console.log(`ReelForge Connector session server listening on 127.0.0.1:${PORT}`);
  });
}

bindSessionServer(Date.now() + 8000);
leichenWegraeumen();

// Wird der Connector beendet, waehrend noch eine Sitzung laeuft, blieben
// bisher offene Browser zurueck. Beim Beenden werden sie jetzt geschlossen.
//
// Was das NICHT loest: die Sperre des Accounts liegt bei Supabase und wird
// mit dem Anmelde-Token des Nutzers freigegeben, das hier gar nicht
// vorliegt. Faellt der Connector waehrend einer Sitzung weg, gilt der
// Account deshalb weiter als belegt, bis entweder die App "End Research"
// schickt oder die Pacht von fuenf Minuten ablaeuft. Genau das ist am
// 06.10.2026 bei einem Neustart waehrend laufender Sitzung passiert.
let beendetSich = false;
for (const zeichen of ["SIGINT", "SIGTERM"]) {
  process.on(zeichen, async () => {
    if (beendetSich) process.exit(0);
    beendetSich = true;
    console.log(`[beenden] ${zeichen}: ${sessions.size} laufende Sitzung(en) werden geschlossen.`);
    await Promise.allSettled([...sessions.values()].map((s) => s.close()));
    sessions.clear();
    server.close(() => process.exit(0));
    // Falls das Schliessen haengt, trotzdem gehen.
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
