# Datenbank-Migration (EF Core)

## Voraussetzungen

- .NET SDK 10.0+
- dotnet-ef Tool (`dotnet tool install --global dotnet-ef`)
- PostgreSQL-Datenbank läuft (Docker oder remote)

## Schritt-für-Schritt Anleitung

### 1. Codeänderungen vornehmen

- Modelle in `Orim.Core/Models/` anpassen
- ggf. `OrimDbContext` in `Orim.Infrastructure/Data/OrimDbContext.cs` aktualisieren (Fluent API, neue DbSets)

### 2. Migration erstellen

```bash
cd D:\Projects\Orim
dotnet ef migrations add <MigrationName> --project Orim.Infrastructure --startup-project Orim.Api
```

- MigrationName sollte beschreibend sein, z.B. `AddBoardTags`, `RenameUserField`
- Die Migration wird in `Orim.Infrastructure/Migrations/` erstellt

### 3. Migration prüfen

- Die generierte Datei in `Orim.Infrastructure/Migrations/` öffnen und prüfen
- Besonders auf Datenverlust achten (DROP COLUMN, ALTER TYPE etc.)
- Bei Bedarf die `Up()` und `Down()` Methoden manuell anpassen

### 4. Migration anwenden

Die Migration wird beim nächsten Start der Anwendung automatisch angewandt (`Database.MigrateAsync()` in `Program.cs`).

Alternativ manuell:

```bash
dotnet ef database update --project Orim.Infrastructure --startup-project Orim.Api
```

### 5. Rollback (falls nötig)

```bash
dotnet ef database update <VorherigeMigration> --project Orim.Infrastructure --startup-project Orim.Api
```

## Tipps

- Vor jeder Migration ein Backup der Datenbank erstellen
- Migrationen immer in einer Entwicklungsumgebung testen
- Bei komplexen Änderungen: Datenmigration in separaten Schritten durchführen
- `dotnet ef migrations list` zeigt alle vorhandenen Migrationen
- `dotnet ef migrations remove` entfernt die letzte nicht angewandte Migration

## Häufige Szenarien

### Neues Feld hinzufügen

1. Property zum C#-Model hinzufügen
2. ggf. Fluent API in OrimDbContext aktualisieren
3. `dotnet ef migrations add AddFeldName ...`
4. Anwendung neu starten

### Feld umbenennen

1. Property umbenennen
2. Migration erstellen
3. In der Migration prüfen, ob EF Core ein Rename oder Drop+Create generiert hat
4. Bei Drop+Create manuell zu `RenameColumn` ändern

### Neue Entität/Tabelle

1. Neues Model + DbSet in OrimDbContext
2. Fluent API Konfiguration hinzufügen
3. Migration erstellen und prüfen
