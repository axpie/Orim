using Microsoft.EntityFrameworkCore;
using Orim.Core.Interfaces;
using Orim.Core.Models;
using Orim.Infrastructure.Data;

namespace Orim.Infrastructure.Repositories;

public class EfBoardRepository : IBoardRepository
{
    private readonly OrimDbContext _context;

    public EfBoardRepository(OrimDbContext context)
    {
        _context = context;
    }

    public async Task<List<Board>> GetAllAsync()
    {
        return await BoardsWithIncludes()
            .AsNoTracking()
            .ToListAsync();
    }

    public async Task<Board?> GetByIdAsync(Guid id)
    {
        return await BoardsWithIncludes()
            .AsNoTracking()
            .FirstOrDefaultAsync(b => b.Id == id);
    }

    public async Task<Board?> GetByShareTokenAsync(string token)
    {
        return await BoardsWithIncludes()
            .AsNoTracking()
            .FirstOrDefaultAsync(b => b.ShareLinkToken == token);
    }

    public async Task<List<BoardSummary>> GetBoardSummariesAsync()
    {
        return await _context.Boards
            .AsNoTracking()
            .Select(b => new BoardSummary
            {
                Id = b.Id,
                Title = b.Title,
                OwnerId = b.OwnerId,
                Visibility = b.Visibility,
                ShareLinkToken = b.ShareLinkToken,
                Members = b.Members.ToList(),
                FolderId = b.FolderId,
                Tags = b.Tags,
                ElementCount = b.Elements.Count,
                CreatedAt = b.CreatedAt,
                UpdatedAt = b.UpdatedAt
            })
            .ToListAsync();
    }

    public async Task SaveAsync(Board entity)
    {
        var existing = await BoardsWithIncludes()
            .FirstOrDefaultAsync(b => b.Id == entity.Id);

        if (existing is null)
        {
            _context.Boards.Add(entity);
        }
        else
        {
            existing.Title = entity.Title;
            existing.OwnerId = entity.OwnerId;
            existing.LabelOutlineEnabled = entity.LabelOutlineEnabled;
            existing.ArrowOutlineEnabled = entity.ArrowOutlineEnabled;
            existing.SurfaceColor = entity.SurfaceColor;
            existing.ThemeKey = entity.ThemeKey;
            existing.Visibility = entity.Visibility;
            existing.ShareLinkToken = entity.ShareLinkToken;
            existing.SharedAllowAnonymousEditing = entity.SharedAllowAnonymousEditing;
            existing.SharePasswordHash = entity.SharePasswordHash;
            existing.FolderId = entity.FolderId;
            existing.CustomColors = entity.CustomColors.ToList();
            existing.RecentColors = entity.RecentColors.ToList();
            existing.StickyNotePresets = entity.StickyNotePresets.ToList();
            existing.Tags = entity.Tags.ToList();
            existing.Elements = entity.Elements.ToList();
            existing.CreatedAt = entity.CreatedAt;
            existing.UpdatedAt = entity.UpdatedAt;

            // Diff Members by UserId (composite key: BoardId + UserId)
            var existingMemberIds = existing.Members.Select(m => m.UserId).ToHashSet();
            var newMemberIds = entity.Members.Select(m => m.UserId).ToHashSet();

            var membersToRemove = existing.Members.Where(m => !newMemberIds.Contains(m.UserId)).ToList();
            _context.BoardMembers.RemoveRange(membersToRemove);

            foreach (var member in entity.Members.Where(m => !existingMemberIds.Contains(m.UserId)))
            {
                existing.Members.Add(member);
                _context.Entry(member).State = EntityState.Added;
            }

            foreach (var member in entity.Members.Where(m => existingMemberIds.Contains(m.UserId)))
            {
                var existingMember = existing.Members.First(m => m.UserId == member.UserId);
                existingMember.Role = member.Role;
                existingMember.Username = member.Username;
            }

            // Diff Comments by Id
            var existingCommentIds = existing.Comments.Select(c => c.Id).ToHashSet();
            var newCommentIds = entity.Comments.Select(c => c.Id).ToHashSet();

            var commentsToRemove = existing.Comments.Where(c => !newCommentIds.Contains(c.Id)).ToList();
            foreach (var comment in commentsToRemove)
            {
                _context.BoardCommentReplies.RemoveRange(comment.Replies);
                _context.BoardComments.Remove(comment);
            }

            foreach (var comment in entity.Comments.Where(c => !existingCommentIds.Contains(c.Id)))
            {
                comment.BoardId = existing.Id;
                _context.BoardComments.Add(comment);
            }

            foreach (var comment in entity.Comments.Where(c => existingCommentIds.Contains(c.Id)))
            {
                var existingComment = existing.Comments.First(c => c.Id == comment.Id);
                _context.Entry(existingComment).CurrentValues.SetValues(comment);

                // Diff Replies by Id
                var existingReplyIds = existingComment.Replies.Select(r => r.Id).ToHashSet();
                var newReplyIds = comment.Replies.Select(r => r.Id).ToHashSet();

                var repliesToRemove = existingComment.Replies.Where(r => !newReplyIds.Contains(r.Id)).ToList();
                _context.BoardCommentReplies.RemoveRange(repliesToRemove);

                foreach (var reply in comment.Replies.Where(r => !existingReplyIds.Contains(r.Id)))
                {
                    reply.CommentId = existingComment.Id;
                    _context.BoardCommentReplies.Add(reply);
                }

                foreach (var reply in comment.Replies.Where(r => existingReplyIds.Contains(r.Id)))
                {
                    var existingReply = existingComment.Replies.First(r => r.Id == reply.Id);
                    _context.Entry(existingReply).CurrentValues.SetValues(reply);
                }
            }

            // Diff Snapshots by Id
            var existingSnapshotIds = existing.Snapshots.Select(s => s.Id).ToHashSet();
            var newSnapshotIds = entity.Snapshots.Select(s => s.Id).ToHashSet();

            var snapshotsToRemove = existing.Snapshots.Where(s => !newSnapshotIds.Contains(s.Id)).ToList();
            _context.BoardSnapshots.RemoveRange(snapshotsToRemove);

            foreach (var snapshot in entity.Snapshots.Where(s => !existingSnapshotIds.Contains(s.Id)))
            {
                snapshot.BoardId = existing.Id;
                _context.BoardSnapshots.Add(snapshot);
            }
        }

        await _context.SaveChangesAsync();
        _context.ChangeTracker.Clear();
    }

