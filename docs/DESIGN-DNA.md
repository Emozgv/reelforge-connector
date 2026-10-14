# ReelForge Design-DNA

Zum Mitnehmen in ein anderes Werkzeug (Retool o. ä.). Jeder Wert hier ist
aus dem laufenden Code ausgelesen, nicht aus einem Screenshot abgeleitet.

Stand: 14.10.2026. Quellen im Repo: `src/lib/panelLook.ts`,
`src/lib/goldRing.ts`, `src/lib/pageHeader.ts`, `src/components/shared/v3.tsx`,
`src/index.css`, `src/components/billing/BillingPage.tsx`.

> **Die Referenzseite ist Billing.** Wenn irgendwo unklar ist, wie etwas
> aussehen soll: so wie dort. Alle anderen Seiten wurden darauf gezogen.

---

## 1. Flächen — die Treppe

Nichts ist flach. Es gibt eine feste Reihenfolge von dunkel nach hell:

| Ebene | Wert | Wofür |
|---|---|---|
| Seite | `#020508` | der Grund der ganzen App |
| Panel | `linear-gradient(120deg, rgba(16,19,21,0.667) 0%, rgba(11,14,17,0.733) 100%)` | die großen Kästen |
| Karte / Feld im Panel | `#0d0d0f` | Kacheln, Eingaben, Zeilen |

**Ränder**

| Rand | Wert | Wofür |
|---|---|---|
| warm (Standard) | `#1a130b` | Panels und Kacheln |
| neutral | `#26262b` | Eingabefelder, Knöpfe, Schwebemenüs |
| Hover | `#2f2113` warm · `#3a3a40` neutral | |

**Radius:** Panel `11px` · Kachel `9px` · Knopf und Eingabe `6px` ·
Plakette `7px` · Statuspille `14px`

**Kein Schatten auf Panels.** Tiefe entsteht über die Treppe, nicht über
Schlagschatten. Ausnahme: Schwebemenüs `0 14px 36px rgba(0,0,0,0.55)`.

---

## 2. Farben

**Gold — die Marke.** Nur als Akzent, nie als Fläche.

| Rolle | Wert |
|---|---|
| Hauptgold | `#D39448` |
| helles Gold | `#EAC088` |
| Verlauf (Knöpfe, Avatare) | `linear-gradient(113.9deg, #EAC088 0%, #D39448 100%)` |
| Abschnittsüberschriften | `#f1a846` |

**Schrift**

| Rolle | Wert | Größe |
|---|---|---|
| Weiß / Überschriften | `#f5f5f5` | |
| Beschriftung | `#afb7c3` | 11–12 px |
| Hinweis | `#b9c0ca` | 10–11 px |
| Zeilentext | `#b8c0cb` | 12 px |
| gedämpft | `#8c877e` | 10–11 px |

**Signale — eine Farbe je Bedeutung, nicht mehr**

| Bedeutung | Wert |
|---|---|
| läuft / gut | `#63c07f` |
| Achtung | `#e0664f` |
| in Prüfung | `#5eb1ff` |
| besonders | `#c79bff` |

---

## 3. Schrift

- Fließtext: **Inter** (`--font-sans`)
- Serifen-Überschriften: **Fraunces** (`--font-serif`)
- Seitentitel: 32 px / 39 px, bold, `tracking -0.4px`, `#f2f0ef`
- Kürzel über dem Titel: 11 px, semibold, `tracking 0.06em`, GROSS, `#D39448`
- Unterzeile: 13 px / 19 px, `#8c877e`
- Abschnittstitel: 15 px semibold, `#f5f5f5`
- Abschnitts-Unterzeile: 11 px, `#8c877e`
- Große Zahlen: 24 px bold, `tracking -0.5px`, **zählen beim Erscheinen hoch**

---

## 4. Die Bausteine

### Zeichenfeld
Abgerundetes Quadrat mit Goldrahmen. Trägt jedes Zeichen.

