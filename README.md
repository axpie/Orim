# ORIM

## Quick Start

Requires [Docker](https://docs.docker.com/get-docker/).

**1. Create a `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:17
    environment:
      POSTGRES_USER: orim
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: orim
    volumes:
      - orim-pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U orim"]
      interval: 5s
      retries: 10
    restart: unless-stopped

  orim:
    image: ghcr.io/axpie/orim:latest
    ports:
      - "5000:5000"
    environment:
      ConnectionStrings__DefaultConnection: "Host=db;Port=5432;Database=orim;Username=orim;Password=changeme"
      Jwt__Key: "replace-this-with-a-random-32-char-secret!!"
      SeedAdmin__Password: "Admin123!"
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

volumes:
  orim-pgdata:
```

**2. Start**

```bash
docker compose up -d
```

Open **http://localhost:5000** — log in with `admin` / `Admin123!`.

> Change `changeme`, `Jwt__Key` and `SeedAdmin__Password` before any non-local deployment.

---

ORIM is a collaborative whiteboard editor with an ASP.NET Core API and a React SPA.

## Overview

- Backend: .NET 10, ASP.NET Core Minimal API, SignalR
- Frontend: React 19, Vite, TypeScript, Konva, MUI
- Persistence: PostgreSQL via Entity Framework Core
- Authentication: JWT via httpOnly cookie session
- Export: JSON, PNG and ZIP (full data export)

## Positioning

ORIM is not a generic whiteboard clone. The product is focused on **secure internal collaboration**:

- Self-hosted or privately managed deployments
- SSO-backed team access for organisations with governance requirements
- Controlled sharing, comments, snapshots and traceable administration
- Whiteboard collaboration for internal teams, consulting, and regulated environments

## Project Structure

- `Orim.Api`: API, SignalR hub, SPA hosting in release builds
- `orim-spa`: React frontend for whiteboard, dashboard and administration
- `Orim.Core`: Domain models, interfaces and core logic
- `Orim.Infrastructure`: EF Core DbContext, PostgreSQL repositories and infrastructure services
- `Orim.Tests`: xUnit tests

## Prerequisites

- .NET 10 SDK
- Node.js with `npm`
- Docker Desktop (for local PostgreSQL database) or PostgreSQL 17+

## Local Setup

### Quick start (Visual Studio 2022)

1. **Clone** the repository.
2. **Create your local configuration file** from the example:
   ```powershell
   Copy-Item .\Orim.Api\appsettings.Development.json.example .\Orim.Api\appsettings.Development.json
   ```
3. **Edit** `Orim.Api/appsettings.Development.json` and set at minimum:
   - `Jwt:Key` — any random string of at least 32 characters (e.g. `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`)
   - `SeedAdmin:Password` — the initial admin password (default `Admin123!` is fine for local dev)
4. **Hit F5** in Visual Studio.

That's it. On the first Debug build Visual Studio will:
- Start the PostgreSQL Docker container via `docker compose up -d`
- Install npm packages if `node_modules` is missing
- Launch the Vite dev server (`npm run dev`) and wait for it to be ready
- Open the browser at `http://localhost:5173`

The API runs on `https://localhost:61967`. The Vite dev server proxies API calls to it automatically.

### Command-line setup

```powershell
# Restore .NET dependencies
dotnet restore .\Orim.slnx

# Install frontend dependencies
cd .\orim-spa && npm install && cd ..

# Start the PostgreSQL container
docker compose up -d

# In one terminal: start the SPA dev server
cd .\orim-spa && npm run dev

# In another terminal: start the API
dotnet run --project .\Orim.Api\Orim.Api.csproj
```

In a release build, the SPA is compiled into `Orim.Api/wwwroot` and served by the API directly.

## Database (PostgreSQL)

The Docker Compose file (`docker-compose.yml`) at the repository root starts a local PostgreSQL 17 container. The connection string in `Orim.Api/appsettings.json` points to it by default — no changes needed for local development.

On startup the API automatically runs `Database.MigrateAsync()` so the schema is always up to date. For details on creating new migrations see [docs/db_migration.md](docs/db_migration.md).

## Data Storage

All data is stored in a PostgreSQL database (boards, users, themes, images). Persistence is handled via Entity Framework Core.

## Configuration

The base configuration lives in `Orim.Api/appsettings.json`. Developer-specific overrides go in `Orim.Api/appsettings.Development.json` — **this file is git-ignored** and must be created locally (see [Local Setup](#local-setup)). A template with all required keys is provided in `Orim.Api/appsettings.Development.json.example`.

For production or CI, use environment variables or .NET User Secrets instead of committing secrets.

Important settings:

- `ConnectionStrings:DefaultConnection`: PostgreSQL connection string
- `Jwt:Key`: signing key for tokens (minimum 32 characters, keep secret)
- `SeedAdmin:Username`: username of the initial admin
- `SeedAdmin:Password`: password for the admin seed (set via `appsettings.Development.json` or user secrets)
- `SeedAdmin:ResetPasswordOnStartup`: optional password reset on startup
- `Authentication:Microsoft:*`: Single-tenant Microsoft 365 / Entra SSO for this ORIM deployment

## Microsoft 365 / Entra SSO

ORIM supports Microsoft Entra SSO as a **single-tenant** login per deployment. The SPA signs users in via Microsoft and then exchanges the Microsoft ID token for an ORIM JWT used for the API and SignalR.

Key properties:

- An existing local login remains available as fallback
- Users are automatically linked or created on their first successful Microsoft login
- Tenant verification happens server-side via `tid` claim validation

## Google SSO

ORIM supports Google SSO as an additional login option. The SPA uses the official Google Identity Services (client-side) to obtain an ID token. The backend validates the Google ID token server-side (Google.Apis.Auth), requires a verified email, and exchanges the external identity for an ORIM JWT.

Key properties:

- Local login remains available as fallback
- Only verified Google email addresses are accepted
- The login can optionally be restricted to a Google Workspace / hosted domain (`Authentication:Google:HostedDomain`)

Example configuration in `Orim.Api/appsettings.json` or via environment variables:

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

For local user secrets:

```powershell
dotnet user-secrets set "Authentication:Microsoft:Enabled" "true" --project .\Orim.Api\Orim.Api.csproj
dotnet user-secrets set "Authentication:Microsoft:TenantId" "<tenant-id>" --project .\Orim.Api\Orim.Api.csproj
dotnet user-secrets set "Authentication:Microsoft:ClientId" "<client-id>" --project .\Orim.Api\Orim.Api.csproj
```

Azure App Registration:

- Platform: `Single-page application`
- Redirect URI local: `http://localhost:5173/login`
- Redirect URI production: `<your-orim-url>/login`
- Account type: accounts in this organisational directory only

User matching precedence:

- ORIM first looks for an already linked external identity
- then for a matching email
- then for a matching username
- if nothing matches, a new ORIM user with the `User` role is created

## Admin Seed Password

The initial admin password is intentionally not stored in the repository and must be injected via configuration.

For the local **development/debug configuration**, `SeedAdmin:Password` is set to `Admin123!` and `SeedAdmin:ResetPasswordOnStartup` is enabled. This resets the local admin account to `admin` / `Admin123!` on every debug start.

Local user secrets:

```powershell
dotnet user-secrets init --project .\Orim.Api\Orim.Api.csproj
dotnet user-secrets set "SeedAdmin:Password" "ASecurePassword!" --project .\Orim.Api\Orim.Api.csproj
```

Temporarily via environment variable:

```powershell
$Env:SeedAdmin__Password = "ASecurePassword!"
dotnet run --project .\Orim.Api\Orim.Api.csproj
```

## Profile and User Management

ORIM includes integrated account and user management:

- Users can change their display name and password at `/profile`.
- Administrators can create, deactivate, delete users, change usernames, switch roles between `User` and `Admin`, and reset passwords at `/admin/users`.
- ORIM prevents the last active administrator from being deactivated, deleted or demoted.

## Display Names in Live Collaboration

Live presence in the whiteboard is based on SignalR. Display names are kept in sync for active board sessions:

- New or updated display names are resolved server-side from the user profile when joining a board
- Open browser tabs pick up profile changes via storage sync
- Active board connections update their presence entries automatically so other participants see the new display name

Note: comments, snapshots and board memberships continue to use the username as the stable technical identifier.

## Deployment Readiness

ORIM includes an operational readiness layer for closed betas and design-partner pilots:

- `/admin/settings` shows a deployment readiness check with environment, version, database provider, migrations, SSO, assistant and theme status.
- `/api/admin/deployment-readiness` exposes the same signals in a machine-readable format.
- `/health/live` and `/health/ready` are available for liveness and readiness probes.
- API responses include `X-Request-Id` for correlating support cases and log entries.
- Auth and SignalR endpoints are rate-limited.
- Browser sessions use httpOnly cookies instead of frontend-stored tokens.

For a credible design-partner pilot, the following should be met:

1. PostgreSQL is reachable and there are no pending migrations.
2. The deployment runs outside `Development` so HSTS is active.
3. At least one enterprise SSO provider is configured if the pilot expects SSO.
4. CI and local validation pass before every release.

## Validation and CI

The GitHub Actions CI under `.github/workflows/ci.yml` validates:

- `dotnet build Orim.Api\Orim.Api.csproj --no-incremental`
- `dotnet test Orim.Tests\Orim.Tests.csproj`
- `cd orim-spa && npm run lint`
- `cd orim-spa && npm run build`

## Useful Commands

Build the full solution:

```powershell
dotnet build .\Orim.slnx /p:UseAppHost=false
```

Frontend build:

```powershell
cd .\orim-spa
npm run build
```

Tests:

```powershell
dotnet test .\Orim.Tests\Orim.Tests.csproj /p:UseAppHost=false
```

## Enterprise Features & Self-Hosted Deployment

A complete feature matrix, self-hosted deployment guide, SSO configuration, observability setup and security notes can be found at [docs/enterprise-features.md](docs/enterprise-features.md).

## Export

### PNG Export

The whiteboard can be exported as a PNG image directly from the browser. Open any board, click the **Export** menu in the toolbar and choose **Export as PNG**. The export uses the current canvas at ≥2× pixel density (retina-quality). The resulting file is named after the board title.

The PNG export is entirely client-side — the canvas is rendered via [Konva](https://konvajs.org/)'s `stage.toDataURL()` and no data is sent to the server.

### ZIP Data Export

Users can download all their boards and images as a single ZIP file via **Settings → My Data → Download as ZIP**. The server endpoint `GET /api/user/export/zip` exports:

- All boards owned by the user as individual JSON files
- The folder hierarchy is mirrored in the ZIP directory structure
- All uploaded images under `images/`

The export uses `System.IO.Compression` from the .NET BCL — no additional packages required.

## Dependencies

### NuGet Packages (Backend)

#### Orim.Api
| Package | Version |
|---|---|
| OpenAI | 2.2.0 |
| Google.Apis.Auth | 1.73.0 |
| Microsoft.AspNetCore.Authentication.JwtBearer | 10.0.5 |
| Microsoft.AspNetCore.SignalR.StackExchangeRedis | (latest) |
| OpenTelemetry.Exporter.Console | 1.15.1 |
| OpenTelemetry.Extensions.Hosting | 1.15.1 |
| OpenTelemetry.Instrumentation.AspNetCore | 1.15.1 |
| OpenTelemetry.Instrumentation.Http | 1.15.0 |

#### Orim.Core
| Package | Version |
|---|---|
| BCrypt.Net-Next | 4.1.0 |

#### Orim.Infrastructure
| Package | Version |
|---|---|
| Microsoft.EntityFrameworkCore | 10.0.4 |
| Microsoft.EntityFrameworkCore.Design | 10.0.4 |
| Microsoft.Extensions.DependencyInjection.Abstractions | 10.0.5 |
| Npgsql.EntityFrameworkCore.PostgreSQL | 10.0.1 |

#### Orim.Tests
| Package | Version |
|---|---|
| Microsoft.NET.Test.Sdk | 17.14.0 |
| xunit | 2.9.3 |
| xunit.runner.visualstudio | 3.1.0 |
| NSubstitute | 5.3.0 |
| Microsoft.EntityFrameworkCore.InMemory | 10.0.4 |

### npm Packages (Frontend — orim-spa)

#### Dependencies
| Package | Version |
|---|---|
| @azure/msal-browser | ^4.26.0 |
| @emotion/react | ^11.14.0 |
| @emotion/styled | ^11.14.1 |
| @mdi/js | ^7.4.47 |
| @microsoft/signalr | ^10.0.0 |
| @mui/icons-material | ^7.3.9 |
| @mui/material | ^7.3.9 |
| @react-oauth/google | ^0.13.4 |
| @tanstack/react-query | ^5.95.2 |
| axios | ^1.14.0 |
| i18next | ^26.0.1 |
| konva | ^10.2.3 |
| react | ^19.2.4 |
| react-dom | ^19.2.4 |
| react-i18next | ^17.0.1 |
| react-konva | ^19.2.3 |
| react-router-dom | ^7.13.2 |
| uuid | ^13.0.0 |
| zustand | ^5.0.12 |

#### Dev Dependencies
| Package | Version |
|---|---|
| @eslint/js | ^9.39.4 |
| @testing-library/jest-dom | ^6.9.1 |
| @testing-library/react | ^16.3.2 |
| @types/node | ^24.12.0 |
| @types/react | ^19.2.14 |
| @types/react-dom | ^19.2.3 |
| @types/uuid | ^10.0.0 |
| @vitejs/plugin-react | ^6.0.1 |
| eslint | ^9.39.4 |
| eslint-plugin-react-hooks | ^7.0.1 |
| eslint-plugin-react-refresh | ^0.5.2 |
| globals | ^17.4.0 |
| jsdom | ^29.0.1 |
| typescript | ~5.9.3 |
| typescript-eslint | ^8.57.0 |
| vite | ^8.0.1 |
| vitest | ^4.1.2 |

## License

ORIM is released under the [MIT License](LICENSE). You are free to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the software.

See [LICENSE](LICENSE) for the full terms.

---

# ORIM — Deutsch

Orim ist ein kollaborativer Whiteboard-Editor mit ASP.NET Core API und React SPA.

## Überblick

- Backend: .NET 10, ASP.NET Core Minimal API, SignalR
- Frontend: React 19, Vite, TypeScript, Konva, MUI
- Persistenz: PostgreSQL via Entity Framework Core
- Authentifizierung: JWT via httpOnly Cookie-Session
- Export: JSON, PNG und ZIP (vollständiger Datenexport)

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

## Admin-Seed-Passwort

Das initiale Admin-Passwort wird absichtlich nicht im Repository gespeichert und muss ueber Konfiguration von aussen gesetzt werden.

Für die lokale **Development-/Debug-Konfiguration** ist `SeedAdmin:Password` auf `Admin123!` gesetzt und `SeedAdmin:ResetPasswordOnStartup` aktiviert. Dadurch wird das lokale Admin-Konto beim Debug-Start deterministisch auf `admin` / `Admin123!` zurückgesetzt.

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
- laufende Board-Verbindungen aktualisieren ihre Presence-Eintraege automatisch

Hinweis: Kommentare, Snapshots und Board-Mitgliedschaften verwenden weiterhin den Benutzernamen als stabile technische Kennung.

## Design-Partner- / Deployment-Readiness

ORIM bringt eine betriebliche Readiness-Schicht für geschlossene Betas und Design-Partner-Piloten mit:

- `/admin/settings` zeigt einen Deployment-Readiness-Check mit Umgebung, Version, Datenbank-Provider, Migrationen, SSO-, Assistant- und Theme-Status
- `/api/admin/deployment-readiness` liefert dieselben Signale maschinenlesbar
- `/health/live` und `/health/ready` stehen für Liveness- und Readiness-Probes bereit

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

## Export

### PNG-Export

Das Whiteboard kann direkt im Browser als PNG exportiert werden. Board öffnen, im Toolbar auf **Exportieren** klicken und **Als PNG exportieren** wählen. Das Bild wird mit mindestens 2-facher Pixeldichte (Retina-Qualität) erstellt und nach dem Board-Titel benannt.

Der PNG-Export ist vollständig clientseitig – der Canvas wird via Konvas `stage.toDataURL()` gerendert, es werden keine Daten an den Server übertragen.

### ZIP-Datenexport

Unter **Einstellungen → Meine Daten → Als ZIP herunterladen** können Benutzer alle eigenen Boards und Bilder als ZIP-Datei exportieren. Der Endpunkt `GET /api/user/export/zip` erzeugt:

- Alle eigenen Boards als einzelne JSON-Dateien
- Die Ordnerstruktur aus ORIM wird als Verzeichnisstruktur in der ZIP-Datei abgebildet
- Alle hochgeladenen Bilder unter `images/`

## Verwendete Pakete

Eine vollständige Paketliste mit Versionsnummern befindet sich im englischen Abschnitt oben unter [Dependencies](#dependencies).

## Lizenz

ORIM steht unter der [MIT-Lizenz](LICENSE). Nutzung, Kopieren, Modifizieren, Weiterverbreitung und Verkauf sind frei gestattet.

Die vollständigen Lizenzbedingungen finden Sie in [LICENSE](LICENSE).
