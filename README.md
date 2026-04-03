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
