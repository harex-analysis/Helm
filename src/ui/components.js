import { COLORS, KINDS, displayDay } from '../core/deck.js';

const drawings = {
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.7 8.3-2 5.4-5.4 2 2-5.4 5.4-2Z"/>',
  decks: '<rect x="7" y="4" width="12" height="15" rx="2"/><path d="M4 8v11a3 3 0 0 0 3 3h8M11 9h4m-4 4h4"/>',
  library: '<path d="M3 4h5v16H3zm5 0h5v16H8zm7 2 4-1 3 14-4 1z"/>',
  wand: '<path d="m4 20 10.5-10.5 3 3L7 23m5-11 3 3M19 3v4m-2-2h4M8 2v4M6 4h4m10 13v4m-2-2h4"/>',
  chart: '<path d="M3 4v16h18M7 15l4-4 4 2 5-6m-3 0h3v3"/>',
  grid: '<rect x="4" y="3" width="6" height="8" rx="1"/><rect x="14" y="3" width="6" height="8" rx="1"/><rect x="4" y="15" width="6" height="6" rx="1"/><rect x="14" y="15" width="6" height="6" rx="1"/>',
  history: '<path d="M4 11a8 8 0 1 1 2 6m-3-6V5m0 6h6m3-4v5l3 2"/>',
  settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="10" cy="18" r="2" fill="currentColor" stroke="none"/>',
  upload: '<path d="M12 16V4m-4 4 4-4 4 4M5 15v5h14v-5"/>',
  download: '<path d="M12 4v12m-4-4 4 4 4-4M5 16v4h14v-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  right: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>', left: '<path d="m15 6-6 6 6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z"/>',
  shield: '<path d="M12 3 4 6v5c0 5 3 8 8 10 5-2 8-5 8-10V6Z"/><path d="m8 12 3 3 5-5"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  lock: '<rect x="6" y="10" width="12" height="10" rx="2"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4Z"/>',
  heart: '<path d="M20.5 8.6c0 4.4-8.5 10-8.5 10s-8.5-5.6-8.5-10a4 4 0 0 1 8.5-1.2 4 4 0 0 1 8.5 1.2Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  refresh: '<path d="M20 8a8 8 0 1 0 0 8m0-12v5h-5"/>',
  play: '<path d="m8 5 12 7-12 7Z"/>', pause: '<path d="M9 5v14m6-14v14"/>',
  calendar: '<rect x="4" y="6" width="16" height="14" rx="2"/><path d="M8 3v6m8-6v6M4 11h16"/>',
  link: '<path d="m10 14 4-4m-7 6-1 1a3.5 3.5 0 0 1-5-5l5-5a3.5 3.5 0 0 1 5 0m2 10a3.5 3.5 0 0 0 5 0l5-5a3.5 3.5 0 0 0-5-5l-1 1" transform="translate(2 2) scale(.82)"/>',
  edit: '<path d="m4 16 12-12 4 4L8 20H4Zm10-10 4 4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
  flag: '<path d="M5 22V4m0 1c6-5 8 4 15-1v11c-7 5-9-4-15 1"/>',
  external: '<path d="M13 4h7v7m-8 1 8-8m-1 10v6H4V5h6"/>'
};

export const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
})[char]);
export const icon = (name, size = 18) => '<svg aria-hidden="true" width="' + size + '" height="' + size +
  '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' + (drawings[name] ?? '') + '</svg>';
export const pct = value => new Intl.NumberFormat('es-BO', { style: 'percent', maximumFractionDigits: 1 }).format(value);
export const num = (value, digits = 0) => new Intl.NumberFormat('es-BO', { maximumFractionDigits: digits }).format(value);
export const timestamp = value => new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/La_Paz' }).format(new Date(value));
export const ruleDate = displayDay;
export const opt = (value, label, selected) => '<option value="' + esc(value) + '"' + (selected === value ? ' selected' : '') + '>' + esc(label) + '</option>';
export const kind = item => KINDS[item.kind] ?? item.kind;
export const color = item => item.colors[0]?.toLowerCase() ?? 'neutral';
export const dots = item => item.colors.map(name => '<i class="color-dot ' + esc(name.toLowerCase()) + '" title="' + COLORS[name] + '"></i>').join('');

