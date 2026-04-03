using System.Text.Json.Serialization;
using Orim.Api.Services;
using Orim.Core.Models;

namespace Orim.Api.Contracts;

public sealed record LoginRequest(string Username, string Password);
public sealed record LoginResponse(string Token, Guid UserId, string Username, string DisplayName, UserRole Role);
public sealed record MicrosoftTokenExchangeRequest(string IdToken);
public sealed record GoogleTokenExchangeRequest(string IdToken);
public sealed record MicrosoftAuthProviderDto(string ClientId, string Authority, IReadOnlyList<string> Scopes);
public sealed record GoogleAuthProviderDto(string ClientId);
public sealed record AuthProvidersResponse(MicrosoftAuthProviderDto? Microsoft, GoogleAuthProviderDto? Google);
public sealed record UserDto(Guid Id, string Username, string DisplayName, UserRole Role, bool IsActive, DateTime CreatedAt);
public sealed record CreateUserRequest(string Username, string Password, UserRole Role);
public sealed record ChangePasswordRequest(string? CurrentPassword, string NewPassword);
public sealed record UpdateProfileRequest(string DisplayName);
public sealed record UpdateUserRequest(string Username, UserRole Role);
public sealed record CreateBoardRequest(string Title, string? TemplateId = null, string? ThemeKey = null);
public sealed record SetVisibilityRequest(BoardVisibility Visibility, bool AllowAnonymousEditing = false);
public sealed record ValidatePasswordRequest(string Password);
public sealed record SharedBoardUpdateRequest(Board Board, string? Password, string? SourceClientId = null);
[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(BoardElementAddedOperationDto), "element.added")]
[JsonDerivedType(typeof(BoardElementUpdatedOperationDto), "element.updated")]
[JsonDerivedType(typeof(BoardElementDeletedOperationDto), "element.deleted")]
[JsonDerivedType(typeof(BoardElementsDeletedOperationDto), "elements.deleted")]
[JsonDerivedType(typeof(BoardMetadataUpdatedOperationDto), "board.metadata.updated")]
public abstract record BoardOperationDto;
public sealed record BoardElementAddedOperationDto(BoardElement Element) : BoardOperationDto;
public sealed record BoardElementUpdatedOperationDto(BoardElement Element) : BoardOperationDto;
public sealed record BoardElementDeletedOperationDto(string ElementId) : BoardOperationDto;
public sealed record BoardElementsDeletedOperationDto(IReadOnlyList<string> ElementIds) : BoardOperationDto;
public sealed record BoardMetadataUpdatedOperationDto(
    string? Title = null,
    bool? LabelOutlineEnabled = null,
    bool? ArrowOutlineEnabled = null,
    string? SurfaceColor = null,
    string? ThemeKey = null,
    IReadOnlyList<string>? CustomColors = null,
    IReadOnlyList<string>? RecentColors = null,
    IReadOnlyList<StickyNotePreset>? StickyNotePresets = null) : BoardOperationDto;
public sealed record BoardOperationNotification(Guid BoardId, string? SourceClientId, DateTime ChangedAtUtc, BoardOperationDto Operation);
public sealed record SetSharePasswordRequest(string? Password);
public sealed record AddMemberRequest(string Username, BoardRole Role);
public sealed record UpdateMemberRoleRequest(BoardRole Role);
public sealed record CreateSnapshotRequest(string? Name);
public sealed record ImportBoardRequest(string BoardJson, string? Title);
public sealed record AssistantRequest(IReadOnlyList<ChatMessageEntry> Messages);
public sealed record AssistantSettingsRequest(bool Enabled, string Endpoint, string DeploymentName, string? ApiKey);
public sealed record PresenceLeaveRequest(Guid BoardId, string ClientId);
public sealed record ThemeAvailabilityRequest(bool Enabled);
