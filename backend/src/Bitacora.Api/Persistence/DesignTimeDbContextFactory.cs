using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Data.Sqlite;

namespace Bitacora.Api.Persistence;

// La generación de migraciones no abre ni modifica la base configurada de la aplicación.
public sealed class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<BitacoraDbContext>
{
    public BitacoraDbContext CreateDbContext(string[] args)
    {
        var directory = Environment.GetEnvironmentVariable("Storage__Directory")
            ?? Path.Combine(Directory.GetCurrentDirectory(), ".data");
        var connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = Path.Combine(Path.GetFullPath(directory), "bitacora.db"),
            ForeignKeys = true,
            DefaultTimeout = 5,
            Pooling = false
        }.ToString();

        var options = new DbContextOptionsBuilder<BitacoraDbContext>()
            .UseSqlite(connectionString)
            .Options;

        return new BitacoraDbContext(options);
    }
}
