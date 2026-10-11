using System.Text;
using System.Text.RegularExpressions;
using Bitacora.Api.Storage;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Bitacora.Api.Features.Authentication;

public static partial class AccountCommands
{
    [GeneratedRegex(@"^[A-Za-z0-9_.-]{3,64}$")]
    private static partial Regex UsernamePattern();
    public static bool ValidUsername(string? name) => name is not null && UsernamePattern().IsMatch(name);

    public static int CreateUser(AccountStore accounts)
    {
        Console.Write("Nombre de usuario (3–64 caracteres): ");
        var username = Console.ReadLine();
        Console.Write("Contraseña (12–256 caracteres): ");
        var password = ReadPassword();
        Console.Write("Repetir contraseña: ");
        var confirmation = ReadPassword();
        if (!ValidUsername(username) || password.Length is < 12 or > 256 || password != confirmation)
        {
            Console.Error.WriteLine("Datos inválidos o contraseñas diferentes.");
            return 1;
        }
        try
        {
            accounts.Create(username!, password);
        }
        catch (DbUpdateException exception) when (exception.InnerException is SqliteException { SqliteErrorCode: 19 })
        {
            Console.Error.WriteLine("El nombre de usuario ya existe.");
            return 1;
        }
        Console.WriteLine("Cuenta creada. No existe registro público.");
        return 0;
    }

    private static string ReadPassword()
    {
        if (Console.IsInputRedirected)
        {
            return Console.ReadLine() ?? "";
        }

        var value = new StringBuilder();
        while (true)
        {
            var key = Console.ReadKey(intercept: true);
            if (key.Key == ConsoleKey.Enter)
            {
                Console.WriteLine();
                return value.ToString();
            }
            if (key.Key == ConsoleKey.Backspace && value.Length > 0)
            {
                value.Length--;
            }
            else if (!char.IsControl(key.KeyChar) && value.Length < 257)
            {
                value.Append(key.KeyChar);
            }
        }
    }
}
