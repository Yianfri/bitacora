# Routale

Aplicación Angular/PWA para planificar viajes y llevar un diario, adaptable a PC y Android.

La versión actual permite consultar un itinerario por bloques, abrir el detalle
de un día, crear y editar notas con kilómetros diarios, recuperar borradores y
exportar/restaurar una copia completa. Incluye una **demo ficticia** para probarla.
Mi copia conecta con una API privada para guardar y recuperar copias manualmente.
El [estado y siguientes entregas](docs/public/backlog.md) distingue código disponible,
funciones pendientes y comprobaciones que requieren dispositivos o servidor reales.

## Nombre y compatibilidad

Routale es el nuevo nombre de Bitácora. El repositorio está en
[Yianfri/routale](https://github.com/Yianfri/routale).
El cambio de marca conserva la base IndexedDB `cuaderno-austral-v1`, las claves
de borrador `cuaderno-austral:draft:` y el formato `cuaderno-austral-backup` v1.
Los archivos descargados ahora se llaman `routale-YYYY-MM-DD.json`; los respaldos
anteriores siguen siendo válidos independientemente de su nombre de archivo.

El backend conserva los nombres técnicos `Bitacora.Api`, `BitacoraDbContext`,
`bitacora.db`, cookies y aplicación de Data Protection, junto con las migraciones
existentes. Compose conserva el nombre de proyecto `bitacora` y las variables
`BITACORA_*` para reutilizar configuraciones y recursos previos. Las nuevas
imágenes de ejemplo apuntan a `ghcr.io/yianfri/routale`; no se publican ni se
despliegan al cambiar la marca. Cambiar el origen web sigue requiriendo trasladar
los datos mediante exportación/restauración, como explica [privacidad](docs/public/datos-y-privacidad.md).

## Datos personales

El repositorio, las imágenes Docker y la demo contienen código y datos ficticios.
El plan propio se importa desde un archivo JSON en el navegador. Ese archivo se lee
localmente: importar no envía su contenido. Solo **Guardar una copia en mi cuenta**
envía una copia a la API después de iniciar sesión y vincular el perfil. Plan y notas quedan en IndexedDB;
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

El cuaderno preparado funciona localmente aunque el servidor esté apagado. Para
guardar o recuperar copias de la cuenta, o abrir Routale por primera vez en otro
dispositivo, el servidor debe estar disponible. Mi copia permite volver a comprobar
el acceso sin recargar y descargar un respaldo local durante una caída. Reconectar
no envía cambios automáticamente; ver [responsabilidades](docs/public/arquitectura.md#responsabilidades-cuando-el-servidor-no-está-disponible).

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

**Frontend y backend conectados:** cuentas privadas, sesiones y copias completas
en SQLite. Mi copia permite guardar y recuperar con revisión, control de cambios
entre pestañas y conservación de la copia anterior. El perfil local queda vinculado
a una cuenta; otra cuenta requiere otro perfil de navegador. Cerrar sesión conserva
el cuaderno local. No hay sincronización automática.

## Ensayo local completo

Requiere el SDK .NET 10 de `global.json` y las dependencias npm instaladas.
`npm run local` desde `frontend/` compila la
web y prepara la API .NET en loopback. Abre `http://localhost:4200`; SQLite, claves
y acceso de prueba aleatorio se conservan en `.data/local-stack/`, excluido de Git.
El archivo `access.json` es privado y solo sirve para esa instalación de prueba.

Con Docker Desktop iniciado, desde la raíz:

```sh
docker compose -f deploy/compose.local.yaml up --build -d --wait
node frontend/tools/prepare-docker-local.mjs
node frontend/tools/check-stack.mjs --restart
```

Abre `http://localhost:8088`. El acceso de prueba está en
`.data/docker-local/access.json`; base y claves están en el volumen
`routale_local_private_data`. No reutilizar ese acceso en producción. Para detener
sin borrar datos: `docker compose -f deploy/compose.local.yaml stop`. No añadir `-v`.
La API no publica puertos. `/health` comprueba Nginx y `/api/health` la API/SQLite.
Para los recorridos reales de navegador: compilar el backend y ejecutar
`npm run test:integration` desde frontend, con Chromium o `E2E_CHANNEL=msedge`.

[Ejecutar y probar el backend](backend/README.md), [contrato](docs/public/api.md),
[despliegue](docs/public/despliegue.md) y [revisión de seguridad](docs/public/despliegue-seguro.md).

Reglas: [AGENTS.md](AGENTS.md), [frontend/AGENTS.md](frontend/AGENTS.md)
y [backend/AGENTS.md](backend/AGENTS.md).
Documentación: [arquitectura](docs/public/arquitectura.md),
[datos y privacidad](docs/public/datos-y-privacidad.md),
[despliegue](docs/public/despliegue.md), [backlog](docs/public/backlog.md).
[Convenciones de código y comentarios](docs/public/convenciones-codigo.md)
y [migraciones](docs/public/migraciones.md).
