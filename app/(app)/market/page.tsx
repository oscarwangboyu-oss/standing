'use client';

/**
 * The market home: where a returning person lands. Today's skyline with the lights of the
 * sectors updated today, the overall price and its change since yesterday, the position against
 * the issue price, the Daily Open with the streak, the five sectors (tap for "Why it moved"),
 * the price by day, and the ways onward. Everything comes from the `live` block of GET /api/me.
 */
import { useMemo, useState } from 'react';
import { api, useAsync, useDevice, useMe } from '@/client/api';
import { ROUTES, resultRoute } from '@/client/nav';
import { useShell } from '@/client/shell';
import { today } from '@/client/today';
import { checkInProgress, entries, market as copy, mindNotice, moved, openFeature, retake, roleNames, sectorLines } from '@/copy/market';
import { getAlgo, getBank, type AreaId } from '@/engine';
import type { MeLive, MeResponse } from '@/shared/api';
import {
  BaselineNote,
  Block,
  Button,
  Card,
  Change,
  Entry,
  EntryList,
  FeatureEntry,
  IconCompare,
  IconMarket,
  IconPayday,
  IconPeople,
  IconRetake,
  IconSettings,
  IconWin,
  Note,
  PriceChart,
  QuoteHead,
  Ruler,
  SECTOR_CODES,
  SectorBoard,
  SectorRow,
  Sheet,
  Skeleton,
  SkeletonQuote,
  SkylineCard,
  Spot,
  Streak,
  Ticker,
  cx,
  formatDay,
  formatPrice,
  sharedDomain,
  type StreakDay,
} from '@/ui';
import {
  areaOf,
  daysWithoutRecord,
  isCatchingUp,
  litToday,
  livePrices,
  liveStatus,
  liveTags,
  overallPoints,
  recentPrices,
  streakWeek,
} from '@/ui/market/live';
import { SectorSheet } from '@/ui/market/SectorSheet';
import styles from '@/ui/market/market.module.css';
import { useDailyLog } from '../open/dailyLog';

/** Days without a record after which each sector is halted, from the algorithm in force. */
function haltAfter(area: AreaId): number {
  const live = getAlgo().live;
  if (area === 'W') return live.payday.haltAfterDays;
  if (area === 'C') return live.weeklyWin.haltAfterDays;
  if (area === 'N') return live.peopleNudge.haltAfterDays;
  return live.dailyOpen.haltAfterDays;
}

function cohortOf(me: MeResponse): string | undefined {
  const { age, role } = me.user;
  if (age === null || role === null) return undefined;
  const ages = getBank().ages[age]?.en;
  return ages ? copy.cohort(ages, roleNames[role]) : undefined;
}

export default function MarketPage() {
  const me = useMe();
  const device = useDevice();
  const log = useDailyLog(device.userId);
  const live = me.data?.live ?? null;
  const week = live && live.apps.dailyOpen.enabled && live.apps.dailyOpen.available ? streakWeek(live.streak, live.today, copy.weekdays, log.known) : null;
  const weekKey = JSON.stringify(week);

  // From 960px the streak sits in the sticky column under the skyline, so the reward of the
  // Daily Open stays in view next to the board. On a phone it stays in the Today block.
  const aside = useMemo(
    () =>
      live ? (
        <>
          <SkylineCard prices={livePrices(live)} status={liveStatus(live)} lit={litToday(live)} size="small" />
          <p className={styles.skyNote}>{copy.skylineLit}</p>
          {week && (
            <Card className={cx(styles.streakAside, styles.wideOnly)} variant="flat">
              <Streak days={week} count={live.streak.current} />
            </Card>
          )}
        </>
      ) : undefined,
    // weekKey stands for week: the log hands out a new object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live, weekKey],
  );
  useShell({ aside });

  if (!me.data || !live) {
    if (me.loaded && !me.loading) {
      return (
        <div className={styles.state}>
          <Spot kind="building" />
          <p>{copy.loadError}</p>
          <Button variant="secondary" onClick={() => void me.refresh()}>
            {copy.retry}
          </Button>
        </div>
      );
    }
    return (
      <div className={styles.skeleton}>
        <Skeleton height={180} radius={28} />
        <SkeletonQuote />
        <Skeleton height={220} radius={22} />
      </div>
    );
  }
  return <Market me={me.data} live={live} week={week} />;
}

