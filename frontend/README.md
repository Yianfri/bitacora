# Routale

Aplicación Angular/PWA para consultar el viaje y registrar notas con guardado local.

El [README del proyecto](../README.md) reúne instrucciones para ejecutar,
comprobar y desplegar. Las [reglas de frontend](AGENTS.md) describen convenciones
de componentes, datos, accesibilidad y pruebas.

Desde esta carpeta: `npm ci` y `npm start`. Para comprobar el uso sin conexión:
`npm run build` y `npm run preview`, con un solo servidor en el puerto 4200.

`npm start` y `npm run preview` por sí solos sirven la interfaz; para probar
sesión y copias junto con la API local, usar `npm run local` con el SDK .NET 10
disponible. La indisponibilidad de las copias remotas no impide usar el diario local.
El [backlog](../docs/public/backlog.md) distingue funciones entregadas de editor,
sincronización automática y ensayos físicos pendientes.
