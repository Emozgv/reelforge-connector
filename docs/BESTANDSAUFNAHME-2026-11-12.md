# ReelForge Workspace (Client OS) – Bestandsaufnahme zum 12. November 2026

Diese Übergabe beschreibt das Produkt so, wie es tatsächlich gebaut ist, nicht so, wie es geplant war. Sie ist für die gemeinsame Planung mit einem externen Produktpartner gedacht und soll ohne weiteren Kontext lesbar sein.

## Wie dieses Dokument entstanden ist und wie man es liest

**Grundlage.** Der Programmcode des Workspace (Stand des Hauptzweigs vom 28. Oktober 2026, 364 Änderungsschritte seit dem 22. August 2026), der Code der Begleit-App „ReelForge Connector“, die drei Dokumente im Projektordner (`docs/ROADMAP.md`, `docs/STABLE_BASELINE.md`, `docs/DESIGN-DNA.md`), die tatsächliche Datenbank im Supabase-Projekt (Tabellen, Spalten, Serverfunktionen, Zeilenzahlen), die Preisliste in der Datenbank, der aktuelle Download-Stand des Connectors (Version 0.1.46 vom 15. Oktober 2026) und die über Monate gesammelten Entscheidungs-Notizen aus der Zusammenarbeit zwischen Emre und mir.

**Kennzeichnung.** Alles ohne Zusatz ist im Code oder in der Datenbank nachgelesen. **[Vermutung]** heißt: aus Namen, Kommentaren oder dem Fehlen von etwas geschlossen, nicht ausgeführt und geprüft. **[Empfehlung]** heißt: meine Einschätzung, keine Entscheidung von Emre. **[Entscheidung Emre, Datum]** heißt: so wurde es bewusst festgelegt und soll nicht als Fehler gelesen werden.

**Zustandsbegriffe für Funktionen** (durchgehend gleich verwendet):

- **FERTIG** – Ende-zu-Ende an echte Daten angeschlossen, im Alltag benutzt.
- **TEILWEISE** – funktioniert, aber mit benannten Lücken oder nur unter Bedingungen.
- **NUR OBERFLÄCHE** – wird angezeigt, tut aber nichts oder zeigt feste Texte.
- **FEHLT** – in Roadmap oder Oberfläche angekündigt, nicht gebaut.

**Nicht Teil dieses Dokuments.** Die beiden Schwesterprodukte „ReelForge Internal“ und „Sydney Studio Internal“ (Desktop-Apps für die Produktionsseite) werden nur dort erwähnt, wo sie mit dem Workspace zusammenhängen (Abschnitt 3.5 und 7.6). Ebenso die Caption-Rekonstruktion, der Text Remover und die Internal-Releases von heute: alles Internal, nicht Workspace.

---

## 1. Produktvision und Zielgruppe

### 1.1 Was ReelForge Workspace ist

ReelForge Workspace (im Code und in Gesprächen auch „Client OS“) ist die Kundenseite von ReelForge. ReelForge produziert für Agenturen, die Creator-Konten betreuen, KI-generierte Kurzvideos (Reels) nach echten Vorbildern. Der Workspace ist der Ort, an dem die Agentur diese Vorbilder findet, sammelt, einem Creator zuordnet, zur Produktion gibt, den Fortschritt verfolgt und die fertigen Videos entgegennimmt.

Die festgehaltene Leitidee aus der Roadmap, wörtlich: *„Das Portal soll langfristig die komplette Kundenseite von ReelForge werden. Nicht einfach ein Research-Tool.“* Und als Kette: *Research → Save → Organize → Select Creator → Send to ReelForge → Production → QC → Delivery → Feedback → Store.* Ziel ist, dass die Agentur für diesen Ablauf kein Telegram mehr braucht.

Der Satz, der in der Roadmap als Leitplanke über allem steht: *„ReelForge should remove decisions and work from the client, not give them another complicated tool to manage. Das Portal darf niemals zu einem neuen ClickUp werden. Der Kunde soll denken: ‚Alter, Content ist jetzt einfach.‘“*

### 1.2 Welches Problem gelöst wird

Vor dem Workspace lief der Ablauf über Instagram, Link kopieren, Telegram-Gruppe, Rückfragen „für welches Model war das?“, „wie weit seid ihr?“. Der Workspace ersetzt das durch: ein Klick zum Speichern eines Reels am richtigen Creator, eine Sammlung als Produktionsauftrag, sichtbarer Produktionsstatus, Lieferung im selben System, Regenerationswunsch per Knopf statt Nachricht.

Dazu kommt die zweite, stärkere Idee aus der Roadmap: statt allgemeiner Suche eigene, auf Nischen trainierte Instagram-Research-Konten, deren echter Feed in ReelForge läuft. Das ist seit Oktober 2026 das Herzstück des Produkts (Abschnitt 2.4).

### 1.3 Für wen

- **Agenturen**, die ein oder mehrere Creator-Konten betreuen und regelmäßig Reels produzieren lassen. Jede Agentur hat einen eigenen Arbeitsbereich (Workspace) mit eigenem Login.
- **Rollen in der Agentur:** Owner, Manager und VA (virtuelle Assistenz, die Research macht). Bis zu fünf Teammitglieder zusätzlich zum Owner.
- **ReelForge selbst** als Betreiber: ein eigener Admin-Bereich für alle Agenturen, Pakete, Status, Bonus-Kontingente.
- **Sydney Studio** als zweite, private Produktionsstelle, die am selben Workspace hängt (Abschnitt 3.5).

### 1.4 Preismodell, wie es heute in der Datenbank steht

Pläne gelten **pro Creator**, nicht pro Agentur. Enterprise ist der Pool für Agenturen mit mehreren Creatorn und wird nur von ReelForge vergeben. Preise in US-Dollar, Stand Datenbank 12. November 2026:

| Stufe | Bezeichnung | Preis | Reels pro Monat | Über Stripe kaufbar |
|---|---|---|---|---|
| Trial | Trial | 25 einmalig | 5 | ja (als Zusatzpreis) |
| S | Starter | 89 / Monat | 25 | ja |
| M | Growth | 179 / Monat | 60 | ja |
| L | Scale | 299 / Monat | 120 | ja |
| Enterprise | Enterprise | auf Anfrage | individuell | nein, nur durch ReelForge |

Zusatzpreise: Creator-Einrichtung 49 einmalig (wird beim ersten Abo automatisch mitberechnet), Regenerations-Pakete 5 Stück für 20, 10 für 35, 25 für 69. Grundsatz im Produkt: eine Qualitätsmängel-Nachbesserung ist immer kostenlos, Credits gelten nur für gewünschte kreative Änderungen.

---

## 2. Aufbau und Funktionsumfang

Der Workspace ist eine Web-App (läuft im Browser) mit einer Seitenleiste. Es gibt keine Adresszeilen-Navigation: welche Seite offen ist, merkt sich die App nur intern. Deshalb kann man keine einzelne Collection als Link weitergeben, und der Zurück-Knopf des Browsers verlässt die App.

### 2.1 Seitenleiste (Reihenfolge und Gruppen wie in der App)

| Gruppe | Eintrag | Wer sieht ihn |
|---|---|---|
| Main | Dashboard | alle |
| | Creativity Hub | alle |
| | Research Accounts | alle |
| Workflow | Collections | alle |
| | Production | alle |
| | Library | alle |
| Organization | Creators | alle |
| | Team | alle |
| | Billing | Owner und Manager |
| System | Settings | alle |
| unten | Admin Dashboard | nur ReelForge-Plattform-Admins |
| | Sydney Studio | nur Sydney-Mitglieder |

Unten in der Leiste: Initialen, Anzeigename, Rolle, Abmelden. Plattform-Admins haben dort zusätzlich einen Knopf für Testkonten.

### 2.2 Anmeldung, Arbeitsbereich, Rollen

**Was es gibt.** Anmeldung mit E-Mail und Passwort. Eine Agentur hat genau einen Arbeitsbereich, ein Nutzer gehört zu genau einem. Neue Mitglieder kommen nur per Einladung aus dem Team-Bereich hinein; der Einladungslink loggt ohne Passwort ein, danach erzwingt die App einmalig das Setzen eines Passworts („Welcome aboard“). Gesperrte oder entfernte Arbeitsbereiche bekommen eine eigene Meldung. Nickname (Anzeigename) kann in Settings geändert werden.

**Rollen und Rechte:**

| Recht | Owner | Manager | VA |
|---|---|---|---|
| Alles sehen und speichern, Collections, Research | ja | ja | ja |
| Team einladen, entfernen | ja | ja | nein |
| Rollen ändern | ja | nein | nein |
| Billing sehen | ja | ja | nein |
| Plan wechseln, kaufen | ja | nur wenn vom Owner freigeschaltet | nein |
| Abo kündigen | ja | nein | nein |
| „Send to ReelForge“ | ja | ja | ja (keine Einschränkung vorgesehen) |

**Was fehlt.** Es gibt keine Selbstregistrierung und keine „Passwort vergessen“-Funktion auf der Anmeldeseite. Ein Passwort-Zurücksetzen kann nur der Owner aus der Team-Seite anstoßen. Einen neuen Arbeitsbereich kann niemand in der App anlegen, auch der Admin nicht; Arbeitsbereiche entstehen bisher außerhalb der App **[Vermutung: per Hand in der Datenbank]**. Status: Anmeldung **FERTIG**, Onboarding neuer Agenturen **FEHLT**.

### 2.3 Dashboard

Begrüßung mit Tageszeit, zwei Startknöpfe („Start Research“ führt zu Research Accounts, „Open Production“ zu Production), Zeitraumwahl 7/30/90 Tage.

**Echt:** Fünf Kennzahlen (aktive Creator, gespeicherte Konzepte, in Produktion, braucht Aufmerksamkeit, geliefert), eine Produktionsübersicht als Ring (gespeichert, in Prüfung, in Produktion, geliefert, abgebrochen), „Creator Momentum“ (Anteil der Konzepte je Creator), „Next Actions“ (Rückfragen, Entwürfe, laufende Produktionen; Klick öffnet die Collection), „Recent Concepts“, „Recent Activity“ (letzte Ereignisse), Glocke mit Benachrichtigungen und „Mark all read“.

**Nur Oberfläche:** Das Suchfeld oben öffnet bei Enter nur den Creativity Hub, der Suchbegriff geht verloren. Der Sonnen-Knopf („Light mode“) und das Fragezeichen („Help“) tun nichts und sagen das im Tooltip. Der kleine Pfeil an der Statuspille öffnet kein Menü. Die drei Punkte auf Konzeptkarten sind Dekoration.

