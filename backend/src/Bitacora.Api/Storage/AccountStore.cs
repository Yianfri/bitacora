using System.Security.Cryptography;
using Bitacora.Api.Persistence;
using Bitacora.Api.Persistence.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Bitacora.Api.Storage;

public sealed record Account(string Id, string Username, string PasswordHash);

public sealed class AccountStore(IDbContextFactory<BitacoraDbContext> factory, IPasswordHasher<Account> hasher)
{
    // Verificar un hash también para usuarios inexistentes reduce diferencias de tiempo
    // que podrían revelar qué nombres de cuenta están registrados.
    private readonly Account dummy = new("", "", hasher.HashPassword(new Account("", "", ""),
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))));

    public Account? Authenticate(string username, string password)
    {
        using var db = factory.CreateDbContext();
        var normalized = username.ToUpperInvariant();
        var found = db.Users.SingleOrDefault(user => user.Username == normalized);
        var account = found is null ? dummy : new Account(found.Id, found.Username, found.PasswordHash);
        var result = hasher.VerifyHashedPassword(account, account.PasswordHash, password);

        if (found is null || result == PasswordVerificationResult.Failed)
        {
            return null;
        }

        if (result == PasswordVerificationResult.SuccessRehashNeeded)
        {
            found.PasswordHash = hasher.HashPassword(account, password);
            db.SaveChanges();
        }

        return account;
    }

    public void Create(string username, string password)
    {
        using var db = factory.CreateDbContext();
        var account = new Account(Guid.NewGuid().ToString("N"), username.ToUpperInvariant(), "");

        db.Users.Add(new UserAccount
        {
            Id = account.Id,
            Username = account.Username,
            PasswordHash = hasher.HashPassword(account, password)
        });
        db.SaveChanges();
    }

    public string StartSession(string userId, DateTimeOffset expires)
    {
        using var db = factory.CreateDbContext();
        using var transaction = db.Database.BeginTransaction();
        var now = DateTimeOffset.UtcNow.ToString("O");
        var id = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));

        // EF traduce esta comparación a SQLite BINARY; no admite la sobrecarga ordinal.
#pragma warning disable CA1309
        db.Sessions.Where(session => string.Compare(session.ExpiresUtc, now) <= 0).ExecuteDelete();
#pragma warning restore CA1309
        db.Sessions.Add(new UserSession
        {
            Id = id,
            UserId = userId,
            ExpiresUtc = expires.ToString("O")
        });
        db.SaveChanges();
        transaction.Commit();

        return id;
    }

    public bool ValidSession(string id, string userId)
    {
        using var db = factory.CreateDbContext();
        var now = DateTimeOffset.UtcNow.ToString("O");

        // La comparación ocurre en SQLite sobre instantes UTC normalizados, no en .NET.
#pragma warning disable CA1309
        return db.Sessions.Any(session => session.Id == id && session.UserId == userId
            && string.Compare(session.ExpiresUtc, now) > 0);
#pragma warning restore CA1309
    }

    public void EndSession(string id)
    {
        using var db = factory.CreateDbContext();
        db.Sessions.Where(session => session.Id == id).ExecuteDelete();
    }
}
