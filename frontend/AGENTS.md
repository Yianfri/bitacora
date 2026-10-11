# Reglas de Angular

- Componentes standalone por función. Servicios/repositorios realizan persistencia;
  componentes reciben datos y emiten acciones. El componente raíz coordina la
  primera pantalla; extraer funciones cuando aumente su responsabilidad.
- Dominio puro: no depende de Angular, DOM ni IndexedDB. Mantener ese límite
  en diario/cálculos; adaptar infraestructura sin duplicar reglas.
- TypeScript y templates estrictos. Datos externos entran como `unknown` y
  se validan con Zod más integridad y vínculos. No usar `any` o conversiones
  para silenciar errores ni confiar en el tipo declarado de un JSON.
- ESLint usa información de tipos en archivos TypeScript y rechaza acceso inseguro,
  promesas sin manejar y callbacks async donde se espera void. JSON.parse entra
  como unknown; validar antes de usar propiedades. Pruebas locales privadas quedan
  fuera de las comprobaciones estándar y de Git.
- Signals para estado de pantalla; cálculos derivados con `computed`.
  No guardar el ordinal, bloque visible o kilometraje total como otra fuente de verdad.
- Nota literal mediante interpolación; nunca `innerHTML`. URL externa validada;
  enlaces a otra pestaña con `noopener noreferrer`.
- Reutilizar tokens y componentes antes de crear variantes. Controles nativos
  accesibles en esta entrega; evaluar Angular Material con un caso concreto.
  No introducir una biblioteca visual completa o CSS de sus partes privadas.
- Botones y campos con etiqueta, foco visible y área de toque ≥44 px.
  Una jornada abierta; bloques de hasta siete fechas calculadas desde el plan.
  Probar 320/390/736/1024 px, tema claro/oscuro y movimiento reducido.
- Distancia prevista desde segmentos, real desde jornadas reales. Nota adicional
  no completa etapa ni duplica kilometraje. Mantener `null` visible como desconocido.
- Borrador separado de nota guardada. Errores conservan el formulario.
  Una confirmación local nunca se llama “sincronizado”.
- Pruebas útiles para fechas, referencias, importación repetida, transacción,
  respaldo, concurrencia y lectura/escritura sin conexión.
- `npm run build` verifica aplicación/templates; `npm test` protege dominio y
  almacenamiento; `npm run test:e2e` verifica interacción/PWA; `npm run format:check`
  verifica estilo. Al cambiar dependencias, comprobar `npm ci` y actualizar lockfile.
- No sumar dependencias/mapas/API sin decisión documentada. Caché de aplicación
  no significa cartografía offline. Angular Service Worker se prueba en producción.