**Bekannter Fehler (geprüft):** Die Trendzahlen und Verlaufslinien unter den Kennzahlen werden aus dem Sendedatum der Produktionsaufträge gerechnet. Dieses Datum liegt aber schon als Anzeigetext vor („12 Oct 2026 · 14:03“), und dieser Text lässt sich nicht als Datum zurücklesen (selbst nachgestellt: ergibt „ungültiges Datum“). Folge: Trend und Verlaufslinien sind mit hoher Wahrscheinlichkeit immer leer oder flach, obwohl der Code behauptet, sie aus echten Daten zu rechnen. Nicht im laufenden Produkt beobachtet, aber am Code belegt.

**Benachrichtigungen:** Die Glocke filtert fünf Ereignisarten aus dem Aktivitätsprotokoll. Der „gelesen“-Stand liegt nur im jeweiligen Browser, nicht am Nutzerkonto; ein anderer Rechner zeigt alles wieder als ungelesen.

Status: **FERTIG** mit vier Dekor-Elementen und einem belegten Rechenfehler.

### 2.4 Research Accounts (das Herzstück seit Oktober 2026)

**Idee.** Die Agentur verbindet echte Instagram-Konten, die bewusst auf eine Nische trainiert werden („Blonde Lifestyle“, „Golf/Luxury“, „German Talking“). Eine VA schaut dann innerhalb von ReelForge den echten Feed dieses Kontos, Reel für Reel, mit Ton, kann liken, folgen, kommentieren, teilen, blockieren. Jedes gesehene Reel landet automatisch im Archiv und kann mit einem Klick als Konzept gespeichert werden. Weil es das echte Instagram ist, lernt der Algorithmus des Kontos mit.

**Belegt am 9. Oktober 2026 (eigene Beobachtung von Emre):** Das Schauen und Liken in ReelForge lenkt den Instagram-Feed des Kontos tatsächlich, genau wie in der Instagram-App selbst. Schnelles Durchblättern ohne Likes verwässert den Feed. Das war eine Beobachtung, kein Doppelversuch mit Kontrollkonto.

**Voraussetzung: der Connector.** Eine kleine Desktop-App für macOS und Windows („ReelForge Connector“, Download aus der Seite heraus, aktuell Version 0.1.46). Er ist nötig, weil eine Web-Seite kein zweites, eingeloggtes Instagram fernsteuern kann. Der Connector startet das auf dem Rechner installierte Google Chrome. Auf macOS ist Chrome Pflicht. Der Connector aktualisiert sich selbst, nie während einer laufenden Sitzung; die Web-App verlangt mindestens Version 0.1.36 und lehnt ältere ab. Ohne Connector zeigt die Seite „ReelForge Connector needs to start“ mit Start- und Download-Knopf.

**Konto verbinden.** „Connect account“ mit Beschriftung und Nutzername. Der Login passiert im echten Chrome-Fenster, mit allem, was Instagram verlangt (Zwei-Faktor, SMS, Sicherheitsabfragen). ReelForge sieht nie ein Passwort. Bis zu fünf Konten je Creator und Plattform. Status pro Konto: verbindet, aktiv, braucht Aufmerksamkeit, getrennt. Reconnect und Löschen vorhanden.

**Sitzung.** Zwei Schritte: „Start Connector“ (wecken, Erreichbarkeit prüfen) und „Start Research“ (Sitzung öffnen). Jedes Konto kann nur von einer Person gleichzeitig benutzt werden, über Tabs, Geräte und Teammitglieder hinweg; die anderen sehen „In use by …“ am Konto-Chip, der sich alle zehn Sekunden aktualisiert. Beim Schließen des Tabs wird die Sperre freigegeben; bleibt der Rechner hängen, läuft sie nach fünf Minuten ab.

**Die Bühne (V2).** Instagrams eigener Reel-Tab läuft unsichtbar im Chrome der VA und wird als Bild- und Tonstrom in die Web-App durchgereicht. Wischen per Mausrad, Touch oder Pfeiltasten geht in denselben Tab zurück. Rechts: Zurück/Weiter, Teilen (echte Instagram-Direktnachricht an einen Kontakt, mit Bestätigung; „Copy link“), Herz (Like, echt), Kommentarzahl, Repost (echt). Im Bild: Creator-Kopfzeile mit „Follow“ (echt), Caption, Menü mit „Copy link“ und „Block creator“ (echt, mit Bestätigung, danach springt es automatisch weiter). Quelle umschaltbar „For you / Following“, „Refresh Feed“. Ton startet stumm, Lautstärkeregler vorhanden.

**Profil-Bühne.** Klick auf den Creator-Namen öffnet dessen echte Instagram-Profilseite als zweite Ansicht, mit Kennzahlen auf den Kacheln (Likes, Aufrufe, Kommentare, Reposts, Länge, Datum), ohne den Feed zu verlieren. Reels, die man auf einem Profil anschaut, kommen **absichtlich nicht** ins Archiv **[Entscheidung Emre, 10.10.2026]**, sonst liefe das Archiv beim Stöbern voll. Sortieren und Datumsfilter auf dem Profil wurden gebaut und wieder ausgebaut, weil Instagram sein Kachelraster selbst ständig neu aufbaut und jede Eingriffsform daran scheiterte **[Entscheidung Emre, 10.10.2026]**; die leere Leiste über dem Raster ist dafür reserviert.

**Linke Spalte „Session Context“.** Konto, Plattform, Sitzungsdauer, zum aktuellen Reel Engagement-Rate, Likes, Aufrufe, Kommentare, Reposts, Länge, Datum. Fehlende Werte stehen als Strich, nicht als Null **[Entscheidung Emre, 28.10.2026]**. „Quick Actions“: „Refresh Feed“ und „End Research“ sind echt. **„Mark All As Reviewed“ und „Add Creator Note“ sind Attrappen** (Tooltip „Not available yet“).

**Rechte Spalte „Intelligence“.** Reiter Comments: echte Kommentare in Instagrams drei Sortierungen (For you, Newest, Meta Verified), Nachladen beim Scrollen, Antworten aufklappen, **eigenen Kommentar schreiben** (mit Emoji), aber erst nach fünf Sekunden Verweildauer auf dem Reel. Das Herz an einzelnen Kommentaren ist nur Dekoration. Reiter Notes: eine Notiz je Reel mit Vorlage („Research focus / Pattern / Why it works“), speichert sich selbst, dieselbe Notiz erscheint später im Collections-Player. Darunter „Save to Collection“: Quicksave oder Auswahl aus den Collections des Creators.

**Archiv.** „View archive“ zeigt alle in Sitzungen gesehenen Reels des Kontos, zuletzt gesehen zuerst, mit Likes und Kommentaren (Aufrufe absichtlich nicht, weil Instagram sie für Reels praktisch nie herausgibt). Vorschaubilder werden dauerhaft in eigenen Speicher kopiert, weil Instagrams Bildadressen nach rund vier Tagen sterben; Aufbewahrung 180 Tage, was in einer Collection liegt, bleibt. Zwei bekannte, bewusst offene Grenzen: Das Archiv zeigt höchstens die 1000 zuletzt gesehenen Reels je Konto, obwohl mehr gespeichert sind (beim Konto „Lifestyle“ lagen am 28.10. 3161 Reels, sichtbar 1000; nichts geht verloren, aber es gibt kein „Mehr laden“ und keinen Hinweis) **[Emre weiß es, am 28.10. bewusst nicht behoben]**. Und ältere Archiv-Reels verlieren die Wiedergabe im Workspace, sobald Instagrams Videoadresse abläuft (24 bis 72 Stunden); dann steht „Watch on Instagram“ **[Entscheidung Emre, 27.08.2026: vor dem Launch nicht lösen]**.

**TikTok** ist in der Oberfläche abgeschaltet („Beta“, „temporarily unavailable“). Der Connector kann einen TikTok-Login, die Sitzungslogik ist aber nie gegen ein echtes verbundenes TikTok-Konto geprüft worden.

**Watchtime** wird vom Workspace nicht gemessen und nicht gespeichert. Die Annahme ist, dass Instagram selbst zählt (siehe Beobachtung vom 9.10.). Eine Live-Anzeige „x Signale an Instagram gesendet“ wurde verworfen, weil die mitlesbare Telemetrie keine Watchtime trägt und die Zahl bedeutungslos wäre **[Entscheidung Emre, 09.10.2026]**. Ungeprüft bleibt, ob Instagram den ferngesteuerten Browser an üblichen Merkmalen erkennt.

Status: **TEILWEISE** im Sinne von: funktional sehr tief und im Alltag in Benutzung, aber nur mit installiertem, aktuellem Connector plus Chrome, nur Instagram, zwei Attrappen in den Quick Actions, und die beiden Archiv-Grenzen.

### 2.5 Creativity Hub

Die zweite Suchform: Stichwortsuche über einen externen Datenanbieter (Instagram und TikTok, einzeln oder beides), 24 Ergebnisse je Ladung, Shuffle für die nächste Ladung, Refresh, sechs zufällige Nischen-Chips, Profil-Durchsuchen („Browse a public profile“) mit Follower-Zahlen und „Load more“. Filter (Länge, Aufrufe, benutzt/unbenutzt, gespeichert/ungespeichert, Sortierung, Content Style) wirken nur auf die bereits geladenen Ergebnisse. Der Content Style wird aus Caption und Hashtags per Wortmuster geschätzt, nicht per KI.

Auf jeder Karte: Speichern (Quick Save in die automatische Collection „Quick Saves“ des Creators, in eine bestehende Collection oder in eine neue, mit Notiz), „Add to collection“, „Open source“. Detailansicht mit Abspielen, Kennzahlen, Caption, Pfeiltasten.

**Nur Oberfläche:** Der Knopf **„Find similar“ tut nichts.** Der Block **„AI Insights – Coming soon“** (Creator Fit, Why it fits, Hook, Setting, Recreation difficulty) ist ein Platzhalter. Die Bilderbänder im Kopf sind feste Dekorbilder, die Sprüche eine feste Liste.

**Bekannte Eigenheit der Suche:** Der Anbieter ist bei Instagram wortreihenfolge-empfindlich („gym girl pov“ findet anders als „pov gym girl“). Es gibt eine begrenzte Ersatzstrategie, die lieber weniger als unpassende Ergebnisse liefert. Eine Alternative wurde getestet und verworfen **[Entscheidung, 10.09.2026: keine weiteren Suchheuristiken obendrauf; wenn es nicht reicht, die Quelle selbst neu bewerten]**.

Status: **FERTIG** mit zwei Platzhaltern („Find similar“, „AI Insights“).

### 2.6 Collections

Collections sind Sammlungen gespeicherter Reels („Konzepte“) je Creator und zugleich der Produktionsauftrag.

