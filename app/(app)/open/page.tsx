'use client';

/**
 * Daily Open: three taps, then today's price. Last night's sleep, yesterday's exercise, how
 * you feel now. Yesterday can be filled in today. Body and Mind light up in the skyline once
 * the day is recorded. Not available without the Body and Mind consent.
 */
import { useState } from 'react';
import { api, applyLive, errorCodeOf, useAsync, useDevice, useMe } from '@/client/api';
import { newClientId } from '@/client/device';
import { useFlags } from '@/client/flags';
import { ROUTES } from '@/client/nav';
import { today as deviceToday } from '@/client/today';
import { market, mindNotice } from '@/copy/market';
import { open as copy, shared } from '@/copy/micro';
import { addDays, getAlgo } from '@/engine';
import type { MeLive, MeResponse } from '@/shared/api';
import {
  Button,
  Card,
  Change,
  IconCalendar,
  Note,
  OptionList,
  Price,
  ProgressTape,
  Streak,
  Toast,
  formatDay,
  sectorStyle,
  useToast,
} from '@/ui';
import { daysWithoutRecord, streakWeek } from '@/ui/market/live';
import { dailyReminderIcs, isReminderTime } from '@/ui/micro/ics';
import { Moved, MicroClosed, MicroError, MicroHead, MicroSkeleton, MicroState, Pills, errorMessage } from '@/ui/micro/parts';
import styles from '@/ui/micro/micro.module.css';
import { rememberDaily, useDailyLog, type DailyLogView } from './dailyLog';

type Which = 'today' | 'yesterday';
const STEPS = ['sleep', 'exercise', 'state'] as const;
type StepName = (typeof STEPS)[number];
type Taps = Record<StepName, number | null>;
const NO_TAPS: Taps = { sleep: null, exercise: null, state: null };

export default function OpenPage() {
  const me = useMe();
  const flags = useFlags();
  const device = useDevice();
  const log = useDailyLog(device.userId);

  if (!me.data || !flags.loaded) {
    if ((me.loaded && !me.loading && !me.data) || flags.error) {
      return (
        <MicroState spot="building" title={copy.title} actions={<Button variant="secondary" onClick={() => void me.refresh()}>{shared.retry}</Button>}>
          <p>{shared.loadError}</p>
        </MicroState>
      );
    }
    return <MicroSkeleton />;
  }
  const live = me.data.live;
  if (!flags.flags.dailyOpen) {
    return (
      <>
        <MicroHead title={copy.title} sectors={['BODY', 'MIND']} />
        <MicroClosed name={copy.name} home={ROUTES.market} />
      </>
    );
  }
  if (!me.data.consent.health) {
    return (
      <>
        <MicroHead title={copy.title} sectors={['BODY', 'MIND']} />
        <MicroState title={copy.consentTitle} actions={<Button href={ROUTES.settings}>{copy.consentAction}</Button>}>
          <p>{copy.consent}</p>
          <p>{copy.consentAfter}</p>
        </MicroState>
      </>
    );
  }
  if (!live) return <MicroSkeleton />;
  return <DailyOpen me={me.data} live={live} log={log} />;
}

