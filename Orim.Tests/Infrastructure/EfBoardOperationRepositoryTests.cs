using Orim.Core.Models;
using Orim.Infrastructure.Data;
using Orim.Infrastructure.Repositories;

namespace Orim.Tests.Infrastructure;

public class EfBoardOperationRepositoryTests : IDisposable
{
    private readonly OrimDbContext _context;
    private readonly EfBoardOperationRepository _sut;

    public EfBoardOperationRepositoryTests()
    {
        _context = TestDbContextFactory.Create();
        _sut = new EfBoardOperationRepository(_context);
    }

    public void Dispose() => _context.Dispose();

    [Fact]
    public async Task AppendAsync_AssignsIncreasingSequenceNumbersPerBoard()
    {
        var boardId = await CreateBoardAsync("Sequence board");

        var first = await _sut.AppendAsync(CreateEntry(boardId, "element.added", """{"type":"element.added"}"""));
        var second = await _sut.AppendAsync(CreateEntry(boardId, "element.updated", """{"type":"element.updated"}"""));

        Assert.Equal(1, first);
        Assert.Equal(2, second);
    }

    [Fact]
    public async Task GetOperationsSinceAsync_ReturnsOrderedWindow()
    {
        var boardId = await CreateBoardAsync("History board");

        await _sut.AppendAsync(CreateEntry(boardId, "op-1", """{"step":1}"""));
        await _sut.AppendAsync(CreateEntry(boardId, "op-2", """{"step":2}"""));
        await _sut.AppendAsync(CreateEntry(boardId, "op-3", """{"step":3}"""));

        var operations = await _sut.GetOperationsSinceAsync(boardId, 1, limit: 2);

        Assert.Collection(
            operations,
            operation =>
            {
                Assert.Equal(2, operation.SequenceNumber);
                Assert.Equal("op-2", operation.OperationType);
            },
            operation =>
            {
                Assert.Equal(3, operation.SequenceNumber);
                Assert.Equal("op-3", operation.OperationType);
            });
    }

    [Fact]
    public async Task GetLatestSequenceNumberAsync_ReturnsZeroForUnknownBoard()
    {
        var latest = await _sut.GetLatestSequenceNumberAsync(Guid.NewGuid());

        Assert.Equal(0, latest);
    }

    private async Task<Guid> CreateBoardAsync(string title)
    {
        var board = new Board { Title = title };
        _context.Boards.Add(board);
        await _context.SaveChangesAsync();
        return board.Id;
    }

    private static BoardOperationEntry CreateEntry(Guid boardId, string operationType, string operationPayload)
    {
        return new BoardOperationEntry
        {
            BoardId = boardId,
            OperationType = operationType,
            OperationPayload = operationPayload,
            ClientId = "client-1",
            UserId = Guid.NewGuid(),
            CreatedAtUtc = DateTime.UtcNow
        };
    }
}
