using Bitacora.Api.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace Bitacora.Api.Persistence;

public sealed class BitacoraDbContext(DbContextOptions<BitacoraDbContext> options) : DbContext(options)
{
    public DbSet<UserAccount> Users => Set<UserAccount>();
    public DbSet<UserSession> Sessions => Set<UserSession>();
    public DbSet<TripCopy> TripCopies => Set<TripCopy>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var users = modelBuilder.Entity<UserAccount>();
        users.ToTable("users");
        users.HasKey(user => user.Id);
        users.Property(user => user.Id).HasColumnName("id");
        users.Property(user => user.Username).HasColumnName("username");
        users.Property(user => user.PasswordHash).HasColumnName("password_hash");
        users.HasIndex(user => user.Username).IsUnique();

        var sessions = modelBuilder.Entity<UserSession>();
        sessions.ToTable("sessions");
        sessions.HasKey(session => session.Id);
        sessions.Property(session => session.Id).HasColumnName("id");
        sessions.Property(session => session.UserId).HasColumnName("user_id");
        sessions.Property(session => session.ExpiresUtc).HasColumnName("expires_utc");
        sessions.HasIndex(session => session.UserId).HasDatabaseName("sessions_user");
        sessions.HasOne<UserAccount>().WithMany().HasForeignKey(session => session.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        var trips = modelBuilder.Entity<TripCopy>();
        trips.ToTable("trip_copies", table => table.HasCheckConstraint("CK_trip_revision", "revision > 0"));
        trips.HasKey(trip => new { trip.OwnerId, trip.TripId });
        trips.Property(trip => trip.OwnerId).HasColumnName("owner_id");
        trips.Property(trip => trip.TripId).HasColumnName("trip_id");
        trips.Property(trip => trip.Name).HasColumnName("name");
        trips.Property(trip => trip.BackupJson).HasColumnName("backup_json");
        trips.Property(trip => trip.BackupBytes).HasColumnName("backup_bytes");
        trips.Property(trip => trip.Revision).HasColumnName("revision");
        trips.Property(trip => trip.UpdatedUtc).HasColumnName("updated_utc");
        trips.HasOne<UserAccount>().WithMany().HasForeignKey(trip => trip.OwnerId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
