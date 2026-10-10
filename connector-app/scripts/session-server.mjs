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
const BUEHNE_ARGS = ["--autoplay-policy=no-user-gesture-required"];
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
    if (text) comments.push({ id: `${username}-${i}`, username, text, postedAt: null, likeCount });
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
  async comments(reelId, sourceUrl, abMarke) {
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
    const bekannt =
      this.history.find((r) => r.id === reelId) ??
      this.pending.find((r) => r.id === reelId) ??
      this.katalog.get(reelId) ??
      null;
    if (bekannt?.pk && this.buehneSteht) {
      const schnell = await this.page
        .evaluate(async ({ nr, abMarke }) => {
          try {
            // Instagram gibt zu jeder Antwort eine Marke mit, ab der die
            // naechsten Kommentare beginnen. Damit laesst sich beim Scrollen
            // nachladen, genau wie Instagram es selbst tut (09.10.2026).
            const adresse = abMarke
              ? `/api/v1/media/${nr}/comments/?min_id=${encodeURIComponent(abMarke)}`
              : `/api/v1/media/${nr}/comments/`;
            const r = await fetch(adresse, {
              headers: { "X-IG-App-ID": "936619743392459" },
              credentials: "include",
            });
            if (!r.ok) return { fehler: `HTTP ${r.status}` };
            const j = await r.json();
            const roh = Array.isArray(j?.comments) ? j.comments : [];
            return {
              naechste: typeof j?.next_min_id === "string" ? j.next_min_id : null,
              // Keine eigene Obergrenze: Instagram bestimmt selbst, wie
              // viele es pro Antwort schickt. Hier stand frueher
              // slice(0, 30) -- das warf weg, was schon da war, und holte
              // es beim Scrollen ein zweites Mal (09.10.2026).
              kommentare: roh.map((c) => ({
                id: String(c.pk ?? c.id ?? ""),
                username: c.user?.username ?? null,
                text: typeof c.text === "string" ? c.text : "",
                likeCount: typeof c.comment_like_count === "number" ? c.comment_like_count : null,
                postedAt: typeof c.created_at === "number" ? c.created_at : null,
              })).filter((c) => c.text && c.username),
            };
          } catch (e) { return { fehler: String(e?.message ?? e) }; }
        }, { nr: bekannt.pk, abMarke })
        .catch((e) => ({ fehler: String(e?.message ?? e) }));
      // Wichtig: "keine Kommentare" ist kein Fehlschlag. Ein Reel ohne
      // Kommentare liefert eine leere Liste -- faellt man darauf zurueck,
      // oeffnet ReelForge eine zweite Seite fuer nichts. Nur ein echter
      // Fehler fuehrt zum alten Weg (Emres Einwand, 09.10.2026).
      if (Array.isArray(schnell?.kommentare)) {
        console.log(`[kommentare] ${reelId}: ${schnell.kommentare.length} ueber die Adresse geholt${schnell.naechste ? ", weitere vorhanden" : ""}.`);
        return { available: true, comments: schnell.kommentare, reelId, naechste: schnell.naechste ?? null };
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

    const match = req.url?.match(/^\/sessions\/([^/]+)\/(next|prev|like|follow|block|comments|heartbeat|end|buehne|buehne-antwort|eingabe|buehne-zustand|buehne-aktuell|teilen-oeffnen|teilen-suchen|teilen-senden|teilen-schliessen)$/);
    if (req.method === "POST" && match) {
      const [, id, action] = match;
      const { sessionSecret, reelId, sourceUrl, sdp, art, aufbauId, wert } = await readBody(req);
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
      if (action === "comments") {
        const result = await session.comments(reelId, sourceUrl, wert ?? null);
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
