using Microsoft.Extensions.DependencyInjection;
using Orim.Core.Interfaces;
using Orim.Core.Services;
using Orim.Infrastructure.Repositories;
using Orim.Infrastructure.Services;

namespace Orim.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddOrimInfrastructure(this IServiceCollection services, string dataPath, bool useDebugStorage = false)
    {
        var userFileName = useDebugStorage ? "user_debug.json" : "users.json";
        var boardDirectoryName = useDebugStorage ? "boards_debug" : "boards";

        services.AddSingleton<IUserRepository>(new JsonUserRepository(dataPath, userFileName));
        services.AddSingleton<IBoardRepository>(new JsonBoardRepository(dataPath, boardDirectoryName));
        services.AddSingleton<IBoardStateNotifier, NoOpBoardStateNotifier>();
        services.AddScoped<UserService>();
        services.AddScoped<BoardService>();
        return services;
    }
}
