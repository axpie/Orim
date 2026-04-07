# Orim — Enterprise Features & Deployment Guide

## Feature-Matrix

| Feature | Community | Enterprise / Self-Hosted |
|---|:---:|:---:|
| Collaborative Whiteboard | ✅ | ✅ |
| Realtime Cursors & Presence | ✅ | ✅ |
| Comments & Snapshots | ✅ | ✅ |
| JSON / PNG Export | ✅ | ✅ |
| ZIP Data Export (boards + images) | ✅ | ✅ |
| Board Templates | ✅ | ✅ |
| Board Folders & Tags | ✅ | ✅ |
| Share Links & Passwords | ✅ | ✅ |
| Role-based Access (Owner / Editor / Viewer) | ✅ | ✅ |
| Local Username/Password Auth | ✅ | ✅ |
| Microsoft 365 / Entra SSO | — | ✅ |
| Google Workspace SSO | — | ✅ |
| Custom Theming & Branding | — | ✅ |
| Admin User Management | — | ✅ |
| Deployment Readiness Cockpit | — | ✅ |
| Audit Logging | — | ✅ |
| OpenTelemetry Metrics & Tracing | — | ✅ |
| Health Endpoints (Liveness / Readiness) | — | ✅ |
| Rate Limiting (Auth & SignalR) | ✅ | ✅ |
| HTTPS / HSTS / Security Headers / CSP | ✅ | ✅ |
| Redis SignalR Backplane (Horizontal Scaling) | — | ✅ |
| Operation Journal (Board History) | ✅ | ✅ |

## Self-Hosted Deployment Guide

### Voraussetzungen

- .NET 10 Runtime oder SDK
- PostgreSQL 16+
- Node.js 20+ (nur für den Build der SPA)
- Optional: Redis 7+ (für horizontale Skalierung)
- Optional: Docker / Docker Compose

### Minimaler Start

1. **PostgreSQL bereitstellen**

   ```bash
   docker run -d --name orim-db \
     -e POSTGRES_USER=orim \
     -e POSTGRES_PASSWORD=<sicheres-passwort> \
     -e POSTGRES_DB=orim \
     -p 5432:5432 \
     postgres:17
   ```

2. **Konfiguration**

   Umgebungsvariablen oder `appsettings.json`:

   ```json
   {
     "ConnectionStrings": {
       "OrimDb": "Host=localhost;Port=5432;Database=orim;Username=orim;Password=<passwort>"
     },
     "Jwt": {
       "Key": "<mindestens-32-zeichen-zufallsschluessel>"
     },
     "SeedAdmin": {
       "Username": "admin",
       "Password": "<admin-passwort>"
     }
   }
   ```

3. **SPA bauen und API starten**

   ```bash
   cd orim-spa && npm ci && npm run build
   cp -r dist/* ../Orim.Api/wwwroot/
   cd ../Orim.Api
   dotnet run --configuration Release
   ```

   Die API liefert die SPA automatisch aus `wwwroot` aus.

4. **Erster Login**

   Navigieren Sie zu `https://<host>/login` und melden Sie sich mit den Admin-Zugangsdaten an.

### Horizontale Skalierung mit Redis

Für Multi-Instanz-Deployments hinter einem Load Balancer:

```json
{
  "ConnectionStrings": {
    "OrimDb": "Host=db-host;...",
    "Redis": "redis-host:6379"
  }
}
```

Wenn `ConnectionStrings:Redis` gesetzt ist, verwendet Orim automatisch:
- SignalR Redis Backplane für Cross-Instanz-Messaging
- Deployment Readiness prüft Redis-Konnektivität

### SSO-Konfiguration

#### Microsoft 365 / Entra

```json
{
  "Authentication": {
    "Microsoft": {
      "Enabled": true,
      "TenantId": "<azure-ad-tenant-id>",
      "ClientId": "<app-registration-client-id>",
      "Scopes": ["openid", "profile", "email"]
    }
  }
}
```

Azure App Registration:
- Plattform: Single-page application
- Redirect URI: `https://<orim-host>/login`
- Kontotyp: Nur Konten in diesem Organisationsverzeichnis

#### Google Workspace

```json
{
  "Authentication": {
    "Google": {
      "Enabled": true,
      "ClientId": "<google-oauth-client-id>",
      "HostedDomain": "meine-firma.de"
    }
  }
}
```

### Observability

#### OpenTelemetry

Aktivierung in der Konfiguration:

```json
{
  "Telemetry": {
    "Enabled": true
  }
}
```

Orim exportiert:
- **Traces**: HTTP-Requests, SignalR-Verbindungen, EF Core Queries
- **Metrics**: Request-Rate, Latenz, Active Connections

Standard-Exporter: Console (Development), OTLP (Production). Für Grafana/Jaeger/Prometheus einen OTLP-Collector konfigurieren.

#### Health Endpoints

- `GET /health/live` — Liveness Probe (Prozess läuft)
- `GET /health/ready` — Readiness Probe (DB erreichbar, Migrationen aktuell)

#### Audit Logging

Orim loggt sicherheitsrelevante Aktionen als Structured Log:

- Login / Logout (inkl. fehlgeschlagene Versuche)
- Board erstellen / löschen
- Sharing-Änderungen
- Admin-Aktionen (User-Verwaltung)

Format: Structured JSON mit `EventType`, `UserId`, `ResourceId`, `Timestamp`.
Alle Audit-Events werden mit dem Prefix `AUDIT:` geloggt und können über Log-Aggregatoren gefiltert werden.

### Deployment Readiness

Der Admin-Bereich unter `/admin/settings` zeigt einen Deployment-Readiness-Check:

- Umgebung und Version
- Datenbank-Konnektivität und Migrationsstatus
- SSO-Provider-Konfiguration
- Redis-Konnektivität (wenn konfiguriert)
- OpenTelemetry-Status
- Audit-Logging-Status

API: `GET /api/admin/deployment-readiness` (Admin-Auth erforderlich)

### Backup & Recovery

- **Datenbank**: Regelmäßige PostgreSQL-Backups (`pg_dump`)
- **Board-History**: Orim speichert Board-Operationen als Journal — bei Datenverlust können Boards aus dem Operation Log rekonstruiert werden
- **Konfiguration**: Sichern Sie `appsettings.json` und User Secrets

### Sicherheitshinweise

- JWT-Tokens werden als httpOnly-Cookies transportiert (kein localStorage)
- Alle API-Antworten enthalten Security Headers (CSP, X-Frame-Options, HSTS)
- Share-Link-Tokens verwenden 32 Bytes kryptographische Zufallsdaten
- Auth- und SignalR-Endpoints sind rate-limitiert
- Board-Passwörter werden mit PBKDF2-SHA256 (100k Iterationen) gehasht
