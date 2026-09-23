import { readJson, writeJson, pushAll, romeNow } from './_lib/core.js';

// Chiamato ogni 10 minuti da GitHub Actions (.github/workflows/cron.yml).
const WINDOW_MIN = 60; // una notifica a orario parte se il controllo arriva entro 60 min dall'orario

function slotBody(id, state) {
  const r = rSum(state, 'day');
  const w = rSum(state, 'week');
  const fmt = (x) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2) + 'R';
  switch (id) {
    case 'mattina': return 'Manda una frase di carica (Frasi → Mattina).';
    case 'analisi': return 'Analisi mattutina: sul Mac, Regia → Analisi → screenshot → Genera.';
    case 'membri': return 'Risultati membri: pubblica solo screenshot verificati.';
    case 'pomeriggio': return 'Come mi muovo adesso: sul Mac, Regia → Analisi → Genera.';
    case 'resoconto': return `Oggi ${fmt(r)} · settimana ${fmt(w)}. Inoltra il resoconto VIP, anche se negativo.`;
    case 'pillola': return 'Pillola del weekend: un argomento didattico, chiusura con disclaimer.';
    default: return '';
  }
}

function rSum(state, span) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (span === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return (state.events || []).filter((e) => e.time >= start.getTime()).reduce((a, e) => a + (e.rDelta || 0), 0);
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ ok: false });

  const state = await readJson('state', null);
  if (!state) return res.status(200).json({ ok: true, note: 'nessuno stato salvato' });
  const cron = await readJson('cron', { fired: {}, reminded: {} });
  const now = romeNow();
  const sent = [];

  // 1) orari del programma
  for (const s of state.settings?.slots || []) {
    if (!s.on) continue;
    if ((s.days === 'feriali' && now.weekend) || (s.days === 'weekend' && !now.weekend)) continue;
    const [h, m] = s.t.split(':').map(Number);
    const at = h * 60 + m;
    const key = `${now.day}:${s.id}`;
    if (!cron.fired[key] && now.minutes >= at && now.minutes - at < WINDOW_MIN) {
      cron.fired[key] = true;
      await pushAll(`${s.label} · ${s.t}`, slotBody(s.id, state), { tag: key });
      sent.push(key);
    }
  }

  // 2) messaggi da inoltrare rimasti indietro
  const deadline = (state.settings?.deadline || 10) * 60e3;
  for (const e of state.events || []) {
    if (e.toForward && !e.forwarded && !cron.reminded[e.id] && Date.now() > e.time + deadline && Date.now() - e.time < 24 * 3600e3) {
      cron.reminded[e.id] = true;
      await pushAll('In ritardo: da inoltrare', e.label || 'Messaggio VIP', { tag: 'late-' + e.id });
      sent.push(e.id);
    }
  }

  // pulizia: tieni solo gli ultimi giorni
  const cutoff = Date.now() - 3 * 864e5;
  cron.fired = Object.fromEntries(Object.entries(cron.fired).filter(([k]) => new Date(k.slice(0, 10)).getTime() > cutoff));
  const ids = new Set((state.events || []).map((e) => e.id));
  cron.reminded = Object.fromEntries(Object.entries(cron.reminded).filter(([k]) => ids.has(k)));
  await writeJson('cron', cron);

  return res.status(200).json({ ok: true, sent });
}
