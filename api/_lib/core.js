import { get, put } from '@vercel/blob';
import webpush from 'web-push';

/* ---------- storage (Vercel Blob privato, un file JSON per chiave) ---------- */
export async function readJson(name, fallback) {
  try {
    const res = await get(`regia/${name}.json`, { access: 'private', useCache: false });
    if (!res) return fallback;
    return JSON.parse(await new Response(res.stream).text());
  } catch (e) {
    if (e?.name === 'BlobNotFoundError') return fallback;
    throw e;
  }
}

export async function writeJson(name, data) {
  await put(`regia/${name}.json`, JSON.stringify(data), {
    access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json',
  });
}

/* ---------- auth ---------- */
export function authorized(req) {
  const pin = process.env.REGIA_PIN;
  return Boolean(pin) && req.headers['x-regia-pin'] === pin;
}

export function deny(res) {
  res.status(401).json({ ok: false, error: 'PIN errato' });
}

/* ---------- push ---------- */
let configured = false;
function setup() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:regia@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  configured = true;
}

/** Invia a tutti i dispositivi iscritti, tranne `skipDevice`. Rimuove le iscrizioni scadute. */
export async function pushAll(title, body, { skipDevice, tag } = {}) {
  setup();
  const subs = await readJson('subs', []);
  const alive = [];
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    if (skipDevice && s.deviceId === skipDevice) { alive.push(s); return; }
    try {
      await webpush.sendNotification(s.subscription, JSON.stringify({ title, body, tag: tag || title }), { TTL: 3600 });
      alive.push(s); sent++;
    } catch (e) {
      if (e.statusCode !== 404 && e.statusCode !== 410) alive.push(s);
    }
  }));
  if (alive.length !== subs.length) await writeJson('subs', alive);
  return sent;
}

/* ---------- ora italiana ---------- */
export function romeNow(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(date).map((p) => [p.type, p.value]));
  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    weekend: parts.weekday === 'Sat' || parts.weekday === 'Sun',
  };
}
