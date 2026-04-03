using Microsoft.AspNetCore.Authorization;
using Orim.Api.Services;
using Orim.Infrastructure.Data;

namespace Orim.Api.Endpoints;

internal static class AdminEndpoints
{
    internal static IEndpointRouteBuilder MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/admin/deployment-readiness", [Authorize(Roles = "Admin")] async (
            OrimDbContext dbContext,
            DeploymentReadinessService deploymentReadinessService,
            CancellationToken cancellationToken) =>
        {
            var snapshot = await deploymentReadinessService.GetSnapshotAsync(dbContext, cancellationToken);
            return Results.Ok(snapshot);
        });

        return app;
    }
}
