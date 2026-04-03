using Orim.Core.Models;

namespace Orim.Api.Contracts;

public sealed record CreateBoardCommentRequest(double X, double Y, string Text);
public sealed record CreateBoardCommentReplyRequest(string Text);
public sealed record BoardCommentNotification(Guid BoardId, DateTime ChangedAtUtc, BoardComment Comment);
public sealed record BoardCommentDeletedNotification(Guid BoardId, DateTime ChangedAtUtc, Guid CommentId);