**Echt:** Anlegen (Name, Creator, Notiz), umbenennen, duplizieren (Konzepte werden kopiert), archivieren (ganze Familie oder einzelne Version), wiederherstellen, löschen. Versionen entstehen über den Namen („Herbst“, „Herbst 2“, „Herbst 3“) und werden als eine Karte mit Versionsmenü gezeigt. Creator-Blöcke per Griff sortierbar. Im Workspace einer Collection: Konzeptraster mit Abspielen, Entfernen, Status je Konzept (Unused, Used, Rejected), Notiz je Konzept, Creator-Zuweisung (verschieben, solange nicht gesendet; sonst Kopie an weiteren Creator), Quellen-Schild (Creativity Hub oder „IG Research – Kontoname“), „Direction & notes“ mit Selbstspeichern, Verlauf der Ereignisse, Liste der Übergaben mit Status und Lieferlink.

**„Send to ReelForge“:** Erst ab zehn nicht abgelehnten Konzepten (Hinweis „Add N more concepts“). Gesendet werden immer alle nicht abgelehnten Konzepte, es gibt keine Auswahl einzelner. Beim erneuten Senden warnt die App, welche Konzepte schon in früheren Übergaben waren. Der Erfolg wird abgewartet, Doppelklick erzeugt nur eine Übergabe. Beim Senden wird **nicht** geprüft, ob der Creator einen Plan hat, ob das Kontingent reicht oder ob die Einrichtung des Creators vollständig ist.

**„Check Inbox“:** Wenn ReelForge eine Rückfrage hat, bekommt die Übergabe diesen Status. Im Workspace klappt dann nur der feste Satz „ReelForge needs additional information for this submission“ auf. Es gibt kein Postfach und keine echte Nachricht. **TEILWEISE.**

**Automatik im Hintergrund:** Status „Sent“ setzt der Workspace, „In Progress“ und „Finished“ kommen von der Produktionsseite, „Completed“ an der Collection setzt die Datenbank selbst, sobald die Übergabe fertig ist. Jeder Creator bekommt automatisch eine „Quick Saves“-Collection.

Status: **FERTIG** (mit dem festen Rückfrage-Text als Lücke).

### 2.7 Creators

**Liste:** Kennzahlen (gesamt, Einrichtung vollständig/unvollständig, mit/ohne Plan), Suche, Reiter, Plan-Filter, Sortierung, Reihenfolge per Griff. „New Creator“ öffnet einen Assistenten in drei Schritten (Basisdaten, bis zu fünf Referenzfotos, Direction). Der Creator wird schon nach Schritt eins angelegt.

**Profil:** Profilbild (Klick lädt hoch), Einrichtungsstand (Draft, In progress, Ready, regelbasiert aus den Feldern), Reiter Overview (Checkliste, Aktivität, Collections, Übergaben), Collections, Submissions, Identity (Referenzfotos, Körper-, Tattoo-, Identitäts-Notizen), Direction (Do's, Don'ts, Outfits, Settings, Brand direction), Notes. Seitlich: Plan-Badge mit Nutzung, „Creative Profile“ (Traits, Talking, Sprache, Setting, Content Styles, Vermeiden).