function DailyOpen({ me, live, log }: { me: MeResponse; live: MeLive; log: DailyLogView }) {
  const params = getAlgo().live.dailyOpen;
  const yesterday = addDays(live.today, -1);
  const canYesterday = live.streak.canBackfill.includes(yesterday);
  const recordedToday = live.streak.recordedToday;

  // The day being entered. null: nothing to enter, the screen shows today's open.
  const [which, setWhich] = useState<Which | null>(recordedToday ? null : 'today');
  const [step, setStep] = useState(0);
  const [taps, setTaps] = useState<Taps>(NO_TAPS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ which: Which; stored: boolean } | null>(null);
  const toast = useToast();

  const breakdown = useAsync(() => api.dayBreakdown({ day: live.today, today: live.today }), [live.today, live.sectors.B.target, live.sectors.M.target], {
    enabled: which === null,
  });

  const bodyHalted = live.sectors.B.status === 'halted' || live.sectors.M.status === 'halted';
  const unlisted = live.sectors.B.status === 'unlisted' && live.sectors.M.status === 'unlisted';
  const week = streakWeek(live.streak, live.today, market.weekdays, log.known);

  const submit = async (day: Which, all: Taps) => {
    if (all.sleep === null && all.exercise === null && all.state === null) {
      setError(copy.needOne);
      setStep(0);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const localDate = deviceToday();
      const res = await api.postDaily({ localDate, day: day === 'today' ? localDate : addDays(localDate, -1), ...all });
      if (res.stored) rememberDaily({ day: res.day, ...all });
      applyLive(res.live);
      setSaved({ which: day, stored: res.stored });
      // Yesterday first, then today: the day is not opened until today has its three taps.
      const todayOpen = !(res.live?.streak.recordedToday ?? recordedToday);
      setWhich(day === 'yesterday' && todayOpen ? 'today' : null);
      setStep(0);
      setTaps(NO_TAPS);
    } catch (e) {
      setError(errorMessage(errorCodeOf(e)));
      setStep(STEPS.length - 1);
    } finally {
      setSaving(false);
    }
  };

  const answer = (value: number | null) => {
    if (which === null || saving) return;
    const name = STEPS[step] as StepName;
    const next = { ...taps, [name]: value };
    setTaps(next);
    setError(null);
    if (step < STEPS.length - 1) setStep(step + 1);
    else void submit(which, next);
  };

  const notice = live.mindNotice && (
    <Note tone="care" title={mindNotice.title} className={styles.noteTop}>
      <p>{me.latest?.result.mindAlert ? mindNotice.fromCheck : mindNotice.fromDaily(params.mindNotice.veryBadDays, params.mindNotice.windowDays)}</p>
    </Note>
  );

  const streakCard = (
    <Card variant="flat">
      <Streak days={week} count={live.streak.current} />
      <p className={styles.skyNote}>{copy.streakRule}</p>
    </Card>
  );

  // ---------------------------------------------------------------- the three taps
  if (which !== null) {
    const name = STEPS[step] as StepName;
    const labels = copy[name];
    const questionId = `open-q-${name}`;
    return (
      <>
        {notice}
        <MicroHead title={copy.title} lead={copy.lead} sectors={['BODY', 'MIND']} />
        {bodyHalted && live.sectors.B.haltedSince && (
          <Note title={copy.haltedTitle} className={styles.noteTop}>
            <p>{copy.haltedBody(formatDay(live.sectors.B.haltedSince), daysWithoutRecord(live, 'B') ?? params.haltAfterDays)}</p>
          </Note>
        )}
        {unlisted && (
          <Note title={copy.unlistedTitle} className={styles.noteTop}>
            <p>{copy.unlisted}</p>
          </Note>
        )}
        <div className={styles.flow} style={sectorStyle(name === 'state' ? 'MIND' : 'BODY')}>
          {canYesterday && !recordedToday && step === 0 && (
            <div className={styles.dayChoice}>
              <p className={styles.resultLine}>{copy.yesterdayOpen}</p>
              <Pills<Which>
                label={copy.dayLabel}
                value={which}
                onChange={setWhich}
                options={[
                  { value: 'today', label: copy.today },
                  { value: 'yesterday', label: copy.yesterday },
                ]}
              />
            </div>
          )}
          {saved?.which === 'yesterday' && step === 0 && <p className={styles.resultLine}>{saved.stored ? copy.thenToday : copy.alreadyRecorded}</p>}
          <ProgressTape total={STEPS.length} current={step + 1} />
          <h2 id={questionId} className={styles.question}>
            {copy.questions[which][name]}
          </h2>
          {name === 'exercise' && <p className={styles.hint}>{copy.exerciseHint}</p>}
          <OptionList
            key={`${which}-${name}`}
            labelledBy={questionId}
            options={labels.map((label, i) => ({ value: String(i), label }))}
            value={taps[name] === null ? null : String(taps[name])}
            onSelect={(value) => answer(Number(value))}
            disabled={saving}
          />
          <MicroError>{error}</MicroError>
          <div className={styles.skip}>
            <Button variant="quiet" onClick={() => answer(null)} disabled={saving}>
              {saving ? shared.saving : copy.skip}
            </Button>
          </div>
        </div>
        <div className={styles.note}>{streakCard}</div>
      </>
    );
  }

  // ---------------------------------------------------------------- today's open
  const overall = live.overall;
  const todayTaps = log.tapsOf(live.today);
  return (
    <>
      {notice}
      <MicroHead title={saved?.which === 'yesterday' && saved.stored ? copy.doneYesterday : copy.doneToday} sectors={['BODY', 'MIND']} />
      {saved && !saved.stored && (
        <Note className={styles.noteTop}>
          <p>{copy.alreadyRecorded}</p>
        </Note>
      )}
      {overall.price !== null && (
        <div className={styles.resultHead}>
          <p className={styles.resultLabel}>{copy.priceToday}</p>
          <div className={styles.resultPrice}>
            <Price value={overall.price} size="xl" />
            {overall.change !== null && (
              <>
                <Change value={overall.change} pct={overall.changePercent} size="lg" />
                <span className={styles.resultSince}>{copy.sinceYesterday}</span>
              </>
            )}
          </div>
        </div>
      )}

      <div className={styles.note}>
        <Moved
          live={live}
          areas={['B', 'M']}
          label={copy.bodyMindLabel}
          skyNote={live.sectors.B.status === 'listed' || live.sectors.M.status === 'listed' ? copy.litLine : undefined}
          breakdown={{ data: breakdown.data, loading: breakdown.loading, error: breakdown.error !== null, onRetry: () => void breakdown.refresh() }}
        />
      </div>
      {unlisted && (
        <Note title={copy.unlistedTitle} className={styles.note}>
          <p>{copy.unlisted}</p>
        </Note>
      )}
      <p className={`${styles.resultLine} ${styles.note}`}>{copy.rules(live.moveLimit, params.minDays, params.windowDays)}</p>

      {todayTaps && (
        <Card variant="flat" className={styles.note}>
          <p className="t-label">{copy.yourTaps}</p>
          <dl className={styles.taps}>
            {STEPS.map((name) => (
              <div key={name} className={styles.tap}>
                <dt>{copy.tapsLabels[name]}</dt>
                <dd>{todayTaps[name] === null ? copy.tapSkipped : copy[name][todayTaps[name] as number]}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      <div className={styles.note}>{streakCard}</div>

      {canYesterday && (
        <div className={`${styles.actions} ${styles.note}`}>
          <p className={styles.resultLine}>{copy.yesterdayOpen}</p>
          <Button
            variant="secondary"
            full
            onClick={() => {
              setSaved(null);
              setError(null);
              setWhich('yesterday');
            }}
          >
            {copy.fillYesterday}
          </Button>
        </div>
      )}

      <Calendar startDay={live.today} onSaved={toast.show} />
      <Toast>{toast.message}</Toast>
    </>
  );
}

/** "Add to calendar": a daily repeating event at the time the person picks, linking back to this screen. */
function Calendar({ startDay, onSaved }: { startDay: string; onSaved: (message: string) => void }) {
  const [time, setTime] = useState('08:00');
  const save = () => {
    try {
      const url = new URL(ROUTES.open, window.location.origin).toString();
      const ics = dailyReminderIcs({
        time,
        startDay,
        url,
        summary: copy.calendar.summary,
        description: copy.calendar.description(url),
        uid: newClientId(),
        now: new Date(),
      });
      const href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = href;
      a.download = copy.calendar.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 2000);
      onSaved(copy.calendar.saved);
    } catch {
      onSaved(copy.calendar.failed);
    }
  };
  return (
    <Card variant="sunk" className={styles.note}>
      <div className={styles.calendar}>
        <div>
          <h2 className="t-h3">{copy.calendar.title}</h2>
          <p className="t-small">{copy.calendar.lead}</p>
        </div>
        <div className={styles.calendarRow}>
          <label className={styles.time}>
            <span className={styles.timeLabel}>{copy.calendar.time}</span>
            <input className={styles.timeInput} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <Button variant="secondary" icon={<IconCalendar size={18} />} onClick={save} disabled={!isReminderTime(time)} data-action="add-to-calendar">
            {copy.calendar.action}
          </Button>
        </div>
      </div>
    </Card>
  );
}
