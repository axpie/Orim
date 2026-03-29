using Orim.Api.Services;
using Orim.Core.Models;

namespace Orim.Api.Contracts;

public sealed record LoginRequest(string Username, string Password);
public sealed record LoginResponse(string Token, Guid UserId, string Username, UserRole Role);
public sealed record UserDto(Guid Id, string Username, UserRole Role, bool IsActive, DateTime CreatedAt);
public sealed record CreateUserRequest(string Username, string Password, UserRole Role);
public sealed record ChangePasswordRequest(string NewPassword);
public sealed record CreateBoardRequest(string Title, string? TemplateId = null);
public sealed record SetVisibilityRequest(BoardVisibility Visibility, bool AllowAnonymousEditing = false);
public sealed record ValidatePasswordRequest(string Password);
public sealed record SharedBoardUpdateRequest(Board Board, string? Password, string? SourceClientId = null);
public sealed record SetSharePasswordRequest(string? Password);
public sealed record AddMemberRequest(string Username, BoardRole Role);
public sealed record UpdateMemberRoleRequest(BoardRole Role);
public sealed record CreateSnapshotRequest(string? Name);
public sealed record ImportBoardRequest(string BoardJson, string? Title);
public sealed record AssistantRequest(IReadOnlyList<ChatMessageEntry> Messages);
public sealed record AssistantSettingsRequest(bool Enabled, string Endpoint, string DeploymentName, string? ApiKey);
public sealed record PresenceLeaveRequest(Guid BoardId, string ClientId);
public sealed record ThemeAvailabilityRequest(bool Enabled);