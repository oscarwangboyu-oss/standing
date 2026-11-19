/**
 * The few token values that are needed outside CSS: the web manifest, the theme-color meta tags
 * and the icon. They mirror src/styles/tokens.css. tests/unit/ui/theme.test.ts fails when the
 * two drift apart.
 */
export const THEME = {
  light: {
    ground: '#FAF6EE',
    surface: '#FFFFFF',
    ink: '#141A31',
    ink2: '#474E68',
    line: '#E7E0D1',
  },
  dark: {
    ground: '#0B1024',
    surface: '#182043',
    ink: '#F5F1E8',
    ink2: '#B8BED6',
    line: '#283262',
  },
} as const;

export type ThemeName = keyof typeof THEME;

/** The custom-property prefix of each sector: var(--skil), var(--skil-deep), var(--skil-tint), var(--skil-wash). */
export const SECTOR_TOKEN = { SKIL: 'skil', WLTH: 'wlth', NETW: 'netw', BODY: 'body', MIND: 'mind' } as const;
