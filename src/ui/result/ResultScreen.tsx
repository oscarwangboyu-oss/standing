'use client';

/**
 * The result of a check (/result, and /result?session=ID for an older one).
 *
 * Order, top to bottom (PROMPT.md section 6): the mind notice when it applies, the skyline and
 * the quote head, the key figures, the price chart with the market comment, the note on answer
 * timing, the sector board, the type and the pentagon, the position, contrasts and consistency
 * checks, the provisional-baseline note, share and compare. Each block ends with the small
 * "Was this part useful?" control and reports when it was seen and for how long.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { api, errorCodeOf, useAsync, useDevice, useMe } from '@/client/api';
import { ROUTES } from '@/client/nav';
import { useLocation } from '@/client/runtime';
import { check, useReveal } from '@/client/session';
import { useShell } from '@/client/shell';
import { nav, quote } from '@/copy/common';
import * as copy from '@/copy/result';
import { compute, getBank, type AreaId, type Result } from '@/engine';
import type { MeResponse, ReportSection } from '@/shared/api';
import {
  BaselineNote,
  Block,
  Button,
  Card,
  Entry,
  EntryList,
  IconCompare,
  IconMarket,
  IconShare,
  ISSUE_PRICE,
  Note,
  Pentagon,
  PriceChart,
  QuoteHead,
  Ruler,
  SECTOR_CODES,
  SectorBoard,
  SectorRow,
  Skeleton,
  SkeletonQuote,
  SkylineCard,
  Spot,
  StatStrip,
  Ticker,
  Toast,
  TypeCard,
  Useful,
  chartXs,
  cx,
  formatDay,
  formatPrice,
  round2,
  sharedDomain,
  useOpen,
  useToast,
  type OpenState,
} from '@/ui';
import { acceptInviteOnce, pendingInvite, usePendingInvite } from '../compare/pending';
import { fill } from './fill';
import { Ladder } from './Ladder';
import { MarketLine } from './MarketLine';
import { CODE_AREA, chartOf, cohortOf, historyUpTo, marketFor, overallMove, pairOf, paramsOf, previousOf, pricesOf, rungsText, sectorViews, shareDataOf, statsOf, towerStatuses } from './model';
import { ShareSheet } from './ShareSheet';
import { useReport, type Report } from './useReport';
import { WhySheet, type WhyTarget } from './WhySheet';
import styles from './result.module.css';

/** The check on screen and where its result came from. */
interface Source {
  sessionId: string;
  result: Result;
  /** When the check was completed. */
  at: string;
  /** The server has stored this result. */
  stored: boolean;
  /** Set while the result of a check that was just finished is not stored yet. */
  saving: 'local' | 'waiting' | 'error' | null;
  /** False for an older check opened from the history. */
  isLatest: boolean;
}

const NO_HISTORY: MeResponse['history'] = [];

