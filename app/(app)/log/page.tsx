'use client';

/**
 * The log: the three apps that keep Wealth, Capability and Network current, each with its
 * state (done, due, halted, not open yet), and the days on which the overall price moved. A
 * tap on a day opens what caused the move, sector by sector.
 */
import { useState, type ReactNode } from 'react';
import { api, useAsync, useDevice, useMe } from '@/client/api';
import { useFlags } from '@/client/flags';
import { ROUTES } from '@/client/nav';
import { entries } from '@/copy/market';
import { hub as copy, shared } from '@/copy/micro';
import { addDays, type AreaId, type PayFrequency } from '@/engine';
import type { MeLive } from '@/shared/api';
import {
  Block,
  Button,
  Card,
  Change,
  Entry,
  EntryList,
  IconChevron,
  IconPayday,
  IconPeople,
  IconWin,
  Price,
  Sheet,
  Spot,
  Tag,
  formatDay,
} from '@/ui';
import { AREAS, caughtUp, moveDays, nextMonday } from '@/ui/market/live';
import { MoveBreakdown } from '@/ui/market/MoveBreakdown';
import { MicroHead, MicroSkeleton, MicroState } from '@/ui/micro/parts';
import styles from '@/ui/micro/micro.module.css';

/** Days from one payday to the next, to say when the next one is due. Twice a month and monthly are rounded. */
const PERIOD_DAYS: Record<PayFrequency, number> = { weekly: 7, biweekly: 14, semimonthly: 15, monthly: 30 };

export default function LogPage() {
  const me = useMe();
  const flags = useFlags();

  if (!me.data?.live || !flags.loaded) {
    if ((me.loaded && !me.loading && !me.data) || flags.error) {
      return (
        <MicroState spot="building" title={copy.title} actions={<Button variant="secondary" onClick={() => void me.refresh()}>{shared.retry}</Button>}>
          <p>{shared.loadError}</p>
        </MicroState>
      );
    }
    return <MicroSkeleton />;
  }
  return <Hub live={me.data.live} flags={flags.flags} />;
}

function Hub({ live, flags }: { live: MeLive; flags: { payday: boolean; weeklyWin: boolean; peopleNudge: boolean } }) {
  const device = useDevice();
  const [day, setDay] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const breakdown = useAsync(() => api.dayBreakdown({ day: opened ?? live.today, today: live.today }), [opened, live.today], { enabled: opened !== null });
  const moves = moveDays(live, 14);
  const { payday, weeklyWin, peopleNudge } = live.apps;
  const monday = formatDay(nextMonday(live.today));

  // ---- Payday Check
  let paydayStatus: ReactNode;
  let paydayDetail: string = copy.payday.never;
  if (!flags.payday) paydayStatus = copy.status.closed;
  else if (!payday.eligible) {
    paydayStatus = copy.status.notOffered;
    paydayDetail = copy.payday.notOffered;
  } else {
    const setup = device.payday.setup;
    const lastLocal = [...device.payday.entries].sort((a, b) => (a.day < b.day ? 1 : -1))[0]?.day ?? null;
    const last = payday.lastDay ?? lastLocal;
    if (live.sectors.W.status === 'halted') paydayStatus = <Tag kind="halted" />;
    else if (payday.recordedToday) paydayStatus = copy.status.doneToday;
    else if (!setup && !last) paydayStatus = copy.status.setUp;
    if (setup && last) {
      const next = addDays(last, PERIOD_DAYS[setup.frequency]);
      paydayDetail = next > live.today ? copy.payday.next(formatDay(next)) : copy.payday.dueNow(formatDay(next));
    } else if (last) paydayDetail = copy.payday.last(formatDay(last));
  }

  // ---- the two weekly apps
  const weekly = (on: boolean, app: MeLive['apps']['weeklyWin'], area: AreaId, base: string): { status: ReactNode; detail: string } => {
    if (!on) return { status: copy.status.closed, detail: base };
    if (live.sectors[area].status === 'halted') return { status: <Tag kind="halted" />, detail: app.lastDay ? copy.weekly.last(formatDay(app.lastDay)) : base };
    if (app.recordedThisWeek) return { status: copy.status.doneThisWeek, detail: copy.weekly.nextWeek(monday) };
    return { status: copy.status.due, detail: app.lastDay ? copy.weekly.last(formatDay(app.lastDay)) : base };
  };
  const win = weekly(flags.weeklyWin, weeklyWin, 'C', copy.weekly.win);
  const people = weekly(flags.peopleNudge, peopleNudge, 'N', copy.weekly.people);

  const openDay = (d: string) => {
    setOpened(d);
    setDay(d);
  };
  const openedMove = moves.find((m) => m.day === opened) ?? null;

  return (
    <>
      <MicroHead title={copy.title} lead={copy.lead} />

      <Block title={copy.appsTitle} id="log-apps">
        <Card pad="none">
          <EntryList label={copy.appsLabel}>
            <Entry href={ROUTES.payday} sector="WLTH" icon={<IconPayday />} title={entries.payday.title} detail={paydayDetail} status={paydayStatus} />
            <Entry href={ROUTES.win} sector="SKIL" icon={<IconWin />} title={entries.win.title} detail={win.detail} status={win.status} />
            <Entry href={ROUTES.people} sector="NETW" icon={<IconPeople />} title={entries.people.title} detail={people.detail} status={people.status} />
          </EntryList>
        </Card>
      </Block>

      <Block title={copy.movesTitle} id="log-moves">
        {moves.length > 0 ? (
          <>
            <p className={styles.formLead} style={{ marginTop: 0, marginBottom: 'var(--s-4)' }}>
              {copy.movesLead}
            </p>
            <Card pad="none">
              <ul className={styles.moves} aria-label={copy.movesLabel}>
                {moves.map((m) => (
                  <li key={m.day} className={styles.moveItem}>
                    <button type="button" className={styles.move} onClick={() => openDay(m.day)} aria-label={copy.moveRow(formatDay(m.day))}>
                      <span className={styles.moveDay}>
                        {formatDay(m.day)}
                        {m.fullCheck && <Tag>{copy.fullCheck}</Tag>}
                        {m.versionChange && <Tag>{copy.versionChange}</Tag>}
                      </span>
                      <span className={styles.moveNums}>
                        <Price value={m.price} size="sm" />
                        <Change value={m.change} size="sm" />
                      </span>
                      <IconChevron className={styles.moveChevron} size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
            {moves.length === 14 && <p className={styles.movesNote}>{copy.moreMoves(moves.length)}</p>}
          </>
        ) : (
          <Card>
            <div className={styles.empty}>
              <Spot kind="lot" />
              <p className="t-h3">{copy.emptyTitle}</p>
              <p>{copy.empty}</p>
            </div>
          </Card>
        )}
      </Block>

      <Sheet open={day !== null} onClose={() => setDay(null)} title={opened ? copy.moveRow(formatDay(opened)) : ''}>
        {openedMove && (
          <div className={styles.dayQuote}>
            <Price value={openedMove.price} size="lg" />
            <Change value={openedMove.change} />
          </div>
        )}
        <MoveBreakdown
          data={breakdown.data}
          loading={breakdown.loading}
          error={breakdown.error !== null}
          onRetry={() => void breakdown.refresh()}
          areas={AREAS}
          limit={live.moveLimit}
          catchingUp={caughtUp(breakdown.data)}
        />
      </Sheet>
    </>
  );
}
