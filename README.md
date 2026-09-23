# Regia Branco

Web app (installabile su iPhone) per gestire un canale Telegram di analisi XAUUSD:
coda degli inoltri, registro operazioni in R, resoconto, frasi e notifiche push agli orari del programma.

- `index.html`: l'app (PWA), `sw.js` + `manifest.webmanifest`
- `api/`: funzioni Vercel (stato su Vercel Blob privato, notifiche Web Push, lettura canale pubblico)
- `.github/workflows/cron.yml`: chiama `/api/cron` ogni 10 minuti

Variabili d'ambiente su Vercel: `REGIA_PIN`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`, `BLOB_READ_WRITE_TOKEN`.
Secret su GitHub: `CRON_SECRET`, `REGIA_URL`.
