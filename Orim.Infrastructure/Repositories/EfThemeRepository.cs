using Microsoft.EntityFrameworkCore;
using Orim.Core.Interfaces;
using Orim.Infrastructure.Data;
using Orim.Infrastructure.Data.Entities;

namespace Orim.Infrastructure.Repositories;

public class EfThemeRepository : IThemeRepository
{
    private readonly OrimDbContext _context;

    public EfThemeRepository(OrimDbContext context)
    {
        _context = context;
    }

    public async Task<List<ThemeRecord>> GetAllAsync()
    {
        return await _context.Themes
            .AsNoTracking()
            .Select(t => ToRecord(t))
            .ToListAsync();
    }

    public async Task<ThemeRecord?> GetByKeyAsync(string key)
    {
        var entity = await _context.Themes
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.Key == key);

        return entity is null ? null : ToRecord(entity);
    }

    public async Task SaveAsync(ThemeRecord record)
    {
        var existing = await _context.Themes.FindAsync(record.Key);

        if (existing is null)
        {
            _context.Themes.Add(ToEntity(record));
        }
        else
        {
            existing.Name = record.Name;
            existing.IsDarkMode = record.IsDarkMode;
            existing.IsEnabled = record.IsEnabled;
            existing.IsProtected = record.IsProtected;
            existing.DefinitionJson = record.DefinitionJson;
        }

        await _context.SaveChangesAsync();
        _context.ChangeTracker.Clear();
    }

    public async Task DeleteAsync(string key)
    {
        var entity = await _context.Themes.FindAsync(key);
        if (entity is not null)
        {
            _context.Themes.Remove(entity);
            await _context.SaveChangesAsync();
        }
        _context.ChangeTracker.Clear();
    }

    private static ThemeRecord ToRecord(ThemeEntity entity) => new()
    {
        Key = entity.Key,
        Name = entity.Name,
        IsDarkMode = entity.IsDarkMode,
        IsEnabled = entity.IsEnabled,
        IsProtected = entity.IsProtected,
        DefinitionJson = entity.DefinitionJson
    };

    private static ThemeEntity ToEntity(ThemeRecord record) => new()
    {
        Key = record.Key,
        Name = record.Name,
        IsDarkMode = record.IsDarkMode,
        IsEnabled = record.IsEnabled,
        IsProtected = record.IsProtected,
        DefinitionJson = record.DefinitionJson
    };
}
