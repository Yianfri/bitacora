using System.Net;
using System.Security.Claims;
using System.Threading.RateLimiting;
using Bitacora.Api.Features.Authentication;
using Bitacora.Api.Features.Trips;
using Bitacora.Api.Persistence;
using Bitacora.Api.Storage;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

SQLitePCL.Batteries_V2.Init();
var adminCommand = args is ["create-user"] or ["migrate"];
var builder = WebApplication.CreateBuilder(adminCommand ? [] : args);
builder.Logging.AddFilter("Microsoft.AspNetCore", LogLevel.Warning);
builder.Logging.AddFilter("Microsoft.EntityFrameworkCore", LogLevel.Warning);
var knownProxies = ParseKnownProxies(builder.Configuration["ReverseProxy:KnownProxies"]);
builder.Services.AddProblemDetails();
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 5 * 1024 * 1024);
builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.MaxDepth = 64);
var maxTrips = builder.Configuration.GetValue("Storage:MaxTripsPerUser", 100);
var maxBackupBytes = builder.Configuration.GetValue("Storage:MaxBackupBytesPerUser", 100L * 1024 * 1024);
if (maxTrips <= 0 || maxBackupBytes <= 0)
{
    throw new InvalidOperationException("Las cuotas de almacenamiento deben ser positivas.");
}

builder.Services.AddSingleton(new StorageLimits(maxTrips, maxBackupBytes));
var database = new Database(builder.Configuration["Storage:Directory"] ?? Path.Combine(builder.Environment.ContentRootPath, ".data"));
builder.Services.AddSingleton(database);
builder.Services.AddDbContextFactory<BitacoraDbContext>(options => options.UseSqlite(database.ConnectionString));
builder.Services.AddSingleton<IPasswordHasher<Account>, PasswordHasher<Account>>();
builder.Services.AddSingleton<AccountStore>();
builder.Services.AddSingleton<TripStore>();
builder.Services.AddDataProtection().SetApplicationName("Bitacora.Api")
    .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(database.DirectoryPath, "keys")));
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(options =>
{
    options.Cookie.Name = ".Bitacora.Session";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
    options.ExpireTimeSpan = TimeSpan.FromHours(8);
    options.SlidingExpiration = false;
    options.Events.OnRedirectToLogin = context =>
    {
        context.Response.StatusCode = 401;
        return Task.CompletedTask;
    };
    options.Events.OnRedirectToAccessDenied = context =>
    {
        context.Response.StatusCode = 403;
        return Task.CompletedTask;
    };
    options.Events.OnValidatePrincipal = async context =>
    {
        // Una cookie válida criptográficamente deja de autorizar al revocar su sesión.
        var user = context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
        var session = context.Principal?.FindFirstValue("session");
        if (user is null || session is null || !context.HttpContext.RequestServices.GetRequiredService<AccountStore>().ValidSession(session, user))
        {
            context.RejectPrincipal();
            await context.HttpContext.SignOutAsync();
        }
    };
});
builder.Services.AddAuthorization();
builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";
    options.Cookie.Name = ".Bitacora.Csrf";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
});
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = 429;
    options.AddPolicy("login", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 10,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        }));
});
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    // Sin un proxy declarado se ignoran por completo las cabeceras reenviadas.
    options.ForwardedHeaders = knownProxies.Count == 0
        ? ForwardedHeaders.None
        : ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = 1;
    options.KnownProxies.Clear();
    options.KnownIPNetworks.Clear();
    foreach (var address in knownProxies)
    {
        options.KnownProxies.Add(address);
    }
});
var app = builder.Build();
var transportRemoteAddressKey = new object();
app.Use(async (context, next) =>
{
    // El límite Development comprueba el peer TCP, no una IP reescrita por X-Forwarded-For.
    context.Items[transportRemoteAddressKey] = context.Connection.RemoteIpAddress;
    await next();
});
app.UseForwardedHeaders();
var contexts = app.Services.GetRequiredService<IDbContextFactory<BitacoraDbContext>>();
if (args is ["migrate"] || app.Environment.IsDevelopment())
{
    database.Migrate(contexts);
}
else
{
    database.RequireCurrentSchema(contexts);
}

