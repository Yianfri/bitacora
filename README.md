# Bitácora

Aplicación Angular/PWA para planificar viajes y llevar un diario, adaptable a PC y Android.

Esta primera versión permite consultar un itinerario por bloques, abrir el detalle
de un día, crear y editar notas con kilómetros diarios, recuperar borradores y
exportar/restaurar una copia completa. Incluye una **demo ficticia** para probarla.

## Datos personales

El repositorio, las imágenes Docker y la demo contienen código y datos ficticios.
El plan propio se importa desde un archivo JSON en el navegador. Ese archivo se lee
localmente: no se sube a GitHub ni a una API. Plan y notas quedan en IndexedDB;
los borradores quedan en localStorage. Los dispositivos todavía no se sincronizan.
Las copias exportadas pueden incluir información sensible; conservarlas en privado.

Las fuentes, documentos personales y archivos privados de la instalación local se
excluyen de Git y del contexto Docker. No añadirlos ni incrustarlos en el frontend.
La revisión automática ayuda a detectar filtraciones conocidas y no reemplaza
la revisión del contenido de cada cambio.

## Ejecutar

Node 24.19.0 y npm. Desde `frontend/`:

```sh
npm ci
npm start
```

Abrir `http://localhost:4200`. Elegir **Revisar viaje de ejemplo** o **Traer un respaldo**.
Para probar la PWA compilada, detener desarrollo y ejecutar:

```sh
npm run build
npm run preview
```

Usar un único servidor en 4200. En Android la PWA necesita HTTPS fuera de localhost.
Instalación en teléfono físico y despliegue en servidor siguen pendientes.

## Estructura y comprobaciones

- `frontend/src/app/features/`: pantallas y componentes de viaje/diario.
- `frontend/src/app/core/domain/`: contratos, cálculos y validación.
- `frontend/src/app/core/storage/`: IndexedDB y transacciones.
- `backend/src/Bitacora.Api/Features/`: endpoints y DTO de Authentication y Trips.
- `backend/src/Bitacora.Api/Persistence/`: contexto/entidades EF y migraciones.
- `backend/tests/Bitacora.Api.Tests/`: unit tests .NET y migraciones SQLite.
- `deploy/`, `Dockerfile`, `.github/workflows/`: contenedor y comprobaciones CI.

Desde `frontend/`: `npm run format:check`, `npm run lint`, `npm run typecheck:tests`,
`npm test`, `npm run build` y `npm run test:e2e`. Instalar Chromium con
`npx playwright install chromium`; en Windows puede usarse Edge mediante
`E2E_CHANNEL=msedge`. `npm run check:publication` revisa Git y el contenido compilado.

**Backend implementado como servicio separado:** cuentas privadas, sesiones y
guardado/recuperación de copias completas en SQLite. [Ejecutar y probar el backend](backend/README.md)
y [contrato de endpoints](docs/public/api.md). Angular aún no está conectado a la
API; no hay sincronización automática. El contenedor actual sirve archivos
estáticos y su `/health` comprueba Nginx, mientras la API tiene su propia salud.

Reglas: [AGENTS.md](AGENTS.md), [frontend/AGENTS.md](frontend/AGENTS.md)
y [backend/AGENTS.md](backend/AGENTS.md).
Documentación: [arquitectura](docs/public/arquitectura.md),
[datos y privacidad](docs/public/datos-y-privacidad.md),
[despliegue](docs/public/despliegue.md), [backlog](docs/public/backlog.md).
[Convenciones de código y comentarios](docs/public/convenciones-codigo.md)
y [migraciones](docs/public/migraciones.md).
