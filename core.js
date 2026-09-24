// Regia Branco: riconoscimento dei messaggi VIP e calcolo delle operazioni.
// Usato sia dall'app (browser) sia dal bot (funzione Vercel), così i conti sono identici.

export const W = [0.1, 0.2, 0.3, 0.4]; // divisione della size sulle 4 posizioni
export const TYPE_LABEL = {
  segnale: 'Segnale (resta nel VIP)', tp: 'Target preso', alltp: 'Tutti i target presi', sl: 'Stop toccato',
  chiusura: 'Chiusura manuale', aggiornamento: 'Aggiornamento (resta nel VIP)', resoconto: 'Resoconto della giornata',
  altro: 'Messaggio non riconosciuto',
};
export const FORWARD = { tp: true, alltp: true, sl: true, chiusura: true, resoconto: true };

export const uid = () => Math.random().toString(36).slice(2, 10);
export const num = (s) => parseFloat(String(s).replace(',', '.'));
export const fmtR = (r) => (r == null || isNaN(r) ? '—' : (r >= 0 ? '+' : '−') + Math.abs(r).toFixed(2) + 'R');

export function parse(text) {
  const t = (text || '').trim();
  if (!t) return null;
  const ref = t.match(/\((BUY|SELL)\s+([\d.,]+)\)/i);
  const side = ref ? ref[1].toUpperCase() : null;
  const fill = ref ? num(ref[2]) : null;
  if (/RESOCONTO DELLA GIORNATA/i.test(t)) return { type: 'resoconto' };
  if (/tutti i target presi/i.test(t)) { const p = t.match(/\+\s*(\d+)\s*pips/i); return { type: 'alltp', side, fill, pips: p ? +p[1] : null }; }
  const tp = t.match(/TP\s*([1-4])\s*✅\s*\+?\s*(\d+)\s*pips/i);
  if (tp) return { type: 'tp', n: +tp[1], pips: +tp[2], side, fill };
  if (/(SL toccato|stop\s*loss\s*preso|stop preso|stop toccato)/i.test(t)) return { type: 'sl', side, fill };
  if (/(chiusa in profitto|portata a casa|chiuso in profitto|chiusura manuale)/i.test(t)) {
    const px = t.match(/chius\w*\s+a\s+([\d.,]{6,})/i);
    return { type: 'chiusura', side, fill, price: px ? num(px[1]) : null };
  }
  const sig = t.match(/XAUUSD\s+(BUY|SELL)[\s\S]*?Entry:\s*([\d.,]+)\s*-\s*([\d.,]+)[\s\S]*?SL:\s*([\d.,]+)/i);
  const tps = [...t.matchAll(/TP([1-4]):\s*([\d.,]+)/gi)];
  if (sig && tps.length >= 1) {
    const arr = [null, null, null, null];
    tps.forEach((m) => { arr[+m[1] - 1] = num(m[2]); });
    return { type: 'segnale', side: sig[1].toUpperCase(), e1: num(sig[2]), e2: num(sig[3]), sl: num(sig[4]), tps: arr };
  }
  const at = t.match(/Siamo a\s*([\d.,]+)/i);
  if (at) return { type: 'aggiornamento', side, fill, price: num(at[1]) };
  return { type: 'altro' };
}

export function risk(op) { const f = op.fill ?? (op.e1 + op.e2) / 2; return op.sl ? Math.abs(f - op.sl) : null; }
const dir = (op) => (op.side === 'BUY' ? 1 : -1);

function findOp(S, side, fill, hint) {
  if (!side) return null;
  const c = S.ops.filter((o) => o.side === side);
  if (fill != null) {
    const exact = c.filter((o) => o.fill != null && Math.abs(o.fill - fill) < 0.01).sort((a, b) => b.time - a.time)[0];
    if (exact) return exact;
    const inRange = c.filter((o) => o.fill == null && o.e1 != null && fill >= Math.min(o.e1, o.e2) - 0.6 && fill <= Math.max(o.e1, o.e2) + 0.6)
      .sort((a, b) => (a.status === 'aperta' ? 0 : 1) - (b.status === 'aperta' ? 0 : 1) || b.time - a.time)[0];
    if (inRange) return inRange;
  }
  // il bot conosce il segnale a cui il messaggio risponde
  if (hint && hint.type === 'segnale') {
    return c.find((o) => Math.abs((o.e1 ?? -1) - hint.e1) < 0.01 && Math.abs((o.sl ?? -1) - hint.sl) < 0.01) || null;
  }
  return null;
}

function newOp(S, fields, time) {
  const op = {
    id: uid(), fill: null, e1: null, e2: null, sl: null, tps: [null, null, null, null], time,
    hit: [false, false, false, false], tpPips: [null, null, null, null], closedW: 0, r: 0, wpips: 0,
    status: 'aperta', stopped: false, ...fields, u: Date.now(),
  };
  S.ops.push(op);
  return op;
}

