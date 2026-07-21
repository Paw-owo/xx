const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON_DRAWINGS = {
  chat: `
    <path class="paper" d="M21 34c0-8 7-14 15-14h25c9 0 15 6 15 14v20c0 9-7 15-16 15H47L30 80l4-12c-8-1-13-7-13-15Z"/>
    <path class="fur" d="M31 38c0-5 4-9 9-9h20c5 0 9 4 9 9v12c0 5-4 9-9 9H47l-10 7 2-8c-5-1-8-4-8-9Z"/>
    <circle class="highlight" cx="42" cy="44" r="3.4"/><circle class="highlight" cx="51" cy="44" r="3.4"/><circle class="highlight" cx="60" cy="44" r="3.4"/>
    <path class="charm" d="M63 62c5 0 9 4 9 9s-4 9-9 9-9-4-9-9 4-9 9-9Z"/><path class="line-only" d="m59 71 3 3 6-7"/>`,
  moments: `
    <path class="paper" d="M19 28h58c6 0 11 5 11 11v34c0 6-5 11-11 11H19c-6 0-11-5-11-11V39c0-6 5-11 11-11Z"/>
    <path class="fur" d="M19 67 35 52l11 9 14-18 18 24v7H19Z"/><circle class="charm" cx="66" cy="43" r="8"/>
    <path class="highlight" d="M29 37h18v10H29Z"/><path class="line-only" d="M27 76h45M25 32l4-8h38l4 8M36 24v8"/>
    <path class="sparkle" d="m78 22 1.5 3.5 3.5 1.5-3.5 1.5L78 32l-1.5-3.5L73 27l3.5-1.5Z"/>`,
  settings: `
    <path class="fur" d="m48 12 7 8 10-2 4 10 10 4-2 10 8 7-8 7 2 10-10 4-4 10-10-2-7 8-7-8-10 2-4-10-10-4 2-10-8-7 8-7-2-10 10-4 4-10 10 2Z"/>
    <circle class="paper" cx="48" cy="49" r="19"/><circle class="highlight" cx="48" cy="49" r="10"/><path class="charm" d="m48 38 3 7 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1Z"/>
    <path class="line-only" d="M48 24v5M48 69v5M73 49h-5M28 49h-5"/>`,
  gallery: `
    <path class="paper" d="M17 25h62v56H17Z"/><path class="fur" d="M25 66 39 52l10 8 14-19 9 25v7H25Z"/>
    <path class="highlight" d="M31 35h34v20H31Z"/><circle class="face" cx="43" cy="44" r="2.2"/><circle class="face" cx="53" cy="44" r="2.2"/><path class="line-only" d="M45 50c3 2 5 2 8 0"/>
    <path class="charm" d="m73 30 2 4 4 .5-3 3 1 4-4-2-4 2 1-4-3-3 4-.5Z"/>`,
  characters: `
    <path class="fur" d="M18 49V31l12 8c5-5 11-7 18-7s13 2 18 7l12-8v18c0 17-12 28-30 28S18 66 18 49Z"/>
    <path class="paper" d="M31 65c4-8 10-12 17-12s14 4 18 12c-5 6-11 9-18 9s-13-3-17-9Z"/><circle class="face" cx="40" cy="50" r="2.5"/><circle class="face" cx="56" cy="50" r="2.5"/><path class="line-only" d="M45 57c2 2 5 2 7 0"/>
    <path class="charm" d="M39 68c3 3 6 3 9 0 3 3 6 3 9 0"/><path class="sparkle" d="m75 22 1.5 3.5L80 27l-3.5 1.5L75 32l-1.5-3.5L70 27l3.5-1.5Z"/>`,
  worldbook: `
    <path class="paper" d="M14 27c12-5 24-2 34 7 10-9 22-12 34-7v52c-12-5-24-2-34 7-10-9-22-12-34-7Z"/>
    <path class="highlight" d="M48 34v52M25 46h13M25 58h10M59 46h13M59 58h10"/><path class="fur" d="M34 21h28v20H34Z"/>
    <path class="charm" d="m48 26 3 6 7 1-5 4 1 7-6-3-6 3 1-7-5-4 7-1Z"/><path class="line-only" d="M24 70c6-2 12-1 18 3m30-3c-6-2-12-1-18 3"/>`,
  wallet: `
    <path class="fur" d="M12 36h70c6 0 10 4 10 10v32c0 6-4 10-10 10H12c-6 0-10-4-10-10V46c0-6 4-10 10-10Z"/>
    <path class="paper" d="M58 54h31v18H58c-5 0-9-4-9-9s4-9 9-9Z"/><circle class="face" cx="61" cy="63" r="2.4"/>
    <path class="highlight" d="M24 35V23l9 6c4-3 9-4 15-4s11 1 15 4l9-6v13c0 11-10 19-24 19S24 47 24 35Z"/><path class="charm" d="m48 42 3-4 5 1-3 4 2 5-5-1-3 4-1-5-5-2 5-2Z"/>`,
  shop: `
    <path class="paper" d="M20 36h56l-5 49H25Z"/><path class="fur" d="M16 36h64l-8-18H24Z"/><path class="line-only" d="M34 36c0-11 5-18 14-18s14 7 14 18"/>
    <path class="highlight" d="M33 57h30c8 0 14 6 14 14s-6 14-14 14H33c-8 0-14-6-14-14s6-14 14-14Z"/><path class="charm" d="M48 65c4-7 14-3 14 4 0 7-8 11-14 16-6-5-14-9-14-16 0-7 10-11 14-4Z"/>`,
  memo: `
    <path class="paper" d="M22 14h48l10 10v60H22Z"/><path class="highlight" d="M70 14v12h10M34 39h27M34 52h23M34 65h17"/>
    <path class="fur" d="M58 72 72 42l9 5-14 30-11 7Z"/><path class="charm" d="M34 72c5-8 14-8 19 0-5 5-14 5-19 0Z"/><path class="sparkle" d="m30 25 1.5 3.5L35 30l-3.5 1.5L30 35l-1.5-3.5L25 30l3.5-1.5Z"/>`,
  anniversary: `
    <path class="paper" d="M16 32h64v52H16Z"/><path class="fur" d="M16 32h64v14H16ZM30 27v12m36-12v12"/>
    <path class="highlight" d="M30 56h12v12H30Zm24 0h12v12H54Z"/><path class="charm" d="m48 51 4 8 9 1-7 6 2 9-8-4-8 4 2-9-7-6 9-1Z"/><path class="line-only" d="M29 77h38"/>`,
  games: `
    <path class="fur" d="M17 49h62c7 0 12 5 14 13l3 14c2 10-9 16-16 8L67 74H29L16 84C9 92-2 86 0 76l3-14c2-8 7-13 14-13Z"/>
    <path class="paper" d="M24 64v12m-6-6h12"/><circle class="charm" cx="70" cy="66" r="4"/><circle class="charm" cx="81" cy="75" r="4"/><path class="highlight" d="M30 39h36v16H30Z"/><path class="sparkle" d="m49 44 2 3.5 4 .5-3 3 1 4-4-2-4 2 1-4-3-3 4-.5Z"/>`,
  music: `
    <path class="highlight" d="M18 51c0-14 11-25 25-25s25 11 25 25-11 25-25 25-25-11-25-25Z"/><path class="paper" d="M31 51c0-7 5-12 12-12s12 5 12 12-5 12-12 12-12-5-12-12Z"/>
    <path class="fur" d="M64 18v44c0 7-5 12-12 12-6 0-10-4-10-9s4-9 10-9c3 0 5 1 7 2V26l24-6v33"/><path class="charm" d="m25 31 2 4 4 .5-3 3 1 4-4-2-4 2 1-4-3-3 4-.5Z"/>`,
  dream: `
    <path class="paper" d="M74 13c-10 4-16 12-16 23 0 14 11 25 25 25 2 0 4 0 6-1-6 14-20 24-37 24-22 0-40-18-40-40S30 4 52 4c9 0 16 3 22 9Z"/>
    <path class="highlight" d="M27 56h42c0 13-9 23-21 23S27 69 27 56Z"/><path class="fur" d="M29 56c0-9 8-16 19-16s19 7 19 16"/><path class="line-only" d="M38 61c3 3 6 3 9 0m5 0c3 3 6 3 9 0"/><path class="charm" d="m76 20 2 4 4 .5-3 3 1 4-4-2-4 2 1-4-3-3 4-.5Z"/>`,
  'theme-center': `
    <path class="paper" d="M20 58h56v23H20Z"/><path class="fur" d="M28 52h40l8 12H20Z"/><path class="highlight" d="M31 31h34v25H31Z"/>
    <path class="charm" d="m48 11 5 12 13 1-10 8 3 13-11-7-11 7 3-13-10-8 13-1Z"/><path class="line-only" d="M38 70h20M37 42h22"/><circle class="face" cx="43" cy="44" r="2"/><circle class="face" cx="53" cy="44" r="2"/>`
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
