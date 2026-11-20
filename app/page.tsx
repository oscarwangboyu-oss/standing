import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { brand, sectorNames } from '@/copy/common';
import {
  START_HREF,
  after,
  closing,
  data,
  demo,
  footerLinks,
  hero,
  how,
  meta,
  nav,
  reading,
  result,
  sample,
  sampleFriend,
  sectors,
  team,
  together,
  types,
} from '@/copy/landing';
import { Guard } from '@/client/runtime';
import { typeForPrices } from '@/copy/types';
import { publicFlags, type PublicFlags } from '@/server/publicFlags';
import {
  Band,
  Button,
  Column,
  Footer,
  IconArrowRight,
  IconCheck,
  IconMinus,
  IconOpen,
  IconPayday,
  IconPeople,
  IconWin,
  Price,
  SECTOR_CODES,
  SectorGlyph,
  SectorTag,
  ShareCard,
  Skyline,
  Tag,
  Ticker,
  TopBar,
  TypeEmblem,
  formatPrice,
  sectorStyle,
  skylineTop,
  type SectorCode,
} from '@/ui';
import { SampleQuote } from '@/ui/public/SampleQuote';
import { ScaleFigure } from '@/ui/public/ScaleFigure';
import { SectorScene } from '@/ui/public/SectorScene';
import { StickyStart } from '@/ui/public/StickyStart';
import { TryCheck } from '@/ui/public/TryCheck';
import { TypeGallery } from '@/ui/public/TypeGallery';
import s from '@/ui/public/landing.module.css';
import { LOT_W } from '@/ui/skyline/geometry';

export const metadata: Metadata = {
  title: { absolute: meta.title },
  description: meta.description,
  openGraph: { title: meta.title, description: meta.description, type: 'website', siteName: brand.name },
  twitter: { card: 'summary_large_image', title: meta.title, description: meta.description },
};

/** More sky above the hero skyline than the default crop, so the heading and the city share one sky. */
const HERO_TOP = 44;
/**
 * Width of the hero scene in units. Wider than the default 800, so on a desktop the towers stand a
 * little smaller and the heading, the city and the five prices fit a 900px first screen. A phone
 * shows the middle 440 units either way.
 */
const HERO_SCENE_W = 960;
/** The share of the scene's width taken by the five lots: the prices on the street line up with it. */
const HERO_LOTS = `${((LOT_W * 5) / HERO_SCENE_W) * 100}%`;
/** Heights of the buildings in the sector bands. Each is a complete building. */
const BAND_HEIGHT: Record<SectorCode, number> = { SKIL: 116, WLTH: 98, NETW: 122, BODY: 108, MIND: 102 };
/** Heights of the buildings on the sector cards of a phone, where the building is small. */
const CARD_HEIGHT: Record<SectorCode, number> = { SKIL: 112, WLTH: 96, NETW: 118, BODY: 104, MIND: 100 };
type AfterId = 'open' | 'payday' | 'win' | 'people';
const AFTER_ICON: Record<AfterId, ReactNode> = {
  open: <IconOpen />,
  payday: <IconPayday />,
  win: <IconWin />,
  people: <IconPeople />,
};
/** The stage switch of each short record. */
const AFTER_FLAG: Record<AfterId, keyof PublicFlags> = { open: 'dailyOpen', payday: 'payday', win: 'weeklyWin', people: 'peopleNudge' };

const sampleType = typeForPrices(sample.prices);
const friendType = typeForPrices(sampleFriend.prices);
const compareTop = skylineTop(sample.prices, sampleFriend.prices);

function SectionHead({ id, title, lead, className }: { id: string; title: string; lead?: string; className?: string }) {
  return (
    <header className={`${s.head}${className ? ` ${className}` : ''}`}>
      <h2 id={id} className={s.h2}>
        {title}
      </h2>
      {lead && <p className={s.lead}>{lead}</p>}
    </header>
  );
}

