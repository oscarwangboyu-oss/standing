import type { Metadata } from 'next';
import type { CSSProperties, ReactNode } from 'react';
import { TYPES } from '@/copy/types';
import {
  Band,
  BaselineNote,
  BottomNav,
  Button,
  Card,
  Change,
  Entry,
  EntryList,
  FeatureEntry,
  Footer,
  IconArrowRight,
  IconButton,
  IconCalendar,
  IconCare,
  IconCheck,
  IconChevron,
  IconClose,
  IconCompare,
  IconDownload,
  IconInfo,
  IconLink,
  IconLog,
  IconMarket,
  IconOpen,
  IconPayday,
  IconPeople,
  IconRetake,
  IconSettings,
  IconShare,
  IconWin,
  Mark,
  Note,
  Pentagon,
  PositionBar,
  PositionScale,
  Price,
  PriceChart,
  ProgressCount,
  ProgressTape,
  QuoteHead,
  Ruler,
  SECTOR_CODES,
  SectorBoard,
  SectorGlyph,
  SectorRow,
  SectorTag,
  ShareCard,
  Skeleton,
  SkeletonQuote,
  SkeletonText,
  Skyline,
  SkylineCard,
  Sparkline,
  Spot,
  StatStrip,
  Streak,
  Tag,
  Tape,
  TapeCode,
  Ticker,
  Toast,
  TypeCard,
  TypeEmblem,
  sectorStyle,
  type SectorCode,
} from '@/ui';
import { CompareScreen, MarketScreen, QuestionScreen, ResultScreen, ShareScreen } from './compositions';
import { changes, daily, history, mindNoticeText, prices, sample, sectorHistory, share, week } from './data';
import { FieldDemo, OptionDemo, SheetDemo, ToastDemo, UsefulDemo } from './demos';
import styles from './styleguide.module.css';

export const metadata: Metadata = { title: 'Styleguide', robots: { index: false } };

function Section({ id, title, lead, children }: { id: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="t-h1">
        {title}
      </h2>
      {lead && <p className={styles.lead}>{lead}</p>}
      <div className={styles.body}>{children}</div>
    </section>
  );
}

function Item({ name, note, children, wide = false }: { name: string; note?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? styles.itemWide : styles.item}>
      <div className={styles.itemHead}>
        <h3 className={styles.itemName}>{name}</h3>
        {note && <p className={styles.itemNote}>{note}</p>}
      </div>
      {children}
    </div>
  );
}

function Swatch({ token, label }: { token: string; label?: string }) {
  return (
    <div className={styles.swatch}>
      <span className={styles.chip} style={{ background: `var(${token})` }} />
      <span className={styles.swatchName}>{label ?? token.replace('--', '')}</span>
    </div>
  );
}

function Shot({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className={styles.shot} aria-label={title}>
      <p className={styles.shotTitle}>{title}</p>
      <div className={styles.shotFrame} data-shot={id}>
        {children}
      </div>
    </section>
  );
}

const ICONS: Array<[string, ReactNode]> = [
  ['Market', <IconMarket key="i" />],
  ['Open', <IconOpen key="i" />],
  ['Log', <IconLog key="i" />],
  ['Settings', <IconSettings key="i" />],
  ['Payday', <IconPayday key="i" />],
  ['Win', <IconWin key="i" />],
  ['People', <IconPeople key="i" />],
  ['Retake', <IconRetake key="i" />],
  ['Share', <IconShare key="i" />],
  ['Download', <IconDownload key="i" />],
  ['Link', <IconLink key="i" />],
  ['Compare', <IconCompare key="i" />],
  ['Calendar', <IconCalendar key="i" />],
  ['Info', <IconInfo key="i" />],
  ['Care', <IconCare key="i" />],
  ['Check', <IconCheck key="i" />],
  ['Close', <IconClose key="i" />],
  ['Chevron', <IconChevron key="i" />],
  ['Arrow', <IconArrowRight key="i" />],
];

const NEUTRALS = ['--ground', '--ground-2', '--surface', '--surface-2', '--line', '--line-2', '--ink-3', '--ink-2', '--ink'];

