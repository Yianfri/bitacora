using System.Security.Claims;
using Bitacora.Api.Storage;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;

namespace Bitacora.Api.Features;

public sealed record LoginRequest(string? Username, string? Password);

public static class AuthenticationEndpoints
{
  public static void MapAuthentication(this WebApplication app)
  {
    app.MapGet("/api/auth/csrf", (HttpContext context, IAntiforgery antiforgery) =>
    {
      var tokens = antiforgery.GetAndStoreTokens(context);
      return Results.Ok(new { token = tokens.RequestToken });
    });

    app.MapPost("/api/auth/login", async (LoginRequest request, HttpContext context, AccountStore accounts) =>
    {
      if (!AccountCommands.ValidUsername(request.Username) || request.Password is null || request.Password.Length is < 1 or > 256)
        return Results.Unauthorized();
      var account = accounts.Authenticate(request.Username!, request.Password);
      if (account is null) return Results.Unauthorized();
      var expires = DateTimeOffset.UtcNow.AddHours(8);
      if (context.User.Identity?.IsAuthenticated == true)
        accounts.EndSession(context.User.FindFirstValue("session")!);
      var session = accounts.StartSession(account.Id, expires);
      var claims = new[] { new Claim(ClaimTypes.NameIdentifier, account.Id), new Claim(ClaimTypes.Name, account.Username), new Claim("session", session) };
      var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme));
      await context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, principal,
              new AuthenticationProperties { ExpiresUtc = expires, IsPersistent = false, AllowRefresh = false });
      return Results.Ok(new { username = account.Username });
    }).RequireRateLimiting("login");

    app.MapGet("/api/auth/me", (ClaimsPrincipal user) => Results.Ok(new { username = user.Identity!.Name }))
        .RequireAuthorization();

    app.MapPost("/api/auth/logout", async (HttpContext context, AccountStore accounts) =>
    {
      accounts.EndSession(context.User.FindFirstValue("session")!);
      await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
      return Results.NoContent();
    }).RequireAuthorization();
  }
}
