// Configuración de PM2 para GestorIA.
//
// IMPORTANTE: Baileys (WhatsApp) corre dentro de este mismo proceso de Next.js
// como singleton en globalThis. Por eso DEBE ser una sola instancia en modo
// fork. Nunca uses cluster ni instances > 1: abriría varias sesiones de
// WhatsApp peleándose por la misma conexión.

module.exports = {
  apps: [
    {
      name: "gestoria",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3300",
      cwd: __dirname,
      instances: 1, // <- una sola. No tocar.
      exec_mode: "fork", // <- fork, no cluster. No tocar.
      autorestart: true,
      max_memory_restart: "1G",
      // Next.js carga .env / .env.production automáticamente, así que las
      // variables (DEEPSEEK_API_KEY, AUTH_*, etc.) van en el .env del server.
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