export default function Styleguide() {
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroText}>
          <p className={styles.kicker}>
            <Mark size={22} /> Standing design system
          </p>
          <h1 className="t-display">Skyline</h1>
          <p className="t-lead">Where you stand, drawn as your own city. Five towers, one per sector. The horizon is 100.</p>
        </div>
        <Skyline className={styles.heroSky} prices={prices} size="hero" rise framed />
      </header>

      <nav className={styles.toc} aria-label="Sections">
        {[
          ['#colour', 'Colour'],
          ['#type', 'Type'],
          ['#skyline', 'Skyline'],
          ['#types', 'Types'],
          ['#primitives', 'Primitives'],
          ['#charts', 'Charts'],
          ['#screens', 'Screens'],
        ].map(([href, label]) => (
          <a key={href} href={href}>
            {label}
          </a>
        ))}
      </nav>

      <Section id="colour" title="Colour" lead="A warm ground by day, a deep blue-black by night. Each sector owns a hue with four steps. Green and red are kept for gains and losses, and only ever appear in a pill with an arrow and a sign.">
        <Item name="Neutrals" wide>
          <div className={styles.swatches}>
            {NEUTRALS.map((t) => (
              <Swatch key={t} token={t} />
            ))}
          </div>
        </Item>
        <Item name="Sector ramps" note="deep for text, base for fills and charts, tint, wash" wide>
          <div className={styles.ramps}>
            {SECTOR_CODES.map((code) => {
              const k = code.toLowerCase();
              return (
                <div key={code} className={styles.ramp}>
                  <SectorTag code={code} name />
                  <div className={styles.rampRow}>
                    <Swatch token={`--${k}-deep`} label="deep" />
                    <Swatch token={`--${k}`} label="base" />
                    <Swatch token={`--${k}-tint`} label="tint" />
                    <Swatch token={`--${k}-wash`} label="wash" />
                  </div>
                </div>
              );
            })}
          </div>
        </Item>
        <Item name="Gain and loss next to the sectors" note="Shape and lightness keep them apart from coral and teal" wide>
          <div className={styles.row}>
            <Change value={3.1} pct={2.95} />
            <SectorTag code="NETW" name />
            <Change value={-0.75} pct={-0.77} />
            <SectorTag code="BODY" name />
            <Change value={0} />
          </div>
        </Item>
      </Section>

      <Section id="type" title="Type" lead="Bricolage Grotesque for headings, tickers and every price. Hanken Grotesk for text. Both are served from this site.">
        <Item name="Display" wide>
          <p className="t-display">Where do you stand today</p>
        </Item>
        <Item name="Roles" wide>
          <div className={styles.typeRoles}>
            <p className="t-h1">Heading of a screen</p>
            <p className="t-h2">Heading of a section</p>
            <p className="t-h3">Heading of a card</p>
            <p className="t-lead">A lead paragraph says what the page is in one or two sentences.</p>
            <p className="t-body">Body text is 17px. 100 is the median of people in the same age band and situation, and 15 points is one standard deviation.</p>
            <p className="t-small">Small text, for a second line under a title.</p>
            <p className="t-caption">Caption, for axis labels and footnotes.</p>
          </div>
        </Item>
        <Item name="Prices" note="Tabular lining figures, always two decimals" wide>
          <div className={styles.prices}>
            <Price value={104.37} size="hero" />
            <Price value={111.2} size="xl" />
            <Price value={96.85} size="lg" />
            <Price value={108.1} size="md" />
            <Price value={102.3} size="sm" />
          </div>
        </Item>
      </Section>

      <Section id="skyline" title="Skyline" lead="One scale everywhere: the street is the base, one floor is five points, and the horizon is 100. A tower's roof line is its price. Cranes, domes and flags stand above the roof line.">
        <Item name="Card, in the theme of the page" note="size card">
          <SkylineCard prices={prices} />
        </Item>
        <Item name="Dusk" note="time dusk, the share image">
          <Skyline prices={prices} time="dusk" lit={{ SKIL: true, WLTH: true, NETW: true, BODY: true, MIND: true }} />
        </Item>
        <Item name="Day" note="time day">
          <Skyline prices={prices} time="day" />
        </Item>
        <Item name="Night" note="time night. Lit: BODY and MIND were updated today">
          <Skyline prices={prices} time="night" lit={{ SKIL: false, WLTH: false, NETW: false, BODY: true, MIND: true }} />
        </Item>
        <Item name="The whole range" note="55, 70, 100, 130, 145: a short tower is still a complete building">
          <Skyline prices={{ SKIL: 55, WLTH: 70, NETW: 100, BODY: 130, MIND: 145 }} />
        </Item>
        <Item name="Statuses" note="not listed, not enough data, listed, halted, listed">
          <Skyline prices={{ SKIL: null, WLTH: null, NETW: 103.4, BODY: 108.1, MIND: 102.3 }} status={{ SKIL: 'unlisted', WLTH: 'insufficient', BODY: 'halted' }} />
        </Item>
        <Item name="The check, under construction" note="build: floors per answered question. The pin marks the current sector">
          <Skyline prices={{}} build={{ SKIL: { built: 18, total: 18 }, WLTH: { built: 4, total: 6 }, NETW: { built: 0, total: 6 }, BODY: { built: 0, total: 5 }, MIND: { built: 0, total: 6 } }} active="WLTH" />
        </Item>
        <Item name="Small" note="size small, 120 to 240px wide">
          <div className={styles.row}>
            <div style={{ width: 220 }}>
              <Skyline prices={prices} size="small" />
            </div>
            <div style={{ width: 140 }}>
              <Skyline prices={{ SKIL: 92, WLTH: 118, NETW: 104, BODY: 97, MIND: 110 }} size="small" seed={3} />
            </div>
          </div>
        </Item>
        <Item name="Glyph" note="size glyph at 96, 64 and 48px">
          <div className={styles.row}>
            {[96, 64, 48].map((w) => (
              <div key={w} style={{ width: w }}>
                <Skyline prices={prices} size="glyph" label="" />
              </div>
            ))}
            <div className={styles.row}>
              {SECTOR_CODES.map((code) => (
                <span key={code} style={{ color: `var(--${code.toLowerCase()})` }}>
                  <SectorGlyph code={code} size={28} />
                </span>
              ))}
            </div>
          </div>
        </Item>
        <Item name="Spots" note="Empty states: lot, building, halted, sunrise">
          <div className={styles.row}>
            <Spot kind="lot" size={132} />
            <Spot kind="building" size={132} />
            <Spot kind="halted" size={132} />
            <Spot kind="sunrise" size={132} />
          </div>
        </Item>
      </Section>

      <Section id="types" title="Types" lead="A type is the pair of the two highest sectors. Ten pairs, ten names. The names live in src/copy/types.ts.">
        <Item name="Type card" wide>
          <div className={styles.typeFull}>
            <TypeCard pair={sample.pair} />
          </div>
        </Item>
        <Item name="All ten" wide>
          <div className={styles.typeGrid}>
            {TYPES.map((t) => (
              <div key={t.name} className={styles.typeCell}>
                <TypeEmblem pair={t.pair as [SectorCode, SectorCode]} size={72} />
                <div>
                  <p className={styles.typeName}>{t.name}</p>
                  <p className={styles.typeLine}>{t.line}</p>
                </div>
              </div>
            ))}
          </div>
        </Item>
      </Section>

      <Section id="primitives" title="Primitives">
        <Item name="Button" note="primary, secondary, quiet. lg 56, md 48, sm 44">
          <div className={styles.stack}>
            <div className={styles.row}>
              <Button size="lg" iconEnd={<IconArrowRight size={20} />}>
                Start the check
              </Button>
              <Button size="lg" variant="secondary">
                See a sample
              </Button>
            </div>
            <div className={styles.row}>
              <Button>Save</Button>
              <Button variant="secondary" icon={<IconShare size={18} />}>
                Share
              </Button>
              <Button variant="quiet">Skip this question</Button>
            </div>
            <div className={styles.row}>
              <Button size="sm">Open today</Button>
              <Button size="sm" variant="secondary">
                Add to calendar
              </Button>
              <Button disabled>Unavailable</Button>
            </div>
          </div>
        </Item>
        <Item name="Icon button and icons" note="One family: 24 grid, 1.8 stroke, round caps">
          <div className={styles.stack}>
            <div className={styles.row}>
              <IconButton label="Close">
                <IconClose />
              </IconButton>
              <IconButton label="Share" variant="filled">
                <IconShare />
              </IconButton>
              <IconButton label="Settings" variant="filled">
                <IconSettings />
              </IconButton>
            </div>
            <ul className={styles.icons}>
              {ICONS.map(([name, icon]) => (
                <li key={name}>
                  {icon}
                  <span>{name}</span>
                </li>
              ))}
            </ul>
          </div>
        </Item>
        <Item name="Change" note="A pill with an arrow, a sign and a hidden word">
          <div className={styles.row}>
            <Change value={1.12} pct={1.08} size="lg" />
            <Change value={-0.75} pct={-0.77} size="lg" />
            <Change value={2.4} />
            <Change value={-0.75} />
            <Change value={0} />
            <Change value={3.1} size="sm" />
            <Change value={-1.2} size="sm" />
          </div>
        </Item>
        <Item name="Ticker, sector tag, tag">
          <div className={styles.stack}>
            <div className={styles.row}>
              <Ticker variant="chip" size="lg">
                RIVR
              </Ticker>
              <Ticker variant="chip">RIVR</Ticker>
              <Ticker>RIVR</Ticker>
            </div>
            <div className={styles.row}>
              {SECTOR_CODES.map((code) => (
                <SectorTag key={code} code={code} />
              ))}
            </div>
            <div className={styles.row}>
              {SECTOR_CODES.map((code) => (
                <SectorTag key={code} code={code} name size="sm" />
              ))}
            </div>
            <div className={styles.row}>
              <Tag kind="leader" />
              <Tag kind="laggard" />
              <Tag kind="limit_up" />
              <Tag kind="limit_down" />
              <Tag kind="halted" />
              <Tag kind="resumed" />
              <Tag kind="sample" />
            </div>
          </div>
        </Item>
        <Item name="Card" note="raised, flat, sunk, sector">
          <div className={styles.cards}>
            <Card>Raised</Card>
            <Card variant="flat">Flat</Card>
            <Card variant="sunk">Sunk</Card>
            <Card sector="NETW">Sector wash</Card>
          </div>
        </Item>
        <Item name="Note" note="info, care (the mind notice), plain, and the baseline note">
          <div className={styles.stack}>
            <BaselineNote />
            <Note tone="care" title="A note about your answers">
              <p>{mindNoticeText}</p>
            </Note>
            <Note title="3 answers counted at lower weight">
              <p>They were answered in under a second. This moved the price 0.42 points toward 100. At full weight it would be 104.79.</p>
            </Note>
          </div>
        </Item>
        <Item name="Option list" note="A radio group. Arrows move, Enter or Space chooses">
          <OptionDemo />
        </Item>
        <Item name="Field" note="Text, number with affixes, error">
          <FieldDemo />
        </Item>
        <Item name="Progress" note="The count for the check, the tape for a short flow">
          <div className={styles.stack}>
            <ProgressCount current={33} total={42} sector="BODY" inSector={{ current: 3, total: 5 }} />
            <div style={sectorStyle('MIND')}>
              <ProgressTape total={3} current={2} />
            </div>
          </div>
        </Item>
        <Item name="Position bar" note="70 to 130, the tick is 100">
          <div className={styles.stack}>
            {SECTOR_CODES.map((code) => (
              <div key={code} style={sectorStyle(code)}>
                <PositionBar value={prices[code]} />
              </div>
            ))}
            <PositionScale />
          </div>
        </Item>
        <Item name="Quote head" note="With a change, and the first record">
          <div className={styles.stack}>
            <QuoteHead as="div" ticker={sample.ticker} cohort={sample.cohort} price={sample.price} change={sample.change} />
            <QuoteHead as="div" ticker="NOVA" cohort="Ages 25 to 29, freelance" price={100} change={null} />
          </div>
        </Item>
        <Item name="Stat strip">
          <StatStrip
            stats={[
              { label: 'Issue price', value: '100.00' },
              { label: 'All-time high', value: '105.90' },
              { label: 'All-time low', value: '98.20' },
              { label: 'Data grade', value: 'A' },
            ]}
          />
        </Item>
        <Item name="Sector rows" note="Listed with tags, halted, not enough data, not listed">
          <Card>
            <SectorBoard label="Sector rows in every state">
              <SectorRow code="SKIL" price={111.2} change={2.4} tag="leader" history={sectorHistory.SKIL} />
              <SectorRow code="WLTH" price={96.85} change={-0.75} tag="limit_down" history={sectorHistory.WLTH} />
              <SectorRow code="NETW" price={103.4} change={0} history={sectorHistory.NETW} />
              <SectorRow code="BODY" price={108.1} status="halted" history={sectorHistory.BODY}>
                No Daily Open for 14 days. Record today to resume.
              </SectorRow>
              <SectorRow code="MIND" price={null} status="unlisted" />
            </SectorBoard>
          </Card>
        </Item>
        <Item name="Market comment">
          <Tape>
            <TapeCode code="SKIL" /> leads at 111.20. <TapeCode code="BODY" /> is the top gainer, <Change value={3.1} size="sm" />.
          </Tape>
        </Item>
        <Item name="Streak" note="Seven windows, lit when the day was recorded">
          <Streak days={week} count={6} />
        </Item>
        <Item name="Entries" note="One feature per screen, the rest as rows">
          <div className={styles.stack}>
            <FeatureEntry href="/open" sector="BODY" eyebrow="Daily Open" title="Open today" detail="Three questions. About 15 seconds." action="Open today" art={<Spot kind="sunrise" size={132} />} />
            <Card pad="none">
              <EntryList label="Entries">
                <Entry href="/payday" sector="WLTH" icon={<IconPayday />} title="Payday Check" detail="Amounts stay on this device." status="Nov 28" />
                <Entry href="/settings" icon={<IconSettings />} title="Settings" />
              </EntryList>
            </Card>
          </div>
        </Item>
        <Item name="Sheet, toast, useful">
          <div className={styles.stack}>
            <div className={styles.row}>
              <SheetDemo />
              <ToastDemo />
            </div>
            <Toast embedded>Image saved</Toast>
            <UsefulDemo />
          </div>
        </Item>
        <Item name="Skeleton" note="Still blocks, no shimmer">
          <div className={styles.stack}>
            <SkeletonQuote />
            <SkeletonText lines={3} />
            <Skeleton width={120} height={44} radius={999} />
          </div>
        </Item>
        <Item name="Bottom navigation" note="A dock on a phone, links in the top bar from 960px">
          <div className={styles.navDemo}>
            <BottomNav current="market" className={styles.navStatic} />
          </div>
        </Item>
        <Item name="Empty state">
          <Card className={styles.empty}>
            <Spot kind="lot" />
            <p className="t-h3">No one to compare with yet</p>
            <p className="t-small">Send your invite link. When a friend finishes the check, the two skylines show up here.</p>
            <Button variant="secondary" icon={<IconLink size={18} />}>
              Copy invite link
            </Button>
          </Card>
        </Item>
      </Section>

      <Band tone="MIND">
        <div className={styles.bandDemo}>
          <h2 className="t-h1">Band</h2>
          <p className="t-lead">A tinted section. Its top edge is a skyline silhouette, so a page reads as one city from top to bottom.</p>
        </div>
      </Band>
      <Band tone="WLTH">
        <div className={styles.bandDemo}>
          <p className="t-h3">Bands follow each other without a gap.</p>
        </div>
      </Band>
      <Band tone="ink">
        <div className={styles.bandDemo}>
          <p className="t-h3">The ink band closes a public page.</p>
        </div>
      </Band>

      <Section id="charts" title="Charts" lead="Hand-written SVG. The 100 line is always drawn.">
        <Item name="Price chart" note="Eight records">
          <Card>
            <PriceChart points={history} />
          </Card>
        </Item>
        <Item name="Price chart, daily" note="Spaced by day, with full-check rings and a version marker">
          <Card>
            <PriceChart points={daily} spacing="day" />
          </Card>
        </Item>
        <Item name="Sector chart" note="A chart inside a sector takes its colour">
          <Card style={sectorStyle('BODY') as CSSProperties}>
            <PriceChart points={history.map((p, i) => ({ date: p.date, value: sectorHistory.BODY[i] as number }))} name="Body" />
          </Card>
        </Item>
        <Item name="Pentagon">
          <Card>
            <Pentagon prices={prices} />
          </Card>
        </Item>
        <Item name="Ruler" note="55 to 145">
          <div className={styles.stack}>
            <Ruler value={104.37} />
            <div style={sectorStyle('WLTH')}>
              <Ruler value={96.85} />
            </div>
          </div>
        </Item>
        <Item name="Sparkline">
          <div className={styles.row}>
            {SECTOR_CODES.map((code) => (
              <span key={code} style={sectorStyle(code)}>
                <Sparkline values={sectorHistory[code]} label={`${code} recent records`} />
              </span>
            ))}
          </div>
        </Item>
      </Section>

      <section id="screens" className={styles.screens} aria-labelledby="screens-h">
        <div className={styles.section}>
          <h2 id="screens-h" className="t-h1">
            Screens
          </h2>
          <p className={styles.lead}>Five reference compositions. Each one is a full screen at the width of this window.</p>
        </div>
        <Shot id="question" title="1. A question of the check">
          <QuestionScreen />
        </Shot>
        <Shot id="result" title="2. The result reveal">
          <ResultScreen />
        </Shot>
        <Shot id="market" title="3. The market home">
          <MarketScreen />
        </Shot>
        <Shot id="compare" title="4. Compare">
          <CompareScreen />
        </Shot>
        <Shot id="share" title="5. The share card">
          <ShareScreen />
        </Shot>
      </section>

      <div className={styles.shareFull}>
        <p className={styles.shotTitle}>Share card at full size</p>
        <div data-shot="sharecard" className={styles.shareFullCard}>
          <ShareCard data={share} />
        </div>
      </div>

      <Footer wide />
    </div>
  );
}
