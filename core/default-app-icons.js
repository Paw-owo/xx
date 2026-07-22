const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON_DRAWINGS = {
  chat: `<path class="icon-line" d="M29 36c0-8 6-14 14-14h10c8 0 14 6 14 14v12c0 8-6 14-14 14h-9l-14 9 3-12c-3-3-4-7-4-11Z"/><path class="icon-line" d="M40 41h18M40 51h12"/>`,
  moments: `<path class="icon-line" d="M26 28h44c6 0 10 4 10 10v31c0 6-4 10-10 10H26c-6 0-10-4-10-10V38c0-6 4-10 10-10Z"/><path class="icon-line" d="M25 66 38 54l9 8 12-16 13 20"/><circle class="icon-line" cx="63" cy="43" r="5"/>`,
  settings: `<circle class="icon-line" cx="48" cy="48" r="10"/><path class="icon-line" d="M48 20v8M48 68v8M20 48h8M68 48h8M28 28l6 6M62 62l6 6M68 28l-6 6M34 62l-6 6"/><path class="icon-line" d="M39 22 36 31l-9 3 4 8-4 8 9 3 3 9 9-4 9 4 3-9 9-3-4-8 4-8-9-3-3-9-9 4Z"/>`,
  gallery: `<path class="icon-line" d="M22 28h52c5 0 9 4 9 9v34c0 5-4 9-9 9H22c-5 0-9-4-9-9V37c0-5 4-9 9-9Z"/><path class="icon-line" d="M24 66 38 54l9 8 12-16 14 20"/><circle class="icon-line" cx="64" cy="43" r="5"/>`,
  characters: `<circle class="icon-line" cx="48" cy="39" r="14"/><path class="icon-line" d="M25 76c5-13 13-20 23-20s18 7 23 20"/><path class="icon-line" d="M42 39h.1M54 39h.1M43 47c3 2 7 2 10 0"/>`,
  worldbook: `<path class="icon-line" d="M19 28c10-4 21-1 29 7 8-8 19-11 29-7v48c-10-4-21-1-29 7-8-8-19-11-29-7Z"/><path class="icon-line" d="M48 35v48M29 47h10M29 58h8M57 47h10M57 58h8"/>`,
  wallet: `<path class="icon-line" d="M17 38h61c6 0 10 4 10 10v27c0 6-4 10-10 10H17c-6 0-10-4-10-10V48c0-6 4-10 10-10Z"/><path class="icon-line" d="M57 56h29v17H57c-5 0-8-4-8-8s3-9 8-9Z"/><circle class="icon-dot" cx="63" cy="65" r="2.8"/><path class="icon-line" d="M22 50h22"/>`,
  shop: `<path class="icon-line" d="M24 40h48l-4 39H28Z"/><path class="icon-line" d="M18 40h60l-7-16H25Z"/><path class="icon-line" d="M36 40c0-10 5-17 12-17s12 7 12 17M37 58h22"/>`,
  memo: `<path class="icon-line" d="M27 18h34l10 10v52H27Z"/><path class="icon-line" d="M61 18v12h10M36 42h24M36 54h20M36 66h14"/><path class="icon-line" d="M61 70 73 46l8 4-12 24-9 6Z"/>`,
  anniversary: `<path class="icon-line" d="M18 32h60v48H18Z"/><path class="icon-line" d="M18 46h60M31 27v11M65 27v11M30 58h10M56 58h10M30 70h36"/><path class="icon-line" d="M43 58h11v11H43Z"/>`,
  games: `<path class="icon-line" d="M19 51h58c7 0 11 5 13 13l3 12c2 8-7 13-13 8L66 74H30L16 84C10 89 1 84 3 76l3-12c2-8 6-13 13-13Z"/><path class="icon-line" d="M25 64v12M19 70h12"/><circle class="icon-line" cx="69" cy="66" r="3"/><circle class="icon-line" cx="80" cy="75" r="3"/>`,
  music: `<path class="icon-line" d="M61 23v39c0 7-5 12-12 12-6 0-10-4-10-9s4-8 10-8c4 0 7 2 9 4V29l22-5v28"/><circle class="icon-line" cx="49" cy="65" r="8"/><circle class="icon-line" cx="76" cy="53" r="7"/>`,
  dream: `<path class="icon-line" d="M67 19c-6 5-9 11-9 19 0 13 10 23 23 23h4c-6 13-19 21-34 21-20 0-36-16-36-36s16-36 36-36c6 0 12 2 16 9Z"/><path class="icon-line" d="M30 58h36c-2 11-9 18-18 18s-16-7-18-18Z"/><path class="icon-line" d="M39 63c3 3 6 3 9 0m4 0c3 3 6 3 9 0"/>`,
  'theme-center': `<path class="icon-line" d="M22 58h52v21H22Z"/><path class="icon-line" d="M30 51h36l8 11H22Z"/><path class="icon-line" d="M33 31h30v24H33Z"/><path class="icon-line" d="M39 69h18M39 42h18"/><circle class="icon-line" cx="48" cy="20" r="7"/>`
};
export function createDefaultAppIcon(app, size = 28, documentRef = document) {
  const drawing = ICON_DRAWINGS[app?.id];
  if (!drawing) return null;
  const svg = documentRef.createElementNS(SVG_NS, 'svg');
  svg.classList.add('cozy-app-icon', `cozy-app-icon-${app.id}`);
  svg.setAttribute('viewBox', '0 0 96 96');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = `<g class="icon-badge-frame" aria-hidden="true">
      <path class="badge-paper" d="M14 8h68c4 0 8 2 11 5s5 7 5 11v48c0 5-2 9-5 12s-7 4-11 4H14c-4 0-8-1-11-4s-5-7-5-12V24c0-4 2-8 5-11s7-5 11-5Z"/>
      <path class="badge-soft-half" d="M14 8h34v80H14c-4 0-8-1-11-4s-5-7-5-12V24c0-4 2-8 5-11s7-5 11-5Z"/>
      <path class="badge-gloss" d="M14 8h68c4 0 8 2 11 5s5 7 5 11v13H-2V24c0-4 2-8 5-11s7-5 11-5Z"/>
      <path class="badge-stitch" d="M21 16h54c8 0 14 6 14 14v36c0 8-6 14-14 14H21c-8 0-14-6-14-14V30c0-8 6-14 14-14Z"/>
    </g>
    <g class="icon-character">${drawing}</g>`;
  return svg;
}

export const DEFAULT_APP_ICON_IDS = Object.freeze(Object.keys(ICON_DRAWINGS));
