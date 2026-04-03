using Microsoft.EntityFrameworkCore;
using Orim.Core.Interfaces;
using Orim.Infrastructure.Data;
using Orim.Infrastructure.Data.Entities;

namespace Orim.Infrastructure.Repositories;

public class EfAssistantSettingsRepository : IAssistantSettingsRepository
{
    private const int SingleRowId = 1;
    private readonly OrimDbContext _context;

    public EfAssistantSettingsRepository(OrimDbContext context)
    {
        _context = context;
    }

    public async Task<AssistantSettingsRecord?> GetAsync()
    {
        var entity = await _context.AssistantSettings
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == SingleRowId);

        if (entity is null)
            return null;

        return new AssistantSettingsRecord
        {
            IsEnabled = entity.IsEnabled,
            Endpoint = entity.Endpoint,
            DeploymentName = entity.DeploymentName,
            ApiKey = entity.ApiKey
        };
    }

    public async Task SaveAsync(AssistantSettingsRecord record)
    {
        var existing = await _context.AssistantSettings.FindAsync(SingleRowId);

        if (existing is null)
        {
            _context.AssistantSettings.Add(new AssistantSettingsEntity
            {
                Id = SingleRowId,
                IsEnabled = record.IsEnabled,
                Endpoint = record.Endpoint,
                DeploymentName = record.DeploymentName,
                ApiKey = record.ApiKey
            });
        }
        else
        {
            existing.IsEnabled = record.IsEnabled;
            existing.Endpoint = record.Endpoint;
            existing.DeploymentName = record.DeploymentName;
            existing.ApiKey = record.ApiKey;
        }

        await _context.SaveChangesAsync();
        _context.ChangeTracker.Clear();
    }
}
