using Microsoft.Data.Sqlite;

namespace Bitacora.Api.Storage;

public sealed class Database
{
  private readonly string connectionString;
  public string DirectoryPath { get; }

  public Database(string directory)
  {
    DirectoryPath = Path.GetFullPath(directory);
    Directory.CreateDirectory(DirectoryPath);
    if (!OperatingSystem.IsWindows())
      File.SetUnixFileMode(DirectoryPath, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
    connectionString = new SqliteConnectionStringBuilder
    {
      DataSource = Path.Combine(DirectoryPath, "bitacora.db"),
      ForeignKeys = true,
      DefaultTimeout = 5,
      Pooling = false
    }.ToString();
  }

  public SqliteConnection Open()
  {
    var connection = new SqliteConnection(connectionString);
    connection.Open();
    return connection;
  }

  public void Initialize()
  {
    using var connection = Open();
    using var version = connection.CreateCommand();
    version.CommandText = "PRAGMA user_version";
    var current = Convert.ToInt32(version.ExecuteScalar());
    if (current > 1) throw new InvalidOperationException("Versión de base de datos no compatible.");
    if (current == 1) return;
    using var transaction = connection.BeginTransaction();
    using var command = connection.CreateCommand();
    command.Transaction = transaction;
    command.CommandText = """
            CREATE TABLE users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL
            );
            CREATE TABLE sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_utc TEXT NOT NULL
            );
            CREATE INDEX sessions_user ON sessions(user_id);
            CREATE TABLE trip_copies (
                owner_id TEXT NOT NULL REFERENCES users(id),
                trip_id TEXT NOT NULL,
                name TEXT NOT NULL,
                backup_json TEXT NOT NULL,
                revision INTEGER NOT NULL CHECK(revision > 0),
                updated_utc TEXT NOT NULL,
                PRIMARY KEY(owner_id, trip_id)
            );
            PRAGMA user_version = 1;
            """;
    command.ExecuteNonQuery();
    transaction.Commit();
  }

  public static SqliteCommand Command(SqliteConnection connection, string sql,
      params (string Name, object Value)[] parameters)
  {
    var command = connection.CreateCommand();
    command.CommandText = sql;
    foreach (var (name, value) in parameters) command.Parameters.AddWithValue(name, value);
    return command;
  }
}
