import crypto from 'node:crypto';
import { authorized, deny, readJson, writeJson } from './_lib/core.js';

// Collega il bot Telegram alla Regia. Il token lo incolla Luca nell'app e resta salvato solo qui (Blob privato).
async function tgApi(token, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
  });
  return r.json();
}

export default async function handler(req, res) {
  if (!authorized(req)) return deny(res);
  const tg = await readJson('telegram', null);

  if (req.method === 'GET') {
    if (!tg?.token) return res.status(200).json({ ok: true, connected: false });
    const info = await tgApi(tg.token, 'getWebhookInfo');
    return res.status(200).json({
      ok: true, connected: true, bot: tg.botUsername, vipTitle: tg.vipTitle || null, vipChatId: tg.vipChatId || null,
      lastAt: tg.lastAt || null, webhookError: info.result?.last_error_message || null,
    });
  }

  if (req.method === 'POST') {
    const { token, action } = req.body || {};
    if (action === 'scollega-canale' && tg) {
      delete tg.vipChatId; delete tg.vipTitle;
      await writeJson('telegram', tg);
      return res.status(200).json({ ok: true });
    }
    if (!token || !/^\d+:[\w-]{30,}$/.test(token.trim())) {
      return res.status(400).json({ ok: false, error: 'Token non valido: copialo intero dal messaggio di @BotFather.' });
    }
    const me = await tgApi(token.trim(), 'getMe');
    if (!me.ok) return res.status(400).json({ ok: false, error: 'Telegram non riconosce questo token.' });

    const secret = crypto.randomBytes(24).toString('hex');
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const hook = await tgApi(token.trim(), 'setWebhook', {
      url: `https://${host}/api/telegram`, secret_token: secret, allowed_updates: ['channel_post'], drop_pending_updates: true,
    });
    if (!hook.ok) return res.status(500).json({ ok: false, error: `Webhook non impostato: ${hook.description}` });

    await writeJson('telegram', { token: token.trim(), secret, botUsername: me.result.username });
    return res.status(200).json({ ok: true, bot: me.result.username });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ ok: false });
}
