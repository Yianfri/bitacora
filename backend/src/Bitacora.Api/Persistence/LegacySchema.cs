using System.Globalization;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Bitacora.Api.Persistence;

// Única adaptación del esquema previo a EF. No participa en consultas de negocio.
// Se reconoce la estructura antes de registrar el baseline, sin recrear tablas.
internal static class LegacySchema
{
    public static void RequireKnownVersion(BitacoraDbContext db)
    {
        db.Database.OpenConnection();
        using var command = db.Database.GetDbConnection().CreateCommand();
        command.CommandText = "PRAGMA user_version";

        if (Convert.ToInt32(command.ExecuteScalar(), CultureInfo.InvariantCulture) > 1)
        {
            throw new InvalidOperationException("Versión de base de datos no compatible.");
        }

        var known = db.Database.GetMigrations().ToHashSet(StringComparer.Ordinal);
        if (db.Database.GetAppliedMigrations().Any(migration => !known.Contains(migration)))
        {
            throw new InvalidOperationException("La base tiene migraciones desconocidas para esta versión de la API.");
        }
    }

    public static void AdoptIfNeeded(BitacoraDbContext db)
    {
        RequireKnownVersion(db);
        var history = db.GetService<IHistoryRepository>();
        if (history.Exists())
        {
            return;
        }

        var connection = (SqliteConnection)db.Database.GetDbConnection();
        using var transaction = connection.BeginTransaction(deferred: false);
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "PRAGMA user_version";
        var legacy = Convert.ToInt32(command.ExecuteScalar(), CultureInfo.InvariantCulture);

        if (legacy == 0)
        {
            return;
        }

        CheckColumns(command, "users", ["id:TEXT:0:1", "username:TEXT:1:0", "password_hash:TEXT:1:0"]);
        CheckColumns(command, "sessions", ["id:TEXT:0:1", "user_id:TEXT:1:0", "expires_utc:TEXT:1:0"]);
        CheckColumns(command, "trip_copies", ["owner_id:TEXT:1:1", "trip_id:TEXT:1:2", "name:TEXT:1:0", "backup_json:TEXT:1:0", "revision:INTEGER:1:0", "updated_utc:TEXT:1:0"]);
        CheckForeignKey(command, "sessions", "user_id", "CASCADE");
        CheckForeignKey(command, "trip_copies", "owner_id", "NO ACTION");

        command.CommandText = "SELECT COUNT(*) FROM pragma_index_list('users') AS indexes WHERE indexes.\"unique\" = 1 AND (SELECT group_concat(name) FROM pragma_index_info(indexes.name)) = 'username'";
        if (Convert.ToInt32(command.ExecuteScalar(), CultureInfo.InvariantCulture) == 0)
        {
            throw new InvalidOperationException("La unicidad de cuentas del esquema anterior no es compatible.");
        }

        command.CommandText = "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'trip_copies'";
        var definition = Convert.ToString(command.ExecuteScalar(), CultureInfo.InvariantCulture) ?? "";
        var normalized = string.Concat(definition.Where(character => !char.IsWhiteSpace(character))).ToLowerInvariant();
        if (!normalized.Contains("check(revision>0)", StringComparison.Ordinal))
        {
            throw new InvalidOperationException("El esquema anterior no protege las revisiones.");
        }

        command.CommandText = "CREATE UNIQUE INDEX IF NOT EXISTS IX_users_username ON users(username)";
        command.ExecuteNonQuery();

        // EF genera sus propias sentencias de historial. SQL específico queda aquí
        // y en migraciones de datos; las funciones de cuentas y viajes usan LINQ.
        command.CommandText = history.GetCreateScript();
        command.ExecuteNonQuery();
        command.CommandText = history.GetInsertScript(new HistoryRow(db.Database.GetMigrations().First(), "10.0.8"));
        command.ExecuteNonQuery();
        transaction.Commit();
    }

    private static void CheckColumns(SqliteCommand command, string table, string[] expected)
    {
        // Los nombres provienen únicamente de las constantes del baseline anterior.
        command.CommandText = $"PRAGMA table_info({table})";
        using var reader = command.ExecuteReader();
        var columns = new List<string>();

        while (reader.Read())
        {
            columns.Add(FormattableString.Invariant($"{reader.GetString(1)}:{reader.GetString(2)}:{reader.GetInt32(3)}:{reader.GetInt32(5)}"));
        }

        if (!columns.SequenceEqual(expected))
        {
            throw new InvalidOperationException("El esquema anterior no coincide con el baseline; se conserva sin adoptar.");
        }
    }

    private static void CheckForeignKey(SqliteCommand command, string table, string column, string delete)
    {
        command.CommandText = $"PRAGMA foreign_key_list({table})";
        using var reader = command.ExecuteReader();

        if (!reader.Read() || reader.GetString(2) != "users" || reader.GetString(3) != column
            || reader.GetString(4) != "id" || reader.GetString(6) != delete || reader.Read())
        {
            throw new InvalidOperationException("Los vínculos del esquema anterior no son compatibles.");
        }
    }
}
