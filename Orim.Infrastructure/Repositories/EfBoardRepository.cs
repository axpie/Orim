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
            _context.Entry(existing).CurrentValues.SetValues(entity);

            // Sync Members: clear and re-add
            _context.BoardMembers.RemoveRange(existing.Members);
            foreach (var member in entity.Members)
                existing.Members.Add(member);

            // Sync Comments and Replies: clear and re-add
            foreach (var comment in existing.Comments)
                _context.BoardCommentReplies.RemoveRange(comment.Replies);
            _context.BoardComments.RemoveRange(existing.Comments);
            foreach (var comment in entity.Comments)
                existing.Comments.Add(comment);

            // Sync Snapshots: clear and re-add
            _context.BoardSnapshots.RemoveRange(existing.Snapshots);
            foreach (var snapshot in entity.Snapshots)
                existing.Snapshots.Add(snapshot);
        }

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

    private IQueryable<Board> BoardsWithIncludes()
    {
        return _context.Boards
            .Include(b => b.Members)
            .Include(b => b.Comments)
                .ThenInclude(c => c.Replies)
            .Include(b => b.Snapshots);
    }
}