    public async Task SaveEditorStateAsync(Board entity)
    {
        var existing = await _context.Boards
            .FirstOrDefaultAsync(b => b.Id == entity.Id);

        if (existing is null)
        {
            await SaveAsync(entity);
            return;
        }

        existing.Title = entity.Title;
        existing.LabelOutlineEnabled = entity.LabelOutlineEnabled;
        existing.ArrowOutlineEnabled = entity.ArrowOutlineEnabled;
        existing.SurfaceColor = entity.SurfaceColor;
        existing.ThemeKey = entity.ThemeKey;
        existing.CustomColors = entity.CustomColors.ToList();
        existing.RecentColors = entity.RecentColors.ToList();
        existing.StickyNotePresets = entity.StickyNotePresets.ToList();
        existing.Elements = entity.Elements.ToList();
        existing.UpdatedAt = entity.UpdatedAt;

        await _context.SaveChangesAsync();
        _context.ChangeTracker.Clear();
    }

    public async Task DeleteAsync(Guid id)
    {
        var board = await _context.Boards.FindAsync(id);
        if (board is not null)
        {
            _context.Boards.Remove(board);
            await _context.SaveChangesAsync();
        }
        _context.ChangeTracker.Clear();
    }

    public async Task<IReadOnlyList<BoardFolder>> GetFoldersAsync(Guid ownerId)
    {
        return await _context.BoardFolders
            .AsNoTracking()
            .Where(f => f.OwnerId == ownerId)
            .OrderBy(f => f.Name)
            .ToListAsync();
    }

    public async Task SaveFolderAsync(BoardFolder folder)
    {
        var existing = await _context.BoardFolders.FindAsync(folder.Id);
        if (existing is null)
        {
            _context.BoardFolders.Add(folder);
        }
        else
        {
            _context.Entry(existing).CurrentValues.SetValues(folder);
        }

        await _context.SaveChangesAsync();
        _context.ChangeTracker.Clear();
    }

    public async Task DeleteFolderAsync(string folderId, bool deleteBoards = false)
    {
        var folder = await _context.BoardFolders.FindAsync(folderId);
        if (folder is not null)
        {
            var boards = await _context.Boards.Where(b => b.FolderId == folderId).ToListAsync();
            if (deleteBoards)
            {
                _context.Boards.RemoveRange(boards);
            }
            else
            {
                foreach (var board in boards)
                {
                    board.FolderId = null;
                }
            }

            _context.BoardFolders.Remove(folder);
            await _context.SaveChangesAsync();
        }
        _context.ChangeTracker.Clear();
    }

    private IQueryable<Board> BoardsWithIncludes()
    {
        return _context.Boards
            .Include(b => b.Members)
            .Include(b => b.Comments)
                .ThenInclude(c => c.Replies)
            .Include(b => b.Snapshots);
    }
}
