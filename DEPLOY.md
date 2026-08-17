# Deploy de GestorIA en el VPS (PM2)

App Next.js 15 con WhatsApp (Baileys) embebido en el mismo proceso y base de
datos libsql en archivo local. Por eso: **un solo proceso, fork, y tres rutas que
deben persistir**:

| Ruta | Qué guarda |
|---|---|
| `gestoria.db` | La base entera |
| `.wa-auth/` | La sesión de WhatsApp (si no, hay que reescanear el QR) |
| `uploads/` | Las fotos de los remitos de Compras |

Las tres están en `.gitignore`, así que `git pull` no las toca. Si algún día
movés la app de servidor, copiá esas tres cosas.

## Requisitos en el VPS (una vez)

```bash
# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# pnpm y pm2
npm i -g pnpm pm2
```

## Primer deploy

```bash
cd /opt/gestoria
git clone <URL_DEL_REPO> .

# Dependencias (incluye binario nativo de libsql, prebuilt para linux-x64)
pnpm install --frozen-lockfile

# Variables de entorno (ver .env.example). CAMBIÁ AUTH_SECRET y AUTH_PASSWORD.
cp .env.example .env
nano .env

# En producción, el bloque de IA debe contener:
# DEEPSEEK_API_KEY=tu_clave_deepseek
# DEEPSEEK_MODEL=deepseek-v4-flash
# No hace falta instalar otro SDK ni configurar MongoDB/PostgreSQL para GestorIA.

# Crear el schema y sembrar datos iniciales (usuarios, etapas, etc.)
pnpm db:setup

# Build de producción
pnpm build

# Arrancar con PM2
pm2 start ecosystem.config.cjs
pm2 save                 # guarda la lista de procesos
pm2 startup              # imprime un comando -> ejecutalo para arrancar al bootear
```

La app queda en `http://127.0.0.1:3300` (el puerto lo fija `ecosystem.config.cjs`).

## Redeploys (cuando hacés cambios)

```bash
cd /opt/gestoria
pm2 stop gestoria
cp gestoria.db "gestoria.db.backup-$(date +%Y%m%d-%H%M%S)"
cp .env ".env.backup-$(date +%Y%m%d-%H%M%S)"
git pull
pnpm install --frozen-lockfile
pnpm db:push        # solo si cambió el schema (es idempotente: no rompe nada)
pnpm build
pm2 start ecosystem.config.cjs --only gestoria
```

> `db:push` solo crea lo que falta (`CREATE TABLE IF NOT EXISTS` + `ALTER`
> tolerantes a error), así que correrlo de más no borra datos.

## La cámara necesita HTTPS

El escáner de código de barras de la Caja usa `getUserMedia`, que los navegadores
solo habilitan en contexto seguro. Desde el celular hay que entrar por el dominio
con HTTPS (ver la sección de nginx + certbot); por IP y `http://` el navegador no
va a pedir permiso de cámara.

## Cómo llega el tráfico (importante)

En este VPS conviven varios sitios y **el HTTPS no lo maneja nginx**:

| Puerto | Quién lo tiene |
|---|---|
| 443 | **Traefik**, en el contenedor `n8n-traefik-1` |
| 80 | nginx (solo redirige a https) |
| 3300 | GestorIA, en el host vía PM2 |

Traefik termina el TLS y emite/renueva los certificados solo, con el resolver
`mytlschallenge` (desafío TLS-ALPN sobre el 443; no usa el puerto 80). Lee
configuración dinámica de `/docker/n8n/dynamic` y la recarga sin reiniciarse.

**No uses `certbot --nginx` para estos dominios.** Agrega un `listen 443 ssl` a
nginx que nunca va a poder tomar (el puerto es de Traefik), lo que hace fallar el
`systemctl reload nginx` y deja a nginx sin poder arrancar tras un reboot.

### Publicar el sitio en Traefik

`/docker/n8n/dynamic/gestoria.yml` (el `172.18.0.1` es la IP del host vista desde
el contenedor: `docker inspect n8n-traefik-1 --format '{{range .NetworkSettings.Networks}}{{.Gateway}}{{end}}'`):

```yaml
http:
  routers:
    gestoria:
      rule: "Host(`gestoria.consultoriadigital.io`)"
      entryPoints:
        - websecure
      service: gestoria
      tls:
        certResolver: mytlschallenge
  services:
    gestoria:
      loadBalancer:
        servers:
          - url: "http://172.18.0.1:3300"
```

Traefik lo toma solo; no hay que reiniciar nada. Se verifica con
`curl -sSI https://gestoria.consultoriadigital.io/login | head -3` → `HTTP/2 200`.

### nginx: solo el redirect del puerto 80

`/etc/nginx/sites-available/gestoria`:

```nginx
server {
    listen 80;
    server_name gestoria.consultoriadigital.io;
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
pm2 logs gestoria        # ver logs (incluye [whatsapp] conectado, mensajes, etc.)
pm2 status
pm2 reload gestoria      # reinicio sin downtime tras un build
pm2 restart gestoria
```

## Por qué NO cluster / NO varias instancias

Baileys mantiene UNA conexión WebSocket con WhatsApp y el manager vive como
singleton en `globalThis` (`src/lib/whatsapp/manager.ts`). Las server actions y
la ruta SSE comparten ese proceso. Dos instancias = dos sesiones de WhatsApp
compitiendo = QR inestable y mensajes duplicados/perdidos. Siempre `instances: 1`,
`exec_mode: "fork"`.
