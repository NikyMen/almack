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

Las funciones de IA y lectura de imágenes necesitan `DEEPSEEK_API_KEY` y, si corresponde,
las variables `VISION_*`. El pago real o sandbox de Mercado Pago necesita un
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
> Para leer la **foto del remito** en Compras hace falta un modelo con visión. Por defecto se usa el
> mismo de DeepSeek; si ese modelo no acepta imágenes, se configuran `VISION_API_KEY`, `VISION_BASE_URL`
> y `VISION_MODEL` con cualquier proveedor compatible con OpenAI (ver `.env.example`). Sin eso, Compras
> igual carga el stock: se pega el detalle y se usa "Analizar detalle", que corre con DeepSeek texto.

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
| `VISION_API_KEY`    | Opcional: leer fotos de remitos si el modelo de DeepSeek no tiene visión |
| `VISION_BASE_URL`   | Opcional: base URL del proveedor de visión (formato OpenAI) |
| `VISION_MODEL`      | Opcional: modelo de visión a usar |
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
