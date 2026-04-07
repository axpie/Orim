using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Orim.Api.Contracts;
using Orim.Api.Hubs;
using Orim.Api.Infrastructure;
using Orim.Api.Services;
using Orim.Core.Models;
using Orim.Core.Services;

namespace Orim.Api.Endpoints;

internal static class UserEndpoints
{
    internal static IEndpointRouteBuilder MapUserEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/users", [Authorize(Roles = "Admin")] async (UserService userService) =>
        {
            var users = await userService.GetAllUsersAsync();
            return Results.Ok(users.Select(EndpointHelpers.ToUserDto));
        });

        app.MapGet("/api/users/{id:guid}", [Authorize] async (Guid id, HttpContext context, UserService userService) =>
        {
            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!EndpointHelpers.IsAdmin(context.User) && userId != id)
                return Results.Forbid();

            var user = await userService.GetByIdAsync(id);
            return user is null ? Results.NotFound() : Results.Ok(EndpointHelpers.ToUserDto(user));
        });

        app.MapPost("/api/users", [Authorize(Roles = "Admin")] async (CreateUserRequest request, UserService userService, HttpContext context, ILogger<Program> logger, AuditLogger audit) =>
        {
            try
            {
                var user = await userService.CreateUserAsync(request.Username, request.Password, request.Role);
                if (EndpointHelpers.GetUserId(context.User) is { } adminUserId)
                {
                    audit.LogAdminAction(adminUserId, "user.create", $"UserId={user.Id} Username={user.Username} Role={user.Role}");
                }
                return Results.Created($"/api/users/{user.Id}", EndpointHelpers.ToUserDto(user));
            }
            catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
            {
                logger.LogWarning(ex, "Creating a user failed.");
                return EndpointHelpers.BadRequest(context, "The user could not be created.");
            }
        });

        app.MapPut("/api/users/{id:guid}/profile", [Authorize] async (Guid id, UpdateProfileRequest request, HttpContext context, UserService userService, IHubContext<BoardHub> boardHubContext, ILogger<Program> logger) =>
        {
            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            if (!EndpointHelpers.IsAdmin(context.User) && userId != id)
                return Results.Forbid();

            try
            {
                var user = await userService.UpdateDisplayNameAsync(id, request.DisplayName);
                await boardHubContext.Clients.Group(BoardHub.GetUserGroupName(user.Id))
                    .SendAsync("ProfileDisplayNameChanged", EndpointHelpers.ResolveDisplayName(user));
                return Results.Ok(EndpointHelpers.ToUserDto(user));
            }
            catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
            {
                logger.LogWarning(ex, "Updating profile failed for user {UserId}.", id);
                return EndpointHelpers.BadRequest(context, "The profile could not be updated.");
            }
        });

        app.MapPut("/api/users/{id:guid}/password", [Authorize] async (Guid id, ChangePasswordRequest request, HttpContext context, UserService userService, ILogger<Program> logger, AuditLogger audit) =>
        {
            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            var isAdmin = EndpointHelpers.IsAdmin(context.User);
            if (!isAdmin && userId != id)
                return Results.Forbid();

            try
            {
                if (isAdmin)
                {
                    await userService.SetPasswordAsync(id, request.NewPassword);
                }
                else
                {
                    await userService.ChangePasswordAsync(id, request.CurrentPassword ?? string.Empty, request.NewPassword);
                }

                if (isAdmin && userId != id)
                {
                    audit.LogAdminAction(userId, "user.password.reset", $"TargetUserId={id}");
                }
                return Results.NoContent();
            }
            catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
            {
                logger.LogWarning(ex, "Updating password failed for user {UserId}.", id);
                return EndpointHelpers.BadRequest(context, "The password could not be updated.");
            }
        });

        app.MapPut("/api/users/{id:guid}", [Authorize(Roles = "Admin")] async (Guid id, UpdateUserRequest request, UserService userService, HttpContext context, ILogger<Program> logger, AuditLogger audit) =>
        {
            try
            {
                var user = await userService.UpdateAdminUserAsync(id, request.Username, request.Role);
                if (EndpointHelpers.GetUserId(context.User) is { } adminUserId)
                {
                    audit.LogAdminAction(adminUserId, "user.update", $"TargetUserId={user.Id} Username={user.Username} Role={user.Role}");
                }
                return Results.Ok(EndpointHelpers.ToUserDto(user));
            }
            catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
            {
                logger.LogWarning(ex, "Updating admin-managed user {UserId} failed.", id);
                return EndpointHelpers.BadRequest(context, "The user could not be updated.");
            }
        });

        app.MapPut("/api/users/{id:guid}/deactivate", [Authorize(Roles = "Admin")] async (Guid id, UserService userService, HttpContext context, ILogger<Program> logger, AuditLogger audit) =>
        {
            try
            {
                await userService.DeactivateUserAsync(id);
                if (EndpointHelpers.GetUserId(context.User) is { } adminUserId)
                {
                    audit.LogAdminAction(adminUserId, "user.deactivate", $"TargetUserId={id}");
                }
                return Results.NoContent();
            }
            catch (InvalidOperationException ex)
            {
                logger.LogWarning(ex, "Deactivating user {UserId} failed.", id);
                return EndpointHelpers.BadRequest(context, "The user could not be deactivated.");
            }
        });

        app.MapPut("/api/users/{id:guid}/activate", [Authorize(Roles = "Admin")] async (Guid id, UserService userService, HttpContext context, ILogger<Program> logger, AuditLogger audit) =>
        {
            try
            {
                await userService.ActivateUserAsync(id);
                if (EndpointHelpers.GetUserId(context.User) is { } adminUserId)
                {
                    audit.LogAdminAction(adminUserId, "user.activate", $"TargetUserId={id}");
                }
                return Results.NoContent();
            }
            catch (InvalidOperationException ex)
            {
                logger.LogWarning(ex, "Activating user {UserId} failed.", id);
                return EndpointHelpers.BadRequest(context, "The user could not be activated.");
            }
        });

        app.MapDelete("/api/users/{id:guid}", [Authorize(Roles = "Admin")] async (Guid id, UserService userService, HttpContext context, ILogger<Program> logger, AuditLogger audit) =>
        {
            try
            {
                await userService.DeleteUserAsync(id);
                if (EndpointHelpers.GetUserId(context.User) is { } adminUserId)
                {
                    audit.LogAdminAction(adminUserId, "user.delete", $"TargetUserId={id}");
                }
                return Results.NoContent();
            }
            catch (InvalidOperationException ex)
            {
                logger.LogWarning(ex, "Deleting user {UserId} failed.", id);
                return EndpointHelpers.BadRequest(context, "The user could not be deleted.");
            }
        });

        app.MapGet("/api/boards/{id:guid}/shareable-users", [Authorize] async (Guid id, string? query, HttpContext context, BoardService boardService, UserService userService) =>
        {
            if (EndpointHelpers.GetUserId(context.User) is not { } userId)
                return Results.Unauthorized();

            var board = await boardService.GetBoardAsync(id);
            if (board is null) return Results.NotFound();

            if (!boardService.HasAccess(board, userId, BoardRole.Owner))
                return Results.Forbid();

            var memberIds = board.Members
                .Select(member => member.UserId)
                .Append(board.OwnerId)
                .ToHashSet();

            var normalizedQuery = query?.Trim();
            var users = await userService.GetAllUsersAsync();
            var results = users
                .Where(user => user.IsActive)
                .Where(user => !memberIds.Contains(user.Id))
                .Where(user => string.IsNullOrWhiteSpace(normalizedQuery) ||
                               user.Username.Contains(normalizedQuery, StringComparison.OrdinalIgnoreCase))
                .OrderBy(user => user.Username, StringComparer.OrdinalIgnoreCase)
                .Take(20)
                .Select(EndpointHelpers.ToUserDto);

            return Results.Ok(results);
        });

        return app;
    }
}
