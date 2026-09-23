import { authorized, deny, readJson, writeJson, pushAll } from './_lib/core.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // chiave pubblica VAPID: serve al browser per iscriversi, non è un segreto
    return res.status(200).json({ ok: true, publicKey: process.env.VAPID_PUBLIC_KEY || null });
  }
  if (!authorized(req)) return deny(res);

  if (req.method === 'POST') {
    const { subscription, deviceId, test } = req.body || {};
    if (test) {
      const sent = await pushAll('Prova', 'Se vedi questa notifica, la Regia ti avvisa anche a telefono bloccato.');
      return res.status(200).json({ ok: true, sent });
    }
    if (!subscription?.endpoint) return res.status(400).json({ ok: false, error: 'Iscrizione non valida' });
    const subs = (await readJson('subs', [])).filter((s) => s.subscription.endpoint !== subscription.endpoint && s.deviceId !== deviceId);
    subs.push({ subscription, deviceId, at: Date.now() });
    await writeJson('subs', subs);
    return res.status(200).json({ ok: true, devices: subs.length });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok: false });
}
