/**
 * The colours of the skyline illustration, for three times of day. One source: the CSS custom
 * properties (--k-*) are generated from these objects by skylineCss(), and the share image uses
 * the same objects as plain hex values.
 *
 * Per sector: F front face, S shaded side, L lit facet, D dark trim, W window glass.
 */
import { SECTOR_CODES, type SectorCode } from '../sectors';

export type SkyTime = 'day' | 'night' | 'dusk';

const day = {
  sky1: '#CFE2F8',
  sky2: '#DCEAFA',
  sky3: '#EAF1FA',
  sky4: '#F8EEDD',
  sun: '#FFC54D',
  halo: '#FFE7AE',
  cloud: '#FFFFFF',
  cloud2: '#E6EFFB',
  star: '#FFFFFF',
  water: '#B9D4F1',
  water2: '#E3EEFB',
  shore: '#9CBEE6',
  ground: '#EADFCB',
  ground2: '#D3C4A6',
  path: '#F7F0E1',
  tree: '#3FA06F',
  tree2: '#2C7C56',
  trunk: '#7B5B3E',
  n1: '#C2CEE6',
  n2: '#A8B7D6',
  nwin: '#DFE8F7',
  // Lit glass is a warm, saturated yellow, and the glass of each tower (W below) is a darker
  // shade of its front, so a tower with its lights on stands out by day as it does at night.
  lit: '#FFE48A',
  crane: '#F3B52F',
  flag: '#F0553A',
  pool: '#58C6F0',
  pool2: '#BDEBFB',
  wall: '#FCE6D6',
  dome: '#EFE8FB',
  stone: '#FCEBBE',
  ghost: '#B5AB95',
  ink: '#141A31',
  horizon: '#5E7FB4',
  // W, the glass of an unlit window: the front mixed 60% toward the dark trim.
  skilF: '#2E5CE6', skilS: '#1E3FA8', skilL: '#4F7AF3', skilD: '#152B76', skilW: '#1F3FA3',
  wlthF: '#E9A829', wlthS: '#BC7D12', wlthL: '#F6C655', wlthD: '#7C5008', wlthW: '#A87315',
  netwF: '#14A398', netwS: '#0C7870', netwL: '#36BEB2', netwD: '#075650', netwW: '#0C756D',
  bodyF: '#F26B4B', bodyS: '#C94A2E', bodyL: '#F98C70', bodyD: '#8C2E1A', bodyW: '#B5462E',
  mindF: '#8558E3', mindS: '#6238BD', mindL: '#A07BEF', mindD: '#42228C', mindW: '#5D38AF',
  dayOn: '1',
  nightOn: '0',
  duskOn: '0',
} as const;

export type SkyPalette = { readonly [K in keyof typeof day]: string };
export type SkyKey = keyof SkyPalette;

const night: SkyPalette = {
  sky1: '#0C1230',
  sky2: '#111840',
  sky3: '#182052',
  sky4: '#232A66',
  sun: '#F7E9B8',
  halo: '#2A3273',
  cloud: '#232C63',
  cloud2: '#1B2354',
  star: '#EDE8FF',
  water: '#0D1638',
  water2: '#2A387C',
  shore: '#18214F',
  ground: '#1B2148',
  ground2: '#111636',
  path: '#2B3366',
  tree: '#1F6E57',
  tree2: '#165141',
  trunk: '#3A2E3C',
  n1: '#1C2656',
  n2: '#151D46',
  nwin: '#2D3974',
  lit: '#FFD86B',
  crane: '#F3B52F',
  flag: '#FF7A5C',
  pool: '#3FB6EE',
  pool2: '#8ED8FA',
  wall: '#5B2B23',
  dome: '#B6A1EC',
  stone: '#E3B95A',
  ghost: '#3D4A88',
  ink: '#C9D0F0',
  horizon: '#8492DC',
  skilF: '#2A50CC', skilS: '#1B3692', skilL: '#3F69E2', skilD: '#0F1E5C', skilW: '#1A2F88',
  wlthF: '#CB8C1C', wlthS: '#96640C', wlthL: '#E2A836', wlthD: '#5A3B04', wlthW: '#8C5E0F',
  netwF: '#0F8C83', netwS: '#09645E', netwL: '#20A99E', netwD: '#053E3A', netwW: '#0A605A',
  bodyF: '#DB583B', bodyS: '#A93C25', bodyL: '#EF7759', bodyD: '#6C2011', bodyW: '#9E3723',
  mindF: '#7248CF', mindS: '#502DA2', mindL: '#8C65E2', mindD: '#31196E', mindW: '#4D2B9C',
  dayOn: '0',
  nightOn: '1',
  duskOn: '0',
};

