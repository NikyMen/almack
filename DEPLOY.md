# Deploy de Almack en el VPS (PM2)

Almack es una app Next.js 15 con WhatsApp (Baileys) embebido en el mismo proceso y base de
datos libsql en archivo local. Por eso: **un solo proceso, fork, y tres rutas que
deben persistir**:

| Ruta | Qué guarda |
|---|---|
| `gestoria.db` | La base entera |
| `.wa-auth/` | La sesión de WhatsApp (si no, hay que reescanear el QR) |
| `uploads/` | Las fotos de los remitos de Compras y las imágenes de los productos |

Las tres están en `.gitignore`, así que `git pull` no las toca. Si algún día
movés la app de servidor, copiá esas tres cosas.

## Requisitos en el VPS (una vez)

```bash
# Node 20 o superior
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# pnpm y pm2
npm i -g pnpm pm2
```

## Primer deploy

```bash
mkdir -p /var/www
cd /var/www
git clone <URL_DEL_REPO> almack
cd almack

# Dependencias (incluye binario nativo de libsql, prebuilt para linux-x64)
pnpm install --frozen-lockfile

# Variables de entorno (ver .env.example). CAMBIÁ AUTH_SECRET y AUTH_PASSWORD.
cp .env.example .env
nano .env

# Para habilitar IA, el bloque debe contener:
# DEEPSEEK_API_KEY=tu_clave_deepseek
# DEEPSEEK_MODEL=deepseek-v4-flash
# Para fotos de Compras y carga masiva: Gemini -> DeepSeek.
# Creá una clave de Gemini API en Google AI Studio.
# GEMINI_API_KEY=tu_clave_google
# No hace falta instalar otro SDK ni configurar MongoDB/PostgreSQL.

# Crear el schema y sembrar datos iniciales (usuarios, etapas, etc.)
pnpm db:setup

# Build de producción
pnpm build

# Arrancar con PM2
pm2 start ecosystem.config.cjs
pm2 save                 # guarda la lista de procesos
pm2 startup              # imprime un comando -> ejecutalo para arrancar al bootear
```

La app queda en `http://IP_DEL_VPS:3400` (el puerto lo fija `ecosystem.config.cjs`).

## Redeploys (cuando hacés cambios)

```bash
cd /var/www/almack
pm2 stop almack
cp gestoria.db "gestoria.db.backup-$(date +%Y%m%d-%H%M%S)"
cp .env ".env.backup-$(date +%Y%m%d-%H%M%S)"
git pull
pnpm install --frozen-lockfile
pnpm db:push        # solo si cambió el schema (es idempotente: no rompe nada)
pnpm build
pm2 start ecosystem.config.cjs --only almack
```

> `db:push` solo crea lo que falta (`CREATE TABLE IF NOT EXISTS` + `ALTER`
> tolerantes a error), así que correrlo de más no borra datos.

## La cámara necesita HTTPS

El escáner de código de barras usa `getUserMedia`, que los navegadores solo
habilitan en contexto seguro. Lo usan dos pantallas: la Caja (para cobrar) y el
campo SKU de Stock (para dar de alta un producto leyendo el código del envase).

