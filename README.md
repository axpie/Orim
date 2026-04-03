# Orim

Orim ist ein kollaborativer Whiteboard-Editor mit ASP.NET Core API und React SPA.

## Überblick

- Backend: .NET 10, ASP.NET Core Minimal API, SignalR
- Frontend: React 19, Vite, TypeScript, Konva, MUI
- Persistenz: PostgreSQL via Entity Framework Core
- Authentifizierung: JWT via httpOnly Cookie-Session
- Export: JSON und PDF

## Positionierung

ORIM ist kein generischer Whiteboard-Klon. Das Produkt ist auf **sichere interne Zusammenarbeit** ausgerichtet:

- Self-hosted oder privat gemanagte Deployments
- SSO-gestützte Team-Zugänge für Organisationen mit Governance-Anforderungen
- kontrolliertes Teilen, Kommentare, Snapshots und nachvollziehbare Administration
- Whiteboard-Zusammenarbeit für interne Teams, Beratungen und regulierte Umgebungen

## Projektstruktur

- `Orim.Api`: API, SignalR-Hub, SPA-Hosting im Release-Build
- `orim-spa`: React-Frontend fuer Whiteboard, Dashboard und Administration
- `Orim.Core`: Domänenmodelle, Interfaces und Kernlogik
- `Orim.Infrastructure`: EF Core DbContext, PostgreSQL-Repositories und Infrastruktur-Services
- `Orim.Tests`: xUnit-Tests

## Voraussetzungen

- .NET 10 SDK
- Node.js mit `npm`
- Docker Desktop (fuer lokale PostgreSQL-Datenbank) oder PostgreSQL 17+

## Lokaler Start

Im Repository-Root:

```powershell
dotnet restore .\Orim.slnx
cd .\orim-spa
npm install
```

Frontend im Entwicklungsmodus:

```powershell
cd .\orim-spa
npm run dev
```

API parallel starten:

```powershell
dotnet run --project .\Orim.Api\Orim.Api.csproj
```

Im Release-Build wird die SPA vor dem API-Build nach `Orim.Api/wwwroot` gebaut und von der API ausgeliefert.

## Datenbank (PostgreSQL)

Im DEBUG-Modus startet die API den PostgreSQL-Container automatisch via Docker Compose. Fuer manuellen Start:

```powershell
docker-compose up -d
```

Die Verbindung wird ueber den Connection-String in `Orim.Api/appsettings.json` konfiguriert:

```json
"ConnectionStrings": {
  "OrimDb": "Host=localhost;Port=5432;Database=orim;Username=orim;Password=orim"
}
```

Beim Start fuehrt die API automatisch `Database.MigrateAsync()` aus, sodass das Schema immer aktuell ist. Weitere Details zur Erstellung neuer Migrationen: siehe [docs/db_migration.md](docs/db_migration.md).

## Datenhaltung

Alle Daten werden in einer PostgreSQL-Datenbank gespeichert (Boards, Benutzer, Themes, Bilder). Die Persistenz erfolgt ueber Entity Framework Core.

## Konfiguration

Die Basiskonfiguration liegt in `Orim.Api/appsettings.json`.

Wichtige Einstellungen:

- `ConnectionStrings:OrimDb`: PostgreSQL-Verbindungszeichenfolge
- `Jwt:Key`: Signierschluessel fuer Tokens
- `SeedAdmin:Username`: Benutzername des initialen Admins
- `SeedAdmin:ResetPasswordOnStartup`: optionaler Passwort-Reset beim Start
- `Authentication:Microsoft:*`: Single-Tenant Microsoft-365-/Entra-SSO fuer dieses ORIM-Deployment

## Microsoft 365 / Entra SSO

ORIM unterstuetzt Microsoft-Entra-SSO als **single-tenant** Login pro Deployment. Die SPA meldet Benutzer ueber Microsoft an und tauscht das Microsoft-ID-Token anschliessend gegen ein ORIM-JWT fuer API und SignalR aus.

