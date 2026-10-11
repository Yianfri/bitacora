using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bitacora.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddBackupByteCount : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "backup_bytes",
                table: "trip_copies",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0L);

            // Contar bytes UTF-8 reales también para copias guardadas antes de EF.
            migrationBuilder.Sql("UPDATE trip_copies SET backup_bytes = length(CAST(backup_json AS BLOB))");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "backup_bytes",
                table: "trip_copies");
        }
    }
}