Desde el celular hay que entrar por el dominio con HTTPS (ver "Cómo llega el
tráfico"); por IP y `http://` el navegador ni siquiera pide permiso de cámara.
La única excepción es `localhost`, que el navegador considera seguro igual.

## Cómo llega el tráfico (importante)

En este VPS conviven varios sitios y **el HTTPS no lo maneja nginx**:

| Puerto | Quién lo tiene |
|---|---|
| 443 | **Traefik**, en el contenedor `n8n-traefik-1` |
| 80 | nginx (solo redirige a https) |
| 3400 | Almack, en el host vía PM2 |

Traefik termina el TLS y emite/renueva los certificados solo, con el resolver
`mytlschallenge` (desafío TLS-ALPN sobre el 443; no usa el puerto 80). Lee
configuración dinámica de `/docker/n8n/dynamic` y la recarga sin reiniciarse.

**No uses `certbot --nginx` para estos dominios.** Agrega un `listen 443 ssl` a
nginx que nunca va a poder tomar (el puerto es de Traefik), lo que hace fallar el
`systemctl reload nginx` y deja a nginx sin poder arrancar tras un reboot.

### Publicar el sitio en Traefik

`/docker/n8n/dynamic/almack.yml` (el `172.18.0.1` es la IP del host vista desde
el contenedor: `docker inspect n8n-traefik-1 --format '{{range .NetworkSettings.Networks}}{{.Gateway}}{{end}}'`):

```yaml
http:
  routers:
    almack:
      rule: "Host(`almack.consultoriadigital.io`)"
      entryPoints:
        - websecure
      service: almack
      tls:
        certResolver: mytlschallenge
  services:
    almack:
      loadBalancer:
        servers:
          - url: "http://172.18.0.1:3400"
```

Traefik lo toma solo; no hay que reiniciar nada. Se verifica con
`curl -sSI https://almack.consultoriadigital.io/ | head -3` → `HTTP/2 200`.

**Antes que nada tiene que existir el DNS.** Traefik valida el certificado por
TLS-ALPN contra el dominio real, así que si `almack.consultoriadigital.io` no
resuelve a `72.60.15.125` la emisión falla y Let's Encrypt empieza a limitar los
reintentos. En el VPS quedó preparado:

```bash
/root/almack.yml.pendiente        # el archivo de arriba, listo para copiar
/root/activar-almack-https.sh     # verifica el DNS, lo copia y espera el cert
```

Con el registro A ya creado, alcanza con `bash /root/activar-almack-https.sh`.

### nginx: solo el redirect del puerto 80

`/etc/nginx/sites-available/almack`:

```nginx
server {
    listen 80;
    server_name almack.consultoriadigital.io;
    return 301 https://$host$request_uri;
}
```

### Pendiente conocido

El proxy de Traefik hoy no fija `client_max_body_size` ni desactiva el buffering:

- Las fotos de remitos de Compras llegan hasta 8 MB. Traefik no limita el body
  por defecto, así que debería andar, pero si una subida falla revisá esto.
- El chat de WhatsApp usa SSE. Traefik no bufferea respuestas por defecto; si los
  mensajes en tiempo real llegaran demorados, hay que revisarlo del lado de
  Traefik y no de nginx.

## Comandos útiles de PM2

```bash
pm2 logs almack          # ver logs (incluye [whatsapp] conectado, mensajes, etc.)
pm2 status
pm2 reload almack        # reinicio sin downtime tras un build
pm2 restart almack
```

## Por qué NO cluster / NO varias instancias

Baileys mantiene UNA conexión WebSocket con WhatsApp y el manager vive como
singleton en `globalThis` (`src/lib/whatsapp/manager.ts`). Las server actions y
la ruta SSE comparten ese proceso. Dos instancias = dos sesiones de WhatsApp
compitiendo = QR inestable y mensajes duplicados/perdidos. Siempre `instances: 1`,
`exec_mode: "fork"`.

## Actualizar la instalación de Vercel

1. En el proyecto conectado a `NikyMen/almack`, abrir Settings → Environment Variables.
2. Agregar `GEMINI_API_KEY` y `DEEPSEEK_API_KEY` para Production (también Preview si se quiere probar una rama). No subir `.env.local` ni copiar sus variables de autenticación/base local sobre producción.
3. Opcionales: `GEMINI_MODEL=gemini-3.8-flash` y `DEEPSEEK_VISION_MODEL=deepseek-flash`.
4. Conservar `TURSO_DATABASE_URL` remoto y `TURSO_AUTH_TOKEN`, las credenciales de login y `NEXT_PUBLIC_BASE_URL` con el dominio de producción.
5. Verificar en Settings → Git la rama de producción y el repositorio. Publicar los cambios en esa rama solo después de cargar las claves.
6. Mantener el Build Command `pnpm vercel-build`: ejecuta la migración de tablas faltantes y luego compila. No ejecutar `db:seed` ni `dev:setup` sobre producción.
7. Revisar que el deployment termine en Ready y probar Caja, carga de un comprobante, guardado de registros y revisión del impacto. Confirmar stock únicamente con un ingreso real o en una base de pruebas separada.

Las páginas de Compras declaran `maxDuration = 180` para las llamadas de IA en serie. El proyecto debe permitir esa duración (Fluid Compute). Los archivos grandes pueden encontrar el límite de tamaño de petición de Vercel: para la prueba inicial usar una imagen pequeña.

Las claves se configuran antes del nuevo deployment: cambiar una variable no modifica un deployment existente. El entorno local nunca se publica en Git.