```
Größe        38–40 px (Abschnittskopf) · 30–32 px (Zeilen)
Radius       0.26 × Größe, oder rund bei Kennzahlkacheln
Fläche       linear-gradient(140deg, rgba(211,148,72,0.10), rgba(211,148,72,0.035))
Rand         1px rgba(211,148,72,0.24)
Schein       0 0 14px rgba(211,148,72,0.085)  (nur wo "glanz")
Innenkante   inset 0 1px 0 rgba(255,221,180,0.07)
Zeichen      0.47 × Größe, Strichstärke 1.8, Farbe #D39448
```

### Abschnittskopf
Steht über **jedem** Abschnitt: Zeichenfeld 38 · Titel 15 px semibold ·
Unterzeile 11 px `#8c877e` · optional etwas rechtsbündig daneben.

### Plakette
Umrandet mit Schein — **nicht** massiv gefüllt.

```
Höhe 28 · Radius 7 · Innenabstand 11 · Schrift 12 px semibold
Fläche  rgba(<farbe>, 0.12)
Rand    1px rgba(<farbe>, 0.30)
Schein  0 0 10px rgba(<farbe>, 0.13)
Zeichen 12 px, Strichstärke 2, links in der Pille
```

Gold `255,190,41` · Blau `59,146,255` · Violett `167,106,255` ·
Grün `99,192,127` · Grau `255,255,255` bei 0.045 / 0.11 / 0.05

### Statuspille
Wie die Plakette, aber Radius 14 und mit leuchtendem Punkt davor
(`6px`, `box-shadow 0 0 6px <farbe>`).

### Knöpfe

```
Gold    Höhe 33 · Radius 6 · 11 px semibold · Text #020508
        linear-gradient(113.9deg,#EAC088,#D39448), Rand #D39448
        inset 0 1px 3px rgba(255,236,206,0.3) + 0 0 18px rgba(211,148,72,0.28)
Rahmen  Höhe 33 · Radius 6 · 11 px · Text #f2f0ef
        Fläche #17171a, Rand #26262b, Hover #3a3a40
```

### Tabellen

```
Kopfzeile  34–40 hoch, 9.5–11.5 px, Farbe #8c877e, Trennlinie #1a130b
Zeile      52–58 hoch, Trennlinie #15100a
Name       13 px medium #f5f5f5 · darunter 11 px #8c877e
Avatar     30–36 px rund
aktive Zeile  linear-gradient(90deg, rgba(211,148,72,0.075), rgba(211,148,72,0.02))
              + inset 0 0 0 1px rgba(211,148,72,0.38), Radius 9
```

---

## 5. Rahmen und Abstände

```
Seitenrahmen   max-width 1900, Innenabstand 24 (ab XL 32), oben/unten 32
Abstand Abschnitt zu Abschnitt   13–14
Panel-Innenabstand   17–18
Kachel-Innenabstand  px 14 / py 13
```

---

## 6. Bewegung

- Abschnitte blenden beim Öffnen **nacheinander** auf: 70 ms Versatz je
  Abschnitt, 520 ms Dauer, `cubic-bezier(0.22,1,0.36,1)`, dazu 10 px von
  unten.
- Übergänge bei Farbe und Rand: 150 ms.
- **Wer im Betriebssystem weniger Bewegung eingestellt hat, bekommt alles
  sofort und ohne Bewegung.** Das ist keine Spielerei, sondern eine
  Einstellung, die Leute aus gutem Grund setzen.

---

## 7. Drei Regeln, die mehr wert sind als jede Zahl

1. **Kein Weichzeichner** (`backdrop-filter`). Zweimal versucht, zweimal
   ist die Seite dabei eingebrochen — er muss bei jedem Bild neu rechnen.
   Tiefe kommt aus der Flächen-Treppe, nicht aus Unschärfe.

2. **Eine Farbe je Bedeutung.** Nicht drei Grün für „läuft". Wenn eine
   zweite Variante nötig scheint, ist meist die Bedeutung unklar, nicht
   die Farbe.

3. **Gold nur als Akzent.** Flächen bleiben neutral schwarz. Warm wird es
   über Ränder, Zeichen und den einen goldenen Knopf — nie über die
   Grundfläche.
