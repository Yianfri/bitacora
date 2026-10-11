using Bitacora.Api.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bitacora.Api.Tests.Persistence;

internal sealed class DatabaseFixture : IDisposable
{
    private readonly DirectoryInfo directory = Directory.CreateTempSubdirectory("bitacora-ef-test-");
    public Database Database { get; }
    public IDbContextFactory<BitacoraDbContext> Factory { get; }

    static DatabaseFixture()
    {
        SQLitePCL.Batteries_V2.Init();
    }

    public DatabaseFixture()
    {
        Database = new Database(directory.FullName);
        Factory = new ContextFactory(new DbContextOptionsBuilder<BitacoraDbContext>()
            .UseSqlite(Database.ConnectionString).Options);
    }

    public void Dispose()
    {
        // Solo la carpeta creada por esta prueba; nunca una ruta configurada por el usuario.
        var allowed = Path.GetFullPath(Path.GetTempPath());
        if (!directory.FullName.StartsWith(Path.Combine(allowed, "bitacora-ef-test-"), StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Directorio temporal inesperado.");
        }

        directory.Delete(recursive: true);
    }

    private sealed class ContextFactory(DbContextOptions<BitacoraDbContext> options) : IDbContextFactory<BitacoraDbContext>
    {
        public BitacoraDbContext CreateDbContext() => new(options);
    }
}
