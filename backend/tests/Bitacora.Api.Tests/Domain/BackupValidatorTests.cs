using System.Text.Json;
using System.Text.Json.Nodes;
using Bitacora.Api.Domain;
using Bitacora.Api.Features.Authentication;

namespace Bitacora.Api.Tests.Domain;

public sealed class BackupValidatorTests
{
    private static JsonObject Sample() => Assert.IsType<JsonObject>(JsonNode.Parse(
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "seed.json"))));

    [Fact]
    public void ValidBackupPreservesUnknownFieldsAndOriginalSourceText()
    {
        var backup = Sample();
        backup["futureField"] = new JsonObject { ["text"] = "ñ, café", ["unknown"] = null };
        var original = backup.ToJsonString();
        using var document = JsonDocument.Parse(original);
        var trip = document.RootElement.GetProperty("data").GetProperty("trip");

        Assert.Equal(trip.GetProperty("name").GetString(),
            BackupValidator.Validate(document.RootElement, trip.GetProperty("id").GetString()!));
        Assert.Equal(original, document.RootElement.GetRawText());
    }

    [Theory]
    [InlineData("date")]
    [InlineData("route")]
    [InlineData("hash")]
    [InlineData("money")]
    [InlineData("reference")]
    public void InvalidBackupIsRejectedAtTheDomainBoundary(string kind)
    {
        var backup = Sample();
        var data = backup["data"]!;
        var trip = data["trip"]!;
        var route = trip["id"]!.GetValue<string>();

        switch (kind)
        {
            case "date":
                trip["startDate"] = "2030-02-30";
                break;
            case "route":
                route = "another-trip";
                break;
            case "hash":
                data["sourceSnapshots"]![0]!["files"]![0]!["rawText"] += " ";
                break;
            case "money":
                data["plannedDays"]![0]!["budgetEstimateClp"]!["total"] = -1;
                break;
            case "reference":
                data["plannedDays"]![0]!["segments"]![0]!["stageId"] = "missing";
                break;
        }

        using var document = JsonDocument.Parse(backup.ToJsonString());
        Assert.Throws<InvalidBackupException>(() => BackupValidator.Validate(document.RootElement, route));
    }

    [Theory]
    [InlineData("traveler.one", true)]
    [InlineData("USER_2", true)]
    [InlineData("ab", false)]
    [InlineData("user name", false)]
    [InlineData("<script>", false)]
    [InlineData(null, false)]
    public void AccountNamesFollowTheAdministrativeContract(string? value, bool expected)
    {
        Assert.Equal(expected, AccountCommands.ValidUsername(value));
    }
}
