using Orim.Core.Models;
using Orim.Core.Services;
using Orim.Infrastructure.Repositories;

namespace Orim.Tests.Infrastructure;

public class JsonStorageConsistencyTests : IDisposable
{
    private readonly string _tempDir;
    private readonly JsonUserRepository _userRepository;
    private readonly JsonBoardRepository _boardRepository;
    private readonly UserService _userService;

    public JsonStorageConsistencyTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), $"orim-tests-{Guid.NewGuid()}");
        _userRepository = new JsonUserRepository(_tempDir);
        _boardRepository = new JsonBoardRepository(_tempDir);
        _userService = new UserService(_userRepository, _boardRepository);
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
        {
            Directory.Delete(_tempDir, recursive: true);
        }
    }

    [Fact]
    public async Task DeleteUserAsync_RemovesOwnedBoardsFromJsonStorage()
    {
        var owner = new User { Username = "owner", PasswordHash = "hash" };
        var otherUser = new User { Username = "other", PasswordHash = "hash" };
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

        var reloadedBoards = new JsonBoardRepository(_tempDir);
        var remainingBoards = await reloadedBoards.GetAllAsync();

        Assert.Single(remainingBoards);
        Assert.Equal(foreignBoard.Id, remainingBoards[0].Id);
        Assert.Null(await reloadedBoards.GetByIdAsync(ownedBoard.Id));
        Assert.Null(await reloadedBoards.GetByShareTokenAsync("owned-token"));
    }

    [Fact]
    public async Task DeleteUserAsync_RemovesMembershipsWithoutLeavingOrphanReferences()
    {
        var owner = new User { Username = "owner", PasswordHash = "hash" };
        var member = new User { Username = "member", PasswordHash = "hash" };
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
            OwnerId = Guid.NewGuid(),
            Members =
            [
                new BoardMember { UserId = member.Id, Username = member.Username, Role = BoardRole.Viewer }
            ]
        };

        await _boardRepository.SaveAsync(sharedBoard);
        await _boardRepository.SaveAsync(memberOnlyBoard);

        await _userService.DeleteUserAsync(member.Id);

        var reloadedBoards = new JsonBoardRepository(_tempDir);
        var reloadedSharedBoard = await reloadedBoards.GetByIdAsync(sharedBoard.Id);
        var reloadedMemberOnlyBoard = await reloadedBoards.GetByIdAsync(memberOnlyBoard.Id);

        Assert.NotNull(reloadedSharedBoard);
        Assert.NotNull(reloadedMemberOnlyBoard);
        Assert.DoesNotContain(reloadedSharedBoard.Members, candidate => candidate.UserId == member.Id);
        Assert.DoesNotContain(reloadedMemberOnlyBoard.Members, candidate => candidate.UserId == member.Id);
        Assert.Null(await _userRepository.GetByIdAsync(member.Id));
    }
}