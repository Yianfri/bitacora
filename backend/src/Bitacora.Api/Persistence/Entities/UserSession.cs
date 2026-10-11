namespace Bitacora.Api.Persistence.Entities;

public sealed class UserSession
{
    public required string Id { get; init; }
    public required string UserId { get; init; }
    public required string ExpiresUtc { get; init; }
}