**Nur Oberfläche:** Listenansicht („List view isn't built yet“). „Notes from ReelForge“ (leer, „fills in once Internal can write back“). Der Schalter **„AI Brain“** speichert einen Haken, hat aber keine Wirkung, und sagt das selbst („No effect yet“, „Creator Fit and AI Score are mock previews for now“). Die Felder des Creative Profile werden heute nirgends sonst im Produkt ausgewertet.

**Inkonsistenz:** Die Nutzungszahl im Profil rechnet über alle Zeiten, die in Billing je Abrechnungszyklus. Beide Zahlen können auseinanderlaufen.

Status: **FERTIG** als Profilverwaltung, **NUR OBERFLÄCHE** bei Listenansicht, Notes from ReelForge und AI Brain.

### 2.8 Production

Reine Übersichtsseite über alle Übergaben (ReelForge und Sydney): Chips „Needs Attention“, „In Production“, „Review“, „Finished“, „Cancelled“ mit Zählern, Suche, Creator-Filter, Panels mit Zeilen, Klick öffnet die Collection. Daten echt.

**Nur Oberfläche:** „New Production“ ist nicht klickbar (Produktionen starten aus einer Collection), „All Sources“ („Not available yet“), drei „View all“-Links, der Sortier-Text, das Drei-Punkte-Menü. Das Quellen-Schild zeigt immer „ReelForge“, auch bei Sydney-Zeilen (die tragen zusätzlich „SYD“).

Status: **FERTIG als Übersicht**, mehrere Dekor-Elemente.

### 2.9 Library

Zeigt fertige Lieferungen (Status Finished) als Liste: Vorschau, Collection und Batch-Nummer, Creator, Anzahl, Datum, Quelle, Approved/Delivered. Echt: Öffnen, „Open in Drive“, Favorit, „Approve delivery“, Suche, Creator- und Status-Filter, Sortierung. In der Detailansicht je Reel: Vorbild abspielen, Regenerationswunsch (Gründe Body, Face, Tattoos, Outfit, Movement, Scene, Technical issue, Creative preference, Other; genau ein offener Wunsch je Reel).

**Wichtige Lücke bei der Lieferung:** Die Produktionsseite liefert nur einen Google-Drive-Ordnerlink. Das fertige Video selbst kommt **nicht** automatisch in den Workspace. Die Ansicht „Original gegen fertig“ existiert nur, wenn der Kunde das gelieferte Video selbst hochlädt („Upload video“). Download im Workspace gibt es nicht („Download runs through the Drive folder for now“), „Download ZIP“ ebenso nicht.

**Nur Oberfläche:** „Assets“-Ansicht, Filter „Content Type“ und „Source“, „Download“, „Download ZIP“, „Stills 0“.

**Regeneration, frei oder kostenpflichtig:** Ob ein Wunsch kostenlos ist, entscheidet heute der gewählte Grund im Workspace (Body, Face, Tattoos, Technical issue sind frei), nicht eine Qualitätsentscheidung der Produktionsseite. Die Roadmap sieht das Gegenteil vor. Offene Wünsche werden nur als Badge angezeigt; „Acknowledged“ oder „Done“ sieht der Kunde nicht weiter aufgelöst. In der Datenbank liegen bis heute null Regenerationswünsche, die Funktion ist also noch nie im Echtbetrieb benutzt worden.

Status: **TEILWEISE.**

### 2.10 Billing

Pro Creator eine Zeile mit Plan, Nutzungsbalken je Zyklus, nächster Verlängerung, Preis, Zustand. Echt und über Stripe angebunden: „Add service“ (Trial einmalig oder Starter/Growth/Scale), „Manage“ mit Upgrade (sofort, anteilig berechnet) und Downgrade (zum Zyklusende vorgemerkt), Kündigung zum Zyklusende und deren Rücknahme, „Buy credits“ (Regenerations-Pakete). Nach der Rückkehr von Stripe holt die Seite den neuen Stand mehrfach nach. Enterprise ist nicht selbst änderbar.

**Nur Oberfläche, jeweils mit ehrlichem Tooltip:** „View invoices“, „View usage“, Zahlungsmethode „Manage“, „No card on file“, Rechnungsadresse, Steuerangaben, „Billing history“ (immer „No invoices yet“), der „This month“-Chip, „Manage“ bei Workspace-Zugang. Der Knopf „Add creator service“ im Abschnittskopf ist aktiv gezeichnet, hat aber keinen Handler. Die Kacheln „Agency workspace Active“ und „Creator App Included“ sind feste Texte; eine „Creator App“ gibt es nicht.

**Zwei Stellen mit festen Preisen im Programm** (Trial 25, Pakete 20/35/69), während die echten Preise aus der Datenbank kommen. Stimmen heute überein, laufen aber bei einer Preisänderung auseinander.

**Durchsetzung der Kontingente:** Der Verbrauch wird serverseitig gezählt und angezeigt. Der Workspace verhindert nirgends eine Übergabe ohne Plan oder über dem Kontingent. Ob Datenbank oder Produktionsseite das tun, ist im Workspace-Code nicht sichtbar **[Vermutung: in der Datenbank gibt es eine Funktion „Verbrauch buchen und Kontingent durchsetzen“, ihr Verhalten ist nicht dokumentiert]**.

Status: **TEILWEISE.**

### 2.11 Team

Echt: Mitgliederliste mit Rollen, Einladen (E-Mail, Rolle, optional „Sydney Studio access“), Rolle ändern (nur Owner), Entfernen, Einladungen zurückziehen, Passwort-Reset-Mail, „Can change plan“-Freigabe für Manager. Höchstens fünf Mitglieder zusätzlich zum Owner.

**Ohne Datenbasis:** Spalte „Assigned Creators“ (zeigt bei jedem alle Creator, eine Zuordnung existiert nicht), „Status“ (immer Active), „Last Active“ (nicht erfasst), Auswahlkästchen ohne Sammelaktion. Reiter „Creator Access“ und „Activity“ sind Erklärtexte, dass es das nicht gibt; „Roles & Permissions“ ist eine starre Tabelle.

Status: **TEILWEISE.**

### 2.12 Settings

Nickname (echt), Abmelden, Link zu Billing, eine zweite kompakte Teamverwaltung (funktional doppelt zur Team-Seite), und ein Kasten „Coming soon“ mit „Brand direction“ ohne Funktion. Status: **TEILWEISE.**

### 2.13 Admin Dashboard (nur ReelForge)

Liste aller Agenturen mit Owner, Plan, Team- und Creator-Zahl, Verbrauch, Status. Detail: aktivieren, sperren, entfernen, Workspace-Paket setzen (Enterprise), Bonus-Kontingente, Gratiszeitraum, Creator-Paket setzen, Mitglieder, Aktivität, Regenerationswünsche, Admin-Verlauf. Dazu ein Werkzeug, das alte Vorschaubilder in den eigenen Speicher nachholt, und Testkonten anlegen/löschen (um den Workspace als Nicht-Owner zu sehen). Zugang über eine Liste von Plattform-Admins in der Datenbank, nicht über E-Mail-Adressen im Code. Status: **FERTIG.**

### 2.14 Sydney Studio (im Workspace)

Für Sydney-Mitglieder ein Eintrag „Sydney Studio“ mit zwei Listen: offene Sydney-Anfragen (Collection, Status, Creator, Anzahl, zugewiesene VA, Lieferlink) und Verlauf. Nur lesend, lädt einmal beim Öffnen. Der Sydney-Owner sieht zusätzlich in jeder Collection den Knopf „SYD“ („Send to SYD“, nur Notiz, keine Mindestanzahl, keine Resend-Warnung). Sydney-Übergaben erscheinen in Production und Library mit „SYD“-Schild. Status: **FERTIG (nur lesend)**, Einschränkungen in Abschnitt 6.

---

## 3. Zusammenhängende Arbeitsabläufe

### 3.1 Wie ein Alltag heute aussieht

1. **Owner richtet Creator ein:** Creators → New Creator → Basisdaten, Fotos, Direction. Dabei entsteht automatisch die Collection „Quick Saves“. Billing → „Add service“ für diesen Creator (Trial oder Abo über Stripe).
2. **Owner lädt die VA ein:** Team → Invite Member, Rolle VA. Die VA setzt beim ersten Login ihr Passwort.
3. **VA verbindet ein Research-Konto:** Research Accounts → Connector herunterladen und starten → Connect account → Login im echten Chrome-Fenster.
4. **VA recherchiert:** Start Connector → Start Research → Feed anschauen, liken, kommentieren, Notizen schreiben; passende Reels per Quicksave oder in eine Collection speichern. Alles Gesehene liegt im Archiv.
5. **VA oder Manager kuratiert:** Collections → Konzepte sichten, Notiz je Konzept, abgelehnte markieren, Direction schreiben. Ab zehn Konzepten „Send to ReelForge“.
6. **Produktion läuft außerhalb des Workspace** (ReelForge Internal). Der Workspace zeigt Sent → In Progress → ggf. Check Inbox → Finished, mit geschätzter Dauer und zum Schluss dem Drive-Link.
7. **Lieferung:** Library → Open in Drive. Optional: fertiges Video hochladen, um es im Workspace neben dem Vorbild zu sehen. Favorit, Approve, oder Regeneration anfragen.
8. **Dashboard** zeigt dabei durchgehend, was offen ist, was läuft, was geliefert ist.

### 3.2 Wie die Daten zusammenhängen

Ein **Konzept** ist ein gespeichertes Reel innerhalb genau einer Collection, mit eigenem Lebenslauf (Status, Notiz, Quelle, zugewiesener Creator, später das fertige Video). Dasselbe Reel kann als mehrere Konzepte in mehreren Collections oder bei mehreren Creatorn liegen; innerhalb einer Collection wird es nicht doppelt gespeichert.

Eine **Collection** gehört zu einem Creator und hat Status Draft, Sent, Completed; „In Progress“ und „Cancelled“ werden zur Anzeige aus der letzten Übergabe abgeleitet.

Eine **Übergabe** (Submission) ist ein Schnappschuss: welche Konzepte wann mit welcher Notiz gesendet wurden, mit Status, Dauer-Schätzung und Lieferlink, die nur die Produktionsseite setzen darf. Der Kunde darf daran nur Favorit und Freigabe ändern.

Das **Archiv** eines Research-Kontos ist davon getrennt: dort liegt jedes gesehene Reel mit Kennzahlen, ohne Bezug zu Collections, bis jemand es speichert. Beim Speichern aus dem Archiv gehen Caption, Likes, Kommentare, Videoadresse und Zeitpunkt **nicht** mit ins Konzept über; der Collections-Player holt das Video später live über den Suchanbieter neu. Ob der Anbieter Instagram-Research-Reels zuverlässig auflöst, ist nicht geprüft **[Vermutung]**.

Das **Aktivitätsprotokoll** speist Dashboard, Glocke, Collection-Verlauf und Creator-Aktivität. Der Workspace schreibt hinein (Collection angelegt, umbenannt, Konzept hinzugefügt, entfernt, markiert, Übergabe erstellt, Regeneration angefragt); die Produktionsseite und Stripe schreiben die übrigen Ereignisse (Dauer gesetzt, fertig, Rückfrage, Planwechsel, Zahlung fehlgeschlagen).

**Likes, Follows, Blocks, Reposts, Direktnachrichten** aus der Bühne passieren auf dem echten Instagram-Konto und werden im Workspace **nicht** protokolliert.

### 3.3 Was nicht ineinandergreift (Kurzfassung, Details in Abschnitt 6)

- Statusänderungen von der Produktionsseite, neue Lieferlinks und Benachrichtigungen erscheinen im Workspace **erst nach Neuladen der Seite**. Die Daten werden einmal je Anmeldung geladen; nur Billing (bei Tab-Fokus) und die Konto-Belegung (alle zehn Sekunden) holen nach. Zwei Teammitglieder sehen gegenseitige Änderungen nicht live.
- Creative Profile, AI Brain, Content Style, Difficulty und Creator Fit sind gespeichert oder angezeigt, fließen aber in keine Suche, Sortierung oder Empfehlung ein.
- Die Rückfrage „Check Inbox“ hat keinen Inhalt und keinen Rückkanal im Workspace.
- Das fertige Video kommt nicht automatisch zurück.

### 3.4 Der Connector im Zusammenspiel

Der Connector wird von der Web-Seite über einen Link-Aufruf geweckt (wie ein „Öffne in App“-Link) und danach über eine lokale Verbindung auf dem Rechner angesprochen. Er holt sich Sitzungsdaten und Einmal-Schlüssel direkt vom Server, nie über die Web-Seite, und schreibt jedes gesehene Reel direkt ins Archiv. Cookies und Logins der Research-Konten liegen verschlüsselt serverseitig, nicht auf dem Rechner der VA.

Zwei Dinge, die in der Zusammenarbeit viel Zeit gekostet haben und die man wissen muss: Die installierte Connector-App liest ihre eigene Kopie der Skripte; Änderungen im Projektordner sieht sie nie, auch nach Neustart nicht. Und: jede Änderung im Connector-Ordner löst automatisch einen Bau und eine Veröffentlichung aus, die sich alle installierten Connector beim nächsten Start holen.

### 3.5 Verbindung zur Produktionsseite (ReelForge Internal, Sydney Studio Internal)

Beide Produktionsapps lesen die Übergaben des Workspace über eigens dafür gebaute Datenbank-Brücken (Übergabe annehmen, Status setzen, Lieferordner eintragen) und schreiben nie direkt in die Workspace-Tabellen. Dauer-Schätzung („2 Days“) und Lieferordner kommen so zurück in den Workspace. Welche Konzepte Sydney aus einer Collection nimmt, entscheidet die Serverseite **[Vermutung: alle nicht abgelehnten]**. Im Workspace-Code selbst gibt es keine Schnittstelle zur Produktionsseite; die Verbindung ist ausschließlich die gemeinsame Datenbank.

---

## 4. Tatsächlicher Entwicklungsstand

### 4.1 Vollständig funktionsfähig und im Alltag benutzt

- Anmeldung, Arbeitsbereich, Rollen, Einladung mit Passwort-Setzen, Sperrung von Arbeitsbereichen.
- Creator-Profile mit Fotos, Direction, Notizen, Reihenfolge.
- Creativity Hub: Stichwort- und Profilsuche, Shuffle, Speichern in Collections.
- Research Accounts: Konto verbinden, Sitzung mit Sperre, Bühne mit Bild und Ton, Like, Follow, Block, Repost, Teilen, Kommentare lesen und schreiben, Profil-Bühne, Notizen je Reel, Archiv mit dauerhaften Vorschaubildern, Connector mit Selbst-Update.
- Collections: alles inklusive Versionen, Archiv, Duplizieren, Löschen mit Schutz gesendeter Collections, Creator-Zuweisung, Send to ReelForge mit Mindestanzahl und Resend-Warnung.
- Production als Übersicht, Library als Lieferliste mit Drive-Link, Favorit, Freigabe.
- Billing über Stripe: Abo kaufen, Trial, Upgrade, Downgrade, Kündigung, Credits.
- Team: Einladen, Rollen, Entfernen, Plan-Freigabe, Sydney-Zugang.
- Admin Dashboard komplett.
- Sydney: Übergabe aus der Collection, Anzeige in Production und Library, eigene Lese-Seite.

### 4.2 Teilweise umgesetzt

| Bereich | Was fehlt |
|---|---|
| Lieferung | Fertiges Video kommt nicht automatisch; kein Download im Workspace; Rückfrage „Check Inbox“ ohne Inhalt |
| Regeneration | Nie im Echtbetrieb benutzt; frei/kostenpflichtig nach Grund statt nach Qualitätsurteil; keine Rückmeldung außer Badge |
| Research | Nur Instagram; Archiv zeigt höchstens 1000; alte Reels nicht abspielbar; zwei Quick-Action-Attrappen |
| Billing | Rechnungen, Zahlungsmethode, Adresse, Nutzungsdetail alles Attrappe; Kontingent wird nicht durchgesetzt |
| Team | Zuordnung Creator zu Mitglied, letzte Aktivität, Sammelaktionen fehlen |
| Dashboard | Trend und Verlaufslinien rechnen auf einem unlesbaren Datumstext (belegt) |
| Aktualität | Kein Live-Nachladen; Änderungen anderer erst nach Neuladen |
| Benachrichtigungen | Nur fünf Ereignisarten, gelesen-Stand nur im Browser |

### 4.3 Nur Oberfläche

Find similar; AI Insights; AI Brain; Notes from ReelForge; Listenansicht Creators; New Production, All Sources, View all (Production); Assets, Content Type, Source, Download, Download ZIP (Library); View invoices, View usage, Payment method, Billing history, Add creator service (Billing); Assigned Creators, Status, Last Active, Checkboxen, Reiter Creator Access und Activity (Team); Brand direction (Settings); Dashboard-Suche, Light mode, Help; Mark All As Reviewed, Add Creator Note (Research); Kommentar-Herz.

Alle diese Elemente sagen im Tooltip oder Text ehrlich, dass sie nicht angebunden sind, mit Ausnahme von „Find similar“, der Dashboard-Suche und „Add creator service“, die wie funktionsfähige Knöpfe aussehen.

### 4.4 Fehlt vollständig

Selbstregistrierung und Agentur-Onboarding; „Passwort vergessen“; Workspace anlegen; Tags vergeben und danach filtern; Auswahl einzelner Konzepte beim Senden; Produktionsauftrag mit Menge, Typ, Priorität, Lieferfenster; echtes Postfach für Rückfragen; automatischer Rückweg des fertigen Videos; Download; Similar Reels; jede KI-Analyse (Tags, Hook, Setting, Difficulty, Creator Fit, Reproduzierbarkeit); Creative Brain, Empfehlungen, Shortlists, ReelForge Picks; Content Calendar; Performance-Daten; Approval Flow (VA speichert, Manager gibt frei); Support-Bereich; Bildqualitätsprüfung der Referenzfotos; Capabilities-Hinweise beim Auftrag; TikTok im Research-Modul; Live-Aktualisierung; Mehrfach-Workspaces je Nutzer.

### 4.5 Was im Echtbetrieb liegt (Datenbank, 12. November 2026)

| Gegenstand | Anzahl |
|---|---|
| Arbeitsbereiche | 1 |
| Mitglieder | 2 |
| Creator | 5 |
| Collections | 11 |
| Konzepte | 70 |
| Übergaben an ReelForge | 11 |
| Übergaben an Sydney | 8 |
| Research-Konten | 3 |
| Archivierte Reels | 3715 |
| Regenerationswünsche | 0 |
| Creator-Pläne | 4 |

Das Produkt wird also von genau einer Agentur (der eigenen) benutzt. Alle Mehr-Mandanten-Logik ist gebaut, aber nie mit einer zweiten echten Agentur durchlaufen worden.

---

## 5. Die bestehende Roadmap

### 5.1 Herkunft

Die Roadmap wurde von Emre geschrieben, ging zwischenzeitlich verloren (lag nur als Anhang in Chats), wurde am 4. Oktober 2026 über ChatGPT wiederbeschafft und liegt seitdem unverändert als `docs/ROADMAP.md` im Projekt. Sie hat 42 nummerierte Abschnitte plus die Staffelung V1, V1.5, V2, V3. **Der vollständige Originaltext steht unverändert in Anhang A dieses Dokuments.**

### 5.2 Die Staffelung, wörtlich

> **V1** muss nur brutal gut können: Login / Workspace → Creator Profiles → Research → Save → Collections → Assign Creator → Notes → Send to ReelForge → Production Status → Delivered Reels
>
> **V1.5:** Package Usage, Regenerations, Better Filters, Creator Setup Flow, Notifications
>
> **V2:** Instagram/TikTok Research Accounts, Chromium Sessions, AI Tags, Similar Reels, Reproducibility, Creator Fit
>
> **V3:** Creative Brain, AI Recommendations, automatic Shortlists, Performance Intelligence

### 5.3 Stand je Abschnitt

| Nr. | Roadmap-Punkt | Stand |
|---|---|---|
| 1 | Client Workspace / Dashboard | erledigt; Trendzahlen fehlerhaft, Benachrichtigungen nur im Browser |
| 2 | Creator Profiles | weitgehend erledigt; „Notes von ReelForge“, „Best Performing Concepts“, Used/Saved References fehlen |
| 3 | Research Hub (Suche, Toggle IG/TikTok, Nischen) | Stichwort und Profil erledigt; Tags, Kategorien, Creator-Type-Suche fehlen |
| 4 | Research Accounts / eigene FYPs | erledigt und weit darüber hinaus (Bühne); TikTok aus |
| 5 | Shuffle / Discovery | erledigt |
| 6 | Similar Reels | Knopf vorhanden, ohne Funktion |
| 7 | Save Reel | erledigt |
| 8 | Reel Library (Felder je Reel) | teilweise: „Saved by“, „Saved Date“, Status Sent/In Production/Delivered/Maybe Later fehlen am Konzept (nur Unused/Used/Rejected) |
| 9 | Collections / Albums | erledigt, plus Versionen |
| 10 | Tags & Filtering | nur Hashtags aus der Quelle, kein eigenes Taggen, Filter reduziert |
| 11 | Notes / Creative Direction | erledigt (Collection, Konzept, Reel) |
| 12 | Assign Creator | erledigt |
| 13 | Send to ReelForge | erledigt; Mindestanzahl 10, immer alle Konzepte |
| 14 | Production Request (Menge, Typ, Priorität, Lieferfenster) | nur Notiz, Rest fehlt |
| 15 | Verbindung zu ReelForge Internal | über gemeinsame Datenbank und Brücken, nicht im Workspace sichtbar |
| 16 | Production Tracking (7 Stufen) | 5 Stufen: Sent, In Progress, Check Inbox, Finished, Cancelled |
| 17 | Delivered Content (Preview, Download, Approve, Regenerate) | Approve, Favorit, Regenerate ja; Download nur Drive; Vorschau nur bei Kunden-Upload |
| 18 | Regeneration Requests mit QC-Fail frei / kreativ bezahlt | Gründe ja; frei/bezahlt nach Grund statt nach QC |
| 19 | Package / Credits | erledigt pro Creator plus Enterprise-Pool |
| 20 | AI Reel Analysis | fehlt |
| 21 | Creator Fit Score | fehlt (nur Platzhalterfelder) |
| 22 | Reproducibility / Difficulty | fehlt (Feld mit Ersatzwert „Easy“) |
| 23 | Creative Brain | fehlt (nur der wirkungslose Schalter) |
| 24 | Recommended for Creator | fehlt |
| 25 | AI Shortlists | fehlt |
| 26 | Find More Like This | fehlt |
| 27 | Used / Unused Intelligence | nur manueller Status je Konzept |
| 28 | Content Calendar | fehlt (laut Roadmap „nicht unbedingt V1“) |
| 29 | Performance Data | fehlt |
| 30 | Creative Performance Intelligence | fehlt |
| 31 | Team Collaboration | erledigt (3 Rollen, max. 5) |
| 32 | Approval Flow | fehlt |
| 33 | ReelForge Recommendation Layer | fehlt |
| 34 | Enterprise Differentiator | Enterprise-Paket im Admin vorhanden |
| 35 | Beta Features / Enterprise First Access | fehlt |
| 36 | Notifications | Glocke mit fünf Ereignisarten |
| 37 | Client Requests / Support | fehlt („Help“ ohne Funktion) |
| 38 | Onboarding im Client OS | nur Creator-Assistent; Agentur anlegen, Examples, Package, Ready fehlen |
| 39 | Smart Creator Onboarding | regelbasierte Checkliste, keine Bildprüfung |
| 40 | AI Reference Quality Check | fehlt |
| 41 | Content Capabilities im Portal | fehlt |
| 42 | Research-to-Production One Click | fehlt |

**Nach Staffel:** V1 ist bis auf die Lieferlücke (Video, Download, Rückfrage) erledigt. V1.5 ist erledigt bis auf „Better Filters“ (Tags) und die Begrenztheit der Benachrichtigungen. Aus V2 ist der schwerste Teil (Research Accounts mit echter Sitzung) gebaut, alles mit KI (Tags, Similar, Reproducibility, Creator Fit) nicht. V3 ist nicht begonnen.

### 5.4 Wie sich die Planung unterwegs verändert hat

- **Research Accounts wurden von V2 nach vorn gezogen** und zum Hauptmodul. Grund war die Erkenntnis, dass eigene trainierte Konten der Stichwortsuche weit überlegen sind. Die Roadmap nennt das selbst „eine der stärkeren Ideen“.
- **Von V1 (eigener Player) zu V2 (Bühne).** Bis Ende September spielte ReelForge eine Kopie der Videodatei im eigenen Player ab. Seit dem 6. Oktober läuft Instagrams eigener Tab durch, damit Instagram die Verweildauer selbst zählt. Die alte Fassung ist als Rückfallpunkt markiert (Marke `connector-v1-freeze`), die neue als `v2` mit datierten Zwischenständen.
- **TikTok wurde angebunden und einen Tag später abgeschaltet** (25./26. August), weil es nie gegen ein echtes Konto verifiziert wurde.
- **Produktionsstatus bewusst vereinfacht:** Die Roadmap sah sieben Stufen vor; Emre hat am 25. August entschieden, dass die vier Kundenstufen reichen, und nur Dauer-Schätzung und „Cancelled“ nachgefordert. Beides wurde geliefert.
- **Lieferung über Drive statt im Workspace** war nie so geplant, ist aber der gelebte Stand.
- **Design-Neubauten** im September nach Figma-Entwürfen (Collections, Production, Library, Creators), mit einer festgehaltenen Design-Grundlage („Design-DNA“, Referenzseite Billing). Im Oktober die Entscheidung „altes Gold“ statt einer neuen Goldvariante **[Entscheidung Emre, 29.09.2026]**.
- **Eingefrorene Bereiche:** Research-Sitzung, Sperren, Connector-Update, Archiv, Block User gelten seit Ende August als „funktioniert, nicht anfassen“ und wurden im Oktober mit der Bühne trotzdem grundlegend neu gebaut. Das Baseline-Dokument vom 29. August beschreibt also teilweise einen überholten Stand (siehe 6.5).

---

## 6. Bekannte Probleme und Qualitätslücken

### 6.1 Belegte Fehler im Code

1. **Dashboard-Trend auf Anzeigetext** (Abschnitt 2.3). Betrifft auch Sortierungen: Production, Creator-Profil und Library sortieren nach dem Anzeigetext, also nach Tageszahl statt nach Datum; der Code am Creator-Profil kommentiert das selbst („not a true chronological sort“).
2. **Sydney-Übergaben tragen ein rohes Maschinendatum** statt des Anzeigeformats; in Production und Library mischen sich dadurch zwei Formate in Sortierung und Anzeige.
3. **Sydney-Status wird plattgedrückt:** Requested, Accepted und Delivery Ready erscheinen in Production alle als „In Production“, auf der Sydney-Seite aber getrennt. Sydney-Lieferungen lassen sich in der Library **nicht öffnen**, haben keinen Favorit, keine Freigabe und keine Regeneration.
4. **Dashboard und Production zählen verschieden:** Nach dem Entfernen einer produzierten Collection sinkt „In Production“ im Dashboard, die Zeile bleibt in Production stehen.
5. **„Unsave“ im Creativity Hub** nimmt nur die Markierung zurück; das Konzept bleibt in der Collection.
6. **Speichern im Hub und auf der Bühne meldet Fehler nicht sichtbar.** Die Markierung „Saved“ wird gesetzt, bevor gespeichert ist; schlägt das Speichern fehl, sieht man es erst auf der Collections-Seite.
7. **Ein Datenbankfehler beim Laden des Arbeitsbereichs sieht aus wie „No workspace access yet“**, weil die Fehlermeldung nicht angezeigt wird.
8. **Konzept-Ersatzwerte:** Beim Laden werden fehlende Analysewerte mit „Easy“, „Indoor“, „English“, 0 gefüllt, entgegen der eigenen Regel „leer heißt nicht analysiert“. Heute unsichtbar, aber eine Falle, sobald diese Felder je angezeigt oder gefiltert werden.
9. **Feste Preise im Programm** neben den echten in der Datenbank (Abschnitt 2.10).
10. **Stripe-Rücksprung fest auf die heutige Vercel-Adresse** eingetragen; eine eigene Domain würde den Rückweg vom Bezahlen brechen.
11. **Diagnose-Ausgaben** aus der Fehlersuche vom 2. September sind noch im Produkt (markiert als „temporär, entfernen wenn das Flackern geklärt ist“).
12. **Zwei Nutzungsrechnungen** (Profil all-time, Billing je Zyklus) plus eine dritte in der Admin-Liste.

### 6.2 Unvollständige Abläufe

- Lieferung endet beim Drive-Link (2.9).
- Rückfrage „Check Inbox“ ohne Inhalt und Antwortmöglichkeit (2.6).
- Regeneration ohne Rückmeldung und noch nie benutzt (2.9).
- Kein Live-Nachladen (3.3).
- Kontingent wird im Workspace nicht durchgesetzt (2.10).
- Beim Speichern aus dem Archiv gehen Caption, Kennzahlen, Videoadresse und Zeitpunkt verloren (3.2).
- Kein „Saved by“: Konzepte haben keinen Autor, obwohl die Roadmap ihn vorsieht.
- Senden ist für jede Rolle möglich; ein „darf senden“-Recht existiert nicht.

### 6.3 Unlogische oder doppelte Stellen in der Oberfläche

- Teamverwaltung existiert zweimal (Team-Seite und Settings).
- Spalten und Reiter ohne Datenbasis auf der Team-Seite (2.11).
- Quellen-Schild in Production zeigt immer „ReelForge“.
- Creator-Einrichtungsstand hat im Profil drei Werte, auf der Karte zwei.
- „View all“ bei Recent Concepts im Dashboard führt in den Hub statt zu Collections.
- Ein Kommentar im Code behauptet, der Connector melde seine Version nicht; das tut er seit dem 11. Oktober.

### 6.4 Bewusste Entscheidungen, die wie Fehler aussehen

| Was man sieht | Warum es so ist |
|---|---|
| Alte Archiv-Reels nur „Watch on Instagram“ | Instagrams Videoadressen laufen ab; Nachladen hätte zu viel neue Technik vor dem Launch bedeutet **[Emre, 27.08.2026]** |
| Reels tauchen in neuen Sitzungen wieder auf | Instagrams eigenes serverseitiges Verhalten, gemessen; kein Fehler im Workspace **[Emre, 27.08.2026]** |
| Archiv zeigt höchstens 1000 | Grenze der Datenschnittstelle; bewusst offen gelassen **[Emre, 28.10.2026]** |
| Profil-Reels nicht im Archiv | sonst läuft das Archiv beim Stöbern voll **[Emre, 10.10.2026]** |
| Kein Sortieren/Datumsfilter auf dem Profil | Instagram baut sein Raster selbst neu, sieben Versuche gescheitert **[Emre, 10.10.2026]** |
| Keine „Signale gesendet“-Anzeige | Telemetrie trägt keine Watchtime, die Zahl wäre leer **[Emre, 09.10.2026]** |
| Aufrufe fehlen im Archiv | Instagram gibt sie für Reels praktisch nie heraus (0 von 937 geprüften) |
| Altes Gold, dunkle Flächen, Billing als Design-Referenz | Design-Entscheidungen, festgehalten in der Design-DNA |
| Windows-Fassung des Connectors nie auf echter Hardware getestet | es gibt keinen Windows-Rechner; Builds entstehen nur automatisch |

### 6.5 Offene Punkte aus der Zusammenarbeit

- **Unbestätigter Bericht (28.08.2026):** Während einer Sitzung soll einmal der Connector-Download von selbst gestartet sein. Plausibler Mechanismus gefunden (die „Connector fehlt“-Einblendung hat einen Download-Link ohne Bestätigung, der nach einem unerwarteten Bildwechsel versehentlich getroffen werden kann), aber ohne Reproduktion bewusst nicht geändert **[Emre: erst Beweis, dann Fix]**.
- **Feed-Laden langsam** (August): Messpunkte sind eingebaut, zurückgestellt, bis es wieder auffällt.
- **Baseline-Dokument veraltet:** `docs/STABLE_BASELINE.md` (29.08.) beschreibt Kommentare als „nur lesend“ (heute schreibbar), Windows mit eigenem Chromium (heute System-Chrome) und Connector 0.1.31 (heute 0.1.46). Es ist als Momentaufnahme gekennzeichnet, müsste aber neu gezogen werden.
- **README** ist die unveränderte Vorlage des Baukastens, ohne ein Wort zum Produkt.

### 6.6 Sicherheits- und Betriebsrisiken, die man kennen sollte

- Die lokale Verbindung des Connectors auf dem Rechner ist nur durch Sitzungsschlüssel geschützt; der Gesundheits-Endpunkt ist offen. Risikobewertung steht aus. **[Empfehlung: vor Fremdkunden prüfen lassen]**
- Hochgeladene Dateien (Referenzfotos, Avatare, fertige Videos) liegen in Speicherbereichen, die über öffentliche Adressen gelesen werden **[Vermutung aus der Art der Adressbildung]**.
- Es gibt nur eine Datenbank-Umgebung; Entwicklung und Betrieb teilen sich dieselben Daten **[Vermutung: keine zweite Umgebung im Projekt erkennbar]**.
- Der Großteil der Serverlogik (16 von 19 Serverfunktionen, alle Datenbankregeln und Rechte) liegt **nicht** im Projektordner, sondern nur im Supabase-Projekt. Ein Verlust oder eine versehentliche Änderung dort wäre nicht aus dem Projekt wiederherstellbar.

---

## 7. Technischer und organisatorischer Hintergrund

Nur so tief, wie es zum Verständnis nötig ist.

### 7.1 Die drei Teile

1. **Web-App** (React, Vite, Tailwind, TypeScript), gehostet bei Vercel unter `reelforge-client-os.vercel.app`. Veröffentlichung vermutlich automatisch bei jedem Push auf den Hauptzweig **[Vermutung: kein Deploy-Skript im Projekt]**.
2. **Connector** (Tauri 2, Rust-Hülle, mitgelieferte Node-Laufzeit, Playwright), macOS universal (Apple Silicon und Intel) signiert und notarisiert, Windows x64. Wird bei jeder Änderung im Connector-Ordner automatisch gebaut und als rollendes GitHub-Release „connector-latest“ veröffentlicht; Versionsnummer = 0.1.Laufnummer. Web-App und Connector liegen im **selben** GitHub-Repository (Emozgv/reelforge-connector).
3. **Supabase-Projekt** (Anmeldung, Datenbank, Dateispeicher, Serverfunktionen). Ein Projekt für alle drei Produkte (Workspace, ReelForge Internal, Sydney Studio Internal), getrennt über Datenbankschemata.

### 7.2 Datenbank (Schema `client_os`, 28 Tabellen)

Kerntabellen: `workspaces`, `workspace_members`, `workspace_invites`, `creators`, `collections`, `concepts`, `submissions`, `submission_concepts`, `regeneration_requests`, `activity_events`, `research_accounts`, `research_feed_items`, `research_reel_notes`, `creator_packages`, `workspace_packages`, `plan_catalog`, `stripe_addon_prices`, `reel_usage_events`, `platform_admins`, `admin_activity_log`, dazu sieben Sydney-Tabellen (`syd_members`, `syd_submissions`, `syd_submission_concepts`, `syd_activity_events`, `syd_invites`, `syd_client_access`). Alle mit Zeilenschutz (RLS). Rund 85 Serverfunktionen im Schema, davon die meisten mit erhöhten Rechten; dazu die Brücke `internal_bridge` (sechs Funktionen) für ReelForge Internal und `syd_bridge_*` für Sydney.

Im Projektordner liegen **keine** Migrationen, kein Schema, keine Regeln und keine Funktionskörper. Die Datenbank ist nur im Supabase-Projekt selbst dokumentiert.

### 7.3 Serverfunktionen (Edge Functions), 46 im Projekt, davon für den Workspace relevant

- **Im Projektordner:** `stripe-checkout`, `stripe-manage-subscription`, `stripe-webhook`.
- **Nur im Supabase-Projekt:** `search-reels` (Suche über den Anbieter TikHub **[Vermutung: Name nur in Kommentaren]**), `invite-workspace-member`, `manage-test-account`, `connect-research-account`, `cancel-research-account-connect`, `submit-research-account-session`, `fetch-research-account-session`, `start-research-live-session`, `refresh-research-account-lock`, `release-research-account-lock`, `resolve-live-session-token`, `submit-research-live-reel`, `start-research-feed-sync`, `submit-research-feed-sync`, `start-research-reel-action`, `submit-research-reel-action`, `cache-concept-thumbnail`, `cache-research-thumbnail`.
- Dazu Reste aus Tests, die nichts tun oder gelöscht werden könnten (`tmp-tikhub-compare`, `temp-*`, `debug-raw`, `diag-hero-images`).
- Ein täglicher Aufräumjob löscht Archiv-Vorschaubilder nach 180 Tagen, außer sie liegen in einer Collection.

### 7.4 Externe Dienste und was ohne sie bricht

| Dienst | Wofür | Ohne ihn |
|---|---|---|
| Supabase | alles | nichts geht, auch der Connector nicht |
| Stripe | Kauf, Abo, Kündigung, Credits | Billing-Aktionen scheitern, Pläne frieren ein |
| Instagram (über Chrome) | Login, Feed, Bühne, alle Aktionen | jede Oberflächenänderung von Instagram kann Research anhalten |
| Google Chrome auf dem Rechner | Pflicht auf macOS | harte Fehlermeldung |
| GitHub | Connector-Bau, Download, Update | keine neuen Connector, alte laufen weiter |
| Vercel | Hosting | Web-App nicht erreichbar, Stripe-Rücksprung ins Leere |
| Apple Developer | Signatur und Notarisierung | macOS-Builds blockiert |
| Suchanbieter hinter `search-reels` | Creativity Hub, Video-Auflösung im Collections-Player | Hub leer, Player ohne Video |
| Instagram-Bildserver | Vorschaubilder und Videos mit Ablauf | eigene Kopien fangen die Bilder ab, Videos nicht |

### 7.5 Zugangsdaten und Umgebungen

Die Web-App braucht nur die öffentliche Supabase-Adresse und den öffentlichen Schlüssel. Alle geheimen Schlüssel (Service-Rolle, Stripe, Webhook, Connector-Signatur, Apple-Zertifikat) liegen ausschließlich als Geheimnisse bei Supabase und GitHub, nicht im Projekt. Der Connector hat eine saubere Trennung zwischen Entwicklungsfassung (eigener Name und Link-Schema, aktualisiert sich nie) und Auslieferung (wird erst beim automatischen Bau umbenannt).

### 7.6 Die Schwesterprodukte, soweit relevant

ReelForge Internal (Produktionsseite) und Sydney Studio Internal (private Produktionsstelle, ein Ableger von ReelForge Internal) sind eigene Desktop-Apps mit eigenen Repositories, eigenen Releases und eigener Update-Versorgung. Sie teilen mit dem Workspace nur die Datenbank und greifen auf Workspace-Daten ausschließlich über die Brückenfunktionen zu. Ihr Zustand, ihre Releases und ihre Bildverarbeitung (Caption-Rekonstruktion, Text Remover) sind nicht Teil dieser Bestandsaufnahme.

---

## 8. Weg zur ersten Veröffentlichung

### 8.1 Was für Version 1.0 vorgesehen war

Nach der Roadmap: Login/Workspace, Creator Profiles, Research, Save, Collections, Assign Creator, Notes, Send to ReelForge, Production Status, Delivered Reels. Zusätzlich hat sich im Verlauf ergeben, dass Research Accounts mit echter Sitzung zum Kern gehören, und dass Billing über Stripe schon vor 1.0 gebaut wurde.

### 8.2 Was davon offen ist

Von der V1-Liste ist **nur „Delivered Reels“** unvollständig: das fertige Video kommt nicht in den Workspace, es gibt keinen Download, und die Rückfrage hat keinen Inhalt. Alles andere der V1-Liste ist gebaut und benutzt.

### 8.3 Was für eine zuverlässige erste Veröffentlichung an fremde Agenturen wirklich nötig ist **[Empfehlung]**

Unterschieden nach „ohne das geht es nicht“ und „ohne das wirkt es unfertig“.

**Ohne das geht es nicht:**

1. **Onboarding einer neuen Agentur**: Arbeitsbereich anlegen (mindestens im Admin), Owner einladen, „Passwort vergessen“ auf der Anmeldeseite. Heute kann keine zweite Agentur in das Produkt kommen, ohne dass jemand in der Datenbank arbeitet.
2. **Lieferung schließen**: entweder das fertige Video automatisch in den Workspace bringen (Produktionsseite lädt hoch) oder den Drive-Weg ehrlich als Lieferweg gestalten und die toten Download-Knöpfe entfernen.
3. **Rückfrage mit Inhalt**: „Check Inbox“ braucht mindestens den Text der Rückfrage und einen Antwortweg, sonst führt der Status zurück zu Telegram.
4. **Aktualität**: Statusänderungen und Lieferlinks müssen ohne Neuladen erscheinen (Nachladen bei Tab-Fokus wäre die kleinste Lösung).
5. **Kontingent durchsetzen oder bewusst nicht**: Entscheidung, ob eine Übergabe ohne Plan oder über dem Kontingent blockiert, gewarnt oder nachberechnet wird. Heute passiert nichts.
6. **Dashboard-Trend reparieren** (belegter Rechenfehler) und die Datumssortierungen auf echte Daten umstellen.
7. **Tote Knöpfe entfernen oder ausgrauen**, die wie funktionsfähig aussehen: „Find similar“, Dashboard-Suche, „Add creator service“, „New Production“, „Download“, „Download ZIP“.
8. **Sicherheitsdurchsicht** des Connectors und der Dateispeicher, bevor fremde Daten hineinkommen.
9. **Sicherung der Serverlogik**: Schema, Regeln und Funktionen aus dem Supabase-Projekt ins Projekt exportieren, damit der Stand wiederherstellbar ist.

**Ohne das wirkt es unfertig, blockiert aber nicht:**

10. Billing: Rechnungen und Zahlungsmethode anbinden (Stripe-Kundenportal wäre der kurze Weg) oder den Abschnitt auf das Echte reduzieren.
11. Team: Spalten ohne Daten entfernen, Reiter „Creator Access“ und „Activity“ entfernen, Doppelung mit Settings auflösen.
12. Sydney-Übergaben in Library öffnen können und Status nicht plattdrücken.
13. Regeneration einmal durchspielen und dem Kunden Acknowledged/Done zeigen.
14. Archiv „Mehr laden“ über 1000 hinaus.
15. Speicherfehler im Hub und auf der Bühne sichtbar machen; „Unsave“ wirklich entfernen.
16. Benachrichtigungen am Konto statt im Browser.
17. Baseline-Dokument und README auf den heutigen Stand bringen.

**Nicht für 1.0** (Roadmap V2/V3): alles mit KI, Similar Reels, Tags, Creative Brain, Kalender, Performance, Approval Flow, TikTok.

### 8.4 Was man bei der Priorisierung im Kopf behalten sollte

- Das Produkt hat heute eine Nutzerin: die eigene Agentur. Jede Mehr-Mandanten-Funktion ist ungetestet gegen eine zweite echte Agentur.
- Research Accounts sind der Teil, der am meisten Wert hat und am meisten Pflege braucht, weil er von Instagrams Oberfläche abhängt. Jede Änderung dort hat in der Vergangenheit Tage gekostet; der Bereich ist dafür gut mit Rückfallpunkten abgesichert.
- Die Design-Grundlage ist festgelegt und sollte nicht erneut aufgemacht werden; neue Seiten folgen der Billing-Seite.
- Arbeitsregeln, die sich bewährt haben: erst reproduzieren, dann Ursache, dann kleinste Änderung, dann die ganze Kette prüfen; Entscheidungen aus Abschnitt 6.4 nicht als Fehler wieder aufmachen.

---

## Anhang A: Die Roadmap im Original (unverändert aus `docs/ROADMAP.md`)

ReelForge AI Client OS – Gesamtidee

Das Portal soll langfristig die komplette Kundenseite von ReelForge werden.

Nicht einfach ein Research-Tool.

Der Kunde soll irgendwann ReelForge öffnen und dort praktisch seinen gesamten Content-Flow machen:

Research → Save → Organize → Select Creator → Send to ReelForge → Production → QC → Delivery → Feedback → Store

Und möglichst kein Telegram mehr für den eigentlichen Workflow brauchen.

1. Client Workspace / Dashboard

• eigener Client Login
• eigener Agency Workspace
• mehrere Team-Mitglieder pro Agency möglich
• Übersicht aller Creator
• aktueller Reel-Plan / Package
• verbrauchte und verbleibende Reels
• offene Production Requests
• gerade in Produktion
• fertig / delivered
• Regeneration Requests
• Notifications / wichtige Updates
• eventuell kleines Activity Log: „Felix sent 8 references“, „Batch moved to QC“, etc.

Langfristig soll der Kunde im OS sofort sehen:

Was ist offen? Was wird gerade produziert? Was ist fertig? Was muss ich noch machen?

2. Creator Profiles

Jeder Creator bekommt ein eigenes Profil.

Darin könnten liegen:

• Name
• Profilbild
• Creator Setup Status
• 5 Reference Photos for Character Set
• Body Reference Information
• Tattoo Notes
• typische Body Proportions
• Hair / Face / Identity Notes
• Content Style
• bevorzugte Outfits
• typische Settings
• Talking / Non-Talking
• bevorzugte Sprache
• Content Do’s
• Content Don’ts
• Brand Direction
• Notes vom Client
• Notes von ReelForge
• vergangene Produktionen
• Collections des Creators
• Saved References
• Used References
• Best Performing Concepts später
(AI Brain für AI Score nutzbar, mit hacken an oder aus machen)

Der Kunde soll später nicht jedes Mal erklären müssen:
„Das ist für Creator X.“

Alles hängt direkt am Creator.

3. Research Hub

Das ist das erste große Modul.

Der Kunde soll Reels direkt innerhalb von ReelForge recherchieren können.

Geplant:

• Instagram
• TikTok
• Toggle: IG / TikTok / All
• Search Bar
• Keyword Search
• Nischen Search
• Tags
• Kategorien
• Creator Type Search
• Content Style Search

Beispiele:

golf girl
cute blonde
gym reel
POV talking
mirror reel
German funny
bikini transition

Ergebnisse dann als vertikales Reel Grid, ungefähr 4 Videos pro Reihe am Desktop.

Nicht wie eine komplizierte Datenbank, sondern eher wie ein eigener Discovery Feed.

4. Research Accounts / eigene FYPs

Das war eine der stärkeren Ideen.

Statt nur allgemeine Search APIs zu benutzen könnten später eigene eingeloggte Instagram-/TikTok-Research Accounts angebunden werden.

Zum Beispiel:

Creator A → Blonde Lifestyle Research Account
Creator B → Golf / Luxury Research Account
Creator C → German Talking Reels Account

Diese Accounts können bewusst auf bestimmte Nischen trainiert werden.

Dann könnte das Client OS eventuell über Chromium Sessions / eingeloggte Accounts darauf zugreifen.

Dadurch könnte man echte:

• FYPs
• Explore Feeds
• Suggested Reels
• niche-trained accounts

verwenden.

Das wäre deutlich stärker als nur stumpfe Keyword Search.

5. Shuffle / Discovery

Neben Search wollten wir auch einen Shuffle / Refresh Button.

Der Kunde sucht z. B.:

blonde gym

und bekommt passende Reels.

Dann:

Shuffle

→ neue relevante Ergebnisse.

Nicht komplett random, sondern thematisch passend.

Später könnte daraus werden:

Give me more like this.

6. Similar Reels

Bei jedem Reel:

Find Similar

Dann sucht das System nach ähnlichen:

• Hooks
• Szenen
• Bewegungen
• Outfits
• Kamera-Winkeln
• Editing Styles
• Concepts

Das könnte später AI-basiert laufen.

7. Save Reel

Bei jedem Research Reel:

Save

(haben das ja auch gut gemacht)

Dann landet es in der persönlichen Reel Library.

Kein:

Instagram → Copy Link → Telegram → irgendeine Gruppe → später wieder suchen.

Ein Klick.

(Haben wir ja bereits ein bisschen weiter ausgebaut)

8. Reel Library

Alle gespeicherten References an einem Ort.

Pro Reel:

• Preview
• Source
• Instagram / TikTok
• Original Link
• Creator
• Collection
• Tags
• Notes
• Saved by
• Saved Date
• Status
• Used / Unused
• Sent to ReelForge
• In Production
• Delivered
• Rejected
• Maybe Later

Das wird langfristig richtig wertvoll, weil der Kunde dadurch sein komplettes Creative Archive hat.

9. Collections / Albums

Der Kunde kann eigene Collections erstellen.

Beispiele:

Carolina September
Gym Concepts
Talking Reels
German Hooks
High Priority
Test Next Week
Mirror Reels
Cute / Girlfriend Style
Creator X Q4

Reels einfach reinziehen.

Damit wird Research gleichzeitig Planung.

10. Tags & Filtering

Reels könnten Tags bekommen:

• Gym
• Bedroom
• Mirror
• Car
• Talking
• POV
• Transition
• Bikini
• Lifestyle
• Sexy
• Cute
• Meme
• Trend
• Easy Production
• Hard Production

Später teilweise automatisch durch AI.

Filter:

Creator
Platform
Collection
Used / Unused
Talking
Difficulty
Saved Date
Status
etc.

11. Notes / Creative Direction

Bei jedem Reel kann der Client kleine Notes hinterlassen:

„black dress“

„original text “

„Make her blonde hair more visible“

„German talking version“

„Same scene but bedroom“

„Keep body proportions accurate“

Kein langer Briefing-Prozess.

12. Assign Creator (find unser creativity hub jedoch gut,)

Der Kunde findet ein Reel.

Klickt:

Assign Creator → Carolina

Dann weiß das System direkt, wem die Reference gehört.

Das ist wichtig für den späteren Send-to-ReelForge Flow.

13. Send to ReelForge

Das ist für mich weiterhin einer der wichtigsten Buttons im ganzen OS.

Kunde:

findet Reel
→ Save
→ Creator auswählen
→ Note
→ Send to ReelForge

(Wir haben das ja anders, das man auf der haupseite auswählt wer research macht, find ich auch ehrlich gut so, so lassen, doch vielleicht beim speichern man soll da so auch möglichkeit haben extra ein anderen models zuzuteilen aber primär das model was am anfang ausgewählt wird, wie wir haben ist schon gut)

Fertig.

Kein Telegram.

Kein Copy/Paste.

Kein Download.

Kein „für welches Model war das nochmal?“

14. Production Request

Aus dem gespeicherten Reel wird automatisch ein Production Request.

Enthält:

• Client
• Creator
• Reference
• Original Link
• Preview
• Notes
• Requested Quantity
• Type
• Priority
• Timestamp
• eventuell gewünschtes Delivery Window

Und genau dieser Request geht direkt in ReelForge Internal.

15. Verbindung zu ReelForge Internal

Das Client OS ist nicht getrennt von Internal gedacht.

Client OS = Kundenseite
RF Internal = Operator-/Manager-Seite

Der Flow:

Client OS
↓
Send to ReelForge
↓
RF Internal Manager Inbox
↓
Approved / Production
↓
Operator
↓
QC
↓
Delivered
↓
Client OS

Gemeinsame Datenobjekte ungefähr:

Client → Creator → Reference → Collection → Production Request → Job → QC  in progess (postable or not → Delivery

Das sollte langfristig dieselbe Backend-Logik verwenden.

16. Production Tracking für Kunden

Der Client soll sehen können:

Submitted
Approved
Queued
In Production
QC
Ready
Delivered

Aber nicht eure komplette interne Produktionswelt.

Nur genug Transparenz, damit er nicht schreiben muss:

„Bro wie weit seid ihr?“

17. Delivered Content

Fertige Reels gehen wieder zurück ins Client OS.

Dort:

• Preview
• Download
• Creator
• Reference
• Production Date
• Batch
• Notes
• Status
• eventuell Favorite
• Regenerate
• Approve

Damit entsteht automatisch eine Content Library.

18. Regeneration Requests

Statt Telegram:

Kunde klickt auf einen fertigen Reel:

Request Regeneration

Grund auswählen:

• Body
• Face
• Tattoos
• Outfit
• Movement
• Scene
• Technical Issue
• Creative Preference
• Other

Note dazu.

Dann landet das direkt wieder in Internal.

Und das System/wir kann unterscheiden:

QC Fail → free replacement

vs.

Client wants another creative version → paid regeneration

19. Package / Credits

Im Client Dashboard:

Growth
38 / 60 Reels used

oder

Enterprise
423 / 600 delivered

Enterprise kann dann nur ich verteilen

Vielleicht:

• monthly allowance
• remaining
• pending
• regenerations remaining
• Creator Setups included
• billing cycle

Dadurch weiß der Client immer, was er noch hat.

20. AI Reel Analysis

Später könnte jedes Research Reel automatisch analysiert werden.

Zum Beispiel:

Hook
Setting
Outfit
Movement
Camera
Talking / Non-Talking
Language
Editing
Trend Type
Content Style

Damit werden Search und Organisation massiv besser.

21. Creator Fit Score

AI könnte einschätzen:

Wie gut passt dieses Reel zu Carolina?

Zum Beispiel:

Creator Fit: 91%

Basierend auf:

• Creator Look
• Style
• bisherigen Saves
• bisherigen Orders
• Client Preferences
• Content Brand

22. AI Reproducibility / Difficulty Score

Extrem interessant für ReelForge selbst.

AI bewertet:

Easy
Medium
Hard
bevorzuge ich basierend auf die dinge die jetzt kommen
ob was vors gesicht ist, liquid oder so etc.

oder:

AI Reproducibility: 86%

Basierend auf:

• Kamerabewegung
• Mirror
• Tattoos
• Talking
• mehrere Personen
• komplizierte Bewegung
• schnelle Cuts
• Props
• Background
• Text/Captions

Dann weiß der Client schon:

Das ist wahrscheinlich gut recreatable.

Und ihr spart schlechte Requests.

23. Creative Brain pro Creator

Langfristig eines der stärksten Features.

Jeder Creator bekommt einen eigenen Creative Brain.

Das System lernt:

Was speichert der Client?

Was lehnt er ab?

Was bestellt er?

Was wird oft regeneriert?

Welche Concepts gefallen?

Welche Reels performen?

Welche Settings passen?

Welche Hooks passen?

Dadurch wird Research immer personalisierter.

24. Recommended for Creator

Dann könnte das System irgendwann sagen:

Recommended for Carolina

und automatisch passende Reels zeigen.

Der Kunde muss irgendwann nicht mal mehr suchen.

25. AI Shortlists

Vielleicht täglich oder wöchentlich:

15 Concepts picked for Carolina

AI hat vorher:

300 Reels analysiert
↓
80 passend
↓
30 reproduzierbar
↓
15 best fit

Client klickt nur noch:

✅ Save in new folder  - erstellt dann diesen reels ordner innen zum speichern
❌ Reject

Dann geht es direkt in Production.

Das wäre langfristig brutal.

26. Find More Like This

Client findet einen Reel, der perfekt passt:

Find more like this

Das System liefert ähnliche Concepts.

Das ist wahrscheinlich einfacher und nützlicher als reine Keyword Search.

27. Used / Unused Intelligence

System merkt:

Dieser Reel wurde bereits verwendet.

Oder:

ähnlicher Concept wurde schon 4x produziert.

Damit verhindert ihr, dass dieselben Sachen immer wieder bestellt werden.

Später:

You already used a similar concept 3 weeks ago.

28. Content Calendar

Noch nicht unbedingt V1, aber logisch.

Kunde könnte fertige / geplante Reels auf Kalender legen:

Monday
Tuesday
Wednesday

Vielleicht später:

Instagram Account → Content Plan

Dann wird Client OS langsam auch Planning Tool.

29. Performance Data

Später, wenn sinnvoll:

Client kann Performance seiner Reels eintragen oder eventuell Accounts anbinden.

Dann:

Views
Likes
Shares
Comments
Follows
Profile Visits

Und dann kann der Creative Brain lernen:

Welche AI Concepts funktionieren tatsächlich?

Das wäre nochmal eine komplett andere Liga.

30. Creative Performance Intelligence

Dann könnte ReelForge irgendwann sagen:

Your meme concepts outperform bedroom concepts by 38%.

oder:

Talking reels with direct hooks perform best for this creator.

Dann wird aus Research langsam echte Creative Intelligence.

31. Team Collaboration

Für größere Agencies:

Owner
Manager
Research VA
Marketing Manager

Jeder kann:

• Reels speichern
• Collections verwalten
• Notes hinzufügen
• Requests erstellen

Mit Permissions.

32. Approval Flow

Agency Owner könnte einstellen:

Research VA saves
↓
Marketing Manager approves
↓
Send to ReelForge

Oder einfach:

Anyone can send.

33. ReelForge Recommendation Layer

Nicht nur Kunde → ReelForge.

ReelForge könnte selber Concepts empfehlen.

Zum Beispiel:

ReelForge Picks

„We think these 8 concepts would work well for Carolina.“

Das kann später auch ein Enterprise Benefit werden.

34. Client OS als Enterprise Differentiator

Das ist extrem wichtig für dein Pricing.

Higgsfield:
Tool

Random AI Agency:
Generation Service

ReelForge:
Research + Organization + Production + QC + Delivery System

Dann ist der Vergleich:

„Higgsfield kostet mich weniger pro Generation“

viel weniger relevant.

35. Beta Features / Enterprise First Access

Enterprise Kunden könnten neue Sachen zuerst bekommen:

• AI Research
• Similar Reel Search
• Creator Fit
• automated shortlists
• new production workflows
• new AI models
• experimental content formats

Das hatten wir auch für dein Enterprise Offer besprochen.

36. Notifications

Nicht nervig.

Nur relevante:

Your batch is ready.

5 reels passed QC.

Morphey/xyz requested another creator reference/xyz.

12 new concepts were recommended for Carolina.

37. Client Requests / Support

Später vielleicht kleiner Support-Bereich.

Nicht unbedingt klassisches Ticketsystem.

Einfach:

Need help?

Production question
Creator setup
Billing
Technical
Other

38. Onboarding im Client OS

Neuer Client:

Agency erstellen
↓
Creator hinzufügen
↓
Creator Images hochladen
↓
Content Direction
↓
Examples
↓
Package
↓
Creator Setup
↓
Ready

Dann müssen eure Golden Rules nicht mehr als riesige Telegram Message existieren.
(Die kann ich dir senden wenn du danach fragst)

Das Portal führt ihn durch.

39. Smart Creator Onboarding

Bei Creator Setup könnte das OS automatisch fragen:

Face photos
2 closeups

Body
straight full body

Additional
2–3 clear images

Dann direkt Check:

✅ Face references sufficient
✅ Body reference good
⚠️ Tattoos need more references

Das wäre extrem clean.

40. AI Reference Quality Check

System könnte hochgeladene Creator Bilder analysieren:

Good
Too blurry
Face too small
Need full body
Need better tattoo reference

Damit kommen bessere Inputs rein, bevor Morphey überhaupt anfängt.

41. Content Capabilities direkt im Portal

Bei Request könnte Client direkt sehen:

Talking ✅
Clothing change ✅
Body adjustments ✅
Different language ✅
Up to 12 sec generation ✅
Mirror/reflection limitations ⚠️
Tattoo precision limitations ⚠️

Damit setzt du Expectations vor Production.

42. Research-to-Production One Click

Langfristige Ideallösung:

Client sieht Reel.

Klickt:

Create for Carolina

und sonst fast nichts.

System kennt bereits:

Creator
LoRA
Body
Language
Style
Production Settings

Das ist wahrscheinlich die ultimative Version.

Was ich davon als V1 wirklich bauen würde

Ich würde V1 nicht aufblasen.

V1 muss nur brutal gut können:

Login / Workspace
→ Creator Profiles
→ Research
→ Save
→ Collections
→ Assign Creator
→ Notes
→ Send to ReelForge
→ Production Status
→ Delivered Reels

Wenn diese Experience geil ist, ist Client OS bereits richtig stark.

Danach:

V1.5
Package Usage
Regenerations
Better Filters
Creator Setup Flow
Notifications

Dann:

V2
Instagram/TikTok Research Accounts
Chromium Sessions
AI Tags
Similar Reels
Reproducibility
Creator Fit

Dann:

V3
Creative Brain
AI Recommendations
automatic Shortlists
Performance Intelligence.

Und der große Gedanke, den ich bei allem behalten würde:

ReelForge should remove decisions and work from the client, not give them another complicated tool to manage.

Das Portal darf niemals zu einem neuen ClickUp werden.

Der Kunde soll denken:

„Alter, Content ist jetzt einfach.“

Das ist für mich die komplette Vision.

Weste was ich meine

---

## Anhang B: Rohdaten-Hinweise

- Stand der Datenbankzahlen: 12. November 2026, 13:00 Uhr.
- Stand des Codes: Hauptzweig, letzter Schritt vom 28. Oktober 2026 ("Kein Wert ist kein Null").
- Connector-Download: Version 0.1.46 vom 15. Oktober 2026; Mindestversion der Web-App 0.1.36.
- Verteilung der 364 Entwicklungsschritte: 244 im August, 55 im September, 65 im Oktober 2026.
- Diese Datei ist nicht eingecheckt; sie liegt nur im Projektordner.
