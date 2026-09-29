// Der warme Rand, der eine Flaeche umreisst, ohne einen sichtbaren Strich zu
// ziehen. Er stammt aus dem Creativity Hub und stand dort ueber ein Jahr
// allein -- Emre hat ihn dort erkannt ("das ist das richtige Gold") und wollte
// ihn auf den uebrigen Seiten haben. Damit es genau ein Gold bleibt und nicht
// vier leicht verschiedene, steht er ab jetzt hier und wird ueberall von hier
// geholt, auch vom Hub selbst.
//
// Zwei Staerken, und der Unterschied ist Absicht:
//
//   GOLD_RING       fuer die grossen Flaechen -- Panels, Karten, alles, was
//                   fuer sich steht. Halber Punkt Rand auf 32 Prozent, dazu
//                   ein Hauch Schein.
//   GOLD_RING_SOFT  fuer die Werkzeugleiste -- Suchfelder, Chips, Pillen,
//                   Knoepfe. Die sitzen dicht beieinander und wirken bei der
//                   vollen Staerke wie umrandet statt umrissen.
export const GOLD_RING = "0 0 0 0.5px rgba(211,148,72,0.32), 0 0 10px rgba(211,148,72,0.08)";
export const GOLD_RING_SOFT = "0 0 0 0.5px rgba(211,148,72,0.22), 0 0 8px rgba(211,148,72,0.06)";
