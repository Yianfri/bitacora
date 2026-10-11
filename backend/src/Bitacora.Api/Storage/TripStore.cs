namespace Bitacora.Api.Storage;

public sealed record TripMetadata(string Id, string Name, long Revision, string UpdatedAt);
public sealed record StoredTrip(string Backup, long Revision, string UpdatedAt);

public sealed class TripStore(Database database)
{
  public IReadOnlyList<TripMetadata> List(string owner)
  {
    using var connection = database.Open();
    using var command = Database.Command(connection,
        "SELECT trip_id, name, revision, updated_utc FROM trip_copies WHERE owner_id = $owner ORDER BY updated_utc DESC",
        ("$owner", owner));
    using var reader = command.ExecuteReader();
    var rows = new List<TripMetadata>();
    while (reader.Read()) rows.Add(new(reader.GetString(0), reader.GetString(1), reader.GetInt64(2), reader.GetString(3)));
    return rows;
  }

  public StoredTrip? Read(string owner, string id)
  {
    using var connection = database.Open();
    using var command = Database.Command(connection,
        "SELECT backup_json, revision, updated_utc FROM trip_copies WHERE owner_id = $owner AND trip_id = $id",
        ("$owner", owner), ("$id", id));
    using var reader = command.ExecuteReader();
    return reader.Read() ? new(reader.GetString(0), reader.GetInt64(1), reader.GetString(2)) : null;
  }

  // A non-deferred transaction acquires the write lock before comparing the revision.
  public TripMetadata? Write(string owner, string id, string name, string backup, long? expected)
  {
    using var connection = database.Open();
    using var transaction = connection.BeginTransaction(deferred: false);
    using var read = Database.Command(connection,
        "SELECT revision FROM trip_copies WHERE owner_id = $owner AND trip_id = $id",
        ("$owner", owner), ("$id", id));
    read.Transaction = transaction;
    var existing = read.ExecuteScalar();
    if (expected is null ? existing is not null : existing is null || Convert.ToInt64(existing) != expected)
      return null;
    var revision = expected is null ? 1 : checked(expected.Value + 1);
    var updated = DateTimeOffset.UtcNow.ToString("O");
    var sql = expected is null
        ? "INSERT INTO trip_copies(owner_id, trip_id, name, backup_json, revision, updated_utc) VALUES($owner, $id, $name, $backup, $revision, $updated)"
        : "UPDATE trip_copies SET name=$name, backup_json=$backup, revision=$revision, updated_utc=$updated WHERE owner_id=$owner AND trip_id=$id";
    using var write = Database.Command(connection, sql, ("$owner", owner), ("$id", id),
        ("$name", name), ("$backup", backup), ("$revision", revision), ("$updated", updated));
    write.Transaction = transaction;
    write.ExecuteNonQuery();
    transaction.Commit();
    return new(id, name, revision, updated);
  }
}