const dusk: SkyPalette = {
  sky1: '#1A1A4F',
  sky2: '#3D2A78',
  sky3: '#8A3F86',
  sky4: '#E3697A',
  sun: '#FFD79A',
  halo: '#F6A070',
  cloud: '#5A377F',
  cloud2: '#7A4288',
  star: '#FFEBD6',
  water: '#2A2263',
  water2: '#F0906A',
  shore: '#43296F',
  ground: '#221B4D',
  ground2: '#161038',
  path: '#3A2F6E',
  tree: '#22655C',
  tree2: '#174A47',
  trunk: '#2B1F3C',
  n1: '#31266A',
  n2: '#261D56',
  nwin: '#4A3C8C',
  lit: '#FFE08A',
  crane: '#F6BD3C',
  flag: '#FF7A5C',
  pool: '#4CBEF0',
  pool2: '#9BDDFB',
  wall: '#6A3028',
  dome: '#C5B2F2',
  stone: '#F0C76A',
  ghost: '#4A3F8E',
  ink: '#F4EEE4',
  horizon: '#FFD79A',
  skilF: '#3159D8', skilS: '#1F3B9E', skilL: '#4D75EE', skilD: '#122466', skilW: '#1F3792',
  wlthF: '#E2A22B', wlthS: '#AB7110', wlthL: '#F4BE4E', wlthD: '#684304', wlthW: '#A26B0F',
  netwF: '#139A90', netwS: '#0A6E68', netwL: '#2DB7AC', netwD: '#06453F', netwW: '#0B6862',
  bodyF: '#EF6748', bodyS: '#BB452C', bodyL: '#FA876A', bodyD: '#782714', bodyW: '#AE3E28',
  mindF: '#8054DF', mindS: '#5B33B2', mindL: '#9A75EE', mindD: '#391E7E', mindW: '#5833AA',
  dayOn: '0',
  nightOn: '0',
  duskOn: '1',
};

export const SKY_PALETTES: Record<SkyTime, SkyPalette> = { day, night, dusk };

const KEYS = Object.keys(day) as SkyKey[];

/** The palette as references to the custom properties. Used for every skyline drawn in the page. */
export const SKY_VARS: SkyPalette = Object.fromEntries(KEYS.map((k) => [k, `var(--k-${k})`])) as unknown as SkyPalette;

const block = (p: SkyPalette) => KEYS.map((k) => `--k-${k}:${p[k]}`).join(';');

/**
 * The stylesheet that defines the custom properties: day by default, night under
 * prefers-color-scheme: dark, and one class per time for a skyline with a fixed time.
 * app/layout.tsx puts it in the document once.
 */
export function skylineCss(): string {
  return (
    `:root{${block(day)}}` +
    `@media (prefers-color-scheme:dark){:root{${block(night)}}}` +
    `.k-day{${block(day)}}.k-night{${block(night)}}.k-dusk{${block(dusk)}}`
  );
}

/** The five colours of one sector's tower. */
export interface TowerColors {
  F: string;
  S: string;
  L: string;
  D: string;
  W: string;
}

export function towerColors(p: SkyPalette, code: SectorCode): TowerColors {
  const k = code.toLowerCase() as 'skil' | 'wlth' | 'netw' | 'body' | 'mind';
  return { F: p[`${k}F`], S: p[`${k}S`], L: p[`${k}L`], D: p[`${k}D`], W: p[`${k}W`] };
}

export { SECTOR_CODES };
