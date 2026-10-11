using System.Text;
using Bitacora.Api.Storage;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Bitacora.Api.Tests.Persistence;

public sealed class MigrationTests
{
    private const string LegacyTables = """
        CREATE TABLE users(id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL);
        CREATE TABLE sessions(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_utc TEXT NOT NULL);
        CREATE INDEX sessions_user ON sessions(user_id);
        CREATE TABLE trip_copies(owner_id TEXT NOT NULL REFERENCES users(id), trip_id TEXT NOT NULL, name TEXT NOT NULL,
          backup_json TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision > 0), updated_utc TEXT NOT NULL, PRIMARY KEY(owner_id, trip_id));
        PRAGMA user_version = 1;
        """;

    [Fact]
    public void ProductionRequiresMigrationBeforeStartingWithoutCreatingTables()
    {
        using var fixture = new DatabaseFixture();
        Assert.Throws<InvalidOperationException>(() => fixture.Database.RequireCurrentSchema(fixture.Factory));
        using var db = fixture.Factory.CreateDbContext();
        Assert.Empty(db.Database.GetAppliedMigrations());
    }

    [Fact]
    public void NewerEfHistoryIsRejectedInsteadOfSilentlyRunningAnOlderModel()
    {
        using var fixture = new DatabaseFixture();
        fixture.Database.Migrate(fixture.Factory);
        using var connection = new SqliteConnection(fixture.Database.ConnectionString);
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "INSERT INTO __EFMigrationsHistory VALUES('99990101000000_Future', '99.0.0')";
        command.ExecuteNonQuery();

        Assert.Throws<InvalidOperationException>(() => fixture.Database.RequireCurrentSchema(fixture.Factory));
        Assert.Throws<InvalidOperationException>(() => fixture.Database.Migrate(fixture.Factory));
    }

    [Fact]
    public void FreshDatabaseUsesVersionedMigrationsAndRepeatedMigrationIsSafe()
    {
        using var fixture = new DatabaseFixture();
        fixture.Database.Migrate(fixture.Factory);
        fixture.Database.Migrate(fixture.Factory);
        fixture.Database.RequireCurrentSchema(fixture.Factory);
        using var db = fixture.Factory.CreateDbContext();

        Assert.Equal(2, db.Database.GetAppliedMigrations().Count());
        Assert.Empty(db.Database.GetPendingMigrations());
        Assert.False(db.Database.HasPendingModelChanges());
    }

    [Fact]
    public void LegacyMigrationPreservesAccountsSessionsRawCopiesAndRevisions()
    {
        using var fixture = new DatabaseFixture();
        var original = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "seed.json"));

        using (var connection = new SqliteConnection(fixture.Database.ConnectionString))
        {
            connection.Open();
            using var command = connection.CreateCommand();
            command.CommandText = LegacyTables;
            command.ExecuteNonQuery();
            command.CommandText = """
                INSERT INTO users VALUES('owner', 'EXAMPLE', 'hash-placeholder');
                INSERT INTO sessions VALUES('session', 'owner', '2030-06-03T17:00:00.0000000+00:00');
                INSERT INTO trip_copies VALUES('owner', 'legacy', 'Ejemplo ficticio', $backup, 7, '2030-06-03T17:00:00.0000000+00:00');
                """;
            command.Parameters.AddWithValue("$backup", original);
            command.ExecuteNonQuery();
        }

        fixture.Database.Migrate(fixture.Factory);
        fixture.Database.Migrate(fixture.Factory);
        using var db = fixture.Factory.CreateDbContext();
        var copy = Assert.Single(db.TripCopies);

        Assert.Equal(original, copy.BackupJson);
        Assert.Equal(Encoding.UTF8.GetByteCount(original), copy.BackupBytes);
        Assert.Equal(7, copy.Revision);
        Assert.Equal("hash-placeholder", Assert.Single(db.Users).PasswordHash);
        Assert.Equal("session", Assert.Single(db.Sessions).Id);
        Assert.Equal(2, db.Database.GetAppliedMigrations().Count());

        var store = new TripStore(fixture.Factory, new StorageLimits(100, copy.BackupBytes));
        Assert.Throws<StorageQuotaExceededException>(() => store.Write("owner", "new", "Demo", "x", null));
        Assert.Equal(original, store.Read("owner", "legacy")!.Backup);
    }

    [Theory]
    [InlineData("PRAGMA user_version = 2;")]
    [InlineData("CREATE TABLE users(id TEXT); PRAGMA user_version = 1;")]
    public void UnknownOrIncompatibleSchemasAreNotAdopted(string sql)
    {
        using var fixture = new DatabaseFixture();
        using var connection = new SqliteConnection(fixture.Database.ConnectionString);
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.ExecuteNonQuery();

        Assert.Throws<InvalidOperationException>(() => fixture.Database.Migrate(fixture.Factory));
        command.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE name = '__EFMigrationsHistory'";
        Assert.Equal(0L, command.ExecuteScalar());
    }
}
