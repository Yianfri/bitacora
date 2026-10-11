using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Bitacora.Api.Domain;

public sealed class InvalidBackupException(string message) : Exception(message);

public static partial class BackupValidator
{
  private static readonly string[] Collections = ["plans", "stages", "plannedDays", "actualDays", "diaryEntries", "places"];
  private static readonly HashSet<string> DayKinds = ["arrival", "cycling", "ferry", "rest", "transfer", "buffer", "packing", "flight", "other"];
  [GeneratedRegex(@"^[A-Za-z0-9_.:-]{1,200}$")]
  private static partial Regex RouteId();
  [GeneratedRegex(@"^(?!.*\.\.)(?!/)[a-zA-Z0-9_/-]+\.json$")]
  private static partial Regex SourcePath();
  [GeneratedRegex(@"^[a-f0-9]{64}$")]
  private static partial Regex HashPattern();
  [GeneratedRegex(@"^([01]\d|2[0-3]):[0-5]\d$")]
  private static partial Regex HourPattern();
  [GeneratedRegex(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$")]
  private static partial Regex InstantPattern();

  public static string Validate(JsonElement backup, string routeId)
  {
    try { return ValidateCore(backup, routeId); }
    catch (Exception exception) when (exception is JsonException or InvalidOperationException or KeyNotFoundException or FormatException)
    { throw new InvalidBackupException("Forma o contenido JSON no compatible."); }
  }

  private static string ValidateCore(JsonElement backup, string routeId)
  {
    NoDuplicateProperties(backup);
    Ensure(Text(backup, "format") == "cuaderno-austral-backup" && Field(backup, "schemaVersion").GetInt32() == 1, "Formato o versión no compatible.");
    Instant(backup, "exportedAt");
    var data = Field(backup, "data");
    var trip = Field(data, "trip");
    var tripId = Id(trip, "id");
    Ensure(tripId == routeId && RouteId().IsMatch(tripId), "ID de viaje no compatible con la ruta.");
    var name = Text(trip, "name");
    Ensure(name.Length > 0, "Falta el nombre del viaje.");
    var start = Date(trip, "startDate");
    var end = Date(trip, "endDate");
    Ensure(start <= end, "Ventana de viaje inválida.");
    Ensure(Text(trip, "currency") == "CLP" && Text(trip, "locale") == "es-CL", "Moneda o idioma no compatible.");
    Instant(trip, "createdAt"); Instant(trip, "updatedAt");
    if (trip.TryGetProperty("returnStatus", out _)) Text(trip, "returnStatus");
    if (trip.TryGetProperty("isDemo", out var demo)) Ensure(demo.ValueKind is JsonValueKind.True or JsonValueKind.False, "Indicador de demo inválido.");
    var flights = Rows(trip, "fixedFlights");
    Unique(flights.Select(f => Id(f, "id")));
    foreach (var flight in flights)
    {
      Date(flight, "date"); Text(flight, "origin"); Text(flight, "destination"); Text(flight, "status");
      Ensure(HourPattern().IsMatch(Text(flight, "departure_local")) && HourPattern().IsMatch(Text(flight, "arrival_local")), "Horario de vuelo inválido.");
    }
    var sets = new Dictionary<string, HashSet<string>>();
    foreach (var collection in Collections)
    {
      var rows = Rows(data, collection);
      sets[collection] = Unique(rows.Select(r => Id(r, "id")));
      foreach (var row in rows)
      {
        Ensure(Id(row, "tripId") == tripId, "Un registro pertenece a otro viaje.");
        Instant(row, "createdAt"); Instant(row, "updatedAt");
      }
    }
    Ensure(sets["plans"].Contains(Id(trip, "activePlanId")), "El plan activo no existe.");
    var snapshots = Rows(data, "sourceSnapshots");
    var snapshotIds = Unique(snapshots.Select(s => Id(s, "id")));
    var sources = new Dictionary<(string Snapshot, string Path), HashSet<string>>();
    foreach (var snapshot in snapshots)
    {
      Instant(snapshot, "importedAt");
      var files = Rows(snapshot, "files");
      Unique(files.Select(f => Text(f, "path")));
      foreach (var file in files)
      {
        var path = Text(file, "path");
        var hash = Text(file, "sha256");
        var raw = Text(file, "rawText");
        Ensure(SourcePath().IsMatch(path) && HashPattern().IsMatch(hash), "Referencia de archivo inválida.");
        Ensure(Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(raw))) == hash, "Integridad de origen inválida.");
        using var document = JsonDocument.Parse(raw.TrimStart('\uFEFF'), new JsonDocumentOptions { MaxDepth = 64 });
        var root = document.RootElement;
        Ensure(root.ValueKind == JsonValueKind.Object && Field(root, "schema_version").GetInt32() == 1, "Versión de origen no compatible.");
        NoDuplicateProperties(root);
        var ids = new HashSet<string>();
        CollectSourceIds(root, ids);
        sources.Add((Id(snapshot, "id"), path), ids);
      }
    }
    foreach (var plan in Rows(data, "plans"))
    {
      Text(plan, "name");
      Ensure(Text(plan, "status") == "draft" && snapshotIds.Contains(Id(plan, "sourceSnapshotId")), "Plan u origen inválido.");
    }
    foreach (var stage in Rows(data, "stages")) { Text(stage, "name"); Reference(stage, sources); }
    var days = Rows(data, "plannedDays");
    Unique(days.Select(d => Id(d, "planId") + "/" + Date(d, "date").ToString("yyyy-MM-dd")));
    Unique(days.SelectMany(d => Rows(d, "segments")).Select(s => Id(s, "id")));
    foreach (var day in days)
    {
      Ensure(sets["plans"].Contains(Id(day, "planId")) && DayKinds.Contains(Text(day, "kind")), "Plan o tipo de jornada inválido.");
      Reference(day, sources);
      foreach (var segment in Rows(day, "segments"))
      {
        Ensure(sets["stages"].Contains(Id(segment, "stageId")), "Etapa inexistente.");
        Number(segment, "cyclingKmEstimate");
        if (segment.TryGetProperty("description", out _)) Text(segment, "description");
      }
      var logistics = Field(day, "logistics");
      foreach (var field in new[] { "lodgingCandidate", "lodgingStatusText", "transportNotes", "transportStatusText", "supplyNotes", "alternativeNotes", "difficultyText", "surfaceText" }) Text(logistics, field);
      var map = NullableText(logistics, "referenceMapUrl");
      if (map is not null)
        Ensure(Uri.TryCreate(map, UriKind.Absolute, out var url) && url.Scheme == "https" && url.Host == "www.google.com" && url.AbsolutePath.StartsWith("/maps/", StringComparison.Ordinal), "Referencia de mapa inválida.");
      var budget = Field(day, "budgetEstimateClp");
      foreach (var field in new[] { "lodging", "food", "transport", "other", "total" }) Number(budget, field, integer: true);
    }
    var actualDays = Rows(data, "actualDays");
    Unique(actualDays.Select(a => Date(a, "date").ToString("yyyy-MM-dd")));
    foreach (var actual in actualDays) { Number(actual, "cyclingKm"); Links(actual, "stageIds", sets["stages"]); }
    foreach (var note in Rows(data, "diaryEntries"))
    {
      var text = Text(note, "text");
      Ensure(!string.IsNullOrWhiteSpace(text) && text.Length <= 1200, "Nota vacía o demasiado larga.");
      Ensure(sets["actualDays"].Contains(Id(note, "actualDayId")), "Jornada real inexistente.");
      Links(note, "stageIds", sets["stages"]); Links(note, "placeIds", sets["places"]);
    }
    foreach (var place in Rows(data, "places"))
    {
      foreach (var field in new[] { "name", "category", "coordinates_status", "notes" }) Text(place, field);
      NullableText(place, "contact"); Reference(place, sources);
      var lat = Number(place, "latitude", minimum: -90, maximum: 90);
      var lon = Number(place, "longitude", minimum: -180, maximum: 180);
      Ensure((lat is null) == (lon is null), "Coordenadas incompletas.");
    }
    return name;
  }

