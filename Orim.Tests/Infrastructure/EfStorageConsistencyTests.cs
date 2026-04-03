using Orim.Core.Models;
using Orim.Core.Services;
using Orim.Infrastructure.Data;
using Orim.Infrastructure.Repositories;

namespace Orim.Tests.Infrastructure;

public class EfStorageConsistencyTests : IDisposable
{
    private const string UserPasswordHash = "hash";

    private readonly OrimDbContext _context;
    private readonly EfUserRepository _userRepository;
    private readonly EfBoardRepository _boardRepository;
    private readonly UserService _userService;

    public EfStorageConsistencyTests()
    {
        _context = TestDbContextFactory.Create();
        _userRepository = new EfUserRepository(_context);
        _boardRepository = new EfBoardRepository(_context);
        _userService = new UserService(_userRepository, _boardRepository);
    }

    public void Dispose() => _context.Dispose();

    [Fact]
    public async Task DeleteUserAsync_RemovesOwnedBoards()
    {
        var owner = new User { Username = "owner", PasswordHash = UserPasswordHash };
        var otherUser = new User { Username = "other", PasswordHash = UserPasswordHash };
        await _userRepository.SaveAsync(owner);
        await _userRepository.SaveAsync(otherUser);

        var ownedBoard = new Board
        {
            Title = "Owned",
            OwnerId = owner.Id,
            ShareLinkToken = "owned-token",
            Members =
            [
                new BoardMember { UserId = owner.Id, Username = owner.Username, Role = BoardRole.Owner }
            ]
        };
        var foreignBoard = new Board
        {
            Title = "Foreign",
            OwnerId = otherUser.Id,
            Members =
            [
                new BoardMember { UserId = otherUser.Id, Username = otherUser.Username, Role = BoardRole.Owner }
            ]
        };

        await _boardRepository.SaveAsync(ownedBoard);
        await _boardRepository.SaveAsync(foreignBoard);

        await _userService.DeleteUserAsync(owner.Id);

        var remainingBoards = await _boardRepository.GetAllAsync();

        Assert.Single(remainingBoards);
        Assert.Equal(foreignBoard.Id, remainingBoards[0].Id);
        Assert.Null(await _boardRepository.GetByIdAsync(ownedBoard.Id));
        Assert.Null(await _boardRepository.GetByShareTokenAsync("owned-token"));
    }

    [Fact]
    public async Task DeleteUserAsync_RemovesMembershipsWithoutOrphanReferences()
    {
        var owner = new User { Username = "owner", PasswordHash = UserPasswordHash };
        var member = new User { Username = "member", PasswordHash = UserPasswordHash };
        await _userRepository.SaveAsync(owner);
        await _userRepository.SaveAsync(member);

        var sharedBoard = new Board
        {
            Title = "Shared",
            OwnerId = owner.Id,
            Members =
            [
                new BoardMember { UserId = owner.Id, Username = owner.Username, Role = BoardRole.Owner },
                new BoardMember { UserId = member.Id, Username = member.Username, Role = BoardRole.Editor }
            ]
        };
        var memberOnlyBoard = new Board
        {
            Title = "Member Only",
            OwnerId = owner.Id,
            Members =
            [
                new BoardMember { UserId = owner.Id, Username = owner.Username, Role = BoardRole.Owner },
                new BoardMember { UserId = member.Id, Username = member.Username, Role = BoardRole.Viewer }
            ]
        };

        await _boardRepository.SaveAsync(sharedBoard);
        await _boardRepository.SaveAsync(memberOnlyBoard);

        await _userService.DeleteUserAsync(member.Id);

        var reloadedSharedBoard = await _boardRepository.GetByIdAsync(sharedBoard.Id);
        var reloadedMemberOnlyBoard = await _boardRepository.GetByIdAsync(memberOnlyBoard.Id);

        Assert.NotNull(reloadedSharedBoard);
        Assert.NotNull(reloadedMemberOnlyBoard);
        Assert.DoesNotContain(reloadedSharedBoard.Members, m => m.UserId == member.Id);
        Assert.DoesNotContain(reloadedMemberOnlyBoard.Members, m => m.UserId == member.Id);
        Assert.Null(await _userRepository.GetByIdAsync(member.Id));
    }
}
