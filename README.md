# Orim

Orim ist ein kollaborativer Whiteboard-Editor mit ASP.NET Core API und React SPA.

## Überblick

- Backend: .NET 10, ASP.NET Core Minimal API, SignalR
- Frontend: React 19, Vite, TypeScript, Konva, MUI
- Persistenz: JSON-Dateien im Dateisystem
- Authentifizierung: JWT
- Export: JSON und PDF

## Projektstruktur

- `Orim.Api`: API, SignalR-Hub, SPA-Hosting im Release-Build
- `orim-spa`: React-Frontend fuer Whiteboard, Dashboard und Administration
- `Orim.Core`: Domänenmodelle, Interfaces und Kernlogik
- `Orim.Infrastructure`: JSON-Repositories und Infrastruktur-Services
- `Orim.Tests`: xUnit-Tests

## Voraussetzungen

- .NET 10 SDK
- Node.js mit `npm`

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

## Datenhaltung

Standardmaessig speichert die API ihre Daten lokal unter `Orim.Api/data`.

Relevante Dateien:

- `data/users.json`: Benutzerkonten
- `data/boards/*.json`: Whiteboards
- `data/themes/*.json`: importierte oder angepasste Themes

Der Pfad kann ueber `DataPath` konfiguriert werden. Auf Azure App Service werden relative `DataPath`-Werte automatisch unter `%HOME%` aufgeloest.

## Konfiguration

Die Basiskonfiguration liegt in `Orim.Api/appsettings.json`.

Wichtige Einstellungen:

- `DataPath`: Speicherort fuer JSON-Daten
- `Jwt:Key`: Signierschluessel fuer Tokens
- `SeedAdmin:Username`: Benutzername des initialen Admins
- `SeedAdmin:ResetPasswordOnStartup`: optionaler Passwort-Reset beim Start

## Admin-Seed-Passwort

Das initiale Admin-Passwort wird absichtlich nicht im Repository gespeichert und muss ueber Konfiguration von aussen gesetzt werden.

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

## Lizenz

Aktuell ist keine separate Lizenzdatei im Repository hinterlegt.