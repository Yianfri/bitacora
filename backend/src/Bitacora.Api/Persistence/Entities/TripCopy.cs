namespace Bitacora.Api.Persistence.Entities;

public sealed class TripCopy
{
    public required string OwnerId { get; init; }
    public required string TripId { get; init; }
    public required string Name { get; set; }
    public required string BackupJson { get; set; }
    public long BackupBytes { get; set; }
    public long Revision { get; set; }
    public required string UpdatedUtc { get; set; }
}
