const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON_DRAWINGS = {
  chat: `
    <path class="fur" d="M17 46V27l13 9c5-4 11-6 18-6s13 2 18 6l13-9v20c0 18-13 29-31 29S17 64 17 46Z"/>
    <path class="accent" d="M59 25c-3-7 3-12 9-7l4 3 4-3c6-5 12 0 9 7-2 5-7 8-13 4-6 4-11 1-13-4Z"/>
    <circle class="face" cx="38" cy="48" r="2.7"/><circle class="face" cx="58" cy="48" r="2.7"/><path d="M44 55c2 3 6 3 8 0"/>
    <path class="blush" d="M27 56h7m28 0h7"/><path class="accent" d="M15 62c0-7 6-12 13-12h40c7 0 13 5 13 12v7c0 7-6 12-13 12H39l-12 7 2-8c-8-1-14-5-14-11Z"/>
    <path class="fur" d="M17 66c-5 2-6 8-2 11 4 4 10 1 14-2m50-9c5 2 6 8 2 11-4 4-10 1-14-2"/><circle class="face" cx="39" cy="66" r="2.7"/><circle class="face" cx="48" cy="66" r="2.7"/><circle class="face" cx="57" cy="66" r="2.7"/>`,
  moments: `
    <path class="fur" d="M18 47V29l12 8c6-5 12-7 19-7 8 0 15 3 20 8l11-8v20c0 17-13 29-31 29S18 66 18 47Z"/><circle class="soft" cx="48" cy="53" r="18"/><circle class="accent" cx="48" cy="53" r="10"/><circle class="fur" cx="48" cy="53" r="4"/>
    <path class="accent" d="M22 28c0-7 6-12 13-12h7l5 8H29c-4 0-7 3-7 7Z"/><circle class="face" cx="72" cy="34" r="3"/><path class="blush" d="M23 62l-7 3m57-3 7 3"/>`,
  settings: `
    <path class="soft" d="m48 10 7 8 10-2 3 10 10 3-2 10 8 7-7 8 2 10-10 3-3 10-10-2-7 8-8-7-10 2-3-10-10-3 2-10-8-7 7-8-2-10 10-3 3-10 10 2Z"/>
    <path class="fur" d="M28 49V34l10 7c3-2 7-3 11-3s8 1 11 3l10-7v16c0 13-9 22-21 22s-21-9-21-23Z"/><circle class="face" cx="41" cy="52" r="2.5"/><circle class="face" cx="57" cy="52" r="2.5"/><path d="M46 58c2 2 4 2 6 0"/><path class="accent" d="M42 31a7 7 0 0 1 14 0v7H42Z"/>`,
  gallery: `
    <path class="fur" d="M17 50 20 27l16 11c4-2 8-3 13-3s10 1 14 3l16-11 2 23c1 18-13 30-32 30S16 68 17 50Z"/>
    <path class="accent" d="m25 28 12 10-17-2m53-8L62 38l17-2"/><path d="m31 49 10 4m26-4-10 4M43 61c4-4 8-4 12 0"/><circle class="face" cx="39" cy="53" r="3"/><circle class="face" cx="59" cy="53" r="3"/>
    <path class="blush" d="M25 60h8m32 0h8"/><path class="fur" d="M31 69c5-7 11-8 17-2 6-6 13-5 18 2M35 69l-6 8m32-8 7 8"/><path class="accent" d="M13 20c5-7 5-11 1-15m8 16c6-5 7-9 4-13"/>`,
  characters: `
    <path class="fur" d="M14 52V31l13 9c6-6 13-9 21-9 9 0 16 3 22 9l12-9v22c0 17-14 29-34 29S14 70 14 52Z"/><path class="soft" d="M29 65c4-8 11-12 19-12s16 4 20 12c-6 6-12 9-20 9s-14-3-19-9Z"/>
    <path d="M31 50c3-4 7-4 10 0m14 0c3-4 7-4 10 0M43 59c3 4 7 4 10 0"/><path class="accent" d="M14 32c-5-6-2-13 5-13 3-7 11-7 14 0 7 0 10 7 5 13-6 6-18 6-24 0Z"/>`,
  worldbook: `
    <path class="fur" d="M15 42V25l12 8c5-4 11-6 18-6 6 0 11 2 15 5l10-7v19c0 14-11 24-26 24S15 57 15 42Z"/><circle class="face" cx="36" cy="44" r="2.5"/><circle class="face" cx="53" cy="44" r="2.5"/><path d="M41 51c2 2 5 2 7 0"/>
    <path class="accent" d="M16 62c12-5 23-3 32 5 9-8 20-10 32-5v22c-12-5-23-3-32 5-9-8-20-10-32-5Z"/><path class="fur" d="M48 67v22"/><path class="soft" d="m66 50 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>`,
  wallet: `
    <path class="fur" d="M20 45V27l12 9c5-4 11-6 17-6s12 2 17 6l11-9v20c0 15-12 26-28 26S20 62 20 45Z"/><circle class="face" cx="40" cy="48" r="2.5"/><circle class="face" cx="58" cy="48" r="2.5"/><path d="M45 55c2 2 5 2 7 0"/>
    <path class="accent" d="M13 58h70v27H13c-5 0-8-4-8-9v-9c0-5 3-9 8-9Z"/><path class="soft" d="M57 65h29v14H57c-4 0-7-3-7-7s3-7 7-7Z"/><circle class="face" cx="59" cy="72" r="2.5"/><path class="fur" d="M21 58c1-7 7-11 13-8m29 8c-1-7-7-11-13-8"/>`,
  shop: `
    <path class="accent" d="M16 38h64l-5 47H21Z"/><path class="soft" d="M12 38h72L76 20H20Z"/><path class="fur" d="M26 59V44l10 7c4-3 8-5 13-5 6 0 11 2 15 5l9-7v16c0 13-10 22-24 22S26 73 26 59Z"/><circle class="face" cx="41" cy="61" r="2.5"/><circle class="face" cx="57" cy="61" r="2.5"/><path d="M45 68c2 2 5 2 7 0M34 38c0-12 6-20 15-20s15 8 15 20"/>`,
  memo: `
    <path class="fur" d="M13 45V27l12 8c5-4 11-6 18-6s13 2 18 6l11-8v19c0 15-12 25-29 25S13 61 13 45Z"/><circle class="face" cx="35" cy="47" r="2.5"/><circle class="face" cx="52" cy="47" r="2.5"/><path d="M40 54c2 2 5 2 7 0"/>
    <path class="soft" d="M27 62h51v27H27Z"/><path d="M38 71h27M38 79h20"/><path class="accent" d="m69 68 10-24 8 4-10 24-9 7Z"/><path class="fur" d="M20 66c-5 1-7 6-4 10 3 4 8 3 12 0"/>`,
  anniversary: `
    <path class="fur" d="M18 48V30l12 8c5-4 11-6 18-6s13 2 18 6l12-8v19c0 16-12 27-30 27S18 65 18 48Z"/><circle class="face" cx="39" cy="50" r="2.5"/><circle class="face" cx="57" cy="50" r="2.5"/><path d="M44 57c2 3 6 3 8 0"/>
    <path class="accent" d="M14 66h68v20H14Z"/><path class="soft" d="M14 66h68v8H14Z"/><path d="M30 62V51m36 11V51"/><path class="accent" d="M25 28c-7-7-2-15 5-11 2-8 12-7 13 1 0 6-6 10-13 14-2-1-4-2-5-4Zm43 0c7-7 2-15-5-11-2-8-12-7-13 1 0 6 6 10 13 14 2-1 4-2 5-4Z"/>`,
  games: `
    <path class="fur" d="M19 43V26l11 8c5-4 11-6 18-6s13 2 18 6l11-8v18c0 15-12 25-29 25S19 59 19 43Z"/><circle class="face" cx="39" cy="46" r="2.5"/><circle class="face" cx="57" cy="46" r="2.5"/><path d="M44 53c2 2 6 2 8 0"/>
    <path class="accent" d="M19 59h58c7 0 12 5 14 13l2 9c2 9-8 14-14 8L68 79H28L17 89c-6 6-16 1-14-8l2-9c2-8 7-13 14-13Z"/><path class="fur" d="M22 70v12m-6-6h12"/><circle class="fur" cx="72" cy="72" r="3"/><circle class="fur" cx="80" cy="80" r="3"/>`,
  music: `
    <path class="fur" d="M13 48V29l13 9c5-5 12-7 20-7s15 2 20 7l13-9v20c0 17-13 28-33 28S13 66 13 48Z"/><path d="M31 50c3 4 7 4 10 0m12 0c3 4 7 4 10 0M42 59c3 3 6 3 9 0"/>
    <path class="accent" d="M66 20v43c0 7-5 12-12 12-6 0-10-4-10-9s4-9 10-9c3 0 5 1 7 2V28l24-6v33c0 7-5 12-12 12-6 0-10-4-10-9s4-9 10-9c3 0 5 1 7 2V17Z"/>`,
  dream: `
    <path class="soft" d="M75 13c-10 3-17 12-17 23 0 14 11 25 25 25 2 0 4 0 6-1-6 14-20 24-37 24-22 0-40-18-40-40S30 4 52 4c9 0 17 3 23 9Z"/>
    <path class="fur" d="M19 53V35l12 8c5-4 11-6 18-6s13 2 18 6l11-8v19c0 15-12 26-29 26S19 69 19 53Z"/><path d="M32 55c3 4 7 4 10 0m14 0c3 4 7 4 10 0M44 63c2 2 5 2 7 0"/><path class="accent" d="m20 22 3 7 7 3-7 3-3 7-3-7-7-3 7-3Zm27-12 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z"/>`
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
  svg.innerHTML = `<g class="icon-character">${drawing}</g>
    <g class="icon-decoration" aria-hidden="true">
      <path class="sparkle" d="m13 17 1.8 4.2L19 23l-4.2 1.8L13 29l-1.8-4.2L7 23l4.2-1.8Z"/>
      <path class="bow" d="M72 15c-7-5-12-2-10 5 1 4 5 6 10 3 5 3 9 1 10-3 2-7-3-10-10-5Z"/>
      <circle class="bell" cx="72" cy="20" r="3.2"/>
    </g>`;
  return svg;
}

export const DEFAULT_APP_ICON_IDS = Object.freeze(Object.keys(ICON_DRAWINGS));
