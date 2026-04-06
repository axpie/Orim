using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Microsoft.Extensions.Logging;
using Orim.Core;
using Orim.Core.Models;
using Orim.Infrastructure.Data.Entities;

namespace Orim.Infrastructure.Data;

public class OrimDbContext : DbContext
{
    // Static logger for use in EF Core value converters, which don't support DI.
    private static ILogger? _logger;

    public OrimDbContext(DbContextOptions<OrimDbContext> options, ILogger<OrimDbContext>? logger = null) : base(options)
    {
        _logger ??= logger;
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<Board> Boards => Set<Board>();
    public DbSet<BoardMember> BoardMembers => Set<BoardMember>();
    public DbSet<BoardComment> BoardComments => Set<BoardComment>();
    public DbSet<BoardCommentReply> BoardCommentReplies => Set<BoardCommentReply>();
    public DbSet<BoardSnapshot> BoardSnapshots => Set<BoardSnapshot>();
    public DbSet<UserImageEntity> UserImages => Set<UserImageEntity>();
    public DbSet<ThemeEntity> Themes => Set<ThemeEntity>();
    public DbSet<AssistantSettingsEntity> AssistantSettings => Set<AssistantSettingsEntity>();
    public DbSet<BoardOperationEntity> BoardOperations => Set<BoardOperationEntity>();
    public DbSet<BoardFolder> BoardFolders => Set<BoardFolder>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        ConfigureUser(modelBuilder);
        ConfigureBoard(modelBuilder);
        ConfigureBoardMember(modelBuilder);
        ConfigureBoardComment(modelBuilder);
        ConfigureBoardCommentReply(modelBuilder);
        ConfigureBoardSnapshot(modelBuilder);
        ConfigureUserImage(modelBuilder);
        ConfigureTheme(modelBuilder);
        ConfigureAssistantSettings(modelBuilder);
        ConfigureBoardOperation(modelBuilder);
        ConfigureBoardFolder(modelBuilder);
    }

