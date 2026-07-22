const SVG_NS = 'http://www.w3.org/2000/svg';


const ICON_TONES = {
 chat: 'petal',
 moments: 'fresh',
 settings: 'cloud',
 gallery: 'leaf',
 characters: 'cookie',
 worldbook: 'moss',
 wallet: 'honey',
 shop: 'pudding',
 memo: 'lilac',
 anniversary: 'rose',
 games: 'mint',
 music: 'soda',
 dream: 'moon',
 'theme-center': 'ribbon'
};

const ICON_SEMANTICS = {
 chat: 'bubble',
 moments: 'album',
 settings: 'gear',
 gallery: 'frame',
 characters: 'friend',
 worldbook: 'book',
 wallet: 'pouch',
 shop: 'bag',
 memo: 'note',
 anniversary: 'calendar',
 games: 'controller',
 music: 'record',
 dream: 'moon',
 'theme-center': 'dresser'
};

const ICON_DRAWINGS = {
  chat: `<path class="fur" d="M28 35c0-8 6-14 14-14h12c8 0 14 6 14 14v11c0 8-6 14-14 14H43L30 70l3-12c-3-3-5-7-5-12Z"/><path class="paper" d="M38 37h20v7H38Z"/><path class="line-only" d="M38 51h14"/>`,
  moments: `<path class="fur" d="M23 30h50c5 0 8 3 8 8v34c0 5-3 8-8 8H23c-5 0-8-3-8-8V38c0-5 3-8 8-8Z"/><path class="paper" d="M23 68 38 54l9 8 13-17 14 23Z"/><circle class="highlight" cx="64" cy="44" r="6"/><path class="line-only" d="M29 76h38"/>`,
  settings: `<path class="fur" d="m48 17 5 9 10-1 3 10 9 5-6 8 6 8-9 5-3 10-10-1-5 9-5-9-10 1-3-10-9-5 6-8-6-8 9-5 3-10 10 1Z"/><circle class="paper" cx="48" cy="48" r="17"/><circle class="highlight" cx="48" cy="48" r="7"/>`,
  gallery: `<path class="fur" d="M19 25h58c5 0 9 4 9 9v39c0 5-4 9-9 9H19c-5 0-9-4-9-9V34c0-5 4-9 9-9Z"/><path class="paper" d="M22 68 37 55l9 7 14-18 14 24Z"/><circle class="highlight" cx="65" cy="42" r="7"/><path class="line-only" d="M28 76h40"/>`,
  characters: `<path class="fur" d="M31 40c0-10 7-17 17-17s17 7 17 17-7 17-17 17-17-7-17-17Z"/><path class="paper" d="M25 77c4-12 13-19 23-19s19 7 23 19Z"/><path class="line-only" d="M41 42h.1M55 42h.1M43 50c3 2 7 2 10 0"/>`,
  worldbook: `<path class="fur" d="M17 28c11-4 22-1 31 7 9-8 20-11 31-7v49c-11-4-22-1-31 7-9-8-20-11-31-7Z"/><path class="paper" d="M48 35v49"/><path class="line-only" d="M27 47h12M27 58h10M57 47h12M57 58h10"/>`,
  wallet: `<path class="fur" d="M15 37h66c6 0 10 4 10 10v29c0 6-4 10-10 10H15c-6 0-10-4-10-10V47c0-6 4-10 10-10Z"/><path class="paper" d="M58 55h31v18H58c-5 0-9-4-9-9s4-9 9-9Z"/><circle class="highlight" cx="62" cy="64" r="3"/><path class="line-only" d="M22 49h24"/>`,
  shop: `<path class="fur" d="M22 39h52l-5 43H27Z"/><path class="paper" d="M17 39h62l-7-17H24Z"/><path class="line-only" d="M35 39c0-11 5-18 13-18s13 7 13 18"/><path class="highlight" d="M37 58h22"/>`,
  memo: `<path class="fur" d="M25 16h37l10 10v56H25Z"/><path class="paper" d="M62 16v12h10"/><path class="line-only" d="M35 39h25M35 52h21M35 65h15"/><path class="highlight" d="M61 70 74 45l8 4-13 25-10 7Z"/>`,
  anniversary: `<path class="fur" d="M17 32h62v50H17Z"/><path class="paper" d="M17 32h62v14H17Z"/><path class="line-only" d="M30 27v12M66 27v12M29 58h10M57 58h10M29 72h38"/><path class="highlight" d="M42 58h12v12H42Z"/>`,
  games: `<path class="fur" d="M18 50h60c7 0 11 5 13 13l3 13c2 9-8 14-15 8L66 74H30L17 84C10 90 0 85 2 76l3-13c2-8 6-13 13-13Z"/><path class="paper" d="M25 64v12m-6-6h12"/><circle class="highlight" cx="69" cy="66" r="4"/><circle class="highlight" cx="80" cy="75" r="4"/>`,
  music: `<path class="fur" d="M62 21v42c0 7-5 12-12 12-6 0-10-4-10-9s4-9 10-9c3 0 5 1 7 2V28l23-6v31"/><path class="paper" d="M28 53c0-12 9-21 21-21"/><circle class="highlight" cx="50" cy="66" r="5"/><circle class="highlight" cx="76" cy="54" r="5"/>`,
  dream: `<path class="fur" d="M70 18c-7 4-11 11-11 20 0 13 10 23 23 23h4c-6 13-19 22-35 22-21 0-38-17-38-38S30 7 51 7c7 0 14 2 19 11Z"/><path class="paper" d="M28 58h39c-2 12-9 20-19 20s-18-8-20-20Z"/><path class="line-only" d="M38 62c3 3 6 3 9 0m5 0c3 3 6 3 9 0"/>`,
  'theme-center': `<path class="fur" d="M21 57h54v23H21Z"/><path class="paper" d="M29 51h38l8 12H21Z"/><path class="highlight" d="M32 31h32v24H32Z"/><path class="line-only" d="M38 69h20M38 42h20"/><circle class="paper" cx="48" cy="20" r="8"/>`
};
export function createDefaultAppIcon(app, size = 28, documentRef = document) {
  const drawing = ICON_DRAWINGS[app?.id];
  if (!drawing) return null;
  const svg = documentRef.createElementNS(SVG_NS, 'svg');
  const tone = ICON_TONES[app.id] || 'petal';
  const semantic = ICON_SEMANTICS[app.id] || app.id;
  svg.classList.add('cozy-app-icon', `cozy-app-icon-${app.id}`, `cozy-app-icon-tone-${tone}`, `cozy-app-icon-semantic-${semantic}`);
  svg.setAttribute('viewBox', '0 0 96 96');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('data-semantic-shape', semantic);
  svg.setAttribute('data-theme-tone', tone);
  const showTinyDecoration = Number(size || 0) > 32;
  svg.innerHTML = `<g class="icon-badge-frame" aria-hidden="true">
      <path class="badge-paper" d="M15 9h66c4 0 7 1 10 4s4 6 4 10v50c0 4-1 7-4 10s-6 4-10 4H15c-4 0-7-1-10-4s-4-6-4-10V23c0-4 1-7 4-10s6-4 10-4Z"/>
      <path class="badge-soft-half" d="M15 9h33v78H15c-4 0-7-1-10-4s-4-6-4-10V23c0-4 1-7 4-10s6-4 10-4Z"/>
      <path class="badge-stitch" d="M22 17h52c8 0 14 6 14 14v34c0 8-6 14-14 14H22c-8 0-14-6-14-14V31c0-8 6-14 14-14Z"/>
    </g>
    <g class="icon-character icon-symbol icon-symbol-${app.id} icon-semantic-${semantic}">${drawing}</g>
    ${showTinyDecoration ? `<g class="icon-decoration icon-decoration-${tone}" aria-hidden="true">
      <path class="sparkle" d="M12 18h8M16 14v8"/>
      <circle class="charm-dot" cx="80" cy="18" r="2.4"/>
      <path class="charm-stitch" d="M74 79h10"/>
    </g>` : ''}`;
  return svg;
}

export const DEFAULT_APP_ICON_IDS = Object.freeze(Object.keys(ICON_DRAWINGS));