export function btn(label, action, { glyph = '', style = '', value, disabled = false, title = '' } = {}) {
  return '<button type="button" class="button ' + style + '" data-action="' + action + '"' + (value === undefined ? '' : ' data-value="' + esc(value) + '"') +
    (disabled ? ' disabled' : '') + (title ? ' title="' + esc(title) + '"' : '') + '>' + (glyph ? icon(glyph, 16) : '') + '<span>' + esc(label) + '</span></button>';
}

export function smallButton(label, action, glyph, value, disabled = false) {
  return '<button type="button" class="icon-button" data-action="' + action + '" data-value="' + esc(value) +
    '" aria-label="' + esc(label) + '" title="' + esc(label) + '"' + (disabled ? ' disabled' : '') + '>' + icon(glyph, 15) + '</button>';
}

export const actionsMenu = (label, content, glyph = 'settings') => '<details class="actions-menu"><summary>' +
  icon(glyph, 15) + '<span>' + esc(label) + '</span></summary><div>' + content + '</div></details>';

export function art(card, extra = '', eager = false) {
  return '<span class="art ' + extra + ' ' + color(card) + '">' + icon('decks', 23) + '<img ' + (eager ? '' : 'loading="lazy" ') +
    'decoding="async" draggable="false" alt="" src="/art/' + esc(card.code) + '"></span>';
}
export const codeLabel = card => '<span class="code">' + esc(card.code) + '</span>';
export const formField = (id, name, field, caption = '') => '<label class="field" for="' + id + '"><span>' + esc(name) + '</span>' + field +
  (caption ? '<small>' + esc(caption) + '</small>' : '') + '</label>';
export const oneLine = (id, value, placeholder = '') => '<input id="' + id + '" value="' + esc(value) + '" placeholder="' + esc(placeholder) + '" autocomplete="off">';
export const listArea = (id, value, placeholder = '') => '<textarea id="' + id + '" rows="8" spellcheck="false" placeholder="' + esc(placeholder) + '">' + esc(value) + '</textarea>';
export const checkbox = (id, label, checked) => '<label class="check"><input id="' + id + '" type="checkbox"' + (checked ? ' checked' : '') + '> ' + esc(label) + '</label>';
export const empty = (title, body, actions = '') => '<section class="empty"><div class="empty-sign">' + icon('compass', 24) +
  '</div><h2>' + esc(title) + '</h2><p>' + esc(body) + '</p>' + actions + '</section>';
export const message = (label, messageType = 'info') => '<div class="notice ' + messageType + '">' + icon(messageType === 'good' ? 'check' : 'info', 17) + '<span>' + esc(label) + '</span></div>';
export const header = (title, description = '', actions = '') => '<div class="page-heading"><div><h1>' + title + '</h1>' +
  (description ? '<p>' + description + '</p>' : '') + '</div>' + (actions ? '<div class="actions">' + actions + '</div>' : '') + '</div>';
export const cardName = card => '<span class="card-name">' + esc(card.name) + '</span>' + codeLabel(card);
export const status = (label, category = 'good') => '<span class="status ' + category + '"><i></i>' + esc(label) + '</span>';

export function costCurve(curve, variant) {
  const highest = Math.max(...curve, ...(variant ?? []), 4);
  const step = Math.max(1, Math.ceil(highest / 4));
  const max = step * 4;
  return '<div class="curve" role="img" aria-label="Curva de DON. ' + esc(curve.map((n, i) => 'Coste ' + i + ', ' + n + ' copias').join('. ')) + '">' +
    '<div class="curve-axes">' + [4, 3, 2, 1, 0].map(i => '<span>' + (i * step) + '</span>').join('') + '</div>' +
    '<div class="curve-plot"><div class="curve-lines">' + '<i></i>'.repeat(5) + '</div>' +
    curve.map((n, i) => '<div class="bar-column"><div class="bars">' +
      '<div class="bar ' + (n ? '' : 'zero') + '" style="--height:' + (n / max * 100) + '%"><span>' + (n || '') + '</span></div>' +
      (variant ? '<div class="bar variant ' + (variant[i] ? '' : 'zero') + '" style="--height:' + (variant[i] / max * 100) + '%"><span>' + (variant[i] || '') + '</span></div>' : '') +
      '</div><span class="x-label">' + (i === 10 ? '10+' : i) + '</span></div>').join('') +
    '</div></div>';
}

export function metricsTile(label, value, subtitle, glyph) {
  return '<div class="metric"><div class="metric-top"><span>' + esc(label) + '</span><span class="metric-icon">' + icon(glyph, 16) +
    '</span></div><strong>' + value + '</strong><small>' + esc(subtitle) + '</small></div>';
}
