using System.Security.Cryptography;
using Microsoft.AspNetCore.Identity;

namespace Bitacora.Api.Storage;

public sealed record Account(string Id, string Username, string PasswordHash);

public sealed class AccountStore(Database database, IPasswordHasher<Account> hasher)
{
  private readonly Account dummy = new("", "", hasher.HashPassword(new("", "", ""),
      Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))));

  public Account? Authenticate(string username, string password)
  {
    using var connection = database.Open();
    using var command = Database.Command(connection,
        "SELECT id, username, password_hash FROM users WHERE username = $name", ("$name", username.ToUpperInvariant()));
    using var reader = command.ExecuteReader();
    var found = reader.Read() ? new Account(reader.GetString(0), reader.GetString(1), reader.GetString(2)) : null;
    reader.Close();
    var account = found ?? dummy;
    var result = hasher.VerifyHashedPassword(account, account.PasswordHash, password);
    if (found is null || result == PasswordVerificationResult.Failed) return null;
    if (result == PasswordVerificationResult.SuccessRehashNeeded)
    {
      using var update = Database.Command(connection,
          "UPDATE users SET password_hash = $hash WHERE id = $id",
          ("$hash", hasher.HashPassword(found, password)), ("$id", found.Id));
      update.ExecuteNonQuery();
    }
    return found;
  }

  public void Create(string username, string password)
  {
    var account = new Account(Guid.NewGuid().ToString("N"), username.ToUpperInvariant(), "");
    using var connection = database.Open();
    using var command = Database.Command(connection,
        "INSERT INTO users(id, username, password_hash) VALUES($id, $name, $hash)",
        ("$id", account.Id), ("$name", account.Username), ("$hash", hasher.HashPassword(account, password)));
    command.ExecuteNonQuery();
  }

  public string StartSession(string userId, DateTimeOffset expires)
  {
    var id = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    using var connection = database.Open();
    using var transaction = connection.BeginTransaction();
    using var cleanup = Database.Command(connection, "DELETE FROM sessions WHERE expires_utc <= $now",
        ("$now", DateTimeOffset.UtcNow.ToString("O")));
    cleanup.Transaction = transaction;
    cleanup.ExecuteNonQuery();
    using var insert = Database.Command(connection,
        "INSERT INTO sessions(id, user_id, expires_utc) VALUES($id, $user, $expires)",
        ("$id", id), ("$user", userId), ("$expires", expires.ToString("O")));
    insert.Transaction = transaction;
    insert.ExecuteNonQuery();
    transaction.Commit();
    return id;
  }

  public bool ValidSession(string id, string userId)
  {
    using var connection = database.Open();
    using var command = Database.Command(connection,
        "SELECT COUNT(*) FROM sessions WHERE id = $id AND user_id = $user AND expires_utc > $now",
        ("$id", id), ("$user", userId), ("$now", DateTimeOffset.UtcNow.ToString("O")));
    return Convert.ToInt64(command.ExecuteScalar()) == 1;
  }

  public void EndSession(string id)
  {
    using var connection = database.Open();
    using var command = Database.Command(connection, "DELETE FROM sessions WHERE id = $id", ("$id", id));
    command.ExecuteNonQuery();
  }
}
