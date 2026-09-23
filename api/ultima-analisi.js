import { authorized, deny } from './_lib/core.js';

const CHANNEL = 'cesarexau';

const decode = (s) => s
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

async function page(before) {
  const url = `https://t.me/s/${CHANNEL}${before ? `?before=${before}` : ''}`;
  const html = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
  const msgs = [];
  for (const block of html.split('<div class="tgme_widget_message_wrap').slice(1)) {
    const id = block.match(/data-post="[^"/]+\/(\d+)"/);
    if (!id) continue;
    const time = block.match(/<time[^>]*datetime="([^"]+)"/);
    const text = block.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    msgs.push({ id: Number(id[1]), time: time ? time[1] : null, text: text ? decode(text[1]).trim() : '' });
  }
  return msgs;
}

const isAnalysis = (t) => /scenario long/i.test(t) && /scenario short/i.test(t) && !t.trimEnd().endsWith('…');

export default async function handler(req, res) {
  if (!authorized(req)) return deny(res);
  try {
    let before = null; let ultima = null; let completa = null;
    for (let i = 0; i < 8 && !(ultima && completa); i++) {
      const msgs = await page(before);
      if (!msgs.length) break;
      for (const m of [...msgs].sort((a, b) => b.id - a.id)) {
        if (!isAnalysis(m.text)) continue;
        const item = { ...m, tipo: /livelli da segnare/i.test(m.text) ? 'completa' : 'come mi muovo' };
        ultima ||= item;
        if (item.tipo === 'completa') completa ||= item;
      }
      before = Math.min(...msgs.map((m) => m.id));
    }
    return res.status(200).json({ ok: true, ultima, completa, canale: CHANNEL });
  } catch (e) {
    return res.status(200).json({ ok: false, error: `Non riesco a leggere il canale: ${e.message}` });
  }
}
