const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON_DRAWINGS = {
  chat: `
    <path class="soft" d="M18 34c0-7 6-13 13-13h34c8 0 13 6 13 13v23c0 8-6 14-14 14H43L25 82l4-12c-7-1-11-7-11-14Z"/>
    <path class="accent" d="M30 38h36M30 50h25"/><circle class="fur" cx="65" cy="67" r="13"/><circle class="face" cx="60" cy="64" r="2"/><circle class="face" cx="69" cy="64" r="2"/><path d="M62 70c3 2 5 2 7 0"/>`,
  moments: `
    <path class="soft" d="M19 24h58c6 0 11 5 11 11v43c0 6-5 11-11 11H19c-6 0-11-5-11-11V35c0-6 5-11 11-11Z"/>
    <path class="accent" d="M17 72 34 54l12 10 14-18 19 26"/><circle class="fur" cx="62" cy="43" r="9"/><circle class="face" cx="59" cy="42" r="1.8"/><circle class="face" cx="65" cy="42" r="1.8"/><path d="M60 47c2 1 4 1 6 0"/>`,
  settings: `
    <path class="accent" d="m48 12 7 8 10-2 4 10 10 4-2 10 8 7-8 7 2 10-10 4-4 10-10-2-7 8-7-8-10 2-4-10-10-4 2-10-8-7 8-7-2-10 10-4 4-10 10 2Z"/>
    <circle class="soft" cx="48" cy="49" r="18"/><circle class="fur" cx="48" cy="49" r="8"/><circle class="face" cx="45" cy="48" r="1.8"/><circle class="face" cx="51" cy="48" r="1.8"/>`,
  gallery: `
    <path class="soft" d="M17 25h62v56H17Z"/><path class="accent" d="M25 67 40 51l11 9 14-18 9 25"/>
    <path class="fur" d="M32 35h32v20H32Z"/><circle class="face" cx="43" cy="44" r="2"/><circle class="face" cx="53" cy="44" r="2"/><path d="M45 50c3 2 5 2 8 0"/>`,
  characters: `
    <path class="fur" d="M18 49V31l12 8c5-5 11-7 18-7s13 2 18 7l12-8v19c0 16-12 27-30 27S18 66 18 49Z"/>
    <path class="soft" d="M31 66c4-8 10-12 17-12s14 4 18 12c-5 5-11 8-18 8s-13-3-17-8Z"/><circle class="face" cx="40" cy="50" r="2.4"/><circle class="face" cx="56" cy="50" r="2.4"/><path d="M45 57c2 2 5 2 7 0"/>`,
  worldbook: `
    <path class="soft" d="M14 28c12-5 24-2 34 7 10-9 22-12 34-7v52c-12-5-24-2-34 7-10-9-22-12-34-7Z"/>
    <path class="accent" d="M48 35v52M25 47h13M25 59h10M59 47h13M59 59h10"/><path class="fur" d="M34 22h28v20H34Z"/><circle class="face" cx="43" cy="31" r="2"/><circle class="face" cx="53" cy="31" r="2"/>`,
  wallet: `
    <path class="accent" d="M12 36h70c6 0 10 4 10 10v32c0 6-4 10-10 10H12c-6 0-10-4-10-10V46c0-6 4-10 10-10Z"/>
    <path class="soft" d="M58 54h31v18H58c-5 0-9-4-9-9s4-9 9-9Z"/><circle class="face" cx="61" cy="63" r="2.4"/><path class="fur" d="M24 35V23l9 6c4-3 9-4 15-4s11 1 15 4l9-6v13c0 11-10 19-24 19S24 47 24 35Z"/>`,
  shop: `
    <path class="soft" d="M20 36h56l-5 49H25Z"/><path class="accent" d="M16 36h64l-8-18H24Z"/><path d="M34 36c0-11 5-18 14-18s14 7 14 18"/>
    <path class="fur" d="M35 56h26c8 0 14 6 14 14s-6 14-14 14H35c-8 0-14-6-14-14s6-14 14-14Z"/><circle class="face" cx="42" cy="69" r="2"/><circle class="face" cx="54" cy="69" r="2"/>`,
  memo: `
    <path class="soft" d="M22 14h48l10 10v60H22Z"/><path class="accent" d="M70 14v12h10M34 40h28M34 53h24M34 66h18"/>
    <path class="fur" d="M59 71 72 43l9 5-13 28-11 8Z"/><circle class="face" cx="65" cy="64" r="2"/>`,
  anniversary: `
    <path class="soft" d="M16 32h64v52H16Z"/><path class="accent" d="M16 32h64v14H16ZM30 27v12m36-12v12"/>
    <path class="fur" d="M34 58h28v18H34Z"/><path d="M41 65h14"/><path class="accent" d="m48 52 4 8 9 1-7 6 2 9-8-4-8 4 2-9-7-6 9-1Z"/>`,
  games: `
    <path class="accent" d="M17 49h62c7 0 12 5 14 13l3 14c2 10-9 16-16 8L67 74H29L16 84C9 92-2 86 0 76l3-14c2-8 7-13 14-13Z"/>
    <path class="soft" d="M24 64v12m-6-6h12"/><circle class="fur" cx="70" cy="66" r="4"/><circle class="fur" cx="81" cy="75" r="4"/><path class="fur" d="M29 39h38v16H29Z"/>`,
  music: `
    <path class="fur" d="M18 51c0-14 11-25 25-25s25 11 25 25-11 25-25 25-25-11-25-25Z"/><path class="soft" d="M31 51c0-7 5-12 12-12s12 5 12 12-5 12-12 12-12-5-12-12Z"/>
    <path class="accent" d="M64 18v44c0 7-5 12-12 12-6 0-10-4-10-9s4-9 10-9c3 0 5 1 7 2V26l24-6v33"/>`,
  dream: `
    <path class="soft" d="M74 13c-10 4-16 12-16 23 0 14 11 25 25 25 2 0 4 0 6-1-6 14-20 24-37 24-22 0-40-18-40-40S30 4 52 4c9 0 16 3 22 9Z"/>
    <path class="fur" d="M27 56h42c0 13-9 23-21 23S27 69 27 56Z"/><path class="accent" d="M29 56c0-9 8-16 19-16s19 7 19 16"/><path d="M38 61c3 3 6 3 9 0m5 0c3 3 6 3 9 0"/>`,
  'theme-center': `
    <path class="soft" d="M20 58h56v23H20Z"/><path class="accent" d="M28 52h40l8 12H20Z"/>
    <path class="fur" d="M31 31h34v25H31Z"/><path class="accent" d="m48 11 5 12 13 1-10 8 3 13-11-7-11 7 3-13-10-8 13-1Z"/><circle class="face" cx="43" cy="44" r="2"/><circle class="face" cx="53" cy="44" r="2"/>`
};


const SWEET_APP_DRAWINGS = ICON_DRAWINGS;
export function createDefaultAppIcon(app, size = 28, documentRef = document) {
  const drawing = SWEET_APP_DRAWINGS[app?.id] || ICON_DRAWINGS[app?.id];
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