function closeTp(op, i, pips) {
  if (op.hit[i]) return 0;
  if (pips == null && op.tps[i] != null && op.fill != null) pips = Math.round(Math.abs(op.tps[i] - op.fill) * 10);
  op.hit[i] = true; op.tpPips[i] = pips; op.closedW += W[i]; op.wpips += W[i] * (pips || 0);
  const rk = risk(op);
  const dr = rk && pips != null ? (W[i] * (pips / 10)) / rk : 0;
  op.r += dr;
  return dr;
}
function finish(op, t) { if (op.closedW > 0.999) { op.status = 'chiusa'; op.closedAt = t; } }

/**
 * Registra un messaggio del VIP nello stato S.
 * opts: forwarded (già inoltrato), silent (non chiedere nulla), ask(tag) → prezzo di chiusura, replyText (testo del segnale citato)
 */
export function ingest(S, text, link, time, opts = {}) {
  const p = parse(text);
  if (!p) return null;
  const ev = {
    id: uid(), time, kind: p.type, text: text.trim(), link: link || '', rDelta: 0,
    toForward: !!FORWARD[p.type], forwarded: !!opts.forwarded, reminded: !!opts.forwarded, u: Date.now(),
  };
  let op = null;
  if (p.type === 'segnale') {
    op = newOp(S, { side: p.side, e1: p.e1, e2: p.e2, sl: p.sl, tps: p.tps }, time);
    ev.label = `${p.side} ${p.e1}–${p.e2} · SL ${p.sl}`;
  } else if (['tp', 'alltp', 'sl', 'chiusura', 'aggiornamento'].includes(p.type)) {
    const hint = opts.replyText ? parse(opts.replyText) : null;
    const side = p.side || (hint && hint.side) || null;
    op = findOp(S, side, p.fill, hint) || (side ? newOp(S, { side, fill: p.fill, stub: true }, time) : null);
    if (op && op.fill == null && p.fill != null) op.fill = p.fill;
    const tag = op ? `${op.side} ${op.fill ?? (op.e1 != null ? op.e1 + '–' + op.e2 : '')}` : 'operazione sconosciuta';
    if (op && p.type === 'tp') {
      let dr = 0;
      for (let i = 0; i < p.n - 1; i++) if (!op.hit[i] && op.tps[i] != null) dr += closeTp(op, i, null);
      dr += closeTp(op, p.n - 1, p.pips);
      ev.rDelta = dr; finish(op, time); ev.label = `TP${p.n} ✅ +${p.pips} pips · ${tag}`;
    }
    if (op && p.type === 'alltp') {
      let dr = 0;
      for (let i = 0; i < 4; i++) if (!op.hit[i]) dr += closeTp(op, i, i === 3 ? p.pips : null);
      ev.rDelta = dr; op.closedW = 1; finish(op, time); ev.label = `Tutti i target ✅ +${p.pips ?? '?'} pips · ${tag}`;
    }
    if (op && p.type === 'sl') {
      const rem = Math.max(0, 1 - op.closedW); const rk = risk(op); const dr = rk ? -rem : 0;
      op.r += dr; op.wpips -= rem * (rk ? rk * 10 : 0); op.closedW = 1; op.stopped = true; op.status = 'chiusa'; op.closedAt = time;
      ev.rDelta = dr; ev.label = `Stop ❌ · ${tag}${rk ? ' · ' + fmtR(dr) : ''}`;
    }
    if (op && p.type === 'chiusura') {
      let px = p.price ?? opts.price ?? op.lastPrice;
      if (px == null && !opts.silent && opts.ask) px = opts.ask(tag);
      const rem = Math.max(0, 1 - op.closedW); const rk = risk(op); let dr = 0;
      if (px != null && op.fill != null) { const d = (px - op.fill) * dir(op); op.wpips += rem * d * 10; if (rk) dr = (rem * d) / rk; }
      op.r += dr; op.closedW = 1; op.status = 'chiusa'; op.closedAt = time; op.manual = px;
      ev.rDelta = dr; ev.label = `Chiusa a mano ${px ?? '?'} · ${tag}`;
    }
    if (op && p.type === 'aggiornamento') { op.lastPrice = p.price; ev.label = `Siamo a ${p.price} · ${tag}`; }
    if (op) op.u = Date.now();
    if (!op) ev.label = TYPE_LABEL[p.type];
  } else if (p.type === 'resoconto') {
    ev.label = 'Resoconto VIP della giornata';
  } else {
    ev.label = 'Messaggio non riconosciuto';
  }
  ev.opId = op ? op.id : null;
  S.events.push(ev);
  return ev;
}

/** Unisce lo stato del server con quello di un dispositivo: per ogni elemento vince la versione modificata per ultima. */
export function mergeState(server, client) {
  if (!server) return client;
  const deleted = new Set([...(server.deleted || []), ...(client.deleted || [])]);
  const merge = (a = [], b = []) => {
    const map = new Map();
    for (const x of [...a, ...b]) {
      if (deleted.has(x.id)) continue;
      const cur = map.get(x.id);
      if (!cur || (x.u || 0) >= (cur.u || 0)) map.set(x.id, x);
    }
    return [...map.values()].sort((x, y) => x.time - y.time);
  };
  return {
    ...server, ...client,
    settings: { ...(server.settings || {}), ...(client.settings || {}), bot: server.settings?.bot || client.settings?.bot },
    ops: merge(server.ops, client.ops),
    events: merge(server.events, client.events),
    deleted: [...deleted].slice(-500),
  };
}
