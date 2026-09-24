import { readJson, writeJson, pushAll } from './_lib/core.js';
import { ingest } from '../core.js';

// Webhook del bot Telegram: ogni messaggio del canale VIP entra da solo nella Regia.
// Il bot deve essere amministratore del canale VIP. Il primo canale da cui arriva un messaggio
// viene "agganciato"; i messaggi di altri canali vengono ignorati.

function linkFor(chat, messageId) {
  if (chat.username) return `https://t.me/${chat.username}/${messageId}`;
  return `https://t.me/c/${String(chat.id).replace(/^-100/, '')}/${messageId}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  const tg = await readJson('telegram', null);
  if (!tg?.secret || req.headers['x-telegram-bot-api-secret-token'] !== tg.secret) {
    return res.status(401).json({ ok: false });
  }

  const post = req.body?.channel_post;
  if (!post) return res.status(200).json({ ok: true, skipped: 'non è un post di canale' });

  const chatId = String(post.chat.id);
  if (!tg.vipChatId) {
    tg.vipChatId = chatId;
    tg.vipTitle = post.chat.title || '';
  } else if (tg.vipChatId !== chatId) {
    return res.status(200).json({ ok: true, skipped: 'altro canale' });
  }
  tg.lastAt = Date.now();
  await writeJson('telegram', tg);

  const text = post.text || post.caption || '';
  if (!text.trim()) return res.status(200).json({ ok: true, skipped: 'senza testo' });

  const state = (await readJson('state', null)) || { ops: [], events: [], settings: {} };
  const key = `${chatId}:${post.message_id}`;
  if (state.events.some((e) => e.tg === key)) return res.status(200).json({ ok: true, skipped: 'già registrato' });

  const reply = post.reply_to_message;
  const ev = ingest(state, text, linkFor(post.chat, post.message_id), post.date * 1000, {
    silent: true, replyText: reply ? reply.text || reply.caption || '' : '',
  });
  if (!ev || ev.kind === 'altro') return res.status(200).json({ ok: true, skipped: 'non riconosciuto' });
  ev.tg = key;
  ev.src = 'bot';
  await writeJson('state', state);

  if (ev.toForward) await pushAll('Da inoltrare adesso', ev.label, { tag: ev.id });
  return res.status(200).json({ ok: true, kind: ev.kind });
}