    private static void ConfigureUser(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("Users");
            entity.HasKey(u => u.Id);

            entity.Property(u => u.Username).IsRequired();
            entity.HasIndex(u => u.Username).IsUnique();
            // Case-insensitive collation for username uniqueness
            entity.Property(u => u.Username).UseCollation("und-x-icu");

            entity.Property(u => u.DisplayName).IsRequired();
            entity.Property(u => u.PasswordHash).IsRequired();

            entity.Property(u => u.AuthenticationProvider)
                .HasConversion<string>()
                .IsRequired();

            entity.Property(u => u.Role)
                .HasConversion<string>()
                .IsRequired();
        });
    }

    private static void ConfigureBoard(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Board>(entity =>
        {
            entity.ToTable("Boards");
            entity.HasKey(b => b.Id);

            entity.Property(b => b.Title).IsRequired();

            entity.Property(b => b.CustomColors)
                .HasConversion(CreateStringListConverter(), CreateStringListComparer())
                .HasColumnType("text");

            entity.Property(b => b.RecentColors)
                .HasConversion(CreateStringListConverter(), CreateStringListComparer())
                .HasColumnType("text");

            entity.Property(b => b.EnabledIconGroups)
                .HasConversion(CreateStringListConverter(), CreateStringListComparer())
                .HasColumnType("text");

            entity.Property(b => b.StickyNotePresets)
                .HasConversion(CreateStickyNotePresetsConverter(), CreateStickyNotePresetsComparer())
                .HasColumnType("text");

            entity.Property(b => b.Visibility)
                .HasConversion<string>()
                .IsRequired();

            entity.HasIndex(b => b.ShareLinkToken).IsUnique();
            entity.HasIndex(b => b.CreatedAt);

            entity.Property(b => b.Tags)
                .HasConversion(CreateStringListConverter(), CreateStringListComparer())
                .HasColumnType("text");

            entity.Property(b => b.Elements)
                .HasConversion(CreateElementsConverter(), CreateElementsComparer())
                .HasColumnType("text");

            entity.HasOne<User>()
                .WithMany()
                .HasForeignKey(b => b.OwnerId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasMany(b => b.Members)
                .WithOne()
                .HasForeignKey("BoardId")
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(b => b.Comments)
                .WithOne()
                .HasForeignKey(c => c.BoardId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(b => b.Snapshots)
                .WithOne()
                .HasForeignKey(s => s.BoardId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static ValueConverter<List<BoardElement>, string> CreateElementsConverter() =>
        new(
            v => JsonSerializer.Serialize(v, OrimJsonOptions.Default),
            v => DeserializeElements(v));

    private static ValueComparer<List<BoardElement>> CreateElementsComparer() =>
        new(
            (a, b) => JsonSerializer.Serialize(a, OrimJsonOptions.Default) == JsonSerializer.Serialize(b, OrimJsonOptions.Default),
            v => JsonSerializer.Serialize(v, OrimJsonOptions.Default).GetHashCode(),
            v => DeserializeElements(JsonSerializer.Serialize(v, OrimJsonOptions.Default)));

    private static ValueConverter<List<string>, string> CreateStringListConverter() =>
        new(
            v => JsonSerializer.Serialize(v, OrimJsonOptions.Default),
            v => string.IsNullOrEmpty(v) ? new List<string>() : JsonSerializer.Deserialize<List<string>>(v, OrimJsonOptions.Default) ?? new List<string>());

    private static ValueComparer<List<string>> CreateStringListComparer() =>
        new(
            (a, b) => a != null && b != null && a.SequenceEqual(b),
            v => v.Aggregate(0, (acc, s) => HashCode.Combine(acc, s.GetHashCode())),
            v => v.ToList());

    private static ValueConverter<List<StickyNotePreset>, string> CreateStickyNotePresetsConverter() =>
        new(
            v => JsonSerializer.Serialize(v, OrimJsonOptions.Default),
            v => JsonSerializer.Deserialize<List<StickyNotePreset>>(v, OrimJsonOptions.Default) ?? new List<StickyNotePreset>());

    private static ValueComparer<List<StickyNotePreset>> CreateStickyNotePresetsComparer() =>
        new(
            (a, b) => JsonSerializer.Serialize(a, OrimJsonOptions.Default) == JsonSerializer.Serialize(b, OrimJsonOptions.Default),
            v => JsonSerializer.Serialize(v, OrimJsonOptions.Default).GetHashCode(),
            v => JsonSerializer.Deserialize<List<StickyNotePreset>>(JsonSerializer.Serialize(v, OrimJsonOptions.Default), OrimJsonOptions.Default) ?? new List<StickyNotePreset>());

    private static void ConfigureBoardMember(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<BoardMember>(entity =>
        {
            entity.ToTable("BoardMembers");
            entity.HasKey("BoardId", nameof(BoardMember.UserId));

            // Shadow property for the composite key / FK
            entity.Property<Guid>("BoardId");

            entity.HasIndex(m => m.UserId);

            entity.Property(m => m.Username).IsRequired();

            entity.Property(m => m.Role)
                .HasConversion<string>()
                .IsRequired();
        });
    }

    private static void ConfigureBoardComment(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<BoardComment>(entity =>
        {
            entity.ToTable("BoardComments");
            entity.HasKey(c => c.Id);

            entity.Property(c => c.AuthorUsername).IsRequired();
            entity.Property(c => c.Text).IsRequired();

            entity.HasMany(c => c.Replies)
                .WithOne()
                .HasForeignKey(r => r.CommentId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static void ConfigureBoardCommentReply(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<BoardCommentReply>(entity =>
        {
            entity.ToTable("BoardCommentReplies");
            entity.HasKey(r => r.Id);

            entity.Property(r => r.AuthorUsername).IsRequired();
            entity.Property(r => r.Text).IsRequired();
        });
    }

    private static void ConfigureBoardSnapshot(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<BoardSnapshot>(entity =>
        {
            entity.ToTable("BoardSnapshots");
            entity.HasKey(s => s.Id);

            entity.Property(s => s.Name).IsRequired();
            entity.Property(s => s.CreatedByUsername).IsRequired();
            entity.Property(s => s.ContentJson).HasColumnType("text");
        });
    }

    private static void ConfigureUserImage(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<UserImageEntity>(entity =>
        {
            entity.ToTable("UserImages");
            entity.HasKey(i => i.Id);

            entity.HasIndex(i => i.UserId);

            entity.Property(i => i.FileName).IsRequired();
            entity.Property(i => i.MimeType).IsRequired();
        });
    }

    private static void ConfigureTheme(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<ThemeEntity>(entity =>
        {
            entity.ToTable("Themes");
            entity.HasKey(t => t.Key);

            entity.Property(t => t.Name).IsRequired();

            entity.Property(t => t.DefinitionJson)
                .HasColumnType("jsonb");
        });
    }

    private static void ConfigureAssistantSettings(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AssistantSettingsEntity>(entity =>
        {
            entity.ToTable("AssistantSettings");
            entity.HasKey(a => a.Id);
        });
    }

    private static void ConfigureBoardOperation(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<BoardOperationEntity>(entity =>
        {
            entity.ToTable("BoardOperations");
            entity.HasKey(o => o.Id);

            entity.Property(o => o.BoardId).IsRequired();
            entity.Property(o => o.SequenceNumber).IsRequired();
            entity.Property(o => o.OperationType).IsRequired();
            entity.Property(o => o.OperationPayload).HasColumnType("text").IsRequired();
            entity.Property(o => o.CreatedAtUtc).IsRequired();

            entity.HasIndex(o => new { o.BoardId, o.SequenceNumber }).IsUnique();

            entity.HasOne<Board>()
                .WithMany()
                .HasForeignKey(o => o.BoardId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static void ConfigureBoardFolder(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<BoardFolder>(entity =>
        {
            entity.ToTable("BoardFolders");
            entity.HasKey(f => f.Id);

            entity.Property(f => f.Id).HasColumnType("text");
            entity.Property(f => f.Name).IsRequired();
            entity.HasIndex(f => f.OwnerId);
        });
    }

    private static List<BoardElement> DeserializeElements(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<List<BoardElement>>(json, OrimJsonOptions.Default) ?? [];
        }
        catch (Exception ex) when (ex is NotSupportedException or JsonException)
        {
            _logger?.LogWarning(ex, "Failed to deserialize board elements — returning empty list. This may indicate data corruption.");
            return [];
        }
    }
}
