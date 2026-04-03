# Copilot Instructions for Orim

## Build, test, and lint commands

- Backend/API build: `dotnet build Orim.Api/Orim.Api.csproj`
- Full .NET test suite: `dotnet test Orim.Tests/Orim.Tests.csproj`
- Run a single xUnit test: `dotnet test Orim.Tests/Orim.Tests.csproj --filter "FullyQualifiedName~Orim.Tests.Core.Services.UserServiceTests.CreateUserAsync_ValidInput_CreatesUser"`
- Frontend build: `cd orim-spa && npm run build`
- Frontend lint: `cd orim-spa && npm run lint`

When validating locally, prefer running the .NET build and .NET tests sequentially instead of in parallel because the projects share `bin/obj` outputs and `Orim.Core` can hit file-lock conflicts during concurrent builds.

There is no frontend test runner configured in `orim-spa/package.json`; automated tests currently live in `Orim.Tests`.

## High-level architecture

`Orim.Api` is the composition root. It is an ASP.NET Core Minimal API that configures dependency injection, JWT authentication, CORS, SignalR, theme/assistant services, and all REST endpoints in `Program.cs`. In release builds it also serves the compiled SPA from `wwwroot`.

`Orim.Core` contains the domain model and the business rules. `BoardService`, `UserService`, `BoardPresenceService`, and `BoardChangeNotifier` are the main coordination points for board lifecycle, membership/access rules, realtime presence, and change notifications.

`Orim.Infrastructure` persists data in PostgreSQL via Entity Framework Core. `EfBoardRepository` and `EfUserRepository` implement the repository interfaces using `OrimDbContext`. Migrations are managed through EF Core and applied automatically at startup via `Database.MigrateAsync()`.

`orim-spa` is a React 19 + Vite + TypeScript SPA. React Query handles API fetch/mutation flows, Zustand stores hold editor/auth/offline state, and Konva powers the whiteboard canvas. The whiteboard editor loads a board over HTTP, keeps local state in Zustand, and syncs collaboration changes through SignalR.

The realtime path is operation-based rather than document-diff based. The SPA derives `BoardOperation` values such as `element.added`, `element.updated`, and `board.metadata.updated`, sends them through `useSignalR`, and applies remote operations back into `boardStore`. `BoardStateUpdated` still exists as a fallback/full-state sync path.

Authentication is a two-step flow for SSO providers. The SPA obtains a Microsoft or Google ID token, exchanges it with the API for an ORIM JWT, stores `orim_token` and `orim_user` in `localStorage`, and then both axios and SignalR use that JWT for subsequent calls.

## Key conventions

Keep the TypeScript models in `orim-spa/src/types/models.ts` aligned with the C# models and API contracts in `Orim.Core` and `Orim.Api`. JSON is consistently camelCase and enums are serialized as strings for both HTTP and SignalR payloads.

Board mutations are modeled as serializable operations across the whole stack. If you add a new board-editing behavior, update the shared operation vocabulary and the apply/derive logic instead of introducing an ad hoc payload shape on only one side.

The collaboration model is offline-aware. Pending board operations are persisted in the Zustand outbox store (`orim-board-operation-outbox`) and flushed after reconnect, so changes to collaboration flows should preserve enqueue/flush behavior instead of assuming a permanently connected client.

Conflict handling is explicit. Undo/redo and remote-op reconciliation surface conflicts through `boardStore.commandConflict`; the existing pattern is to expose conflicts rather than silently discarding divergent local intent.

Authorization is role-driven at multiple layers. Board access is based on `Owner`/`Editor`/`Viewer` membership plus share-link access, and the same access rules are enforced in REST endpoints, core services, and `BoardHub`.

Persistence uses PostgreSQL via EF Core. Services load entities through the repository interfaces, mutate them in memory, and save changes back through `SaveChangesAsync()`. Database schema changes are managed through EF Core migrations in `Orim.Infrastructure/Migrations/`.

Debug builds use Docker Compose to automatically start a local PostgreSQL container. The connection string is configured in `appsettings.json` under `ConnectionStrings:OrimDb`.

External login linking has a defined precedence: first by `(provider, external subject)`, then by email, then by username, otherwise a new ORIM user is created. Preserve that order when touching SSO flows.

Usernames and display names are intentionally different concepts. Profile display names propagate into presence/live collaboration, while usernames remain the stable technical identifier used in memberships, comments, and snapshots.
