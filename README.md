# GestorIA — ERP con Inteligencia Artificial

> Mientras otros ERP solo registran información, **GestorIA** usa IA para transformar tus productos en contenido listo para vender en internet.

Módulos: **Ventas · Compras · Stock · Clientes · Facturación · Tienda online sincronizada**
IA integrada: descripciones de productos, publicaciones para redes y consultas rápidas del negocio.

## Stack

- **Next.js 15** (App Router, Server Actions, Turbopack) + **React 19** + **TypeScript**
- **Tailwind CSS v4** + **lucide-react** (iconografía)
- **Drizzle ORM + SQLite** (libsql, base local embebida — sin servidor de base de datos)
- **DeepSeek** (API HTTP, sin SDK) para las funciones de IA

## Puesta en marcha

### Demo local completa

Con Node.js 22 y pnpm 10 instalados, creá `.env.local` en la raíz:

```dotenv
TURSO_DATABASE_URL=file:gestoria-local.db
AUTH_USER=admin
AUTH_PASSWORD=admin
AUTH_SECRET=reemplazar-por-un-secreto-aleatorio-largo
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

Luego ejecutá:

```bash
pnpm install --frozen-lockfile
pnpm dev:setup
pnpm dev
```

`dev:setup` crea las tablas y carga una demo en `gestoria-local.db`: dos sucursales,
catálogo con ofertas y stock, clientes, ventas, facturas, compras en distintos estados,
pedidos online, gastos, traslados, leads de WhatsApp y una conversación de IA. Se puede
repetir sin duplicar la demo. Si la base ya tiene productos, conserva todos los datos.

En **Stock**, el administrador puede elegir una sucursal o ver el total. La columna
**Tránsito — sucursal** muestra mercadería enviada que aún no se puede vender.
**Stock → Mover stock** permite crear un traslado con número, origen, destino y
cantidades. El envío descuenta del origen y suma al tránsito del destino. En
**Verificar llegada** se cargan las cantidades reales de cada artículo, incluso
si faltan o sobran unidades. La sucursal puede aceptar y acreditar esas
cantidades, o rechazar el traslado con una nota; en ese caso queda en tránsito
hasta confirmar la devolución al origen. La demo nueva trae un traslado pendiente
para probar la recepción. `pnpm test:transfers` prueba estos estados sin tocar
la base local.
La pestaña **Tránsito** de Stock muestra cada envío pendiente con producto,
cantidad, número de traslado, origen, estado y destino; también permite filtrar
por la sucursal que lo recibirá.

- Tienda pública: http://localhost:3000/tienda
- Panel: http://localhost:3000/admin (usuario y contraseña de `.env.local`)
- La base local y `.env.local` están excluidos de Git.

El servidor de desarrollo escucha solo en `127.0.0.1`, ya que la demo usa
credenciales simples. Para habilitar el control local antes de cada push en
un clon nuevo, ejecutá `git config core.hooksPath .githooks`. El hook revisa
los objetos que se van a enviar en busca de secretos y archivos sensibles,
consulta `pnpm audit` y comprueba los tipos. También podés revisar el árbol
actual con `pnpm security:check`. La auditoría requiere conexión a npm y
bloquea el push si no puede completarse.

Para empezar con una demo nueva, detené el servidor, respaldá o renombrá
`gestoria-local.db` y ejecutá `pnpm dev:setup` de nuevo.

Las funciones de IA y lectura de imágenes necesitan `DEEPSEEK_API_KEY` y, para imágenes,
`GEMINI_API_KEY`. El pago real o sandbox de Mercado Pago necesita un
`MP_ACCESS_TOKEN` propio y una URL pública para recibir webhooks. El CRM de WhatsApp
permite recorrer leads y presupuestos de prueba; enviar y recibir mensajes requiere
vincular una cuenta desde el panel. No se incluyen credenciales de terceros en la demo.

### Configuración básica anterior

```bash
pnpm install
cp .env.example .env        # agregá tu DEEPSEEK_API_KEY y credenciales de login
pnpm db:push                # crea las tablas
pnpm db:seed                # carga datos de ejemplo
pnpm dev                    # http://localhost:3000
```

> La app funciona sin clave de API: solo las funciones de IA requieren `DEEPSEEK_API_KEY`.
> Las fotos de remitos y la carga masiva usan **Gemini → DeepSeek**.
> Google extrae el texto y DeepSeek lo convierte en productos, cantidades y precios.
> Configurá `GEMINI_API_KEY` y `DEEPSEEK_API_KEY` en `.env.local` (desarrollo)
> o en el entorno del servidor. Creá la clave en Google AI Studio
> y reiniciá la app después de configurar las variables. El nivel gratuito tiene cuotas limitadas.
> No requiere n8n. El stock se carga recién al revisar y confirmar los productos.
> Sin Gemini podés pegar el detalle y analizarlo con DeepSeek.

## Login

Acceso protegido por sesión (cookie firmada con HMAC + middleware). En desarrollo las
credenciales por defecto son **admin / admin**. En **producción** la app exige definir
`AUTH_USER`, `AUTH_PASSWORD` y `AUTH_SECRET` en el entorno: si faltan, el login se
bloquea con un aviso (las credenciales por defecto nunca funcionan en producción).

## Despliegue en producción

```bash
pnpm build
pnpm start    # requiere AUTH_USER, AUTH_PASSWORD y AUTH_SECRET en el entorno
```

Variables de entorno (ver `.env.example`):

| Variable            | Uso                                            |
| ------------------- | ---------------------------------------------- |
| `DEEPSEEK_API_KEY`  | Funciones de IA (descripciones, redes, consultas) |
| `DEEPSEEK_MODEL`    | Modelo: `deepseek-v4-flash` (por defecto) o `deepseek-v4-pro` |
| `GEMINI_API_KEY` | Gemini para fotos de remitos y carga masiva |
| `AUTH_USER`         | Usuario del panel                              |
| `AUTH_PASSWORD`     | Contraseña del panel (obligatoria en producción) |
| `AUTH_SECRET`       | Firma de la cookie de sesión (obligatoria en producción) |

## Marca

La interfaz respeta la identidad de **Consultoría Digital**: paleta navy `#0c1015` + lima
`#c5ed1b`, tipografías Poppins (títulos) e Inter (cuerpo) y el logo oficial
(`public/brand/logo-cd.webp`).

