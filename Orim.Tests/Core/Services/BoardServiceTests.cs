using NSubstitute;
using Orim.Core.Interfaces;
using Orim.Core.Models;
using Orim.Core.Services;

namespace Orim.Tests.Core.Services;

public class BoardServiceTests
{
    private readonly IBoardRepository _boardRepo = Substitute.For<IBoardRepository>();
    private readonly BoardChangeNotifier _notifier = new();
    private readonly BoardService _sut;

    public BoardServiceTests()
    {
        _sut = new BoardService(_boardRepo, _notifier);
    }

    #region CreateBoardAsync

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task CreateBoardAsync_NullOrEmptyTitle_Throws(string? title)
    {
        await Assert.ThrowsAnyAsync<ArgumentException>(
            () => _sut.CreateBoardAsync(title!, Guid.NewGuid(), "owner"));
    }

    [Fact]
    public async Task CreateBoardAsync_TitleTooLong_Throws()
    {
        var longTitle = new string('x', 201);

        var ex = await Assert.ThrowsAsync<ArgumentException>(
            () => _sut.CreateBoardAsync(longTitle, Guid.NewGuid(), "owner"));

        Assert.Contains("200 characters", ex.Message);
    }

    [Fact]
    public async Task CreateBoardAsync_UnknownTemplate_Throws()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => _sut.CreateBoardAsync("Board", Guid.NewGuid(), "owner", "unknown-template"));
    }

    [Fact]
    public async Task CreateBoardAsync_ValidInput_CreatesBoard()
    {
        var ownerId = Guid.NewGuid();

        var board = await _sut.CreateBoardAsync("My Board", ownerId, "alice");

        Assert.Equal("My Board", board.Title);
        Assert.Equal(ownerId, board.OwnerId);
        Assert.Single(board.Members);
        Assert.Equal(BoardRole.Owner, board.Members[0].Role);
        Assert.Equal("alice", board.Members[0].Username);
        await _boardRepo.Received(1).SaveAsync(Arg.Any<Board>());
    }

    [Fact]
    public async Task CreateBoardAsync_TrimsTitle()
    {
        var board = await _sut.CreateBoardAsync("  My Board  ", Guid.NewGuid(), "owner");

        Assert.Equal("My Board", board.Title);
    }

    [Fact]
    public async Task CreateBoardAsync_WithTemplate_AddsElements()
    {
        var board = await _sut.CreateBoardAsync("Board", Guid.NewGuid(), "owner", BoardTemplateCatalog.ProcessTemplateId);

        Assert.NotEmpty(board.Elements);
    }

    [Fact]
    public async Task CreateBoardAsync_BlankTemplate_EmptyElements()
    {
        var board = await _sut.CreateBoardAsync("Board", Guid.NewGuid(), "owner", BoardTemplateCatalog.BlankTemplateId);

        Assert.Empty(board.Elements);
    }

    #endregion

    #region CreateBoardFromImportAsync

    [Fact]
    public async Task CreateBoardFromImportAsync_DeduplicatesColors()
    {
        var imported = new Board
        {
            CustomColors = ["#FFF", "#fff", "#FFF"],
            RecentColors = ["#000", "#000"]
        };

        var board = await _sut.CreateBoardFromImportAsync(imported, "Import", Guid.NewGuid(), "owner");

        Assert.Single(board.CustomColors);
        Assert.Single(board.RecentColors);
    }

    [Fact]
    public async Task CreateBoardFromImportAsync_CopiesStickyNotePresets()
    {
        var imported = new Board
        {
            StickyNotePresets =
            [
                new StickyNotePreset { Id = "yellow", Label = "Yellow", FillColor = "#FDE68A" }
            ]
        };

        var board = await _sut.CreateBoardFromImportAsync(imported, "Import", Guid.NewGuid(), "owner");

        Assert.Single(board.StickyNotePresets);
        Assert.Equal("Yellow", board.StickyNotePresets[0].Label);
    }

    [Fact]
    public async Task CreateBoardFromImportAsync_NormalizesZIndexes()
    {
        var imported = new Board
        {
            Elements = [
                new ShapeElement { ZIndex = 99 },
                new ShapeElement { ZIndex = 42 }
            ]
        };

        var board = await _sut.CreateBoardFromImportAsync(imported, "Import", Guid.NewGuid(), "owner");

        Assert.Equal(0, board.Elements[0].ZIndex);
        Assert.Equal(1, board.Elements[1].ZIndex);
    }

    [Fact]
    public async Task CreateBoardFromImportAsync_NullImportedBoard_Throws()
    {
        await Assert.ThrowsAsync<ArgumentNullException>(
            () => _sut.CreateBoardFromImportAsync(null!, "Title", Guid.NewGuid(), "owner"));
    }

    #endregion

    #region Share Password

    [Fact]
    public void IsSharePasswordProtected_NullHash_ReturnsFalse()
    {
        var board = new Board { SharePasswordHash = null };
        Assert.False(_sut.IsSharePasswordProtected(board));
    }

    [Fact]
    public void IsSharePasswordProtected_EmptyHash_ReturnsFalse()
    {
        var board = new Board { SharePasswordHash = "  " };
        Assert.False(_sut.IsSharePasswordProtected(board));
    }

    [Fact]
    public void SetSharePassword_SetsHash()
    {
        var board = new Board();
        _sut.SetSharePassword(board, "secret");

        Assert.NotNull(board.SharePasswordHash);
        Assert.NotEmpty(board.SharePasswordHash);
        Assert.Contains(".", board.SharePasswordHash);
    }

    [Fact]
    public void ValidateSharePassword_CorrectPassword_ReturnsTrue()
    {
        var board = new Board();
        _sut.SetSharePassword(board, "secret");

        Assert.True(_sut.ValidateSharePassword(board, "secret"));
    }

    [Fact]
    public void ValidateSharePassword_WrongPassword_ReturnsFalse()
    {
        var board = new Board();
        _sut.SetSharePassword(board, "secret");

        Assert.False(_sut.ValidateSharePassword(board, "wrong"));
    }

    [Fact]
    public void ValidateSharePassword_NoHash_ReturnsTrue()
    {
        var board = new Board();
        Assert.True(_sut.ValidateSharePassword(board, null));
    }

    [Fact]
    public void ValidateSharePassword_NullPassword_WhenProtected_ReturnsFalse()
    {
        var board = new Board();
        _sut.SetSharePassword(board, "secret");

        Assert.False(_sut.ValidateSharePassword(board, null));
    }

    [Fact]
    public void ClearSharePassword_RemovesHash()
    {
        var board = new Board();
        _sut.SetSharePassword(board, "secret");

        _sut.ClearSharePassword(board);

        Assert.Null(board.SharePasswordHash);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void SetSharePassword_NullOrWhitespacePassword_Throws(string? password)
    {
        var board = new Board();

        Assert.ThrowsAny<ArgumentException>(() => _sut.SetSharePassword(board, password!));
    }

    #endregion

    #region HasSharedLinkAccess

    [Fact]
    public void HasSharedLinkAccess_PrivateBoard_ReturnsFalse()
    {
        var board = new Board { Visibility = BoardVisibility.Private };

        Assert.False(_sut.HasSharedLinkAccess(board, null));
    }

    [Fact]
    public void HasSharedLinkAccess_PublicBoard_ViewerAccess_ReturnsTrue()
    {
        var board = new Board { Visibility = BoardVisibility.Public };

        Assert.True(_sut.HasSharedLinkAccess(board, null, BoardRole.Viewer));
    }

    [Fact]
    public void HasSharedLinkAccess_PublicBoard_EditorAccess_NotAllowed_ReturnsFalse()
    {
        var board = new Board { Visibility = BoardVisibility.Public, SharedAllowAnonymousEditing = false };

        Assert.False(_sut.HasSharedLinkAccess(board, null, BoardRole.Editor));
    }

    [Fact]
    public void HasSharedLinkAccess_PublicBoard_EditorAccess_Allowed_ReturnsTrue()
    {
        var board = new Board { Visibility = BoardVisibility.Public, SharedAllowAnonymousEditing = true };

        Assert.True(_sut.HasSharedLinkAccess(board, null, BoardRole.Editor));
    }

    [Fact]
    public void HasSharedLinkAccess_PublicBoard_OwnerAccess_ReturnsFalse()
    {
        var board = new Board { Visibility = BoardVisibility.Public, SharedAllowAnonymousEditing = true };

        Assert.False(_sut.HasSharedLinkAccess(board, null, BoardRole.Owner));
    }

    [Fact]
    public void HasSharedLinkAccess_PasswordProtected_WrongPassword_ReturnsFalse()
    {
        var board = new Board { Visibility = BoardVisibility.Public };
        _sut.SetSharePassword(board, "secret");

        Assert.False(_sut.HasSharedLinkAccess(board, "wrong"));
    }

    [Fact]
    public void HasSharedLinkAccess_PasswordProtected_CorrectPassword_ReturnsTrue()
    {
        var board = new Board { Visibility = BoardVisibility.Public };
        _sut.SetSharePassword(board, "secret");

        Assert.True(_sut.HasSharedLinkAccess(board, "secret"));
    }

    #endregion

    #region Members

    [Fact]
    public void AddMember_NewUser_AddsMember()
    {
        var board = new Board { OwnerId = Guid.NewGuid() };
        var user = new User { Username = "bob", IsActive = true };

        _sut.AddMember(board, user, BoardRole.Editor);

        Assert.Single(board.Members);
        Assert.Equal("bob", board.Members[0].Username);
        Assert.Equal(BoardRole.Editor, board.Members[0].Role);
    }

    [Fact]
    public void AddMember_ExistingUser_UpdatesRole()
    {
        var userId = Guid.NewGuid();
        var board = new Board
        {
            OwnerId = Guid.NewGuid(),
            Members = [new BoardMember { UserId = userId, Username = "bob", Role = BoardRole.Viewer }]
        };
        var user = new User { Id = userId, Username = "bob", IsActive = true };

        _sut.AddMember(board, user, BoardRole.Editor);

        Assert.Single(board.Members);
        Assert.Equal(BoardRole.Editor, board.Members[0].Role);
    }

    [Fact]
    public void AddMember_Owner_IsNoOp()
    {
        var ownerId = Guid.NewGuid();
        var board = new Board { OwnerId = ownerId };
        var user = new User { Id = ownerId, Username = "owner", IsActive = true };

        _sut.AddMember(board, user, BoardRole.Editor);

        Assert.Empty(board.Members);
    }

    [Fact]
    public void AddMember_InactiveUser_Throws()
    {
        var board = new Board { OwnerId = Guid.NewGuid() };
        var user = new User { Username = "inactive", IsActive = false };

        Assert.Throws<InvalidOperationException>(() => _sut.AddMember(board, user, BoardRole.Editor));
    }

    [Fact]
    public void RemoveMember_ExistingMember_Removes()
    {
        var userId = Guid.NewGuid();
        var board = new Board
        {
            OwnerId = Guid.NewGuid(),
            Members = [new BoardMember { UserId = userId, Username = "bob" }]
        };

        _sut.RemoveMember(board, userId);

        Assert.Empty(board.Members);
    }

    [Fact]
    public void RemoveMember_Owner_Throws()
    {
        var ownerId = Guid.NewGuid();
        var board = new Board { OwnerId = ownerId };

        Assert.Throws<InvalidOperationException>(() => _sut.RemoveMember(board, ownerId));
    }

    [Fact]
    public void UpdateMemberRole_ExistingMember_UpdatesRole()
    {
        var userId = Guid.NewGuid();
        var board = new Board
        {
            OwnerId = Guid.NewGuid(),
            Members = [new BoardMember { UserId = userId, Username = "bob", Role = BoardRole.Viewer }]
        };

        _sut.UpdateMemberRole(board, userId, BoardRole.Editor);

        Assert.Equal(BoardRole.Editor, board.Members[0].Role);
    }

    [Fact]
    public void UpdateMemberRole_Owner_Throws()
    {
        var ownerId = Guid.NewGuid();
        var board = new Board { OwnerId = ownerId };

        Assert.Throws<InvalidOperationException>(() => _sut.UpdateMemberRole(board, ownerId, BoardRole.Editor));
    }

    [Fact]
    public void UpdateMemberRole_NonExistentMember_Throws()
    {
        var board = new Board { OwnerId = Guid.NewGuid() };

        Assert.Throws<InvalidOperationException>(() => _sut.UpdateMemberRole(board, Guid.NewGuid(), BoardRole.Editor));
    }

    #endregion

    #region Snapshots

    [Fact]
    public void CreateSnapshot_AddsToBoard()
    {
        var board = new Board { Title = "Test", Elements = [new ShapeElement { Label = "A" }] };
        var userId = Guid.NewGuid();

        var snapshot = _sut.CreateSnapshot(board, "v1", userId, "alice");

        Assert.Single(board.Snapshots);
        Assert.Equal("v1", snapshot.Name);
        Assert.Equal("alice", snapshot.CreatedByUsername);
        Assert.Equal(userId, snapshot.CreatedByUserId);
        Assert.NotEmpty(snapshot.ContentJson);
    }

    [Fact]
    public void CreateSnapshot_NullName_GeneratesDefaultName()
    {
        var board = new Board { Title = "Test" };

        var snapshot = _sut.CreateSnapshot(board, null, Guid.NewGuid(), "alice");

        Assert.StartsWith("Snapshot ", snapshot.Name);
    }

    [Fact]
    public void CreateSnapshot_EnforcesMaxSnapshots()
    {
        var board = new Board { Title = "Test" };
        for (var i = 0; i < 35; i++)
        {
            _sut.CreateSnapshot(board, $"snap-{i}", Guid.NewGuid(), "alice");
        }

        Assert.Equal(30, board.Snapshots.Count);
    }

    [Fact]
    public void CreateSnapshot_NewestFirst()
    {
        var board = new Board { Title = "Test" };
        _sut.CreateSnapshot(board, "first", Guid.NewGuid(), "alice");
        _sut.CreateSnapshot(board, "second", Guid.NewGuid(), "alice");

        Assert.Equal("second", board.Snapshots[0].Name);
        Assert.Equal("first", board.Snapshots[1].Name);
    }

    [Fact]
    public void RestoreSnapshot_RestoresContent()
    {
        var board = new Board
        {
            Title = "Original",
            Elements = [new ShapeElement { Label = "A" }]
        };

        var snapshot = _sut.CreateSnapshot(board, "v1", Guid.NewGuid(), "alice");

        board.Title = "Modified";
        board.Elements.Clear();

        _sut.RestoreSnapshot(board, snapshot.Id);

        Assert.Equal("Original", board.Title);
        Assert.Single(board.Elements);
    }

    [Fact]
    public void RestoreSnapshot_PreservesComments()
    {
        var board = new Board
        {
            Title = "Original",
            Elements = [new ShapeElement { Label = "A" }],
            Comments =
            [
                new BoardComment
                {
                    AuthorUserId = Guid.NewGuid(),
                    AuthorUsername = "alice",
                    X = 10,
                    Y = 20,
                    Text = "Keep me"
                }
            ]
        };

        var snapshot = _sut.CreateSnapshot(board, "v1", Guid.NewGuid(), "alice");

        board.Title = "Modified";
        board.Elements.Clear();
        board.Comments[0].Text = "Still here";

        _sut.RestoreSnapshot(board, snapshot.Id);

        Assert.Equal("Original", board.Title);
        Assert.Single(board.Elements);
        Assert.Single(board.Comments);
        Assert.Equal("Still here", board.Comments[0].Text);
    }

    [Fact]
    public void RestoreSnapshot_RestoresStickyNotePresets()
    {
        var board = new Board
        {
            Title = "Original",
            StickyNotePresets =
            [
                new StickyNotePreset { Id = "yellow", Label = "Yellow", FillColor = "#FDE68A" }
            ]
        };

        var snapshot = _sut.CreateSnapshot(board, "v1", Guid.NewGuid(), "alice");

        board.StickyNotePresets =
        [
            new StickyNotePreset { Id = "pink", Label = "Pink", FillColor = "#F9A8D4" }
        ];

        _sut.RestoreSnapshot(board, snapshot.Id);

        Assert.Single(board.StickyNotePresets);
        Assert.Equal("yellow", board.StickyNotePresets[0].Id);
    }

    [Fact]
    public void RestoreSnapshot_NonExistent_Throws()
    {
        var board = new Board { Title = "Test" };

        Assert.Throws<InvalidOperationException>(() => _sut.RestoreSnapshot(board, Guid.NewGuid()));
    }

    #endregion

    #region HasAccess

    [Fact]
    public void HasAccess_SharedBoard_ViewerRole_ReturnsFalseForAnonymousUser()
    {
        var board = new Board { Visibility = BoardVisibility.Shared };

        Assert.False(_sut.HasAccess(board, null, BoardRole.Viewer));
    }

    [Fact]
    public void HasAccess_SharedBoard_EditorRole_NullUser_ReturnsFalse()
    {
        var board = new Board { Visibility = BoardVisibility.Shared };

        Assert.False(_sut.HasAccess(board, null, BoardRole.Editor));
    }

    [Fact]
    public void HasAccess_PublicBoard_ViewerRole_ReturnsTrue()
    {
        var board = new Board { Visibility = BoardVisibility.Public };

        Assert.True(_sut.HasAccess(board, Guid.NewGuid(), BoardRole.Viewer));
    }

    [Fact]
    public void HasAccess_PrivateBoard_NonMember_ReturnsFalse()
    {
        var board = new Board { Visibility = BoardVisibility.Private };

        Assert.False(_sut.HasAccess(board, Guid.NewGuid(), BoardRole.Viewer));
    }

    [Fact]
    public void HasAccess_PrivateBoard_Member_WithSufficientRole_ReturnsTrue()
    {
        var userId = Guid.NewGuid();
        var board = new Board
        {
            Visibility = BoardVisibility.Private,
            Members = [new BoardMember { UserId = userId, Role = BoardRole.Editor }]
        };

        Assert.True(_sut.HasAccess(board, userId, BoardRole.Editor));
    }

    [Fact]
    public void HasAccess_PrivateBoard_Owner_HasAllAccess()
    {
        var userId = Guid.NewGuid();
        var board = new Board
        {
            Visibility = BoardVisibility.Private,
            OwnerId = userId,
            Members = [new BoardMember { UserId = userId, Role = BoardRole.Owner }]
        };

        Assert.True(_sut.HasAccess(board, userId, BoardRole.Owner));
        Assert.True(_sut.HasAccess(board, userId, BoardRole.Editor));
        Assert.True(_sut.HasAccess(board, userId, BoardRole.Viewer));
    }

    [Fact]
    public void HasAccess_PrivateBoard_Viewer_CannotEdit()
    {
        var userId = Guid.NewGuid();
        var board = new Board
        {
            Visibility = BoardVisibility.Private,
            Members = [new BoardMember { UserId = userId, Role = BoardRole.Viewer }]
        };

        Assert.True(_sut.HasAccess(board, userId, BoardRole.Viewer));
        Assert.False(_sut.HasAccess(board, userId, BoardRole.Editor));
    }

    #endregion

    #region GetAccessibleBoardSummariesAsync

    [Fact]
    public async Task GetAccessibleBoardSummariesAsync_FiltersCorrectly()
    {
        var userId = Guid.NewGuid();
        var summaries = new List<BoardSummary>
        {
            new() { OwnerId = userId, Visibility = BoardVisibility.Private },
            new() { OwnerId = Guid.NewGuid(), Visibility = BoardVisibility.Public },
            new() { OwnerId = Guid.NewGuid(), Visibility = BoardVisibility.Private,
                     Members = [new BoardMember { UserId = userId }] },
            new() { OwnerId = Guid.NewGuid(), Visibility = BoardVisibility.Private }
        };
        _boardRepo.GetBoardSummariesAsync().Returns(summaries);

        var result = await _sut.GetAccessibleBoardSummariesAsync(userId);

        Assert.Equal(3, result.Count);
    }

    #endregion

    #region GenerateShareLinkToken

    [Fact]
    public void GenerateShareLinkToken_Returns64CharHexString()
    {
        var token = _sut.GenerateShareLinkToken();

        Assert.Equal(64, token.Length);
        Assert.Matches("^[0-9a-f]{64}$", token);
    }

    [Fact]
    public void GenerateShareLinkToken_ReturnsUniqueTokens()
    {
        var tokens = Enumerable.Range(0, 10).Select(_ => _sut.GenerateShareLinkToken()).ToList();

        Assert.Equal(tokens.Count, tokens.Distinct().Count());
    }

    #endregion

    #region ReplaceBoardContent

    [Fact]
    public void ReplaceBoardContent_CopiesProperties()
    {
        var target = new Board { Title = "Target" };
        var imported = new Board
        {
            LabelOutlineEnabled = false,
            ArrowOutlineEnabled = false,
            CustomColors = ["#FFF"],
            RecentColors = ["#000"],
            StickyNotePresets = [new StickyNotePreset { Id = "yellow", Label = "Yellow", FillColor = "#FDE68A" }],
            Elements = [new ShapeElement { Label = "Imported" }]
        };

        _sut.ReplaceBoardContent(target, imported);

        Assert.False(target.LabelOutlineEnabled);
        Assert.False(target.ArrowOutlineEnabled);
        Assert.Single(target.CustomColors);
        Assert.Single(target.RecentColors);
        Assert.Single(target.StickyNotePresets);
        Assert.Single(target.Elements);
    }

    [Fact]
    public void ReplaceBoardContent_DeduplicatesColors()
    {
        var target = new Board();
        var imported = new Board
        {
            CustomColors = ["#FFF", "#fff", "#FFF"],
            RecentColors = ["#000", "#000"]
        };

        _sut.ReplaceBoardContent(target, imported);

        Assert.Single(target.CustomColors);
        Assert.Single(target.RecentColors);
    }

    [Fact]
    public void ReplaceBoardContent_PreservesComments()
    {
        var target = new Board
        {
            Comments =
            [
                new BoardComment
                {
                    AuthorUserId = Guid.NewGuid(),
                    AuthorUsername = "alice",
                    X = 12,
                    Y = 24,
                    Text = "Server-owned"
                }
            ]
        };
        var imported = new Board
        {
            Elements = [new ShapeElement { Label = "Imported" }],
            Comments =
            [
                new BoardComment
                {
                    AuthorUserId = Guid.NewGuid(),
                    AuthorUsername = "bob",
                    X = 1,
                    Y = 2,
                    Text = "Should not replace"
                }
            ]
        };

        _sut.ReplaceBoardContent(target, imported);

        Assert.Single(target.Elements);
        Assert.Single(target.Comments);
        Assert.Equal("Server-owned", target.Comments[0].Text);
    }

    [Fact]
    public void ReplaceBoardContent_NullTargetBoard_Throws()
    {
        Assert.Throws<ArgumentNullException>(() => _sut.ReplaceBoardContent(null!, new Board()));
    }

    [Fact]
    public void ReplaceBoardContent_NullImportedBoard_Throws()
    {
        Assert.Throws<ArgumentNullException>(() => _sut.ReplaceBoardContent(new Board(), null!));
    }

    #endregion

    #region UpdateBoardAsync

    [Fact]
    public async Task UpdateBoardAsync_UpdatesTimestamp()
    {
        var board = new Board
        {
            OwnerId = Guid.NewGuid(),
            Members = [new BoardMember { UserId = Guid.NewGuid(), Role = BoardRole.Owner }]
        };
        board.Members[0].UserId = board.OwnerId;

        var before = DateTime.UtcNow;
        await _sut.UpdateBoardAsync(board);

        Assert.True(board.UpdatedAt >= before);
        await _boardRepo.Received(1).SaveAsync(board);
    }

    [Fact]
    public async Task DeleteBoardAsync_DelegatesToRepository()
    {
        var boardId = Guid.NewGuid();

        await _sut.DeleteBoardAsync(boardId);

        await _boardRepo.Received(1).DeleteAsync(boardId);
    }

    #endregion

    #region GetTemplates

    [Fact]
    public void GetTemplates_ReturnsAllDefinitions()
    {
        var templates = _sut.GetTemplates();

        Assert.Equal(7, templates.Count);
    }

    #endregion
}
