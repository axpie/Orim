using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Orim.Core.Interfaces;
using Orim.Core.Services;
using Orim.Infrastructure.Data;
using Orim.Infrastructure.Repositories;
using Orim.Infrastructure.Services;

namespace Orim.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddOrimInfrastructure(this IServiceCollection services, string connectionString)
    {
        services.AddDbContext<OrimDbContext>(options =>
            options.UseNpgsql(connectionString));

        services.AddScoped<IBoardRepository, EfBoardRepository>();
        services.AddScoped<IUserRepository, EfUserRepository>();
        services.AddScoped<IBoardFileService, EfBoardFileService>();
        services.AddScoped<IThemeRepository, EfThemeRepository>();
        services.AddScoped<IAssistantSettingsRepository, EfAssistantSettingsRepository>();
        services.AddScoped<IBoardOperationRepository, EfBoardOperationRepository>();
        services.AddScoped<UserService>();
        services.AddScoped<BoardService>();
        return services;
    }
}
