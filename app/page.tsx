import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { brand, notes, sectorNames } from '@/copy/common';
import {
  START_HREF,
  after,
  closing,
  data,
  footerLinks,
  hero,
  how,
  limits,
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
  Note,
  Price,
  Ruler,
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

export const metadata: Metadata = {
  title: { absolute: meta.title },
  description: meta.description,
  openGraph: { title: meta.title, description: meta.description, type: 'website', siteName: brand.name },
  twitter: { card: 'summary_large_image', title: meta.title, description: meta.description },
};

/** More sky above the hero skyline than the default crop, so the heading and the city share one sky. */
const HERO_TOP = 44;
/** Heights of the buildings in the sector bands. Each is a complete building. */
const BAND_HEIGHT: Record<SectorCode, number> = { SKIL: 116, WLTH: 98, NETW: 122, BODY: 108, MIND: 102 };
const AFTER_ICON: Record<'open' | 'payday' | 'win' | 'people', ReactNode> = {
  open: <IconOpen />,
  payday: <IconPayday />,
  win: <IconWin />,
  people: <IconPeople />,
};

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
        <section className={s.hero} aria-labelledby="hero-title">
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
            <Skyline prices={sample.prices} size="hero" rise top={HERO_TOP} framed={false} seed={7} />
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
            <p className={s.pavementNote}>
              <Tag kind="sample">{sample.tag}</Tag>
              <span>
                {sample.note} {hero.horizon}
              </span>
            </p>
          </div>
        </section>

        {/* ---------- What a result looks like ---------- */}
        <section id="sample" className={s.section} aria-labelledby="sample-title">
          <Column>
            <SectionHead id="sample-title" title={result.title} lead={result.lead} />
            <SampleQuote />
          </Column>
        </section>

        {/* ---------- How to read a price ---------- */}
        <Band tone="sunk" id="reading">
          <div className={s.reading}>
            <div className={s.readingText}>
              <SectionHead id="reading-title" title={reading.title} lead={reading.lead} />
              <dl className={s.facts}>
                {reading.facts.map((f) => (
                  <div key={f.figure}>
                    <dt>{f.figure}</dt>
                    <dd>{f.text}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className={s.readingFigure}>
              <div className={s.figureCard}>
                <ScaleFigure code="SKIL" price={sample.prices.SKIL} copy={reading.figure} />
              </div>
              <div className={s.rulerCard}>
                <p className={s.rulerLabel}>
                  <Ticker variant="chip" size="sm">
                    {sample.ticker}
                  </Ticker>
                  {reading.rulerLabel}
                </p>
                <Ruler value={sample.price} />
              </div>
              <Note tone="info" title={notes.baselineTitle} className={s.onSunk}>
                <p>{notes.baseline}</p>
              </Note>
            </div>
          </div>
        </Band>

        {/* ---------- The five sectors ---------- */}
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
              <div className={s.sectorText}>
                <p className={s.sectorKicker}>
                  <SectorTag code={sector.code} />
                  <span>{sector.count}</span>
                </p>
                <h3 id={`sector-${sector.code}-title`} className={s.sectorName}>
                  {sectorNames[sector.code]}
                </h3>
                <p className={s.sectorAbout}>{sector.about}</p>
                <div className={s.sectorCols}>
                  <div>
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
        <div className={s.ladder}>
          <Column>
            <p>{sectors.ladder}</p>
          </Column>
        </div>

        {/* ---------- Types ---------- */}
        <section id="types" className={s.section} aria-labelledby="types-title">
          <Column>
            <SectionHead id="types-title" title={types.title} lead={types.lead} />
            <TypeGallery />
          </Column>
        </section>

        {/* ---------- How a check works ---------- */}
        <Band tone="sunk" id="how">
          <div className={s.how}>
            <div className={s.howText}>
              <SectionHead id="how-title" title={how.title} lead={how.lead} />
              <ol className={s.steps}>
                {how.steps.map((step, i) => (
                  <li key={step.title}>
                    <span className={s.stepNo} aria-hidden="true">
                      {i + 1}
                    </span>
                    <div className={s.stepBody}>
                      <h3 className={s.stepTitle}>{step.title}</h3>
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
            </div>
            <div className={s.howTry}>
              <TryCheck />
            </div>
          </div>

          <div className={s.after}>
            <header className={s.afterHead}>
              <h3 className={s.h3}>
                {after.title}
                <span className={s.h3Tag}>
                  <Tag>{after.staged}</Tag>
                </span>
              </h3>
              <p className={s.lead}>{after.lead}</p>
            </header>
            <ul className={s.afterList}>
              {after.items.map((item) => (
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
            <p className={s.afterNote}>{after.note}</p>
          </div>
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
                      <Skyline prices={who.prices} size="small" top={compareTop} label="" />
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
            <dl className={s.ledger} aria-labelledby="data-title">
              {data.rows.map((row) => (
                <div key={row.item} className={row.kept ? s.kept : s.notKept}>
                  <dt>
                    <span className={s.ledgerMark}>{row.kept ? <IconCheck size={14} /> : <IconMinus size={14} />}</span>
                    <span className="vh">{row.kept ? data.yesLabel : data.notLabel}: </span>
                    {row.item}
                  </dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Band>

        {/* ---------- What it is not, and who builds it ---------- */}
        <section className={s.section} aria-labelledby="limits-title">
          <Column>
            <div className={s.honest}>
              <div className={s.limits}>
                <h2 id="limits-title" className={s.h3}>
                  {limits.title}
                </h2>
                <ul className={s.limitList}>
                  {limits.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <Note tone="info" title={limits.baselineTitle}>
                  <p>{limits.baseline}</p>
                </Note>
                <Link href="/method" className={s.more}>
                  {limits.method}
                  <IconArrowRight size={18} />
                </Link>
              </div>
              <div className={s.team}>
                <h2 className={s.h3}>{team.title}</h2>
                <p className={s.teamText}>{team.text}</p>
                <dl className={s.teamFacts}>
                  {team.facts.map((f) => (
                    <div key={f.text}>
                      <dt>{f.figure}</dt>
                      <dd>{f.text}</dd>
                    </div>
                  ))}
                </dl>
                <Link href="/about" className={s.more}>
                  {team.about}
                  <IconArrowRight size={18} />
                </Link>
              </div>
            </div>
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
