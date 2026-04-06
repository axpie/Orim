namespace Orim.Core.Interfaces;

public interface IRepository<T> where T : class
{
    Task<List<T>> GetAllAsync();
    Task<T?> GetByIdAsync(Guid id);
    Task SaveAsync(T entity);
    Task DeleteAsync(Guid id);
}
