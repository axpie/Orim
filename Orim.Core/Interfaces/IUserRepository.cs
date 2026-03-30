using Orim.Core.Models;

namespace Orim.Core.Interfaces;

public interface IUserRepository : IRepository<User>
{
    Task<User?> GetByUsernameAsync(string username);
    Task<User?> GetByEmailAsync(string email);
    Task<User?> GetByExternalIdentityAsync(AuthenticationProvider provider, string externalSubject);
}
