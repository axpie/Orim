using Microsoft.Extensions.Logging;

namespace Orim.Api.Services;

public sealed class AuditLogger
{
    private readonly ILogger<AuditLogger> _logger;

    public AuditLogger(ILogger<AuditLogger> logger)
    {
        _logger = logger;
    }

    public void LogUserLogin(Guid userId, string username, string provider)
    {
        _logger.LogInformation("AUDIT: User login | UserId={UserId} Username={Username} Provider={Provider}",
            userId, username, provider);
    }

    public void LogUserLoginFailed(string username, string provider, string reason)
    {
        _logger.LogWarning("AUDIT: Login failed | Username={Username} Provider={Provider} Reason={Reason}",
            username, provider, reason);
    }

    public void LogUserLogout(Guid userId, string username)
    {
        _logger.LogInformation("AUDIT: User logout | UserId={UserId} Username={Username}",
            userId, username);
    }

    public void LogBoardCreated(Guid boardId, Guid userId, string title)
    {
        _logger.LogInformation("AUDIT: Board created | BoardId={BoardId} UserId={UserId} Title={Title}",
            boardId, userId, title);
    }

    public void LogBoardDeleted(Guid boardId, Guid userId)
    {
        _logger.LogInformation("AUDIT: Board deleted | BoardId={BoardId} UserId={UserId}",
            boardId, userId);
    }

    public void LogBoardShared(Guid boardId, Guid userId, string visibility)
    {
        _logger.LogInformation("AUDIT: Board sharing changed | BoardId={BoardId} UserId={UserId} Visibility={Visibility}",
            boardId, userId, visibility);
    }

    public void LogMemberAdded(Guid boardId, Guid addedUserId, string role, Guid byUserId)
    {
        _logger.LogInformation("AUDIT: Member added | BoardId={BoardId} AddedUserId={AddedUserId} Role={Role} ByUserId={ByUserId}",
            boardId, addedUserId, role, byUserId);
    }

    public void LogMemberRemoved(Guid boardId, Guid removedUserId, Guid byUserId)
    {
        _logger.LogInformation("AUDIT: Member removed | BoardId={BoardId} RemovedUserId={RemovedUserId} ByUserId={ByUserId}",
            boardId, removedUserId, byUserId);
    }

    public void LogAdminAction(Guid adminUserId, string action, string details)
    {
        _logger.LogInformation("AUDIT: Admin action | AdminUserId={AdminUserId} Action={Action} Details={Details}",
            adminUserId, action, details);
    }
}
