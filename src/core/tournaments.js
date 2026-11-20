import { codePattern, deckText, parseDeck } from './deck.js';

const API = 'https://play.limitlesstcg.com/api';
const eventId = /^[a-f0-9]{24}$/;
const cardCode = card => (String(card?.set ?? '') + '-' + String(card?.number ?? '').padStart(3, '0')).toUpperCase();

async function fetchJson(route) {
  const response = await fetch(API + route, { redirect: 'error', signal: AbortSignal.timeout(14000) });
  if (!response.ok) throw new Error('Limitless respondió HTTP ' + response.status + '.');
  return response.json();
}

export function tournamentEntries(event, standings, catalog) {
  if (!eventId.test(event.id) || !Array.isArray(standings)) return [];
  const day = String(event.date ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  const results = [];
  for (const entry of standings) {
    const rank = entry.placing;
    const list = entry.decklist;
    const leader = cardCode(list?.leader);
    if (!Number.isInteger(rank) || rank < 1 || rank > 12 || !codePattern.test(leader)) continue;
    let count = 0;
    const lines = ['1 ' + leader];
    for (const kind of ['character', 'event', 'stage']) {
      for (const card of Array.isArray(list[kind]) ? list[kind] : []) {
        const code = cardCode(card);
        if (!codePattern.test(code) || !Number.isInteger(card.count) || card.count < 1 || card.count > 50) continue;
        count += card.count;
        lines.push(card.count + ' ' + code);
      }
    }
    if (count !== 50) continue;
    try {
      const deck = parseDeck(lines.join('\n'), catalog);
      results.push({ leader, text: deckText(deck), day, rank, name: 'Puesto ' + rank + ' · ' + String(event.name || 'Torneo público').slice(0, 140),
        context: day + ' · ' + event.players + ' participantes · Limitless', source: 'https://play.limitlesstcg.com/tournament/' + event.id + '/standings' });
    } catch {}
  }
  return results;
}

export async function refreshTournaments(catalog, progress = () => {}) {
  const index = await fetchJson('/tournaments?game=OP&limit=40');
  if (!Array.isArray(index)) throw new Error('Limitless devolvió un índice de torneos inesperado.');
  const events = index.filter(event => eventId.test(event?.id) && [null, undefined, 'STANDARD'].includes(event.format) &&
    Number.isInteger(event.players) && event.players >= 12 && !/\b(extra|egb|sealed|draft)\b/i.test(event.name ?? '')).slice(0, 10);
  let done = 0;
  const records = [];
  for (let start = 0; start < events.length; start += 4) {
    const batches = await Promise.all(events.slice(start, start + 4).map(async event => {
      try { return tournamentEntries(event, await fetchJson('/tournaments/' + event.id + '/standings'), catalog); }
      catch { return []; }
      finally { progress(++done + '/' + events.length + ' torneos consultados'); }
    }));
    records.push(...batches.flat());
  }
  if (!records.length) throw new Error('Los torneos consultados carecen de listas completas reconocidas. Se conserva la biblioteca local.');
  return records;
}
