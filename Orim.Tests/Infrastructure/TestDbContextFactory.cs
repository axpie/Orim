using Microsoft.EntityFrameworkCore;
using Orim.Infrastructure.Data;

namespace Orim.Tests.Infrastructure;

internal static class TestDbContextFactory
{
    public static OrimDbContext Create(string? databaseName = null)
    {
        var options = new DbContextOptionsBuilder<OrimDbContext>()
            .UseInMemoryDatabase(databaseName ?? Guid.NewGuid().ToString())
            .Options;
        var context = new OrimDbContext(options);
        context.Database.EnsureCreated();
        return context;
    }
}
