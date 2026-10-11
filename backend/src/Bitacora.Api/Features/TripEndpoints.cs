using System.Security.Claims;
using System.Text.Json;
using Bitacora.Api.Domain;
using Bitacora.Api.Storage;

namespace Bitacora.Api.Features;

public static class TripEndpoints
{
  public static void MapTrips(this WebApplication app)
  {
    var trips = app.MapGroup("/api/trips").RequireAuthorization();
    trips.MapGet("/", (ClaimsPrincipal user, TripStore store) => Results.Ok(store.List(Owner(user))));
    trips.MapGet("/{id}", (string id, ClaimsPrincipal user, TripStore store, HttpResponse response) =>
    {
      var trip = store.Read(Owner(user), id);
      if (trip is null) return Results.NotFound();
      response.Headers.ETag = Quote(trip.Revision);
      return Results.Text(trip.Backup, "application/json");
    });
    trips.MapPut("/{id}", (string id, JsonElement backup, HttpContext context, TripStore store) =>
    {
      var create = context.Request.Headers.IfNoneMatch.ToString();
      var update = context.Request.Headers.IfMatch.ToString();
      if (create.Length == 0 && update.Length == 0)
        return Results.Problem(statusCode: 428, title: "Falta una condición de revisión.");
      long? expected = null;
      if (create.Length > 0 && (create != "*" || update.Length > 0))
        return Results.Problem(statusCode: 400, title: "Condiciones de revisión inválidas.");
      if (update.Length > 0)
      {
        if (update.Length < 3 || update[0] != '"' || update[^1] != '"'
                || !long.TryParse(update[1..^1], out var revision) || revision < 1 || revision == long.MaxValue)
          return Results.Problem(statusCode: 400, title: "ETag inválido.");
        expected = revision;
      }
      string name;
      try { name = BackupValidator.Validate(backup, id); }
      catch (InvalidBackupException exception)
      { return Results.Problem(statusCode: 400, title: "Respaldo inválido.", detail: exception.Message); }
      TripMetadata? saved;
      try { saved = store.Write(Owner(context.User), id, name, backup.GetRawText(), expected); }
      catch (StorageQuotaExceededException)
      { return Results.Problem(statusCode: 409, title: "Cuota de copias agotada.", extensions: new Dictionary<string, object?> { ["code"] = "storage_quota_exceeded" }); }
      if (saved is null) return Results.Problem(statusCode: 412, title: "La copia cambió. Recupera su revisión antes de guardar.");
      context.Response.Headers.ETag = Quote(saved.Revision);
      return Results.Json(saved, statusCode: expected is null ? 201 : 200);
    });
  }

  private static string Owner(ClaimsPrincipal user) => user.FindFirstValue(ClaimTypes.NameIdentifier)!;
  private static string Quote(long revision) => $"\"{revision}\"";
}
