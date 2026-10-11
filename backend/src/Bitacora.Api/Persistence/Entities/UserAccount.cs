namespace Bitacora.Api.Persistence.Entities;

public sealed class UserAccount
{
    public required string Id { get; init; }
    public required string Username { get; init; }
    public required string PasswordHash { get; set; }
}