  private static JsonElement Field(JsonElement row, string field)
  {
    Ensure(row.ValueKind == JsonValueKind.Object && row.TryGetProperty(field, out _), "Falta un campo obligatorio.");
    return row.GetProperty(field);
  }
  private static string Text(JsonElement row, string field)
  {
    var value = Field(row, field);
    Ensure(value.ValueKind == JsonValueKind.String, "Tipo de texto inválido.");
    return value.GetString()!;
  }
  private static string? NullableText(JsonElement row, string field) => Field(row, field).ValueKind == JsonValueKind.Null ? null : Text(row, field);
  private static string Id(JsonElement row, string field)
  {
    var value = Text(row, field);
    Ensure(value.Length is >= 1 and <= 200, "ID vacío o demasiado largo.");
    return value;
  }
  private static JsonElement[] Rows(JsonElement row, string field)
  {
    var value = Field(row, field);
    Ensure(value.ValueKind == JsonValueKind.Array, "Colección inválida.");
    return value.EnumerateArray().ToArray();
  }
  private static HashSet<string> Unique(IEnumerable<string> values)
  {
    var result = new HashSet<string>();
    foreach (var value in values) Ensure(result.Add(value), "Identificador o fecha repetida.");
    return result;
  }
  private static DateOnly Date(JsonElement row, string field)
  {
    Ensure(DateOnly.TryParseExact(Text(row, field), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) && date.Year >= 1900, "Fecha local inválida.");
    return date;
  }
  private static void Instant(JsonElement row, string field)
  {
    var value = Text(row, field);
    Ensure(value.Length <= 64 && InstantPattern().IsMatch(value) && DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out _), "Instante inválido.");
  }
  private static double? Number(JsonElement row, string field, bool integer = false, double minimum = 0, double maximum = double.MaxValue)
  {
    var value = Field(row, field);
    if (value.ValueKind == JsonValueKind.Null) return null;
    Ensure(value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out _), "Número inválido.");
    var number = value.GetDouble();
    Ensure(double.IsFinite(number) && number >= minimum && number <= maximum && (!integer || number <= 9007199254740991 && Math.Truncate(number) == number), "Número fuera de rango.");
    return number;
  }
  private static void Links(JsonElement row, string field, HashSet<string> targets)
  {
    var links = Rows(row, field).Select(v => { Ensure(v.ValueKind == JsonValueKind.String, "Vínculo inválido."); return v.GetString()!; });
    foreach (var link in Unique(links)) Ensure(targets.Contains(link), "Vínculo inexistente.");
  }
  private static void Reference(JsonElement row, Dictionary<(string, string), HashSet<string>> sources)
  {
    var reference = Field(row, "sourceRef");
    if (reference.ValueKind == JsonValueKind.Null) return;
    var snapshot = Id(reference, "snapshotId");
    var path = Text(reference, "path");
    var sourceId = Id(reference, "sourceId");
    Ensure(sources.TryGetValue((snapshot, path), out var ids) && ids.Contains(sourceId), "Procedencia inexistente.");
  }
  private static void CollectSourceIds(JsonElement element, HashSet<string> ids)
  {
    if (element.ValueKind == JsonValueKind.Object)
    {
      if (element.TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String) ids.Add(id.GetString()!);
      foreach (var property in element.EnumerateObject()) CollectSourceIds(property.Value, ids);
    }
    else if (element.ValueKind == JsonValueKind.Array)
      foreach (var item in element.EnumerateArray()) CollectSourceIds(item, ids);
  }
  private static void NoDuplicateProperties(JsonElement element)
  {
    if (element.ValueKind == JsonValueKind.Object)
    {
      var keys = new HashSet<string>();
      foreach (var property in element.EnumerateObject())
      {
        Ensure(keys.Add(property.Name), "Propiedad JSON repetida.");
        NoDuplicateProperties(property.Value);
      }
    }
    else if (element.ValueKind == JsonValueKind.Array)
      foreach (var item in element.EnumerateArray()) NoDuplicateProperties(item);
  }
  private static void Ensure(bool condition, string message)
  { if (!condition) throw new InvalidBackupException(message); }
}