Wichtige Eigenschaften:

- bestehende lokale Anmeldung bleibt als Fallback erhalten
- Benutzer werden beim ersten erfolgreichen Microsoft-Login automatisch verknuepft oder angelegt
- die Tenant-Pruefung erfolgt serverseitig ueber die `tid`-Claim-Pruefung

## Google SSO / Google-Anmeldung

ORIM unterstuetzt Google-SSO als weitere Login-Option. Die SPA nutzt die offiziellen Google Identity Services (Client-side), die ein ID-Token (Credential) liefern. Das Backend validiert das Google-ID-Token serverseitig (Google.Apis.Auth), verlangt eine verifizierte E-Mail und tauscht die externe Identitaet gegen ein ORIM-JWT aus.

Wichtige Eigenschaften:

- lokale Anmeldung bleibt als Fallback erhalten
- nur verifizierte Google-E-Mails werden akzeptiert (verringert Risiko von Konto-Übernahmen)
- optional kann die Anmeldung auf eine Google Workspace / Hosted-Domain eingeschränkt werden (konfigurierbar über `Authentication:Google:HostedDomain`)
- Hosted-Domain wird serverseitig case-insensitiv geprüft; wenn gesetzt, wird die Domain als `ExternalTenantId` gespeichert

Beispielkonfiguration in `Orim.Api/appsettings.json` oder ueber Umgebungsvariablen:

```json
"Authentication": {
  "Microsoft": {
    "Enabled": true,
    "TenantId": "11111111-2222-3333-4444-555555555555",
    "ClientId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "Scopes": [ "openid", "profile", "email" ]
  },
  "Google": {
    "Enabled": true,
    "ClientId": "000000000000-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com",
    "HostedDomain": ""
  }
}
```

Fuer lokale User-Secrets:

```powershell
dotnet user-secrets set "Authentication:Microsoft:Enabled" "true" --project .\Orim.Api\Orim.Api.csproj
dotnet user-secrets set "Authentication:Microsoft:TenantId" "<tenant-id>" --project .\Orim.Api\Orim.Api.csproj
dotnet user-secrets set "Authentication:Microsoft:ClientId" "<client-id>" --project .\Orim.Api\Orim.Api.csproj
```

Azure-App-Registration:

- Plattform: `Single-page application`
- Redirect URI lokal: `http://localhost:5173/login`
- Redirect URI Produktion: `<deine-orim-url>/login`
- Konto-Typ: nur Konten in diesem Organisationsverzeichnis

Hinweis zum Benutzerabgleich:

- ORIM sucht zuerst nach bereits verknuepfter externer Identitaet
- danach nach passender E-Mail
- zuletzt nach passendem Benutzernamen
- wenn nichts passt, wird ein neuer ORIM-Benutzer mit Rolle `User` angelegt

## Admin-Seed-Passwort

Das initiale Admin-Passwort wird absichtlich nicht im Repository gespeichert und muss ueber Konfiguration von aussen gesetzt werden.

Für die lokale **Development-/Debug-Konfiguration** ist `SeedAdmin:Password` auf `Admin123!` gesetzt und `SeedAdmin:ResetPasswordOnStartup` aktiviert. Dadurch wird das lokale Admin-Konto beim Debug-Start deterministisch auf `admin` / `Admin123!` zurückgesetzt, auch wenn die Development-Datenbank bereits existiert.

User-Secrets lokal:

```powershell
dotnet user-secrets init --project .\Orim.Api\Orim.Api.csproj
dotnet user-secrets set "SeedAdmin:Password" "EinSehrSicheresPasswort!" --project .\Orim.Api\Orim.Api.csproj
```

Temporär per Umgebungsvariable:

```powershell
$Env:SeedAdmin__Password = "EinSehrSicheresPasswort!"
dotnet run --project .\Orim.Api\Orim.Api.csproj
```