export function ResultScreen() {
  const where = useLocation();
  const wanted = where ? new URLSearchParams(where.search).get('session') : null;
  const reveal = useReveal();
  const me = useMe();
  const latest = me.data?.latest ?? null;

  // Once /api/me carries the stored result, the reveal has done its job.
  useEffect(() => {
    if (reveal && reveal.status === 'stored' && latest?.sessionId === reveal.sessionId) check().clearReveal();
  }, [reveal, latest]);

  const revealSession = reveal?.sessionId ?? null;
  // The moment the result was first shown stands in for the completion time until the server gives its own.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const revealAt = useMemo(() => new Date().toISOString(), [revealSession]);

  const isOlder = wanted !== null && wanted !== revealSession && wanted !== latest?.sessionId;
  const inHistory = isOlder && (me.data?.history.some((h) => h.sessionId === wanted) ?? false);
  const older = useAsync(() => api.getSession(wanted as string), [wanted], { enabled: inHistory });
  const olderResult = useMemo(() => {
    if (!isOlder || !older.data || !me.data || older.data.session.id !== wanted) return null;
    try {
      const { session, steps } = older.data;
      return compute({
        bank: getBank(session.bankVersion),
        background: session.background,
        steps,
        excludedAreas: session.excludedAreas,
        previous: previousOf(me.data.history, session.id)?.sectors ?? null,
      });
    } catch {
      return null;
    }
  }, [isOlder, older.data, me.data, wanted]);

  let source: Source | null = null;
  if (isOlder) {
    const point = me.data?.history.find((h) => h.sessionId === wanted);
    if (olderResult && point) source = { sessionId: point.sessionId, result: olderResult, at: point.at, stored: true, saving: null, isLatest: false };
  } else if (reveal) {
    source = {
      sessionId: reveal.sessionId,
      result: reveal.result,
      at: reveal.stored?.completedAt ?? revealAt,
      stored: reveal.status === 'stored',
      saving: reveal.status === 'stored' ? null : reveal.status,
      isLatest: true,
    };
  } else if (latest) {
    source = { sessionId: latest.sessionId, result: latest.result, at: latest.completedAt, stored: true, saving: null, isLatest: true };
  }

  if (source) return <ResultView key={source.sessionId} source={source} me={me.data} />;

  if (!me.loaded || (isOlder && inHistory && !older.loaded)) return <Waiting />;
  if (isOlder) {
    const failed = inHistory && older.error !== null && errorCodeOf(older.error) !== 'not_found';
    return (
      <Message title={failed ? copy.older.failed : copy.older.missing}>
        {failed && (
          <Button variant="secondary" onClick={() => void older.refresh()}>
            {copy.older.retry}
          </Button>
        )}
        <Button variant={failed ? 'quiet' : 'secondary'} href={ROUTES.result}>
          {copy.older.latest}
        </Button>
      </Message>
    );
  }
  if (me.error && !me.data) {
    return (
      <Message title={copy.empty.failed}>
        <Button variant="secondary" onClick={() => void me.refresh()}>
          {copy.empty.retry}
        </Button>
      </Message>
    );
  }
  return <Message title={copy.empty.title} line={copy.empty.line} />;
}

function Waiting() {
  return (
    <div className={styles.waiting}>
      <SkeletonQuote />
      <Skeleton height={96} radius={22} />
      <Skeleton height={260} radius={22} />
    </div>
  );
}

function Message({ title, line, children }: { title: string; line?: string; children?: ReactNode }) {
  return (
    <div className={styles.message}>
      <Spot kind="lot" />
      <h1 className="t-h1">{title}</h1>
      {line && <p className={styles.messageLine}>{line}</p>}
      {children && <div className={styles.messageActions}>{children}</div>}
    </div>
  );
}

function Rate({ report, sections }: { report: Report; sections: readonly ReportSection[] }) {
  return <Useful className={styles.useful} onChange={(answer) => report.useful(sections, answer)} />;
}

/** The sections each block of the screen reports as. */
const S = {
  mind: ['mind_notice'],
  header: ['header'],
  stats: ['key_stats'],
  head: ['header', 'key_stats'],
  chart: ['chart'],
  commentary: ['commentary'],
  history: ['chart', 'commentary'],
  timing: ['timing_note'],
  board: ['sector_table'],
  type: ['type'],
  radar: ['radar'],
  shape: ['type', 'radar'],
  position: ['social_position'],
  contrasts: ['contrasts'],
  checks: ['checks'],
  cross: ['contrasts', 'checks'],
  norm: ['norm_note'],
  share: ['share'],
} as const satisfies Record<string, readonly ReportSection[]>;

