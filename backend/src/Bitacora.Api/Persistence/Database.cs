using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Bitacora.Api.Persistence;

public sealed class Database
{
    public string DirectoryPath
    {
        get;
    }
    public string ConnectionString
    {
        get;
    }

    public Database(string directory)
    {
        DirectoryPath = Path.GetFullPath(directory);
        Directory.CreateDirectory(DirectoryPath);

        if (!OperatingSystem.IsWindows())
        {
            File.SetUnixFileMode(DirectoryPath, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        }

        ConnectionString = new SqliteConnectionStringBuilder
        {
            DataSource = Path.Combine(DirectoryPath, "bitacora.db"),
            ForeignKeys = true,
            DefaultTimeout = 5,
            Pooling = false
        }.ToString();
    }

    public void Migrate(IDbContextFactory<BitacoraDbContext> factory)
    {
        using var db = factory.CreateDbContext();
        LegacySchema.AdoptIfNeeded(db);
        db.Database.Migrate();
    }

    public void RequireCurrentSchema(IDbContextFactory<BitacoraDbContext> factory)
    {
        using var db = factory.CreateDbContext();
        LegacySchema.RequireKnownVersion(db);

        // Producción comprueba el esquema; el paso de despliegue aplica migraciones
        // previamente, con la API detenida y respaldo privado de la base.
        if (db.Database.GetPendingMigrations().Any())
        {
            throw new InvalidOperationException("Faltan migraciones. Ejecuta el comando migrate antes de iniciar la API.");
        }
    }
}
