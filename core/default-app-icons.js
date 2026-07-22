const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON_DRAWINGS = {
  chat: `
    <path class="paper" d="M23 37c0-10 8-17 19-17h13c11 0 19 7 19 17v13c0 10-8 17-19 17H44L29 77l4-12c-6-3-10-8-10-15Z"/>
    <path class="fur" d="M34 39c0-4 3-7 7-7h15c4 0 7 3 7 7v9c0 4-3 7-7 7H43l-8 6 2-7c-2-1-3-4-3-6Z"/>
    <path class="line-only" d="M42 43h14M42 50h10"/>
    <path class="charm" d="M65 61c3-4 9-2 9 3 0 4-5 7-9 11-4-4-9-7-9-11 0-5 6-7 9-3Z"/>`,
  moments: `
    <path class="paper" d="M17 30h62c6 0 10 4 10 10v34c0 6-4 10-10 10H17c-6 0-10-4-10-10V40c0-6 4-10 10-10Z"/>
    <path class="fur" d="M20 67 36 53l10 8 14-17 16 23v7H20Z"/>
    <circle class="highlight" cx="66" cy="44" r="8"/>
    <path class="line-only" d="M25 77h46M27 30l4-8h34l4 8"/>
    <path class="charm" d="m77 22 2 4 4 1-4 2-2 4-2-4-4-2 4-1Z"/>`,
  settings: `
    <path class="fur" d="m48 14 6 8 10-2 4 9 9 4-2 10 8 6-8 6 2 10-9 4-4 9-10-2-6 8-6-8-10 2-4-9-9-4 2-10-8-6 8-6-2-10 9-4 4-9 10 2Z"/>
    <circle class="paper" cx="48" cy="49" r="19"/>
    <circle class="highlight" cx="48" cy="49" r="8"/>
    <path class="line-only" d="M48 25v4M48 69v4M72 49h-4M28 49h-4"/>
    <path class="charm" d="m48 38 2 5 6 1-4 4 1 6-5-3-5 3 1-6-4-4 6-1Z"/>`,
  gallery: `
    <path class="paper" d="M18 24h60c5 0 9 4 9 9v42c0 5-4 9-9 9H18c-5 0-9-4-9-9V33c0-5 4-9 9-9Z"/>
    <path class="fur" d="M23 66 37 53l10 8 15-18 12 23v8H23Z"/>
    <path class="highlight" d="M29 35h30v18H29Z"/>
    <path class="line-only" d="M31 76h37M38 44h12"/>
    <circle class="charm" cx="67" cy="42" r="7"/>`,
  characters: `
    <path class="fur" d="M20 49V32l11 8c5-5 11-7 17-7s12 2 17 7l11-8v17c0 17-11 28-28 28S20 66 20 49Z"/>
    <path class="paper" d="M32 65c4-8 10-12 16-12s12 4 16 12c-4 6-10 9-16 9s-12-3-16-9Z"/>
    <circle class="face" cx="41" cy="50" r="2.4"/><circle class="face" cx="55" cy="50" r="2.4"/>
    <path class="line-only" d="M45 57c2 2 4 2 6 0"/>
    <path class="charm" d="M39 68c3 3 6 3 9 0 3 3 6 3 9 0"/>`,
  worldbook: `
    <path class="paper" d="M15 27c12-5 23-2 33 7 10-9 21-12 33-7v51c-12-5-23-2-33 7-10-9-21-12-33-7Z"/>
    <path class="line-only" d="M48 34v51M25 47h13M25 58h10M58 47h13M58 58h10"/>
    <path class="fur" d="M35 22h26v18H35Z"/>
    <path class="charm" d="m48 26 3 6 7 1-5 4 1 7-6-3-6 3 1-7-5-4 7-1Z"/>`,
  wallet: `
    <path class="fur" d="M13 36h69c6 0 10 4 10 10v31c0 6-4 10-10 10H13c-6 0-10-4-10-10V46c0-6 4-10 10-10Z"/>
    <path class="paper" d="M58 54h31v18H58c-5 0-9-4-9-9s4-9 9-9Z"/>
    <circle class="face" cx="62" cy="63" r="2.5"/>
    <path class="highlight" d="M26 35V24l8 6c4-3 9-4 14-4s10 1 14 4l8-6v11c0 11-9 19-22 19s-22-8-22-19Z"/>
    <path class="charm" d="M43 42h10M48 37v10"/>`,
  shop: `
    <path class="paper" d="M21 37h54l-5 47H26Z"/>
    <path class="fur" d="M16 37h64l-8-18H24Z"/>
    <path class="line-only" d="M34 37c0-11 5-18 14-18s14 7 14 18"/>
    <path class="highlight" d="M34 58h28c8 0 14 6 14 14s-6 14-14 14H34c-8 0-14-6-14-14s6-14 14-14Z"/>
    <path class="charm" d="M48 66c4-7 13-3 13 4 0 6-7 10-13 15-6-5-13-9-13-15 0-7 9-11 13-4Z"/>`,
  memo: `
    <path class="paper" d="M23 14h46l10 10v59H23Z"/>
    <path class="line-only" d="M69 14v12h10M34 39h27M34 52h23M34 65h16"/>
    <path class="fur" d="M58 72 72 43l9 5-14 29-11 7Z"/>
    <path class="highlight" d="M34 72c5-7 14-7 19 0-5 5-14 5-19 0Z"/>
    <path class="charm" d="m30 25 2 4 4 1-4 2-2 4-2-4-4-2 4-1Z"/>`,
  anniversary: `
    <path class="paper" d="M16 32h64v52H16Z"/>
    <path class="fur" d="M16 32h64v14H16ZM30 27v12m36-12v12"/>
    <path class="line-only" d="M29 57h10M57 57h10M29 72h38"/>
    <path class="highlight" d="M30 56h12v12H30Zm24 0h12v12H54Z"/>
    <path class="charm" d="M48 52c4-7 13-3 13 4 0 6-7 10-13 15-6-5-13-9-13-15 0-7 9-11 13-4Z"/>`,
  games: `
    <path class="fur" d="M17 49h62c7 0 12 5 14 13l3 14c2 10-9 16-16 8L67 74H29L16 84C9 92-2 86 0 76l3-14c2-8 7-13 14-13Z"/>
    <path class="paper" d="M24 64v12m-6-6h12"/>
    <circle class="charm" cx="70" cy="66" r="4"/><circle class="charm" cx="81" cy="75" r="4"/>
    <path class="highlight" d="M31 39h34v15H31Z"/>
    <path class="line-only" d="M39 45h18"/>`,
  music: `
    <path class="highlight" d="M19 51c0-14 11-25 25-25s25 11 25 25-11 25-25 25-25-11-25-25Z"/>
    <path class="paper" d="M32 51c0-7 5-12 12-12s12 5 12 12-5 12-12 12-12-5-12-12Z"/>
    <path class="fur" d="M64 19v43c0 7-5 12-12 12-6 0-10-4-10-9s4-9 10-9c3 0 5 1 7 2V27l24-6v32"/>
    <path class="charm" d="m25 31 2 4 4 1-4 2-2 4-2-4-4-2 4-1Z"/>`,
  dream: `
    <path class="paper" d="M73 13c-10 4-16 12-16 23 0 14 11 25 25 25 2 0 4 0 6-1-6 14-20 24-37 24-22 0-40-18-40-40S29 4 51 4c9 0 16 3 22 9Z"/>
    <path class="highlight" d="M27 56h42c0 13-9 23-21 23S27 69 27 56Z"/>
    <path class="fur" d="M29 56c0-9 8-16 19-16s19 7 19 16"/>
    <path class="line-only" d="M38 61c3 3 6 3 9 0m5 0c3 3 6 3 9 0"/>
    <path class="charm" d="m76 20 2 4 4 1-4 2-2 4-2-4-4-2 4-1Z"/>`,
  'theme-center': `
    <path class="paper" d="M20 58h56v23H20Z"/>
    <path class="fur" d="M28 52h40l8 12H20Z"/>
    <path class="highlight" d="M31 31h34v25H31Z"/>
    <path class="charm" d="m48 12 5 11 12 1-9 8 3 12-11-7-11 7 3-12-9-8 12-1Z"/>
    <path class="line-only" d="M38 70h20M37 42h22"/>
    <circle class="face" cx="43" cy="44" r="2"/><circle class="face" cx="53" cy="44" r="2"/>`
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
  const showTinyDecoration = Number(size || 0) > 32;
  svg.innerHTML = `<g class="icon-badge-frame" aria-hidden="true">
      <path class="badge-paper" d="M16 22c0-4 4-7 8-6 1-5 7-8 12-5 3-5 10-5 13 0 5-3 11 0 12 5 5-1 9 2 9 6 5 1 8 7 5 12 5 3 5 10 0 13 3 5 0 11-5 12 1 5-3 9-8 9-1 5-7 8-12 5-3 5-10 5-13 0-5 3-11 0-12-5-5 1-9-3-8-8-5-1-8-7-5-12-5-3-5-10 0-13-3-5 0-11 5-12Z"/>
      <path class="badge-stitch" d="M23 27c3-5 8-7 13-5 4-5 12-5 16 0 6-2 12 1 14 7 5 3 7 9 4 15 3 6 1 12-4 15-2 6-8 9-14 7-4 5-12 5-16 0-6 2-12-1-14-7-5-3-7-9-4-15-3-6-1-12 5-17Z"/>
      <circle class="cookie-dot" cx="25" cy="31" r="2"/><circle class="cookie-dot" cx="70" cy="34" r="2"/><circle class="cookie-dot" cx="27" cy="62" r="2"/>
    </g>
    <g class="icon-character">${drawing}</g>
    ${showTinyDecoration ? `<g class="icon-decoration" aria-hidden="true">
      <path class="sparkle" d="m13 17 1.8 4.2L19 23l-4.2 1.8L13 29l-1.8-4.2L7 23l4.2-1.8Z"/>
      <circle class="cookie-dot" cx="74" cy="20" r="3"/>
    </g>` : ''}`;
  return svg;
}

export const DEFAULT_APP_ICON_IDS = Object.freeze(Object.keys(ICON_DRAWINGS));