function ResultView({ source, me }: { source: Source; me: MeResponse | null }) {
  const { sessionId, result } = source;
  const record = useDevice();
  const toast = useToast();
  const report = useReport(sessionId);

  const history = me?.history ?? NO_HISTORY;
  // The live block describes the latest check. Until /api/me knows this check, it describes the one before.
  const live = source.isLatest && me?.latest?.sessionId === sessionId ? me.live : null;
  const params = paramsOf(result.versions);
  const previous = previousOf(history, sessionId);
  const upTo = historyUpTo(history, sessionId, result, source.at);
  const notice = result.mindNotice || live?.mindNotice === true;
  const market = marketFor(result, previous, notice);
  const views = sectorViews({ result, market, previous, upTo, live });
  const prices = pricesOf(result);
  const pair = pairOf(market.flat ? null : result.type);
  const move = overallMove(result, previous);
  const stats = statsOf(upTo, live);
  const chart = chartOf(upTo, live);
  const values = chart.points.map((p) => p.value);
  const open = useOpen(values, { xs: chartXs(chart.points, chart.spacing), disabled: result.overall === null });
  const domain = sharedDomain(views.map((v) => v.history));

  const ticker = me?.user.ticker ?? record.ticker;
  const cohort = cohortOf(me?.user.age ?? record.profile?.age, me?.user.role ?? record.profile?.role);
  const shareData = shareDataOf(result, ticker);

  // The line can end on today's live price while the quote is the check's own price: the count lands on the quote.
  const lastValue = values[values.length - 1];
  const headOpen: OpenState =
    result.overall !== null && lastValue !== undefined ? { ...open, value: open.value + (result.overall - lastValue) * open.drawn } : open;

  // ---- why it moved
  const [why, setWhy] = useState<WhyTarget | null>(null);
  const [asked, setAsked] = useState(false);
  const breakdown = useAsync(() => api.breakdown({ to: sessionId }), [sessionId], { enabled: asked && source.stored && previous !== null });
  const whyState = previous === null ? 'first' : !source.stored ? 'unsaved' : breakdown.error ? 'error' : breakdown.data ? 'ready' : 'loading';
  const openWhy = (target: WhyTarget) => {
    setAsked(true);
    setWhy(target);
  };

  // ---- share
  const [sharing, setSharing] = useState(false);

  // ---- an invite opened before the check: accept it now that there is a result
  const pending = usePendingInvite();
  const pendingCode = pending?.code ?? null;
  const pendingFrom = pending?.fromTicker ?? null;
  const [compared, setCompared] = useState<{ id: string; ticker: string | null } | null>(null);
  const canAccept = source.stored && source.isLatest;
  const showToast = toast.show;
  useEffect(() => {
    if (!pendingCode || !canAccept) return;
    let current = true;
    acceptInviteOnce(pendingCode).then(
      (answer) => {
        pendingInvite().clear();
        if (current) setCompared({ id: answer.comparison.id, ticker: answer.comparison.other.ticker ?? pendingFrom });
      },
      (error: unknown) => {
        const code = errorCodeOf(error);
        // Used, expired or the person's own: it will never work. Anything else is tried again on the next visit.
        if (code !== 'invite_invalid' && code !== 'invite_own') return;
        pendingInvite().clear();
        if (current && code === 'invite_invalid') showToast(copy.actions.inviteGone);
      },
    );
    return () => {
      current = false;
    };
  }, [pendingCode, pendingFrom, canAccept, showToast]);

  const mindNote = notice ? (
    <Note tone="care" title={copy.mind.title}>
      <p>{result.mindAlert ? copy.mind.fromCheck : copy.mind.fromDaily(params.dailyOpen.mindNotice.veryBadDays, params.dailyOpen.mindNotice.windowDays)}</p>
      <p>{copy.mind.body}</p>
      <p>
        {fill(copy.mind.help, {
          number: (
            <a className={styles.helpNumber} href={`tel:${copy.mind.number}`}>
              {copy.mind.number}
            </a>
          ),
        })}
      </p>
    </Note>
  ) : null;

  const typeCard = pair ? (
    <TypeCard pair={pair} />
  ) : (
    <Card variant="flat">
      <p className={styles.plain}>{market.pricedCount < 2 ? copy.shape.noTypeFew : copy.shape.noTypeFlat(params.market.flatBand)}</p>
    </Card>
  );

  // The market is where the prices go on after a check. Every person with a result has one.
  const hasMarket = me?.live !== undefined && me?.live !== null;

  useShell({
    headerRight: (
      <span className={styles.headRight}>
        {hasMarket && (
          <span className={styles.headMarket}>
            <Button variant="quiet" size="sm" href={ROUTES.market}>
              {nav.market}
            </Button>
          </span>
        )}
        <Button variant="secondary" size="sm" icon={<IconShare size={18} />} onClick={() => setSharing(true)}>
          {copy.actions.shareShort}
        </Button>
      </span>
    ),
    aside: (
      <div className={styles.asideStack}>
        {/* On a phone the illustration comes first, so the notice sits above it: the very top. */}
        {mindNote && (
          <div className={styles.narrowOnly} ref={report.mark(S.mind, 'aside')}>
            {mindNote}
          </div>
        )}
        <SkylineCard prices={prices} status={towerStatuses(views)} rise />
        <div className={styles.wideOnly} ref={report.mark(S.type, 'aside')}>
          {typeCard}
        </div>
      </div>
    ),
  });

  const codes = (areas: readonly AreaId[]) => SECTOR_CODES.filter((code) => areas.includes(CODE_AREA[code]));
  const unlisted = views.filter((v) => v.status === 'unlisted').map((v) => v.code);
  const insufficient = views.filter((v) => v.status === 'insufficient').map((v) => v.code);
  const unpriced = views.filter((v) => v.price === null).map((v) => v.code);
  const todayPrice = live?.overall.price ?? null;
  const movedSince = todayPrice !== null && result.overall !== null && round2(todayPrice) !== round2(result.overall);
  const position = result.socialPosition;

  return (
    <>
      {mindNote && (
        <div className={cx(styles.wideOnly, styles.topNote)} ref={report.mark(S.mind, 'main')}>
          {mindNote}
        </div>
      )}

      {source.saving && (
        <div className={styles.status} role="status">
          <p>{copy.saving[source.saving]}</p>
          {source.saving !== 'local' && (
            <Button variant="secondary" size="sm" onClick={() => void check().complete()}>
              {copy.saving.retry}
            </Button>
          )}
        </div>
      )}
      {!source.isLatest && (
        <p className={styles.status}>
          <span>{copy.older.line(formatDay(source.at))}</span>
          <Link className={styles.link} href={ROUTES.result}>
            {copy.older.latest}
          </Link>
        </p>
      )}

      <div ref={report.mark(S.header)}>
        {result.overall !== null ? (
          <QuoteHead ticker={ticker ?? copy.head.noTicker} cohort={cohort ?? undefined} price={result.overall} change={move} open={headOpen} />
        ) : (
          <header className={styles.noQuote}>
            <div className={styles.noQuoteWho}>
              <Ticker variant="chip">{ticker ?? copy.head.noTicker}</Ticker>
              {cohort && <span className={styles.cohort}>{cohort}</span>}
            </div>
            <h1 className="t-h1">{copy.head.noOverallTitle}</h1>
            <p className={styles.plain}>{copy.head.noOverall(params.overall.minPricedSectors)}</p>
          </header>
        )}
        {move && (
          <div className={styles.whyRow}>
            <Button variant="quiet" size="sm" onClick={() => openWhy('overall')}>
              {copy.head.why}
            </Button>
          </div>
        )}
      </div>
      <div ref={report.mark(S.stats)}>
        <StatStrip
          className={styles.stats}
          stats={
            // On a first record the high and the low are the price itself: they say nothing yet.
            stats.high === null || stats.low === null || round2(stats.high) === round2(stats.low)
              ? [
                  { label: quote.issuePrice, value: formatPrice(ISSUE_PRICE) },
                  { label: copy.head.listed, value: copy.head.listedOf(market.pricedCount, SECTOR_CODES.length) },
                  { label: quote.grade, value: result.grade },
                ]
              : [
                  { label: quote.issuePrice, value: formatPrice(ISSUE_PRICE) },
                  { label: quote.high, value: formatPrice(stats.high) },
                  { label: quote.low, value: formatPrice(stats.low) },
                  { label: quote.grade, value: result.grade },
                ]
          }
        />
      </div>
      <Rate report={report} sections={S.head} />

      <Block title={copy.history.title} id="r-history">
        <Card>
          {chart.points.length > 1 ? (
            <div ref={report.mark(S.chart)}>
              <PriceChart points={chart.points} spacing={chart.spacing} open={open} />
            </div>
          ) : chart.points.length === 1 && result.overall !== null ? (
            // One record has no line to draw. The ruler shows where the price sits on the whole scale instead.
            <div className={styles.oneRecord} ref={report.mark(S.chart)}>
              <Ruler value={result.overall} />
              <p className={styles.caption}>{copy.history.oneRecord}</p>
            </div>
          ) : (
            <p className={styles.plain} ref={report.mark(S.chart)}>
              {copy.history.noOverall}
            </p>
          )}
          <div className={styles.tape} ref={report.mark(S.commentary)}>
            <MarketLine result={result} market={market} notice={notice} />
          </div>
          {movedSince && live && todayPrice !== null && (
            <p className={styles.caption}>
              {copy.history.today(formatPrice(todayPrice), formatDay(live.lastCheckDay))}{' '}
              <Link className={styles.link} href={ROUTES.market}>
                {copy.history.market}
              </Link>
            </p>
          )}
        </Card>
        <Rate report={report} sections={S.history} />
      </Block>

      {result.reducedWeight.count > 0 && (
        <div className={styles.timing}>
          <div ref={report.mark(S.timing)}>
            <Note title={copy.timing.title}>
              <p>
                {copy.timing.note(
                  result.reducedWeight.count,
                  result.reducedWeight.points === null ? null : formatPrice(result.reducedWeight.points),
                  result.overallFullWeight === null ? null : formatPrice(result.overallFullWeight),
                )}
              </p>
            </Note>
          </div>
          <Rate report={report} sections={S.timing} />
        </div>
      )}

      <Block title={copy.sectors.title} id="r-sectors">
        <Card>
          <div ref={report.mark(S.board)}>
            <SectorBoard label={copy.sectors.boardLabel}>
              {views.map((view) => (
                <SectorRow
                  key={view.code}
                  code={view.code}
                  price={view.price}
                  change={view.change}
                  status={view.status}
                  tag={view.tag}
                  history={view.history}
                  domain={domain}
                  onSelect={view.price !== null ? () => openWhy(view.area) : undefined}
                >
                  {view.status === 'halted' && view.haltedSince ? copy.sectors.halted(formatDay(view.haltedSince)) : undefined}
                </SectorRow>
              ))}
            </SectorBoard>
            <div className={styles.boardNotes}>
              <p>{copy.sectors.hint}</p>
              {result.overall !== null && result.overallLeftOut.length > 0 && <p>{copy.sectors.covers(codes(result.overallCovers), codes(result.overallLeftOut))}</p>}
              {unlisted.length > 0 && <p>{copy.sectors.unlisted(unlisted)}</p>}
              {insufficient.length > 0 && <p>{copy.sectors.insufficient(insufficient, Math.round(params.sector.minOwnScoredShare * 100))}</p>}
              {result.interestWrong && <p>{copy.sectors.interest(Math.round(params.interest.shrink * 100))}</p>}
            </div>
          </div>
        </Card>
        <Rate report={report} sections={S.board} />
      </Block>

      <Block title={copy.shape.title} id="r-shape">
        <div className={styles.narrowOnly} ref={report.mark(S.type)}>
          {typeCard}
        </div>
        <Card className={styles.shape}>
          <div ref={report.mark(S.radar)}>
            <Pentagon prices={prices} />
          </div>
          <p className={styles.caption}>
            {copy.shape.caption}
            {unpriced.length > 0 && ` ${copy.shape.partial(unpriced)}`}
          </p>
        </Card>
        <Rate report={report} sections={S.shape} />
      </Block>

      {position && (
        <Block title={copy.position.title} id="r-position">
          <Card>
            <div className={styles.position} ref={report.mark(S.position)}>
              <p className={styles.plain}>{copy.position.lead(params.social.rungs)}</p>
              <Ladder rungs={params.social.rungs} objective={position.objectiveRung} own={position.ladderRungs} />
              <dl className={styles.facts}>
                <div>
                  <dt>{copy.position.objective}</dt>
                  <dd>{copy.position.objectiveDetail(position.objectiveRung, params.social.rungs, formatPrice(position.objectivePrice))}</dd>
                </div>
                <div>
                  <dt>{copy.position.subjective}</dt>
                  <dd>{copy.position.subjectiveDetail(Math.min(...position.ladderRungs), Math.max(...position.ladderRungs), params.social.rungs)}</dd>
                </div>
                <div>
                  <dt>{copy.position.gap}</dt>
                  <dd>
                    {copy.position.gapKinds[position.gapKind]} {copy.position.gapSize(rungsText(position.gap))}
                  </dd>
                </div>
              </dl>
            </div>
          </Card>
          <Rate report={report} sections={S.position} />
        </Block>
      )}

      <Block title={copy.contrasts.title} id="r-cross">
        <Card>
          <div className={styles.cross}>
            <section ref={report.mark(S.contrasts)} aria-labelledby="r-contrasts">
              <h3 id="r-contrasts" className="t-h3">
                {copy.contrasts.heading}
              </h3>
              <p className={styles.crossLead}>{copy.contrasts.lead}</p>
              {result.contrasts.length > 0 ? (
                <ul className={styles.list}>
                  {result.contrasts.map((id) => (
                    <li key={id}>{copy.contrasts.items[id]}</li>
                  ))}
                </ul>
              ) : (
                <p className={styles.plain}>{copy.contrasts.none}</p>
              )}
            </section>
            <section ref={report.mark(S.checks)} aria-labelledby="r-checks">
              <h3 id="r-checks" className="t-h3">
                {copy.checks.heading}
              </h3>
              <p className={styles.crossLead}>{copy.checks.lead(params.flags.gradeB, params.flags.gradeC)}</p>
              {result.flags.length > 0 ? (
                <ul className={styles.list}>
                  {result.flags.map((flag) => (
                    <li key={flag.id}>
                      {copy.checks.items[flag.id]} <span className={styles.points}>{copy.checks.points(flag.points)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.plain}>{copy.checks.none}</p>
              )}
              <p className={styles.grade}>{copy.checks.grade(result.grade, result.flagPoints)}</p>
            </section>
          </div>
        </Card>
        <Rate report={report} sections={S.cross} />
      </Block>

      {/* The note stays until a real norm replaces the provisional one. */}
      {result.normProvisional && (
        <>
          <div ref={report.mark(S.norm)}>
            <BaselineNote className={styles.baseline} />
          </div>
          <Rate report={report} sections={S.norm} />
        </>
      )}

      {compared && (
        <div className={styles.compared} role="status">
          <p>{copy.actions.compareReady(compared.ticker)}</p>
          <Link className={styles.link} href={`${ROUTES.compare}?id=${encodeURIComponent(compared.id)}`}>
            {copy.actions.compareOpen}
          </Link>
        </div>
      )}

      <div className={styles.actions} ref={report.mark(S.share)}>
        <Button size="lg" full icon={<IconShare size={20} />} onClick={() => setSharing(true)} data-action="share">
          {copy.actions.share}
        </Button>
        <Button variant="secondary" size="lg" full icon={<IconCompare size={20} />} href={ROUTES.compare}>
          {copy.actions.compare}
        </Button>
      </div>

      {/* After a check the prices go on in the market. Without this row a first-time person would not find it. */}
      {hasMarket && source.isLatest && me?.live && (
        <Card pad="none" className={styles.onward}>
          <EntryList label={copy.actions.onwardLabel}>
            <Entry
              href={ROUTES.market}
              icon={<IconMarket />}
              title={copy.actions.market}
              detail={me.live.apps.dailyOpen.enabled && me.live.apps.dailyOpen.available ? copy.actions.marketDaily : copy.actions.marketPlain}
            />
          </EntryList>
        </Card>
      )}

      <WhySheet target={why} onClose={() => setWhy(null)} state={whyState} data={breakdown.data} onRetry={() => void breakdown.refresh()} />
      <ShareSheet open={sharing} onClose={() => setSharing(false)} data={shareData} onShared={() => report.share()} />
      <Toast>{toast.message}</Toast>
    </>
  );
}
