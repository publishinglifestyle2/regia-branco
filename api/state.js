import { authorized, deny, readJson, writeJson, pushAll } from './_lib/core.js';

const FORWARD_LABEL = { tp: 'Target preso', alltp: 'Tutti i target', sl: 'Stop toccato', chiusura: 'Chiusura', resoconto: 'Resoconto VIP' };

export default async function handler(req, res) {
  if (!authorized(req)) return deny(res);

  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, state: await readJson('state', null) });
  }

  if (req.method === 'PUT') {
    const { state, deviceId } = req.body || {};
    if (!state || !Array.isArray(state.ops) || !Array.isArray(state.events)) {
      return res.status(400).json({ ok: false, error: 'Stato non valido' });
    }
    const prev = await readJson('state', { events: [] });
    const known = new Set((prev.events || []).map((e) => e.id));
    await writeJson('state', state);

    // messaggi nuovi da inoltrare: avvisa gli altri dispositivi (es. aggiunto dal Mac → notifica su iPhone)
    const fresh = state.events.filter((e) => e.toForward && !e.forwarded && !known.has(e.id));
    for (const e of fresh) {
      await pushAll('Da inoltrare adesso', e.label || FORWARD_LABEL[e.kind] || 'Nuovo messaggio VIP', { skipDevice: deviceId, tag: e.id });
    }
    return res.status(200).json({ ok: true, pushed: fresh.length });
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ ok: false });
}
