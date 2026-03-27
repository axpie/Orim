using Orim.Core.Models;

namespace Orim.Tests.Core.Models;

public class UserTests
{
    [Fact]
    public void NewUser_HasDefaultValues()
    {
        var user = new User();

        Assert.NotEqual(Guid.Empty, user.Id);
        Assert.Equal(string.Empty, user.Username);
        Assert.Equal(string.Empty, user.PasswordHash);
        Assert.Equal(UserRole.User, user.Role);
        Assert.True(user.IsActive);
    }

    [Fact]
    public void NewUser_CreatedAt_IsRecentUtc()
    {
        var before = DateTime.UtcNow.AddSeconds(-1);
        var user = new User();
        var after = DateTime.UtcNow.AddSeconds(1);

        Assert.InRange(user.CreatedAt, before, after);
    }
}
