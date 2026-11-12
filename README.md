# Atelier – Instagram-Planer & Druckstudio fürs iPad

Atelier ist eine Web-App für Safari auf dem iPad. Sie lässt sich wie eine normale App auf den Home-Bildschirm legen und funktioniert danach auch offline. Alle Daten bleiben auf dem Gerät. Die App hat zwei Bereiche:

1. **Planer**: Instagram-Beiträge und Stories vorbereiten und planen, Bilder Beiträgen zuordnen und alles in einem einheitlichen, ruhigen Look halten.
2. **Druckstudio**: Fotos in festgelegten Stilen für große Drucke aufbereiten, zum Beispiel für digitale Downloads auf Etsy (bis 24 × 36 Zoll bei 300 dpi).

Alle Looks und Druckstile sind **eigene, rein rechnerische Verfahren** (Farbkurven, Rauschen, Höhenlinien, Pinsel- und Fasersimulation). Es gibt keine KI-Bildgenerierung, keine fremden Presets und keine fremden Texturen.

---

## Installieren (iPad)

1. **https://kolya-git.github.io/atelier/** in **Safari** öffnen.
2. **Teilen → Zum Home-Bildschirm**.
3. Die App einmal mit Internet starten. Sie speichert sich dabei komplett auf dem iPad und läuft danach auch **offline**, im Vollbild und mit eigenem Symbol. Safari löscht ihre Daten dann nicht automatisch.

Voraussetzung: iPadOS 16.4 oder neuer (empfohlen ist iPadOS 17 oder 18). Ältere Versionen ab 15.4 laufen ebenfalls, nur der PNG-Export fehlt dort.

**Updates:** Neue Versionen lädt die App automatisch im Hintergrund, sobald sie mit Internet geöffnet wird. Beim nächsten Start sind sie aktiv.

**Daten aus einer anderen Atelier-Version übernehmen:** dort unter *Einstellungen → Sicherung erstellen*, hier unter *Einstellungen → Sicherung einspielen*.

Die App besteht nur aus statischen Dateien ohne Build-Schritt. Gehostet wird sie über GitHub Pages (Settings → Pages → Deploy from a branch → `main`, Ordner `/ (root)`). Jeder andere HTTPS-Host funktioniert genauso.

---

## Planer

| Bereich | Was du dort machst |
| --- | --- |
| **Raster** | So sieht das Profil aus, wenn alle geplanten Beiträge online sind (3:4-Kacheln wie in der aktuellen Profilansicht). Lange drücken und ziehen ordnet um: Die Termine bleiben an ihrem Platz, die Beiträge wandern. Ideen ohne Termin liegen oben in einer Leiste. Ziehst du eine Idee auf eine Kachel, tauschen die beiden. |
| **Kalender** | Monatsansicht oder Liste. Beiträge und Stories lassen sich per Langdruck auf andere Tage ziehen. „Termine exportieren“ erzeugt eine `.ics`-Datei für den iPad-Kalender, mit Erinnerung 10 Minuten vorher. |
| **Bilder** | Fotos aus der Mediathek importieren. Mehrere auswählen und daraus „Ein Beitrag (Karussell)“, „Je ein Beitrag“ (automatisch auf die nächsten Posting-Tage verteilt) oder eine Story machen. |
| **Beitrag** | Bis zu 20 Bilder in beliebiger Reihenfolge. Ausschnitt per Finger: ziehen, mit zwei Fingern zoomen, Doppeltippen setzt zurück. Formate 3:4, 4:5 oder 1:1. Look und Feinabstimmung, Bildunterschrift mit Zeichen- und **Hashtag-Zähler** (warnt ab 5 Hashtags), gespeicherte Hashtag-Sets, private Notizen und Status (Idee → Entwurf → Bereit → Veröffentlicht). |
| **Stories** | Seiten aus Vorlagen: Vollbild, Passepartout, Bild & Text, Textseite, Zitat, zwei oder drei Bilder, Liste, Serie und Neuer Beitrag. **Text steht nie auf einem Foto.** Er hat immer seinen eigenen Bereich und richtet sich nach dem gemeinsamen Story-Stil. Die Sicherheitszonen von Instagram (oben und unten) werden angezeigt. |

### Einheitlicher Look, ohne dass es nach KI aussieht

- **Feed-Look:** ein gemeinsamer Look für alle Beiträge (Natur, Leinen, Salz, Erde, Moos, Nebel, Abendlicht, Silber, Kohle, Tee). Änderst du ihn, ändern sich alle Beiträge mit. Die Looks sind bewusst zurückhaltend und filmnah: weiche Lichter, gedeckte Grüntöne, feines Korn, keine HDR- oder Glanzeffekte.
- **Serie angleichen:** gleicht Helligkeit, Weißabgleich, Kontrast und Farbigkeit aller Bilder behutsam aneinander an, bevor der Look wirkt. Die Korrektur ist begrenzt, damit nichts künstlich wirkt.
- **Story-Stil:** sechs Vorlagen (Papier, Archiv, Stein, Nacht, Ton, Moos). Schriften, Farben, Größen und Ränder kannst du selbst anpassen. **„Farben aus meinen Bildern ableiten“** erzeugt eine gedämpfte Palette aus deinen Fotos, sodass Stories und Feed zusammenpassen.

### Posten

