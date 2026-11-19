/**
 * The Standing design system, "Skyline". Import from '@/ui'.
 * The specification is DESIGN.md. /styleguide shows every part in its states.
 */
export { cx } from './cx';
export * from './format';
export * from './sectors';
export * from './icons';

export { VisuallyHidden } from './VisuallyHidden';
export { Price, type PriceProps } from './Price';
export { Ticker, type TickerProps } from './Ticker';
export { Change, type ChangeProps } from './Change';
export { Tag, SectorTag, sectorStyle, type TagProps, type SectorTagProps } from './Tag';
export { Button, IconButton, type ButtonProps, type IconButtonProps } from './Button';
export { Card, type CardProps } from './Card';
export { Band, type BandProps } from './Band';
export { Rule, type RuleProps } from './Rule';
export { Note, BaselineNote, type NoteProps } from './Note';
export { Field, type FieldProps } from './Field';
export { OptionList, type Option, type OptionListProps } from './OptionList';
export { ProgressCount, type ProgressCountProps } from './ProgressCount';
export { ProgressTape, type ProgressTapeProps } from './ProgressTape';
export { Tape, TapeCode } from './Tape';
export { PositionBar, PositionScale, type PositionBarProps } from './PositionBar';
export { StatStrip, type Stat, type StatStripProps } from './StatStrip';
export { QuoteHead, type QuoteHeadProps } from './QuoteHead';
export { SectorRow, SectorBoard, type SectorRowProps, type SectorBoardProps } from './SectorRow';
export { Sheet, type SheetProps } from './Sheet';
export { BottomNav, NAV_ITEMS, type BottomNavProps, type NavId, type NavItem } from './BottomNav';
export { AppShell, Block, TopBar, Wordmark, type AppShellProps, type BlockProps } from './AppShell';
export { PublicShell, Column, type PublicShellProps } from './PublicShell';
export { Footer, type FooterProps } from './Footer';
export { Streak, type StreakDay, type StreakProps } from './Streak';
export { Toast, useToast, type ToastProps } from './Toast';
export { Useful, type UsefulAnswer, type UsefulProps } from './Useful';
export { Skeleton, SkeletonText, SkeletonQuote, type SkeletonProps } from './Skeleton';
export { TypeCard, type TypeCardProps } from './TypeCard';
export { Entry, EntryList, FeatureEntry, type EntryProps, type FeatureEntryProps } from './Entry';

export { Skyline, SkylineScene, skylineTop, skyPalette, type SkylineProps, type SkylineSize, type TowerStatus } from './skyline/Skyline';
export { SkylineCard, type SkylineCardProps } from './skyline/SkylineCard';
export { TypeEmblem, type TypeEmblemProps } from './skyline/TypeEmblem';
export { Spot, type SpotKind, type SpotProps } from './skyline/Spot';
export { SectorGlyph, type SectorGlyphProps } from './skyline/SectorGlyph';
export { SKY_PALETTES, skylineCss, type SkyPalette, type SkyTime } from './skyline/palette';
export { towerHeight, priceAtHeight, HORIZON_Y, GROUND_Y } from './skyline/geometry';

export { PriceChart, chartXs, type ChartPoint, type PriceChartProps } from './charts/PriceChart';
export { Sparkline, type SparklineProps } from './charts/Sparkline';
export { Pentagon, type PentagonProps } from './charts/Pentagon';
export { Ruler, type RulerProps } from './charts/Ruler';
export { priceDomain, sharedDomain, type Domain, type PriceDomain } from './charts/scale';

export { ShareCard, shareArt, type ShareCardProps } from './share/ShareCard';
export { SHARE_WIDTH, SHARE_HEIGHT, type ShareCardData, type ShareSector } from './share/layout';
export { renderShareCard, loadShareFonts } from './share/render';

export { useOpen, type OpenPhase, type OpenState, type UseOpenOptions } from './motion/useOpen';
export { OPEN_DELAY_MS, OPEN_DURATION_MS } from './motion/open';
