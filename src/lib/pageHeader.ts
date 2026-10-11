// Der Seitenkopf -- eine Regel fuer alle Hauptseiten.
//
// Vorher hatte jede Seite ihre eigenen Werte: Unterzeilen in 12,5 / 13 / 14
// Punkt, mal 5 mal 6 Punkt Abstand darunter, und Research Accounts setzte
// sein Kuerzel in einen Kasten mit eigenem Aussenabstand. Beim Wechsel
// zwischen den Reitern sprang der Kopf dadurch senkrecht (Emre, 11.10.2026).
//
// Wer eine neue Hauptseite baut, nimmt diese vier Zeilen -- dann sitzt sie
// automatisch richtig.
//
// NICHT enthalten ist der waagerechte Rahmen: Research Accounts hat bewusst
// eine engere Maximalbreite und groessere Seitenraender, weil seine drei
// Spalten sonst auseinanderlaufen. Das anzufassen waere ein Umbau dieser
// Seite, kein Abstandsthema.
export const KOPF_RAHMEN = "mx-auto w-full max-w-[1900px] px-6 xl:px-8 pt-8 pb-8";

/** Das kleine goldene Kuerzel ueber der Ueberschrift. */
export const KOPF_KUERZEL = "block text-[11px] font-semibold tracking-[0.06em] uppercase text-[#D39448]";

/** Die Ueberschrift der Seite. */
export const KOPF_TITEL = "mt-[5px] text-[32px] leading-[39px] font-bold tracking-[-0.4px] text-[#f2f0ef]";

/** Die Zeile unter der Ueberschrift -- nur Groesse und Abstand.
 *  Die FARBE bleibt bewusst bei der jeweiligen Seite: sie war schon vorher
 *  unterschiedlich, und sie mitzuvereinheitlichen war nicht gewuenscht. */
export const KOPF_UNTERZEILE = "mt-1.5 text-[13px] leading-[19px]";

/** Der Abstand vom Kopf zum ersten Inhaltsblock. */
export const KOPF_ABSTAND = "mt-6";