Instagram erlaubt kein Posten aus Web-Apps. Atelier bereitet deshalb alles vor, und der Button **„Posten …“** führt durch drei Schritte:
1. Bildunterschrift kopieren.
2. Bilder (1080 px breit, mit Look) über das Teilen-Menü in Fotos sichern oder direkt an Instagram senden.
3. Den Beitrag als veröffentlicht markieren.

---

## Druckstudio

1. **Foto öffnen**, am besten das Original in voller Auflösung, nicht die Kopie aus dem Planer.
2. **Format und Auflösung** wählen. Die Leiste unten zeigt, wie viele ppi das Foto im Druck hat und ob es für die Größe reicht.
3. **Stil wählen und einstellen:**
   - **Galerie:** Passepartout-Rand, optional geprägter Plattenrand wie beim Tiefdruck und eine feine Haarlinie.
   - **Aussparung:** Bereiche werden entlang natürlicher Linien herausgenommen, etwa entlang heller oder dunkler Bildbereiche, des Bildrands oder einer Richtung. Im Freiraum zeigt sich Leinen oder Papier. Beim Untergrund „Weiß“ bleibt die Fläche unbedruckt, sodass bei echtem Leinen das Material selbst sichtbar wird. Bei „Transparent“ (PNG) wird sie durchsichtig. Optional erscheinen im Freiraum Höhenlinien.
   - **Edeldruck:** Cyanotypie, Platin/Palladium, Van Dyke, Salzpapier, Silbergelatine oder Kallitypie, jeweils mit gestrichenem Pinselrand und Borstenspuren auf Büttenpapier.
   - **Topografie:** Höhenlinien aus den Helligkeiten des Fotos, wahlweise als reines Linienbild, über dem Foto oder als Übergang vom Foto in Linien.
   - **Linienstich:** Das Bild wird aus fließenden Linien aufgebaut, deren Stärke der Helligkeit folgt. Optional mit Relief und Kreuzschraffur.
   - **Büttenrand:** das Foto als Fragment mit gerissenem, faserigem Rand und zartem Schatten.
4. **Maske** (Apple Pencil oder Finger): grob „Behalten“ oder „Entfernen“ malen. Die Kante folgt danach automatisch natürlichen Linien.
5. **Lupe:** zeigt einen Ausschnitt in 100 %, genau so, wie er in der Druckdatei steht (Korn, Fasern, Linien).
6. **Neu würfeln:** eine neue zufällige, aber reproduzierbare Variante der Fasern und Pinselstriche.
7. **Exportieren:**
   - **Einzelne Datei**: JPEG (Qualität einstellbar, ab 95 ohne Farbunterabtastung) oder PNG (verlustfrei, mit 300 dpi in den Metadaten).
   - **Etsy-Set**: je Seitenverhältnis die größte gängige Datei bei 300 dpi, nämlich 2:3 (24 × 36 in), 3:4 (18 × 24 in), 4:5 (16 × 20 in), DIN A (A1) und 11:14, optional 5:7 (50 × 70 cm) und 1:1. **Jede Datei bleibt automatisch unter 20 MB**, so wie Etsy es verlangt. Dafür wird die Qualität geschätzt und notfalls die Auflösung leicht reduziert. Etsy erlaubt 5 Dateien pro Angebot.

Große Dateien werden kachelweise auf dem Grafikchip gerechnet und streifenweise kodiert. So klappen auch 78 Megapixel auf dem iPad, ohne dass der Speicher überläuft. Projekte (Originalfoto, Stil, Ausschnitt, Maske) werden automatisch gespeichert.

---

## Daten, Sicherung, Rechte

- **Speicher:** Alles liegt lokal im Browser-Speicher (IndexedDB) des iPads. Unter *Einstellungen → Daten & Sicherung* erstellst du eine ZIP-Sicherung, legst sie in „Dateien“ oder iCloud ab und spielst sie bei Bedarf wieder ein.
- **Schriften:** Cormorant Garamond, EB Garamond, Newsreader, Jost, Hanken Grotesk und IBM Plex Mono stehen unter der SIL Open Font License und sind auch kommerziell frei nutzbar (siehe [`fonts/LICENSE-OFL.txt`](fonts/LICENSE-OFL.txt)).
- **Stile:** eigene Algorithmen. Sie ahmen keine bestimmten Künstler nach und enthalten weder Fotos noch Texturen Dritter. Die Ergebnisse sind deine Gestaltung.
- **Fotos:** Verkaufen darfst du nur, woran du die Rechte hast. Das sind eigene Fotos. Bei erkennbaren Personen, Kunstwerken oder Marken brauchst du gegebenenfalls Freigaben.
- **Etsy:** Da keine generative KI im Spiel ist, gelten die Drucke als von dir gestaltet. Prüfe trotzdem die aktuellen Etsy-Richtlinien.

---

## Technik

- Reines HTML, CSS und JavaScript (ES-Module), ohne Build-Schritt und ohne externe Abhängigkeiten.
- `js/gl/`: WebGL2-Engine. `glsl.js` enthält Looks, Rauschen und die Druckstile, `looks.js` die Look-Vorlagen und das Angleichen.
- `js/planner/`, `js/stories/`, `js/print/`: die drei Bereiche. `print/encoders.js` enthält streifenweise JPEG- und PNG-Kodierer (eigene Implementierung nach ITU T.81 bzw. PNG-Spezifikation).
- Nach Änderungen an der App `python3 tools/build-sw.py` ausführen. Das aktualisiert die Offline-Dateiliste, damit installierte iPads die neue Version laden.
