using Microsoft.EntityFrameworkCore;
using Orim.Core.Interfaces;
using Orim.Core.Models;
using Orim.Infrastructure.Data;
using Orim.Infrastructure.Data.Entities;

namespace Orim.Infrastructure.Repositories;

public class EfBoardOperationRepository : IBoardOperationRepository
{
    private readonly OrimDbContext _context;

    public EfBoardOperationRepository(OrimDbContext context)
    {
        _context = context;
    }

    public async Task<long> AppendAsync(BoardOperationEntry entry)
    {
        var maxSeq = await _context.BoardOperations
            .Where(o => o.BoardId == entry.BoardId)
            .MaxAsync(o => (long?)o.SequenceNumber) ?? 0;

        var entity = new BoardOperationEntity
        {
            Id = entry.Id,
            BoardId = entry.BoardId,
            SequenceNumber = maxSeq + 1,
            OperationType = entry.OperationType,
            OperationPayload = entry.OperationPayload,
            ClientId = entry.ClientId,
            UserId = entry.UserId,
            CreatedAtUtc = entry.CreatedAtUtc
        };

        _context.BoardOperations.Add(entity);
        await _context.SaveChangesAsync();

        entry.SequenceNumber = entity.SequenceNumber;
        return entity.SequenceNumber;
    }

    public async Task<IReadOnlyList<BoardOperationEntry>> GetOperationsSinceAsync(Guid boardId, long sinceSequenceNumber, int limit = 100)
    {
        return await _context.BoardOperations
            .AsNoTracking()
            .Where(o => o.BoardId == boardId && o.SequenceNumber > sinceSequenceNumber)
            .OrderBy(o => o.SequenceNumber)
            .Take(limit)
            .Select(o => new BoardOperationEntry
            {
                Id = o.Id,
                BoardId = o.BoardId,
                SequenceNumber = o.SequenceNumber,
                OperationType = o.OperationType,
                OperationPayload = o.OperationPayload,
                ClientId = o.ClientId,
                UserId = o.UserId,
                CreatedAtUtc = o.CreatedAtUtc
            })
            .ToListAsync();
    }

    public async Task<long> GetLatestSequenceNumberAsync(Guid boardId)
    {
        return await _context.BoardOperations
            .Where(o => o.BoardId == boardId)
            .MaxAsync(o => (long?)o.SequenceNumber) ?? 0;
    }

    public async Task DeleteBoardOperationsAsync(Guid boardId)
    {
        await _context.BoardOperations
            .Where(o => o.BoardId == boardId)
            .ExecuteDeleteAsync();
    }
}