function Market({ me, live, week }: { me: MeResponse; live: MeLive; week: StreakDay[] | null }) {
  const [selected, setSelected] = useState<AreaId | null>(null);
  const [asked, setAsked] = useState(false);
  const breakdown = useAsync(() => api.dayBreakdown({ today: today() }), [live.today, live.overall.target], { enabled: asked });

  const daily = live.apps.dailyOpen;
  const dailyShown = daily.enabled && daily.available;
  const bodyHalted = live.sectors.B.status === 'halted' || live.sectors.M.status === 'halted';
  const tags = liveTags(live);
  const histories = Object.fromEntries(SECTOR_CODES.map((code) => [code, recentPrices(live, areaOf(code))]));
  const withHistory = SECTOR_CODES.map((code) => histories[code] as number[]).filter((h) => h.length > 1);
  const domain = withHistory.length > 0 ? sharedDomain(withHistory) : undefined;
  const points = overallPoints(live, (algo) => (algo === null ? copy.versionLabelOther : copy.versionLabel(algo)));
  const hasVersionMark = points.some((p) => p.version);
  const overall = live.overall.price;
  const ticker = me.user.ticker ?? copy.noTicker;
  const dailyParams = getAlgo().live.dailyOpen;

  const feature = !dailyShown ? null : bodyHalted ? (
    <FeatureEntry
      href={ROUTES.open}
      sector="MIND"
      eyebrow={openFeature.eyebrow}
      title={openFeature.haltedTitle}
      detail={openFeature.haltedDetail(daysWithoutRecord(live, 'B') ?? dailyParams.haltAfterDays)}
      action={openFeature.haltedAction}
      art={<Spot kind="halted" size={148} />}
    />
  ) : !daily.recordedToday ? (
    <FeatureEntry
      href={ROUTES.open}
      sector="MIND"
      eyebrow={openFeature.eyebrow}
      title={openFeature.title}
      detail={openFeature.detail}
      action={openFeature.action}
      art={<Spot kind="sunrise" size={148} />}
    />
  ) : (
    <FeatureEntry
      href={ROUTES.open}
      sector="MIND"
      eyebrow={openFeature.eyebrow}
      title={openFeature.doneTitle}
      detail={live.streak.canBackfill.length > 0 ? openFeature.backfillDetail : openFeature.doneDetail}
      action={live.streak.canBackfill.length > 0 ? openFeature.backfillAction : openFeature.doneAction}
      art={<Spot kind="sunrise" size={148} />}
    />
  );

  const select = (area: AreaId) => {
    setAsked(true);
    setSelected(area);
  };

  // A check that was started and left: it goes on at the question where it stopped.
  const inProgress = me.openSession;

  // The change shown first: against yesterday. On the first day of the series there is no
  // yesterday: then against the check before (a retake the same day), or against what today's
  // check gave on its own (records made after it today). "First record" only when neither moved.
  const sinceToday = live.overall.sinceCheck !== null && Math.abs(live.overall.sinceCheck) >= 0.005 ? live.overall.sinceCheck : null;
  const headline =
    live.overall.change !== null
      ? { change: { value: live.overall.change, pct: live.overall.changePercent }, since: copy.sinceYesterday }
      : me.change && me.change.delta !== null
        ? { change: { value: me.change.delta, pct: me.change.percent }, since: copy.sinceLastCheck }
        : sinceToday !== null
          ? { change: { value: sinceToday, pct: live.overall.sinceCheckPercent }, since: copy.sinceTodaysCheck }
          : { change: null, since: copy.sinceYesterday };

  return (
    <>
      {live.mindNotice && (
        <Note tone="care" title={mindNotice.title} className={styles.notice}>
          <p>
            {me.latest?.result.mindAlert
              ? mindNotice.fromCheck
              : mindNotice.fromDaily(dailyParams.mindNotice.veryBadDays, dailyParams.mindNotice.windowDays)}
          </p>
        </Note>
      )}

      {overall !== null ? (
        <>
          <QuoteHead
            ticker={ticker}
            cohort={cohortOf(me)}
            price={overall}
            change={headline.change}
            since={headline.since}
          />
          <div className={styles.against}>
            <p className={styles.againstLine}>
              <span>{copy.againstIssue}</span>
              <Change value={overall - 100} size="sm" />
            </p>
            <Ruler value={overall} />
            {/* The price history needs two days. Until then the ruler is the picture, and this line says when the chart starts. */}
            {points.length < 2 && <p className={styles.rulerNote}>{copy.historyOneDay}</p>}
          </div>
          {isCatchingUp(live.overall) && (
            <p className={styles.catchUp}>{copy.catchingUp(formatPrice(live.overall.target as number), live.moveLimit)}</p>
          )}
        </>
      ) : (
        <div className={styles.noOverall}>
          <Ticker variant="chip">{ticker}</Ticker>
          <h1 className="t-h1">{copy.noOverall}</h1>
          <p>{copy.noOverallDetail}</p>
        </div>
      )}

      {(feature || live.retake.due || inProgress) && (
        <Block label={copy.today}>
          {inProgress && (
            <Note title={checkInProgress.title}>
              <div className={styles.retake}>
                <p>{checkInProgress.body(inProgress.answered)}</p>
                <Button variant="secondary" size="sm" href={ROUTES.check} icon={<IconRetake size={18} />}>
                  {checkInProgress.action}
                </Button>
              </div>
            </Note>
          )}
          {live.retake.due && !inProgress && (
            <Note title={retake.title}>
              <div className={styles.retake}>
                <p>{retake.body(live.retake.daysSinceCheck)}</p>
                <Button variant="secondary" size="sm" href={ROUTES.retake} icon={<IconRetake size={18} />}>
                  {retake.action}
                </Button>
              </div>
            </Note>
          )}
          {feature}
          {dailyShown && week && (
            <Card className={cx(styles.streak, styles.narrowOnly)} variant="flat">
              <Streak days={week} count={live.streak.current} />
            </Card>
          )}
        </Block>
      )}

      <Block title={copy.sectors} id="m-sectors">
        <Card>
          <SectorBoard label={copy.sectorsLabel}>
            {SECTOR_CODES.map((code) => {
              const area = areaOf(code);
              const sector = live.sectors[area];
              const history = histories[code] as number[];
              const line =
                sector.status === 'halted'
                  ? sectorLines.halted[area](daysWithoutRecord(live, area) ?? haltAfter(area))
                  : sector.dailyLimit
                    ? sectorLines.limit(live.moveLimit)
                    : sector.resumed
                      ? sectorLines.resumed
                      : undefined;
              return (
                <SectorRow
                  key={code}
                  code={code}
                  price={sector.price}
                  change={sector.change}
                  status={sector.status}
                  tag={tags[code]}
                  history={history}
                  domain={domain}
                  // A sector without a price has no move to explain: the row says why and is not a button.
                  onSelect={sector.price === null ? undefined : () => select(area)}
                >
                  {line}
                </SectorRow>
              );
            })}
          </SectorBoard>
        </Card>
      </Block>

      {points.length > 1 && (
        <Block title={copy.history} id="m-history">
          <Card>
            <PriceChart
              points={points}
              spacing="day"
              caption={hasVersionMark ? `${copy.historyCaption} ${copy.historyCaptionVersion}` : copy.historyCaption}
            />
          </Card>
        </Block>
      )}

      <Block title={copy.more} id="m-more">
        <Card pad="none">
          <EntryList label={copy.moreLabel}>
            {live.apps.payday.enabled && live.apps.payday.available && (
              <Entry
                href={ROUTES.payday}
                sector="WLTH"
                icon={<IconPayday />}
                title={entries.payday.title}
                detail={entries.payday.detail}
                status={
                  live.apps.payday.recordedToday
                    ? entries.payday.doneToday
                    : live.apps.payday.lastDay
                      ? entries.payday.last(formatDay(live.apps.payday.lastDay))
                      : entries.payday.setUp
                }
                statusTone={live.apps.payday.recordedToday ? 'done' : undefined}
              />
            )}
            {live.apps.weeklyWin.enabled && live.apps.weeklyWin.available && (
              <Entry
                href={ROUTES.win}
                sector="SKIL"
                icon={<IconWin />}
                title={entries.win.title}
                detail={entries.win.detail}
                status={live.apps.weeklyWin.recordedThisWeek ? entries.doneThisWeek : entries.dueThisWeek}
                statusTone={live.apps.weeklyWin.recordedThisWeek ? 'done' : 'due'}
              />
            )}
            {live.apps.peopleNudge.enabled && live.apps.peopleNudge.available && (
              <Entry
                href={ROUTES.people}
                sector="NETW"
                icon={<IconPeople />}
                title={entries.people.title}
                detail={entries.people.detail}
                status={live.apps.peopleNudge.recordedThisWeek ? entries.doneThisWeek : entries.dueThisWeek}
                statusTone={live.apps.peopleNudge.recordedThisWeek ? 'done' : 'due'}
              />
            )}
            <Entry
              href={inProgress ? ROUTES.check : ROUTES.retake}
              icon={<IconRetake />}
              title={entries.retake.title}
              detail={
                inProgress
                  ? checkInProgress.body(inProgress.answered)
                  : live.retake.due
                    ? entries.retake.dueDetail(live.retake.daysSinceCheck)
                    : entries.retake.detail(dailyParams.retestAfterDays)
              }
              status={inProgress ? entries.retake.inProgress : live.retake.due ? entries.retake.due : formatDay(live.retake.dueDay)}
              statusTone={!inProgress && live.retake.due ? 'due' : undefined}
            />
            <Entry href={resultRoute()} icon={<IconMarket />} title={entries.result.title} detail={entries.result.detail} />
            <Entry href={ROUTES.compare} icon={<IconCompare />} title={entries.compare.title} detail={entries.compare.detail} />
            <Entry href={ROUTES.settings} icon={<IconSettings />} title={entries.settings.title} detail={entries.settings.detail} />
          </EntryList>
        </Card>
      </Block>

      {me.latest?.result.normProvisional && <BaselineNote className={styles.baseline} />}

      <Sheet open={selected !== null} onClose={() => setSelected(null)} title={selected ? moved.title(SECTOR_CODES.find((c) => areaOf(c) === selected) ?? '') : ''}>
        {selected && (
          <SectorSheet
            live={live}
            area={selected}
            breakdown={{ data: breakdown.data, loading: breakdown.loading, error: breakdown.error !== null, onRetry: () => void breakdown.refresh() }}
          />
        )}
      </Sheet>
    </>
  );
}
