using Orim.Core.Models;

namespace Orim.Tests.Helpers;

/// <summary>Fluent builder for creating Board instances in tests.</summary>
public sealed class BoardBuilder
{
    private Guid _id = Guid.NewGuid();
    private string _title = "Test Board";
    private Guid _ownerId = Guid.NewGuid();
    private List<BoardElement> _elements = [];
    private List<BoardMember> _members = [];

    public BoardBuilder WithId(Guid id) { _id = id; return this; }
    public BoardBuilder WithTitle(string title) { _title = title; return this; }
    public BoardBuilder WithOwner(Guid userId) { _ownerId = userId; return this; }
    public BoardBuilder WithElements(params BoardElement[] elements) { _elements = [..elements]; return this; }
    public BoardBuilder WithMember(Guid userId, string username, BoardRole role)
    {
        _members.Add(new BoardMember { UserId = userId, Username = username, Role = role });
        return this;
    }

    public Board Build() => new()
    {
        Id = _id,
        Title = _title,
        OwnerId = _ownerId,
        Elements = _elements,
        Members = _members,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow
    };
}
