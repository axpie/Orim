namespace Orim.Core.Exceptions;

public class OrimDomainException : Exception
{
    public OrimDomainException(string message) : base(message) { }
    public OrimDomainException(string message, Exception inner) : base(message, inner) { }
}

public class BoardNotFoundException : OrimDomainException
{
    public BoardNotFoundException(Guid boardId) : base($"Board '{boardId}' was not found.") { }
}

public class UserNotFoundException : OrimDomainException
{
    public UserNotFoundException(string identifier) : base($"User '{identifier}' was not found.") { }
}

public class AccessDeniedException : OrimDomainException
{
    public AccessDeniedException(string resource) : base($"Access to '{resource}' was denied.") { }
}
