using Microsoft.Extensions.DependencyInjection;
using Orim.Core.Interfaces;
using Orim.Core.Services;
using Orim.Infrastructure.Repositories;
using Orim.Infrastructure.Services;

namespace Orim.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddOrimInfrastructure(this IServiceCollection services, string dataPath)
    {
        services.AddSingleton<IUserRepository>(new JsonUserRepository(dataPath));
        services.AddSingleton<IBoardRepository>(new JsonBoardRepository(dataPath));
        services.AddSingleton<IBoardStateNotifier, NoOpBoardStateNotifier>();
        services.AddScoped<UserService>();
        services.AddScoped<BoardService>();
        return services;
    }
}
