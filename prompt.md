

Erstelle ein vollständiges, produktionsreifes Webprojekt namens **"Orim"** – einen Miro-ähnlichen kollaborativen Whiteboard-Editor.

---

## Technologie-Stack

- **Framework:** C# .NET 10, ASP.NET Core mit serverseitigem Blazor (Blazor Server)
- **UI-Bibliothek:** MudBlazor (aktuellste Version)
- **Persistenz:** JSON-Dateien im Dateisystem, keine Datenbank
- **Authentifizierung:** ASP.NET Core Cookie Authentication (kein Identity Framework)
- **Deployment-Ziel:** Lokal ausführbar und als Azure App Service deploybar (kein Docker)

---

## Projektstruktur

Lege folgende Projektstruktur an:
Orim/
Orim.Web/ ← Blazor Server Hauptprojekt
Orim.Core/ ← Domänenmodelle, Interfaces, Services
Orim.Infrastructure/ ← JSON-Persistenz, Datei-I/O
---

## Persistenz (JSON-Dateien)

- Alle Daten werden als JSON-Dateien im Verzeichnis `data/` gespeichert (konfigurierbar via `appsettings.json`)
- Dateistruktur:
  - `data/users.json` – alle Benutzer
  - `data/boards/{boardId}.json` – je ein Board pro Datei
- Passwörter werden **niemals im Klartext** gespeichert – nutze `BCrypt.Net` zum Hashen (Work Factor 12)
- Lese-/Schreiboperationen über ein `IRepository<T>`-Interface abstrahieren, damit später ein Datenbankwechsel möglich ist

---

## Benutzerverwaltung & Authentifizierung

- Zwei Rollen: `Admin` und `User`
- Login über **Benutzername + Passwort** (Formular, Cookie-basierte Session)
- Nur **Admins** können Benutzer anlegen, bearbeiten und deaktivieren
- Der erste Admin wird beim ersten Start automatisch angelegt (Seed-User, konfigurierbar in `appsettings.json`)
- Kein Self-Registration für normale Benutzer

---

## Board-Zugriffskontrolle

Jedes Board hat eine Sichtbarkeit und Board-spezifische Rollen:

| Sichtbarkeit | Bedeutung |
|---|---|
| `Privat` | Nur der Ersteller und explizit eingeladene Mitglieder sehen das Board |
| `Öffentlich` | Alle eingeloggten Benutzer können das Board lesen (Viewer) |
| `Geteilt` | Zugriff über einen einmaligen Share-Link (auch ohne Login lesbar) |

Board-Rollen:
- `Owner` – erstellt das Board, kann alles inkl. Löschen
- `Editor` – kann Elemente hinzufügen, bearbeiten und löschen
- `Viewer` – kann nur lesen, nicht bearbeiten

Einladungen erfolgen über Benutzername, nicht E-Mail.
Share-Links sind UUID v4 (kein erratbarer Link).

---

## Whiteboard-Kernfunktionen

Das Whiteboard soll als **SVG-basierter Canvas** in einer Blazor-Komponente implementiert werden.

Unterstützte Elemente:
- **Shapes:** Rechteck, Ellipse, Dreieck (mit Füll- und Rahmenfarbe, Größe und Position)
- **Texte:** Freipositionierbares Textfeld (Schriftgröße, Farbe, Fettdruck, Kursiv)
- **Verbindungen (Arrows):** Verbindungspfeile zwischen zwei Elementen (gerade Linie mit Pfeilspitze, Farbe wählbar). Jedes Element verfügt über definierte Dock-Punkte (oben, unten, links, rechts, Mittelpunkt), an denen Pfeile angehängt werden können. Bei der Bewegung eines Elements bleiben die angehängten Pfeile automatisch mit den Dock-Punkten verbunden und werden entsprechend nachgezogen.
- **Sticky Notes:** Datenmodell und Komponente anlegen, UI aber über Feature-Flag deaktiviert (für spätere Aktivierung vorbereitet)

Interaktionen:
- Elemente per Drag-and-Drop verschieben
- Elemente selektieren und löschen (Entf-Taste)
- Elemente resizen (8 Handles an der Bounding Box)
- Zoom (Mausrad) und Pan (Space+Drag)
- **Undo/Redo** (Strg+Z / Strg+Y) über einen Command-Stack im Service
- Mehrfachselektion (Shift+Klick und Lasso-Selektion)

---

## Export / Import

- **Export als PNG:** Screenshot des SVG-Canvas via JavaScript Interop
- **Export als PDF:** Serverseitige PDF-Generierung via `PdfSharp`
- **Export als JSON:** Serialisierung des Board-Datenmodells
- **Import aus JSON:** Hochladen einer zuvor exportierten JSON-Datei, vollständiges Wiederherstellen des Boards

---

## Extensibility (Vorbereitung für spätere Erweiterungen)

- **Echtzeit-Kollaboration (SignalR):** Alle Board-State-Änderungen laufen über einen abstrakten `IBoardStateNotifier`-Service. Aktuell ist die Implementierung ein No-Op. Später kann SignalR eingehängt werden, ohne die UI zu ändern.
- **Sticky Notes:** Feature-Flag in `appsettings.json`: `Features:StickyNotes: false`

---

## UI-Design

- Orientierung an der Optik von **https://github.com/features/copilot**:
  - Dunkler Header und Sidebar, heller Content-Bereich
  - Akzentfarbe: kräftiges Blau-Violett (#6E40C9 oder ähnlich)
  - Klare, serifenlose Typografie (Inter oder System-Font)
  - Abgerundete UI-Elemente, dezente Schatten für Tiefe
- Responsive für Desktop-Bildschirme (Whiteboard nicht für Mobile optimiert)
- Mehrsprachigkeit: **Deutsch und Englisch** über `IStringLocalizer` und `.resx`-Ressourcendateien
- Standardsprache: Deutsch; Sprachumschaltung im Benutzermenü

---

## Sicherheitsanforderungen

- Passwörter BCrypt-gehasht (Work Factor 12)
- XSS: alle Texteingaben für SVG-Ausgabe escapen/sanitizen
- Autorisierung auf allen Board-Zugriffen erzwingen (kein Security by Obscurity)
- Path Traversal verhindern: Board-IDs gegen UUID-Format validieren, bevor sie als Dateinamen verwendet werden
- Share-Links als UUID v4 (nicht erratbar)

---

## Nicht im Scope (aktuell)

- Echtzeit-Kollaboration (kommt später via SignalR)
- Sticky Notes UI (kommt später)
- E-Mail-Benachrichtigungen
- Mobile Unterstützung
- Docker