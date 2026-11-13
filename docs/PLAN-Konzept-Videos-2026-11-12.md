# Plan: Gespeicherte Reels dauerhaft abspielbar machen (Weg 1)

Stand 12.11.2026, abends. Von Emre freigegeben und am selben Abend gebaut -- Umsetzungsstand siehe unten.

## Das Problem in einem Satz

Beim Speichern eines Reels merken wir uns nur Instagrams Lieferadresse, und die läuft nach ein bis zwei Tagen ab (gemessen heute: Adresse vom 08.11., 16:22 Uhr war am 10.11., 04:00 Uhr tot). Danach kann der Collections-Player das Video nur noch über den Suchanbieter holen, und der scheitert bei Instagram-Research-Reels.

## Was gebaut wird

**1. Connector merkt sich die kleine Fassung** (connector-app, eine Stelle)
Instagram liefert jedes Reel in mehreren Auflösungen. Heute nehmen wir immer die erste, also die größte. Künftig wird zusätzlich die kleinste Fassung ab 480 Punkt Breite mitgeschrieben (`videoUrlKlein`). Die große bleibt für alles andere unangetastet.
Nebenwirkung: Jede Änderung im Connector-Ordner baut automatisch eine neue Connector-Fassung, die sich alle installierten Connector holen. Kein Zwang zum Update (Mindestversion bleibt 0.1.36), ältere Connector schreiben die kleine Adresse einfach nicht mit.

**2. Archiv bekommt eine Spalte** (Datenbank)
`client_os.research_feed_items.video_url_klein` (Text, leer erlaubt). Die Serverfunktion `submit-research-live-reel`, die das Archiv schreibt, übernimmt das neue Feld. Alles andere an ihr bleibt gleich.

**3. Konzepte bekommen eine Spalte und einen Speicherplatz** (Datenbank)
`client_os.concepts.preview_video_url` (Text, leer erlaubt) und ein neuer Speicherbereich `client-os-concept-videos` (öffentlich lesbar wie die Vorschaubilder, nur Video-Dateien, höchstens 60 MB je Datei). Dateiname = Konzept-Kennung. Wird ein Konzept gelöscht, wird die Datei mitgelöscht (Aufräumen durch dieselbe Serverfunktion, Modus „löschen“).

**4. Eine Serverfunktion kopiert das Video** (`cache-concept-video`, neu)
Gebaut nach dem Vorbild von `cache-concept-thumbnail`, das seit August die Vorschaubilder kopiert:
- Normalfall: direkt nach dem Speichern eines Konzepts, im Hintergrund, ohne das Speichern zu verzögern. Lädt die kleine Fassung (ersatzweise die große), legt sie ab, trägt die dauerhafte Adresse am Konzept ein. Nur für Mitglieder des Workspace, zu dem das Konzept gehört.
- Nachholrunde (nur Plattform-Admin): geht alle Konzepte ohne Kopie durch, sucht im Archiv die passende Zeile über die Reel-Adresse, versucht die dort gespeicherte Adresse. Abgelaufene werden übersprungen und gezählt, nicht als Fehler gemeldet.
- Gilt für alle Quellen, auch Creativity Hub (TikTok-Adressen laufen genauso ab).

**5. Web-App** (vier kleine Stellen)
- Beim Speichern eines Konzepts wird zusätzlich die Video-Kopie angestoßen (wie heute schon das Vorschaubild).
- Der Collections-Player prüft zuerst, ob eine Kopie da ist. Wenn ja, spielt er sie sofort ab, ohne den Suchanbieter zu fragen. Wenn nein, läuft es wie heute.
- Schlägt der Suchanbieter fehl, erscheint nicht mehr die rohe Fehlermeldung, sondern die Reel-Ansicht mit Vorschaubild, Kennzahlen und „Watch on Instagram“ (so macht es das Archiv heute schon).
- Archiv-Einträge und gespeicherte Konzepte tragen die neuen Felder (`videoUrlKlein`, `previewVideoUrl`) nur durch; keine Logik daran.

**6. Nachholrunde einmal ausführen** über den bestehenden Admin-Bereich (ein Knopf neben „Backfill saved thumbnails“). Erwartung, ehrlich: Von den 53 vorhandenen Research-Konzepten werden nur die wenigen eine Kopie bekommen, deren Archiv-Adresse jünger als rund anderthalb Tage ist. Die anderen bleiben beim Anbieter-Versuch mit dem neuen Ersatzbild. Ab dem Einbau sind alle neu gespeicherten Reels dauerhaft da.

