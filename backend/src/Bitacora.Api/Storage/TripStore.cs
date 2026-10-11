using System.Text;
using Bitacora.Api.Persistence;
using Bitacora.Api.Persistence.Entities;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Bitacora.Api.Storage;

public sealed record StoredTrip(string Backup, long Revision, string UpdatedAt);
public sealed record TripSummary(string Id, string Name, long Revision, string UpdatedAt);
public sealed record StorageLimits(int MaxTripsPerUser, long MaxBackupBytesPerUser);
public sealed class StorageQuotaExceededException() : Exception("La cuenta alcanzó su cuota de copias.");

public sealed class TripStore(IDbContextFactory<BitacoraDbContext> factory, StorageLimits limits)
{
    public IReadOnlyList<TripSummary> List(string owner)
    {
        using var db = factory.CreateDbContext();

        return db.TripCopies.AsNoTracking()
            .Where(copy => copy.OwnerId == owner)
            .OrderByDescending(copy => copy.UpdatedUtc)
            .Select(copy => new TripSummary(copy.TripId, copy.Name, copy.Revision, copy.UpdatedUtc))
            .ToList();
    }

    public StoredTrip? Read(string owner, string id)
    {
        using var db = factory.CreateDbContext();

        return db.TripCopies.AsNoTracking()
            .Where(copy => copy.OwnerId == owner && copy.TripId == id)
            .Select(copy => new StoredTrip(copy.BackupJson, copy.Revision, copy.UpdatedUtc))
            .SingleOrDefault();
    }

    public TripSummary? Write(string owner, string id, string name, string backup, long? expected)
    {
        using var db = factory.CreateDbContext();
        db.Database.OpenConnection();

        // El bloqueo precede a revisión y cuota. EF participa en la misma transacción
        // para que dos peticiones no consuman simultáneamente la última plaza.
        using var transaction = ((SqliteConnection)db.Database.GetDbConnection()).BeginTransaction(deferred: false);
        db.Database.UseTransaction(transaction);

        var existing = db.TripCopies.SingleOrDefault(copy => copy.OwnerId == owner && copy.TripId == id);
        if (expected is null ? existing is not null : existing is null || existing.Revision != expected)
        {
            return null;
        }

        var others = db.TripCopies.Where(copy => copy.OwnerId == owner && copy.TripId != id);
        var bytes = Encoding.UTF8.GetByteCount(backup);
        var usedBytes = others.Sum(copy => (long?)copy.BackupBytes) ?? 0;

        if ((expected is null && others.Count() >= limits.MaxTripsPerUser)
            || bytes > limits.MaxBackupBytesPerUser - usedBytes)
        {
            throw new StorageQuotaExceededException();
        }

        var revision = expected is null ? 1 : checked(expected.Value + 1);
        var updated = DateTimeOffset.UtcNow.ToString("O");

        if (existing is null)
        {
            db.TripCopies.Add(new TripCopy
            {
                OwnerId = owner,
                TripId = id,
                Name = name,
                BackupJson = backup,
                BackupBytes = bytes,
                Revision = revision,
                UpdatedUtc = updated
            });
        }
        else
        {
            existing.Name = name;
            existing.BackupJson = backup;
            existing.BackupBytes = bytes;
            existing.Revision = revision;
            existing.UpdatedUtc = updated;
        }

        db.SaveChanges();
        transaction.Commit();

        return new TripSummary(id, name, revision, updated);
    }
}
