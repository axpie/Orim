using Microsoft.EntityFrameworkCore;
using Orim.Core.Interfaces;
using Orim.Core.Models;
using Orim.Infrastructure.Data;

namespace Orim.Infrastructure.Repositories;

public class EfUserRepository : IUserRepository
{
    private readonly OrimDbContext _context;

    public EfUserRepository(OrimDbContext context)
    {
        _context = context;
    }

    public async Task<List<User>> GetAllAsync()
    {
        return await _context.Users.AsNoTracking().ToListAsync();
    }

    public async Task<User?> GetByIdAsync(Guid id)
    {
        return await _context.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == id);
    }

    public async Task<User?> GetByUsernameAsync(string username)
    {
        return await _context.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.Username.ToLower() == username.ToLower());
    }

    public async Task<User?> GetByEmailAsync(string email)
    {
        if (string.IsNullOrWhiteSpace(email))
            return null;

        return await _context.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.Email != null && u.Email.ToLower() == email.ToLower());
    }

    public async Task<User?> GetByExternalIdentityAsync(AuthenticationProvider provider, string externalSubject)
    {
        return await _context.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(u =>
                u.AuthenticationProvider == provider &&
                u.ExternalSubject != null &&
                u.ExternalSubject.ToLower() == externalSubject.ToLower());
    }

    public async Task SaveAsync(User entity)
    {
        var existing = await _context.Users.FindAsync(entity.Id);

        if (existing is null)
        {
            _context.Users.Add(entity);
        }
        else
        {
            _context.Entry(existing).CurrentValues.SetValues(entity);
        }

        await _context.SaveChangesAsync();
        _context.ChangeTracker.Clear();
    }

    public async Task DeleteAsync(Guid id)
    {
        var user = await _context.Users.FindAsync(id);
        if (user is not null)
        {
            _context.Users.Remove(user);
            await _context.SaveChangesAsync();
        }
        _context.ChangeTracker.Clear();
    }
}
