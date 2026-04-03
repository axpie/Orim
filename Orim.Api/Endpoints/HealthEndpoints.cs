using Microsoft.EntityFrameworkCore;
using Orim.Api.Infrastructure;
using Orim.Infrastructure.Data;

namespace Orim.Api.Endpoints;

internal static class HealthEndpoints
{
    internal static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/health/live", (HttpContext context) =>
            Results.Ok(new
            {
                status = "alive",
                requestId = context.TraceIdentifier,
                checkedAtUtc = DateTime.UtcNow
            }))
            .AllowAnonymous();

        app.MapGet("/health/ready", async (HttpContext context, OrimDbContext dbContext, ILogger<Program> logger, CancellationToken cancellationToken) =>
        {
            try
            {
                if (!await dbContext.Database.CanConnectAsync(cancellationToken))
                {
                    return EndpointHelpers.ServiceUnavailable(context, "The service is not ready.");
                }

                return Results.Ok(new
                {
                    status = "ready",
                    requestId = context.TraceIdentifier,
                    checkedAtUtc = DateTime.UtcNow
                });
            }
            catch (Exception exception)
            {
                logger.LogWarning(exception, "Readiness check failed for request {RequestId}.", context.TraceIdentifier);
                return EndpointHelpers.ServiceUnavailable(context, "The service is not ready.");
            }
        })
            .AllowAnonymous();

        return app;
    }
}