if (args is ["migrate"])
{
    Console.WriteLine("Migraciones aplicadas. La base y las claves permanecen privadas.");
    return;
}

if (adminCommand)
{
    Environment.ExitCode = AccountCommands.CreateUser(app.Services.GetRequiredService<AccountStore>());
    return;
}
app.UseExceptionHandler();
app.Use(async (context, next) =>
{
    var transportAddress = context.Items[transportRemoteAddressKey] as IPAddress;
    if (app.Environment.IsDevelopment() && transportAddress is { } address
        && !IsLoopback(address) && !knownProxies.Contains(NormalizeAddress(address)))
    {
        context.Response.StatusCode = 403;
        return;
    }
    if (context.Request.Path.StartsWithSegments("/api"))
    {
        context.Response.Headers.CacheControl = "no-store";
        context.Response.Headers.XContentTypeOptions = "nosniff";
        if (!app.Environment.IsDevelopment() && !context.Request.IsHttps)
        {
            context.Response.StatusCode = 400;
            return;
        }
    }
    if (context.Request.ContentLength > 5 * 1024 * 1024)
    {
        context.Response.StatusCode = 413;
        return;
    }
    try
    {
        await next(context);
    }
    catch (BadHttpRequestException exception) when (exception.StatusCode is 400 or 413)
    {
        await Results.Problem(statusCode: exception.StatusCode, title: "Cuerpo de solicitud inválido o demasiado grande.").ExecuteAsync(context);
    }
    catch (Exception exception) when (exception is SqliteException { SqliteErrorCode: 5 or 6 }
        or DbUpdateException { InnerException: SqliteException { SqliteErrorCode: 5 or 6 } })
    {
        context.Response.Headers.RetryAfter = "1";
        await Results.Problem(statusCode: 503, title: "Almacenamiento ocupado; vuelve a intentar.").ExecuteAsync(context);
    }
});
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api") && !HttpMethods.IsGet(context.Request.Method)
        && !HttpMethods.IsHead(context.Request.Method) && !HttpMethods.IsOptions(context.Request.Method))
    {
        try
        {
            await context.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(context);
        }
        catch (AntiforgeryValidationException)
        {
            await Results.Problem(statusCode: 403, title: "Token CSRF inválido.").ExecuteAsync(context);
            return;
        }
    }
    await next(context);
});
app.MapAuthentication();
app.MapTrips();
app.MapGet("/health", (IDbContextFactory<BitacoraDbContext> factory) =>
{
    try
    {
        using var db = factory.CreateDbContext();
        if (!db.Database.CanConnect())
        {
            return Results.StatusCode(503);
        }
        return Results.Ok(new
        {
            status = "ok"
        });
    }
    catch (SqliteException)
    {
        return Results.StatusCode(503);
    }
});
app.Run();

static IReadOnlySet<IPAddress> ParseKnownProxies(string? configuredAddresses)
{
    var addresses = new HashSet<IPAddress>();
    foreach (var value in (configuredAddresses ?? string.Empty).Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
    {
        if (!IPAddress.TryParse(value, out var address))
        {
            throw new InvalidOperationException("ReverseProxy:KnownProxies debe contener direcciones IP válidas separadas por comas.");
        }

        addresses.Add(NormalizeAddress(address));
    }

    return addresses;
}

static IPAddress NormalizeAddress(IPAddress address) => address.IsIPv4MappedToIPv6 ? address.MapToIPv4() : address;

static bool IsLoopback(IPAddress address) => IPAddress.IsLoopback(address)
    || (address.IsIPv4MappedToIPv6 && IPAddress.IsLoopback(address.MapToIPv4()));