## Profil- und Benutzerverwaltung

ORIM enthaelt eine integrierte Konto- und Benutzerverwaltung:

- Benutzer koennen unter `/profile` ihren Anzeigenamen und ihr eigenes Passwort aendern.
- Administratoren koennen unter `/admin/users` Benutzer anlegen, deaktivieren, loeschen, Benutzernamen aendern, Rollen zwischen `User` und `Admin` wechseln und Passwoerter neu setzen.
- Zum Schutz vor Aussperrung verhindert ORIM, dass der letzte aktive Administrator deaktiviert, geloescht oder zu einem normalen Benutzer herabgestuft wird.

## Anzeigenamen in der Live-Zusammenarbeit

Die Live-Praesenz im Whiteboard basiert auf SignalR. Anzeigenamen werden fuer aktive Board-Sitzungen synchron gehalten:

- neue oder aktualisierte Anzeigenamen werden bei Board-Beitritt serverseitig aus dem Benutzerprofil aufgeloest
- geoeffnete Browser-Tabs uebernehmen Profil-Aenderungen per Storage-Sync
- laufende Board-Verbindungen aktualisieren ihre Presence-Eintraege automatisch, damit andere aktive Teilnehmer den neuen Anzeigenamen sehen

Hinweis: Kommentare, Snapshots und Board-Mitgliedschaften verwenden weiterhin den Benutzernamen als stabile technische Kennung.

## Design-Partner- / Deployment-Readiness

ORIM bringt eine betriebliche Readiness-Schicht für geschlossene Betas und Design-Partner-Piloten mit:

- `/admin/settings` zeigt einen Deployment-Readiness-Check mit Umgebung, Version, Datenbank-Provider, Migrationen, SSO-, Assistant- und Theme-Status
- `/api/admin/deployment-readiness` liefert dieselben Signale maschinenlesbar für Admin-Oberflächen oder spätere Ops-Automation
- `/health/live` und `/health/ready` stehen für Liveness- und Readiness-Probes bereit
- API-Antworten enthalten `X-Request-Id` zur Korrelation von Support-Fällen und Log-Einträgen
- Auth- und SignalR-Zugänge sind rate-limitiert
- Browser-Sessions verwenden httpOnly-Cookies statt im Frontend gespeicherter Tokens

Für einen glaubwürdigen Design-Partner-Pilot sollten mindestens folgende Punkte erfüllt sein:

1. PostgreSQL ist erreichbar und es gibt keine offenen Migrationen.
2. Das Deployment läuft außerhalb von `Development`, damit HSTS aktiv ist.
3. Mindestens ein Enterprise-SSO-Provider ist konfiguriert, wenn der Pilot SSO erwartet.
4. CI und lokale Validierung laufen vor jedem Release durch.

## Validierung und CI

Die GitHub-Actions-CI unter `.github/workflows/ci.yml` validiert:

- `dotnet build Orim.Api\Orim.Api.csproj --no-incremental`
- `dotnet test Orim.Tests\Orim.Tests.csproj`
- `cd orim-spa && npm run lint`
- `cd orim-spa && npm run build`

## Nützliche Befehle

Gesamtlösung bauen:

```powershell
dotnet build .\Orim.slnx /p:UseAppHost=false
```

Frontend-Build:

```powershell
cd .\orim-spa
npm run build
```

Tests:

```powershell
dotnet test .\Orim.Tests\Orim.Tests.csproj /p:UseAppHost=false
```

## Enterprise Features & Self-Hosted Deployment

Eine vollständige Feature-Matrix, Self-Hosted Deployment-Anleitung, SSO-Konfiguration, Observability-Setup und Sicherheitshinweise finden Sie unter [docs/enterprise-features.md](docs/enterprise-features.md).

## Lizenz

Aktuell ist keine separate Lizenzdatei im Repository hinterlegt.
