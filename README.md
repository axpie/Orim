# Orim

Orim ist ein kollaborativer Whiteboard-Editor auf Basis von ASP.NET Core und serverseitigem Blazor.

## Überblick

- Framework: .NET 10, ASP.NET Core, Blazor Server
- UI: MudBlazor
- Persistenz: JSON-Dateien im Dateisystem
- Authentifizierung: Cookie Authentication
- Sprachen: Deutsch und Englisch
- Export: JSON und PDF

## Projektstruktur

- `Orim.Web`: Webanwendung und Blazor-Komponenten
- `Orim.Core`: Domänenmodelle, Interfaces und Kernlogik
- `Orim.Infrastructure`: JSON-Repositories und Infrastruktur-Services

## Voraussetzungen

- .NET 10 SDK
- Windows, macOS oder Linux mit aktuellem `dotnet`-CLI

## Lokaler Start

Im Repository-Root:

```powershell
dotnet restore
dotnet build .\Orim.Web\Orim.Web.csproj /p:UseAppHost=false
dotnet run --project .\Orim.Web\Orim.Web.csproj
```

Standard-URLs in der Entwicklung:

- `https://localhost:7190`
- `http://localhost:5030`

## Datenhaltung

Standardmäßig speichert die Anwendung ihre Daten unter `Orim.Web/data`.

Relevante Dateien:

- `data/users.json`: Benutzerkonten
- `data/boards/*.json`: Whiteboards

Der Pfad kann über die Konfiguration `DataPath` geändert werden.

## Konfiguration

Die Basiskonfiguration liegt in `Orim.Web/appsettings.json`.

Wichtige Einstellungen:

- `DataPath`: Speicherort für JSON-Daten
- `SeedAdmin:Username`: Benutzername des initialen Admins, Standard ist `admin`
- `SeedAdmin:ResetPasswordOnStartup`: Erzwingt auf Wunsch ein Passwort-Reset des vorhandenen Admins beim Start
- `Features:StickyNotes`: reserviertes Feature-Flag

## Admin-Seed-Passwort einrichten

Die Anwendung legt den ersten Admin automatisch an, wenn noch kein Admin mit dem konfigurierten Benutzernamen existiert.

Wichtig:

- Das Passwort steht absichtlich nicht in `appsettings.json`.
- Das Passwort muss über Konfiguration von außen gesetzt werden.
- In Produktion startet die Anwendung nicht, wenn kein Admin existiert und `SeedAdmin:Password` nicht gesetzt ist.

### Wie `SeedAdmin__Password` funktioniert

In .NET entspricht die Umgebungsvariable `SeedAdmin__Password` der Konfiguration `SeedAdmin:Password`.

### Entwicklung mit User Secrets

Empfohlen für lokale Entwicklung:

```powershell
dotnet user-secrets init --project .\Orim.Web\Orim.Web.csproj
dotnet user-secrets set "SeedAdmin:Password" "EinSehrSicheresPasswort!" --project .\Orim.Web\Orim.Web.csproj
```

Danach die Anwendung normal starten.

### Entwicklung mit Umgebungsvariable

PowerShell:

```powershell
$Env:SeedAdmin__Password = "EinSehrSicheresPasswort!"
dotnet run --project .\Orim.Web\Orim.Web.csproj
```

Die Variable gilt in diesem Fall nur für die aktuelle Shell.

### Verhalten beim ersten Start

- Existiert noch kein Admin-Benutzer, wird ein Admin mit `SeedAdmin:Username` und dem konfigurierten Passwort angelegt.
- Existiert der Admin bereits, wird `SeedAdmin__Password` ignoriert.
- Soll ein vorhandenes Admin-Passwort beim Start bewusst ersetzt werden, muss zusätzlich `SeedAdmin:ResetPasswordOnStartup=true` gesetzt werden.

Beispiel in PowerShell:

```powershell
$Env:SeedAdmin__Password = "NeuesSicheresPasswort!"
$Env:SeedAdmin__ResetPasswordOnStartup = "true"
dotnet run --project .\Orim.Web\Orim.Web.csproj
```

Danach sollte `SeedAdmin__ResetPasswordOnStartup` wieder entfernt oder auf `false` gesetzt werden.

### Azure App Service

Für Azure App Service sollte das Seed-Passwort als Application Setting oder Key Vault Referenz gesetzt werden.

Benötigte App Settings:

- `SeedAdmin__Password`
- optional `SeedAdmin__Username`
- optional `SeedAdmin__ResetPasswordOnStartup`
- optional `DataPath`

Empfohlenes Vorgehen für das erste Deployment:

1. `SeedAdmin__Password` mit einem langen zufälligen Passwort setzen.
2. Falls ein bestehender Admin absichtlich überschrieben werden soll, zusätzlich `SeedAdmin__ResetPasswordOnStartup=true` setzen.
3. Anwendung starten und den ersten Login durchführen.
4. Danach `SeedAdmin__ResetPasswordOnStartup` wieder auf `false` setzen.
5. Wenn kein weiterer Seed mehr nötig ist, `SeedAdmin__Password` aus der App-Konfiguration entfernen.

Beispiel mit Azure CLI:

```powershell
az webapp config appsettings set \
  --resource-group <resource-group> \
  --name <app-name> \
  --settings SeedAdmin__Password="EinSehrSicheresPasswort!"
```

### Sicherheits-Hinweise

- Keine Passwörter in Git einchecken.
- Für Produktion bevorzugt Azure Key Vault verwenden.
- Das Seed-Passwort nur für Initialisierung oder kontrollierte Rotation nutzen.
- Nach erfolgreichem Rollout das Seed-Passwort aus der Konfiguration entfernen, wenn es nicht mehr gebraucht wird.

## Authentifizierung und Rollen

- `Admin`: Benutzerverwaltung und volle Verwaltung
- `User`: reguläre Nutzung von Boards entsprechend Berechtigungen

Boards unterstützen unterschiedliche Sichtbarkeiten und Rollen innerhalb eines Boards.

## Entwicklungshinweise

- Die Anwendung nutzt lokalisierte Ressourcen über `.resx`-Dateien.
- Whiteboard-Daten werden dateibasiert gespeichert, deshalb sollte `DataPath` in Produktionsumgebungen auf persistenten Speicher zeigen.
- Wenn `dotnet build` fehlschlägt, ist häufig noch eine laufende Instanz von `Orim.Web` aktiv, die Ausgabedateien sperrt.

## Nützliche Befehle

Build:

```powershell
dotnet build .\Orim.slnx /p:UseAppHost=false
```

Nur Webprojekt starten:

```powershell
dotnet run --project .\Orim.Web\Orim.Web.csproj
```

## Lizenz

Aktuell ist keine separate Lizenzdatei im Repository hinterlegt.