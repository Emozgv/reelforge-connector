/** Woran eine Reel-Notiz haengt: an dem Reel selbst, nicht an der Zeile,
 *  in der es gerade steht.
 *
 *  Dasselbe Reel traegt im Haus verschiedene Kennungen -- im Research-Feed
 *  die Kennung seiner Feed-Zeile, in einer Collection die Kennung des
 *  Konzepts. Eine Notiz an einer dieser Kennungen waere an der STELLE
 *  festgemacht, nicht am Reel: wer dasselbe Video in der Collection
 *  oeffnet, saehe die Notiz aus dem Research nicht (Emre, 28.10.2026).
 *
 *  Die Adresse des Reels ist das, was ueberall gleich ist. Die Collections
 *  rechnen schon laenger damit: ob ein Reel bereits in einer Collection
 *  liegt, wird ueber genau diese Adresse entschieden. Hier gilt dieselbe
 *  Auskunft, nur etwas nachsichtiger geschrieben -- ohne www, ohne
 *  Anhaengsel hinter dem Fragezeichen, ohne Schraegstrich am Ende.
 *
 *  Kleingeschrieben wird NUR der Rechnername. Der Rest der Adresse traegt
 *  die Kennung des Reels, und die unterscheidet Gross- und Kleinschreibung
 *  ("DeWjKBxuN0P"). Sie kleinzuschreiben hiesse, zwei verschiedene Reels
 *  fuer dasselbe zu halten.
 *
 *  Ohne Adresse bleibt die eigene Kennung uebrig. Dann haengt die Notiz
 *  wie frueher an der Stelle, aber sie geht nicht verloren.
 */
export function reelSchluessel(video: { id: string; sourceUrl?: string | null }): string {
  const adresse = (video.sourceUrl ?? "").trim();
  if (!adresse) return video.id;
  try {
    const u = new URL(adresse);
    const wirt = u.hostname.replace(/^www\./i, "").toLowerCase();
    const pfad = u.pathname.replace(/\/+$/, "");
    return `${wirt}${pfad}`;
  } catch {
    // Keine vollstaendige Adresse -- dann wenigstens sauber abschneiden.
    return adresse.split("?")[0].split("#")[0].replace(/\/+$/, "");
  }
}
