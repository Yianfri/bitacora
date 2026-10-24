FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS restore
WORKDIR /src
COPY src/Bitacora.Api/Bitacora.Api.csproj src/Bitacora.Api/
COPY src/Bitacora.Api/packages.lock.json src/Bitacora.Api/
RUN dotnet restore src/Bitacora.Api/Bitacora.Api.csproj --locked-mode

FROM restore AS publish
COPY src/Bitacora.Api/ src/Bitacora.Api/
RUN dotnet publish src/Bitacora.Api/Bitacora.Api.csproj --no-restore --configuration Release --output /out /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS runtime
WORKDIR /app
ENV ASPNETCORE_HTTP_PORTS=8080 \
    Storage__Directory=/data
EXPOSE 8080
RUN mkdir -p /data && chown app:app /data
COPY --from=publish --chown=app:app /out/ ./
USER app
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1
ENTRYPOINT ["dotnet", "Bitacora.Api.dll"]