## Scripts

| Comando         | Acción                                       |
| --------------- | -------------------------------------------- |
| `pnpm dev`      | Servidor de desarrollo (Turbopack)           |
| `pnpm build`    | Build de producción                          |
| `pnpm start`    | Servidor de producción                       |
| `pnpm db:push`  | Crea las tablas en la base SQLite            |
| `pnpm db:seed`  | Carga datos de ejemplo                       |
| `pnpm db:setup` | Tablas + datos de ejemplo en un solo paso    |


## Carga de stock y diferencias de precios

Entrar a **Compras → Carga de stock** (`/admin/compras/carga`), elegir proveedor y sucursal,
subir el comprobante y revisar el borrador. Se pueden corregir código, nombre, cantidad y costo,
vincular productos existentes o confirmar productos nuevos. La confirmación muestra stock del
local antes/después y permite revalorizar individualmente. La carga de stock, los precios y el
historial se guardan en una sola transacción; una carga aplicada no puede volver a sumarse.

- Fotos JPG/PNG/WEBP/GIF: usan Gemini (`GEMINI_API_KEY`) y DeepSeek (`DEEPSEEK_API_KEY`).
- Excel XLSX y CSV/TSV: lectura directa, sin IA ni n8n. Primera hoja con datos, encabezados
  `Nombre,Código,Cantidad,Costo unitario`; cantidades enteras positivas y costo por unidad.
  Códigos con ceros iniciales deben estar guardados como texto en Excel.
- Word DOCX y TXT: extracción de texto y análisis con la IA de texto existente (`DEEPSEEK_API_KEY`).
  Hasta 12.000 caracteres para evitar recortes silenciosos.
- Hasta 8 MB y 500 productos por archivo. Convertir los formatos antiguos XLS/DOC a XLSX/DOCX.
  Cada archivo agrega renglones; unificar líneas del mismo producto antes de confirmar.

**Diferencias de precios** (`/admin/compras/diferencias-precios`) registra subas y bajas contra el
último costo positivo recibido; si no hay compras anteriores, usa el costo del catálogo.
Venta sugerida = venta actual × costo nuevo / costo anterior (dos decimales), conservando el
margen porcentual. Sin costo o venta anterior no se propone revalorización. El historial conserva
los nombres y códigos aunque se elimine la compra o el producto. No registra ediciones manuales
del catálogo ni se reconstruye retroactivamente.

Ejecutar `pnpm db:push` para crear la tabla de diferencias antes de usar la nueva sección.
Las importaciones de documentos no guardan el archivo original: conservan los renglones extraídos
y una entrada de auditoría con el nombre del archivo. Las fotos adjuntas desde Compras mantienen
el almacenamiento existente. Para un flujo de varios proveedores o OCR externo, se puede añadir
n8n más adelante sin cambiar la revisión y confirmación.

Si Gemini falla por conexión o devuelve 500/502/503/504, la imagen se transcribe con DeepSeek (`deepseek-flash`) como respaldo. Esta lectura consume saldo de DeepSeek. Opcional: `DEEPSEEK_VISION_MODEL` para cambiar el modelo de respaldo.