## Was NICHT angefasst wird

Bühne, Sperren, Sitzungsstart, Archiv-Anzeige, Collections-Logik (Senden, Status, Versionen), die Seite von heute. Das Archiv selbst bekommt keine Kopien, nur gespeicherte Konzepte.

## Speicher und Kosten (Schätzung, nicht gemessen)

Kleine Fassung etwa 1 bis 2 MB je Reel. 1000 gespeicherte Reels = 1 bis 2 GB = einige Cent im Monat. Keine Neukomprimierung, keine zusätzliche Maschine.

## Offenes Risiko, das vor dem Bauen geprüft wird

Ob unser Server (Supabase-Serverfunktion) Instagrams Videodateien laden darf. Bei den Vorschaubildern klappt das seit Oktober; bei Profilbildern aus dem „Following“-Feed hat Instagram im Oktober den Server abgewiesen (403). Für Videos konnte ich es heute nicht prüfen: alle gespeicherten Adressen sind abgelaufen, und die Instagram-Suche des Anbieters ist gerade gestört (liefert seit heute Abend Fehler, auch im Creativity Hub, unabhängig von unserer Arbeit).
Prüfung: beim nächsten Research-Lauf eine frische Adresse nehmen und einmal vom Server laden. Wenn Instagram den Server abweist, Plan B ohne Mehraufwand für dich: der Connector lädt die Datei (er hat die eingeloggte Sitzung) und lädt sie in den Speicher hoch; die Serverfunktion stellt ihm dafür eine einmalige Upload-Erlaubnis aus. Alles andere am Plan bleibt gleich.

## Reihenfolge

1. Frische Adresse prüfen (braucht einen kurzen Research-Lauf von dir oder deiner VA, 1 Minute).
2. Datenbank: zwei Spalten, ein Speicherbereich.
3. Serverfunktion `cache-concept-video` bauen, am Konzept von heute testen.
4. Web-App: Speichern, Player, Ersatzbild.
5. Connector: kleine Fassung mitschreiben, Archiv-Serverfunktion erweitern, Connector-Build abwarten (automatisch).
6. Nachholrunde über den Admin-Bereich.
7. Prüfung: ein frisch gespeichertes Research-Reel spielt im Collections-Player ohne Anbieter; ein altes zeigt das Ersatzbild statt der Fehlermeldung; Archiv, Bühne und Senden unverändert.

Aufwand: rund ein halber Tag, plus der Connector-Build. Nach deinem Okay fange ich mit Schritt 1 und 2 an.

## Umsetzungsstand 12.11.2026, 20:05 Uhr

- Datenbank: Spalten `research_feed_items.video_url_klein`, `concepts.preview_video_url` und Speicherbereich `client-os-concept-videos` angelegt (Migration `konzept_videos_dauerhaft`).
- Serverfunktionen: `cache-concept-video` (neu, Version 1) und `submit-research-live-reel` (Version 12, schreibt `video_url_klein` nur, wenn der Connector es mitschickt).
- Web-App (lokal, uncommittet): Speichern stoesst die Kopie an und traegt sie nach Erfolg sofort ins Konzept ein; Loeschen entfernt die Datei; der Collections-Player spielt die Kopie zuerst; ohne Video Ersatzansicht mit "Watch on Instagram" statt Fehlerkasten; Admin-Bereich hat "Backfill saved videos"; Creativity Hub meldet "Instagram is currently unavailable", wenn nur die Instagram-Seite des Anbieters ausfaellt.
- Connector: kleine Fassung wird mitgeschrieben (Commit f6e2e8c auf main, Build laeuft automatisch; bisherige Fassung 0.1.46).
- Test: TikTok-Reel aus dem Hub gespeichert -> Kopie 5,1 MB nach 6 Sekunden im Speicher, Konzept traegt die Adresse, Player spielt (27,6 s). Research-Konzept ohne Kopie -> Ersatzansicht statt Fehler.
- Nachholrunde: 50 geprueft, 0 kopiert, 49 abgelaufen, 1 ohne Archivquelle. Wie erwartet: die Archivadressen sind alle aelter als anderthalb Tage.
- OFFEN: ob Instagrams Videoserver eine frische Adresse an unseren Server ausliefert (bei TikTok ja). Pruefung beim naechsten Research-Lauf: ein Reel speichern, dann im Admin-Bereich oder in der Datenbank nachsehen, ob `preview_video_url` gesetzt ist.
