using Orim.Core.Interfaces;
using Orim.Core.Models;

namespace Orim.Core.Services;

public sealed class BoardCommentService
{
    private const int MaxCommentLength = 2_000;
    private readonly IBoardRepository _boardRepository;

    public BoardCommentService(IBoardRepository boardRepository)
    {
        _boardRepository = boardRepository;
    }

    public async Task<BoardComment> CreateCommentAsync(
        Board board,
        Guid authorUserId,
        string authorUsername,
        double x,
        double y,
        string text)
    {
        ArgumentNullException.ThrowIfNull(board);

        var now = DateTime.UtcNow;
        var comment = new BoardComment
        {
            BoardId = board.Id,
            AuthorUserId = authorUserId,
            AuthorUsername = NormalizeAuthorUsername(authorUsername),
            X = NormalizeCoordinate(x, nameof(x)),
            Y = NormalizeCoordinate(y, nameof(y)),
            Text = NormalizeText(text, nameof(text)),
            CreatedAt = now,
            UpdatedAt = now
        };

        board.Comments.Add(comment);
        await SaveBoardAsync(board, now);
        return comment;
    }

    public async Task<BoardComment> AddReplyAsync(
        Board board,
        Guid commentId,
        Guid authorUserId,
        string authorUsername,
        string text)
    {
        ArgumentNullException.ThrowIfNull(board);

        var comment = FindComment(board, commentId);
        var now = DateTime.UtcNow;
        comment.Replies.Add(new BoardCommentReply
        {
            AuthorUserId = authorUserId,
            AuthorUsername = NormalizeAuthorUsername(authorUsername),
            Text = NormalizeText(text, nameof(text)),
            CreatedAt = now,
            UpdatedAt = now
        });
        comment.UpdatedAt = now;

        await SaveBoardAsync(board, now);
        return comment;
    }

    public async Task DeleteCommentAsync(Board board, Guid commentId)
    {
        ArgumentNullException.ThrowIfNull(board);

        var removed = board.Comments.RemoveAll(comment => comment.Id == commentId);
        if (removed == 0)
        {
            throw new InvalidOperationException("Comment not found.");
        }

        await SaveBoardAsync(board, DateTime.UtcNow);
    }

    public async Task<BoardComment> DeleteReplyAsync(Board board, Guid commentId, Guid replyId)
    {
        ArgumentNullException.ThrowIfNull(board);

        var comment = FindComment(board, commentId);
        var removed = comment.Replies.RemoveAll(reply => reply.Id == replyId);
        if (removed == 0)
        {
            throw new InvalidOperationException("Comment reply not found.");
        }

        comment.UpdatedAt = DateTime.UtcNow;
        await SaveBoardAsync(board, comment.UpdatedAt);
        return comment;
    }

    public static bool CanDeleteComment(Board board, BoardComment comment, Guid userId)
    {
        ArgumentNullException.ThrowIfNull(board);
        ArgumentNullException.ThrowIfNull(comment);

        return board.OwnerId == userId || comment.AuthorUserId == userId;
    }

    public static bool CanDeleteReply(Board board, BoardCommentReply reply, Guid userId)
    {
        ArgumentNullException.ThrowIfNull(board);
        ArgumentNullException.ThrowIfNull(reply);

        return board.OwnerId == userId || reply.AuthorUserId == userId;
    }

    private async Task SaveBoardAsync(Board board, DateTime updatedAt)
    {
        board.UpdatedAt = updatedAt;
        await _boardRepository.SaveAsync(board);
    }

    private static BoardComment FindComment(Board board, Guid commentId) =>
        board.Comments.FirstOrDefault(comment => comment.Id == commentId)
        ?? throw new InvalidOperationException("Comment not found.");

    private static string NormalizeAuthorUsername(string authorUsername)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(authorUsername);
        return authorUsername.Trim();
    }

    private static string NormalizeText(string text, string paramName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(text, paramName);

        var normalized = text.Trim();
        if (normalized.Length > MaxCommentLength)
        {
            throw new ArgumentException($"Comment text must not exceed {MaxCommentLength} characters.", paramName);
        }

        return normalized;
    }

    private static double NormalizeCoordinate(double value, string paramName)
    {
        if (!double.IsFinite(value))
        {
            throw new ArgumentException("Comment coordinates must be finite numbers.", paramName);
        }

        return Math.Round(value, 2);
    }
}