export default function Page() {
  const flags = publicFlags();
  const afterOn = after.items.filter((item) => flags[AFTER_FLAG[item.id]]);
  return (
    <div className={s.page}>
      {/* A person with a completed check belongs on /market (src/client/nav.ts). */}
      <Guard />
      <div className={s.sky}>
        <TopBar
          wide
          right={
            <nav className={s.nav} aria-label={nav.label}>
              <a href="#how">{nav.how}</a>
              <a href="#sectors">{nav.sectors}</a>
              <a href="#types">{nav.types}</a>
              <Link href="/method">{nav.method}</Link>
              <span className={s.navStart}>
                <Button href={START_HREF} variant="secondary" size="sm">
                  {nav.start}
                </Button>
              </span>
            </nav>
          }
        />
      </div>

      <main>
        {/* ---------- Hero ---------- */}
        <section className={s.hero} aria-labelledby="hero-title" style={{ '--lots': HERO_LOTS } as CSSProperties}>
          <Column className={s.heroInner}>
            <div className={s.heroText}>
              <h1 id="hero-title" className={s.heroTitle}>
                <span>{hero.titleA}</span> <span className={s.heroTitleB}>{hero.titleB}</span>
              </h1>
              <p className={s.heroLead}>{hero.lead}</p>
              <div className={s.heroAction}>
                <span id="hero-start">
                  <Button href={START_HREF} size="lg" iconEnd={<IconArrowRight size={22} />}>
                    {hero.cta}
                  </Button>
                </span>
                <p className={s.heroFact}>{hero.fact}</p>
              </div>
              <p className={s.heroRestore}>
                {hero.restoreText} <Link href="/settings?restore=1">{hero.restoreLink}</Link>
              </p>
            </div>
            <aside className={s.heroQuote} aria-label={sample.tag}>
              <p className={s.heroQuoteTop}>
                <Ticker variant="chip">{sample.ticker}</Ticker>
                <Tag kind="sample">{sample.tag}</Tag>
              </p>
              <p className={s.heroQuoteLabel}>{hero.overall}</p>
              <Price value={sample.price} size="xl" />
              {sampleType && (
                <p className={s.heroQuoteType}>
                  <TypeEmblem pair={sampleType.pair} size={36} />
                  <span>{sampleType.name}</span>
                </p>
              )}
            </aside>
          </Column>
          <div className={s.heroSky}>
            <Skyline prices={sample.prices} size="hero" rise top={HERO_TOP} sceneWidth={HERO_SCENE_W} framed={false} seed={7} className={s.heroScene} />
          </div>
          <div className={s.pavement}>
            <dl className={s.heroLegend} aria-hidden="true">
              {SECTOR_CODES.map((code) => (
                <div key={code} style={sectorStyle(code)}>
                  <dt>
                    <SectorGlyph code={code} size={16} />
                    {code}
                  </dt>
                  <dd>{formatPrice(sample.prices[code])}</dd>
                </div>
              ))}
            </dl>
            {/* Under 900px the quote card is not shown: the street carries the quote of the sample. */}
            <p className={s.pavementQuote}>
              <Tag kind="sample">{sample.tag}</Tag>
              <span className={s.pavementQuoteLine}>
                <Ticker variant="chip" size="sm">
                  {sample.ticker}
                </Ticker>
                <span className="vh">{hero.overall} </span>
                <Price value={sample.price} size="md" />
                {sampleType && (
                  <span className={s.pavementType}>
                    <TypeEmblem pair={sampleType.pair} size={24} />
                    {sampleType.name}
                  </span>
                )}
              </span>
            </p>
          </div>
        </section>

        {/* ---------- Try three questions, and how a check works ---------- */}
        <section id="how" className={s.section} aria-labelledby="how-title">
          <Column>
            <SectionHead id="how-title" title={demo.title} />
            <div className={s.how}>
              <div className={s.howTry}>
                <TryCheck />
              </div>
              <div className={s.howText}>
                <h3 className={s.h3}>{how.title}</h3>
                <ol className={s.steps}>
                  {how.steps.map((step, i) => (
                    <li key={step.title}>
                      <span className={s.stepNo} aria-hidden="true">
                        {i + 1}
                      </span>
                      <div className={s.stepBody}>
                        <h4 className={s.stepTitle}>{step.title}</h4>
                        <p>{step.text}</p>
                        {i === 0 && (
                          <>
                            <ul className={s.chips} aria-label={how.agesLabel}>
                              {how.ages.map((a) => (
                                <li key={a} className={s.chipAge}>
                                  {a}
                                </li>
                              ))}
                            </ul>
                            <ul className={s.chips} aria-label={how.situationsLabel}>
                              {how.situations.map((a) => (
                                <li key={a}>{a}</li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>

                {/* The short records after the check: listed only when their stage switch is on. */}
                <div className={s.after}>
                  <h3 className={s.h3}>
                    {after.title}
                    {afterOn.length > 0 && (
                      <span className={s.h3Tag}>
                        <Tag>{after.staged}</Tag>
                      </span>
                    )}
                  </h3>
                  {afterOn.length > 0 && (
                    <div className={s.afterFull}>
                      <p className={s.afterLead}>{after.lead}</p>
                      <ul className={s.afterList}>
                        {afterOn.map((item) => (
                          <li key={item.id} style={sectorStyle(item.sectors[0] as SectorCode)}>
                            <span className={s.afterIcon}>{AFTER_ICON[item.id]}</span>
                            <div className={s.afterText}>
                              <p className={s.afterTitle}>
                                {item.title}
                                <span className={s.afterRhythm}>{item.rhythm}</span>
                              </p>
                              <p className={s.afterDetail}>{item.text}</p>
                            </div>
                            <p className={s.afterTags}>
                              {item.sectors.map((code) => (
                                <SectorTag key={code} code={code} size="sm" />
                              ))}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className={afterOn.length > 0 ? s.afterShort : s.afterSoon}>
                    {afterOn.length > 0 ? after.short : after.soon}{' '}
                    <Link href="/about#plan" className={s.inline}>
                      {after.plan}
                    </Link>
                  </p>
                </div>
              </div>
            </div>
          </Column>
        </section>

        {/* ---------- What a result looks like (from 700px; a phone has the quote on the street) ---------- */}
        <Band tone="sunk" id="sample" className={s.sampleSection}>
          <SectionHead id="sample-title" title={result.title} lead={result.lead} />
          <SampleQuote />
        </Band>

        {/* ---------- How to read a price: the one statement of the page ---------- */}
        <Band tone="ink" id="reading" className={s.readingBand}>
          <div className={s.reading}>
            <div className={s.readingText}>
              <h2 id="reading-title" className={s.kicker}>
                {reading.title}
              </h2>
              <p className={s.statement}>{reading.statement}</p>
              <dl className={s.facts}>
                {reading.facts.map((f) => (
                  <div key={f.figure}>
                    <dt>{f.figure}</dt>
                    <dd>{f.text}</dd>
                  </div>
                ))}
              </dl>
              <div className={s.baseline}>
                <p>
                  <strong>{reading.baselineTitle}</strong> {reading.baseline}
                </p>
                <Link href="/method" className={`${s.more} ${s.moreOnInk}`}>
                  {reading.method}
                  <IconArrowRight size={18} />
                </Link>
              </div>
            </div>
            <div className={s.readingFigure}>
              <div className={s.figureCard}>
                <ScaleFigure code="SKIL" price={sample.prices.SKIL} copy={reading.figure} />
              </div>
            </div>
          </div>
        </Band>

        {/* ---------- The five sectors: a row of cards on a phone, a band each from 700px ---------- */}
        <section id="sectors" className={s.sectionIntro} aria-labelledby="sectors-title">
          <Column>
            <SectionHead id="sectors-title" title={sectors.title} lead={sectors.lead} />
            <ul className={s.sectorIndex}>
              {SECTOR_CODES.map((code) => (
                <li key={code}>
                  <a href={`#sector-${code}`}>
                    <SectorTag code={code} name />
                  </a>
                </li>
              ))}
            </ul>
          </Column>
          <div className={s.rail} role="region" aria-label={sectors.railLabel} tabIndex={0}>
            <ul className={s.railList}>
              {sectors.list.map((sector) => (
                <li key={sector.code} className={s.railCard} style={sectorStyle(sector.code)}>
                  <div className={s.railHead}>
                    <SectorScene code={sector.code} h={CARD_HEIGHT[sector.code]} className={s.railArt} />
                    <div className={s.railTitle}>
                      <SectorTag code={sector.code} />
                      <h3 id={`card-${sector.code}-title`} className={s.railName}>
                        {sectorNames[sector.code]}
                      </h3>
                    </div>
                  </div>
                  <p className={s.railAbout}>{sector.about}</p>
                  <figure className={s.ask}>
                    <figcaption className={s.sectorLabel}>{sectors.questionLabel}</figcaption>
                    <blockquote className={s.askText}>{sector.question}</blockquote>
                    <p className={s.askRange}>{sectors.answersLabel(sector.answers[0], sector.answers[1])}</p>
                  </figure>
                </li>
              ))}
            </ul>
          </div>
        </section>
        {sectors.list.map((sector, i) => (
          <Band key={sector.code} tone={sector.code} id={`sector-${sector.code}`} className={s.sectorBand}>
            <article className={`${s.sector}${i % 2 === 1 ? ` ${s.sectorFlip}` : ''}`} style={sectorStyle(sector.code)} aria-labelledby={`sector-${sector.code}-title`}>
              <span className={s.ghost} aria-hidden="true">
                {sector.code}
              </span>
              <div className={s.sectorArt}>
                <SectorScene code={sector.code} h={BAND_HEIGHT[sector.code]} />
              </div>
              <header className={s.sectorHead}>
                <p className={s.sectorKicker}>
                  <SectorTag code={sector.code} />
                  <span>{sector.count}</span>
                </p>
                <h3 id={`sector-${sector.code}-title`} className={s.sectorName}>
                  {sectorNames[sector.code]}
                </h3>
              </header>
              <div className={s.sectorText}>
                <p className={s.sectorAbout}>{sector.about}</p>
                <div className={s.sectorCols}>
                  <div className={s.asksCol}>
                    <p className={s.sectorLabel}>{sectors.asksLabel}</p>
                    <ul className={s.asks}>
                      {sector.asks.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </div>
                  <figure className={s.ask}>
                    <figcaption className={s.sectorLabel}>{sectors.questionLabel}</figcaption>
                    <blockquote className={s.askText}>{sector.question}</blockquote>
                    <p className={s.askRange}>{sectors.answersLabel(sector.answers[0], sector.answers[1])}</p>
                  </figure>
                </div>
                <p className={s.sectorFoot}>
                  <SectorGlyph code={sector.code} size={18} />
                  <span>
                    {sector.building}
                    {sector.note ? ` ${sector.note}` : ''}
                  </span>
                </p>
              </div>
            </article>
          </Band>
        ))}

        {/* ---------- Types ---------- */}
        <Band tone="sunk" id="types">
          <SectionHead id="types-title" title={types.title} lead={types.lead} />
          <TypeGallery />
        </Band>

        {/* ---------- Share and compare ---------- */}
        <section id="compare" className={s.section} aria-labelledby="together-title">
          <Column>
            <SectionHead id="together-title" title={together.title} />
            <div className={s.together}>
              <div className={s.shareBlock}>
                <div className={s.shareArt}>
                  <ShareCard
                    data={{
                      ticker: sample.ticker,
                      price: sample.price,
                      sectors: SECTOR_CODES.map((code) => ({ code, price: sample.prices[code] })),
                      type: sampleType?.name ?? null,
                    }}
                  />
                </div>
                <div className={s.blockText}>
                  <h3 className={s.h3}>{together.share.title}</h3>
                  <p>{together.share.text}</p>
                </div>
              </div>
              <div className={s.compareBlock}>
                <div className={s.pairArt} role="img" aria-label={together.compare.label}>
                  {[
                    { who: sample, type: sampleType },
                    { who: sampleFriend, type: friendType },
                  ].map(({ who, type }) => (
                    <div key={who.ticker} className={s.pairCol} aria-hidden="true">
                      <p className={s.pairHead}>
                        <Ticker variant="chip" size="sm">
                          {who.ticker}
                        </Ticker>
                        <Price value={who.price} size="md" />
                      </p>
                      <Skyline prices={who.prices} size="small" top={compareTop} label="" className={s.pairSky} />
                      {type && (
                        <p className={s.pairType}>
                          <TypeEmblem pair={type.pair} size={32} />
                          <span>{type.name}</span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <div className={s.blockText}>
                  <h3 className={s.h3}>{together.compare.title}</h3>
                  <p>{together.compare.text}</p>
                  <p className={s.caption}>{together.compare.note}</p>
                </div>
              </div>
            </div>
          </Column>
        </section>

        {/* ---------- What is collected ---------- */}
        <Band tone="sunk" id="data">
          <div className={s.data}>
            <div className={s.dataText}>
              <SectionHead id="data-title" title={data.title} lead={data.lead} />
              <Link href="/privacy" className={s.more}>
                {data.more}
                <IconArrowRight size={18} />
              </Link>
            </div>
            <div className={s.ledger}>
              {/* What is never collected: a compact grid. What is kept: one row each, with how (from 700px). */}
              <p className={s.ledgerLabel}>{data.notLabel}</p>
              <dl className={s.ledgerNot}>
                {data.rows
                  .filter((row) => !row.kept)
                  .map((row) => (
                    <div key={row.item}>
                      <dt>
                        <span className={s.ledgerMark}>
                          <IconMinus size={14} />
                        </span>
                        <span className="vh">{data.notLabel}: </span>
                        {row.item}
                      </dt>
                      {/* "Not collected" is already the label of the group. */}
                      {row.value !== data.notLabel && <dd>{row.value}</dd>}
                    </div>
                  ))}
              </dl>
              <div className={s.ledgerKeptPart}>
                <p className={`${s.ledgerLabel} ${s.ledgerLabelKept}`}>{data.yesLabel}</p>
                <dl className={s.ledgerKept}>
                  {data.rows
                    .filter((row) => row.kept)
                    .map((row) => (
                      <div key={row.item}>
                        <dt>
                          <span className={s.ledgerMark}>
                            <IconCheck size={14} />
                          </span>
                          <span className="vh">{data.yesLabel}: </span>
                          {row.item}
                        </dt>
                        <dd>{row.value}</dd>
                      </div>
                    ))}
                </dl>
              </div>
            </div>
          </div>
        </Band>

        {/* ---------- Who builds it ---------- */}
        <section className={s.teamSection} aria-labelledby="team-title">
          <Column className={s.team}>
            <div className={s.teamHead}>
              <h2 id="team-title" className={s.h2}>
                {team.title}
              </h2>
              <p className={s.teamText}>{team.text}</p>
              <Link href="/about" className={s.more}>
                {team.about}
                <IconArrowRight size={18} />
              </Link>
            </div>
            <dl className={s.teamFacts}>
              {team.facts.map((f) => (
                <div key={f.text}>
                  <dt>{f.figure}</dt>
                  <dd>{f.text}</dd>
                </div>
              ))}
            </dl>
          </Column>
        </section>

        {/* ---------- Closing: the city at dusk ---------- */}
        <section className={`${s.closing} k-dusk`} aria-labelledby="closing-title">
          <Column className={s.closingText}>
            <h2 id="closing-title" className={s.closingTitle}>
              {closing.title}
            </h2>
            <p className={s.closingFact}>{closing.fact}</p>
            <span id="closing-start">
              <Link href={START_HREF} className={s.closingButton}>
                {closing.cta}
                <IconArrowRight size={22} />
              </Link>
            </span>
          </Column>
          <Skyline
            prices={sample.prices}
            size="hero"
            time="dusk"
            top={HERO_TOP}
            framed={false}
            horizonLabel={false}
            lit={{ SKIL: true, WLTH: true, NETW: true, BODY: true, MIND: true }}
            label=""
            seed={5}
          />
        </section>
      </main>

      <Footer wide links={footerLinks} className={s.footer} />
      <StickyStart watch="hero-start" until="closing-start" />
    </div>
  );
}
