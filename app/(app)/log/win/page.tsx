'use client';

/**
 * Weekly Win: one entry a week, a course, a certificate or a skill. The server receives the
 * kind and the few choices the engine uses (hours of a course; exam and level of a
 * certificate). The name the person gives it stays on this device.
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { api, applyLive, errorCodeOf, useAsync, useDevice, useMe } from '@/client/api';
import { device as deviceStore, newClientId, type LocalWin } from '@/client/device';
import { useFlags } from '@/client/flags';
import { ROUTES } from '@/client/nav';
import { today as deviceToday } from '@/client/today';
import { shared, win as copy } from '@/copy/micro';
import { CERTIFICATE_LEVELS, WEEKLY_WIN_KINDS, dayNumber, getAlgo, weekOf, type CertificateLevel, type WeeklyWinKind } from '@/engine';
import type { MeLive, WeeklyWinRequest } from '@/shared/api';
import { Button, Card, Field, Note, OptionList, formatDay, sectorStyle } from '@/ui';
import { countWindow, daysWithoutRecord, nextMonday } from '@/ui/market/live';
import {
  Facts,
  Meter,
  More,
  Moved,
  MicroClosed,
  MicroError,
  MicroHead,
  MicroSkeleton,
  MicroState,
  Pills,
  Recorded,
  errorMessage,
  useTopOnChange,
} from '@/ui/micro/parts';
import styles from '@/ui/micro/micro.module.css';

const BACK = { href: ROUTES.log, label: shared.backLabel, name: shared.back };
const sameWeek = (a: string, b: string): boolean => weekOf(dayNumber(a)) === weekOf(dayNumber(b));

/** What was sent for a win, in words. */
function sentLine(win: Pick<LocalWin, 'kind' | 'hours' | 'exam' | 'level'>): string {
  if (win.kind === 'course') return win.hours === null || win.hours === undefined ? copy.sent.courseNoHours : copy.sent.course(copy.hours[win.hours] ?? '');
  if (win.kind === 'certificate') return copy.sent.certificate(copy.levels[win.level ?? 'entry'], win.exam === true);
  return copy.sent.skill;
}

export default function WinPage() {
  const me = useMe();
  const flags = useFlags();
  const head = <MicroHead title={copy.title} lead={copy.lead} sectors={['SKIL']} back={BACK} />;

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
  if (!flags.flags.weeklyWin) {
    return (
      <>
        {head}
        <MicroClosed name={copy.name} home={ROUTES.market} />
      </>
    );
  }
  if (!me.data.live) return <MicroSkeleton />;
  return <WeeklyWin live={me.data.live} />;
}

function WeeklyWin({ live }: { live: MeLive }) {
  const device = useDevice();
  const params = getAlgo().live.weeklyWin;
  const [mode, setMode] = useState<'auto' | 'form'>('auto');
  // A win logged in this visit: the mark of the done state fills in once.
  const [justSaved, setJustSaved] = useState(false);
  const done = live.apps.weeklyWin.recordedThisWeek;
  const showForm = !done || mode === 'form';
  const top = useTopOnChange(showForm ? 'form' : 'done');
  // Once a win is logged, the line that says so is the heading of the screen.
  const head = showForm ? <MicroHead title={copy.title} lead={copy.lead} sectors={['SKIL']} back={BACK} /> : <MicroHead sectors={['SKIL']} back={BACK} />;
  const counted = countWindow(live.apps.weeklyWin);
  const breakdown = useAsync(() => api.dayBreakdown({ day: live.today, today: live.today }), [live.today, live.sectors.C.target], {
    enabled: live.apps.weeklyWin.recordedToday,
  });

  const wins = [...device.wins].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  const thisWeek = wins.find((w) => sameWeek(w.day, live.today)) ?? null;

  const rules = (kind: WeeklyWinKind | null, exam: boolean | null) => (
    <Facts
      sector="SKIL"
      title={copy.rulesTitle}
      items={[
        kind === 'course' && copy.rules.course(params.learning.minWeeks),
        kind === 'certificate' && (exam === false ? copy.rules.certificateNoExam : copy.rules.certificateExam),
        kind === 'skill' && copy.rules.skill,
        copy.rules.regularity(params.regularity.minWeeks, params.regularity.windowWeeks),
        copy.rules.halt(params.haltAfterDays),
      ]}
    />
  );

  if (showForm) {
    return (
      <>
        {head}
        {live.sectors.C.status === 'halted' && live.sectors.C.haltedSince && (
          <Note title={shared.haltedTitle('Capability')} className={styles.noteTop}>
            <p>{copy.halted(formatDay(live.sectors.C.haltedSince), daysWithoutRecord(live, 'C') ?? params.haltAfterDays)}</p>
          </Note>
        )}
        {done && (
          <Note className={styles.noteTop}>
            <p>{copy.replaceNote}</p>
          </Note>
        )}
        <WinForm
          rules={rules}
          onSaved={(next) => {
            applyLive(next);
            setJustSaved(true);
            setMode('auto');
          }}
        />
      </>
    );
  }

  const loggedOn = thisWeek?.day ?? live.apps.weeklyWin.lastDay ?? live.today;
  return (
    <>
      {head}
      <Recorded
        level={1}
        headingRef={top}
        sector="SKIL"
        fresh={justSaved}
        title={copy.recordedTitle}
        detail={copy.recordedDetail(formatDay(loggedOn), !!thisWeek?.title)}
      />

      <Card sector="SKIL">
        <div className={styles.facts}>
          <p className={styles.resultLabel}>{copy.doneTitle}</p>
          {thisWeek ? (
            <>
              <h2 className="t-h3">{thisWeek.title || copy.untitled[thisWeek.kind]}</h2>
              <p className={styles.resultLine}>{sentLine(thisWeek)}</p>
            </>
          ) : (
            <p className={styles.resultLine}>{copy.doneNoLocal}</p>
          )}
          <p className={styles.resultLine}>{copy.nextDue(formatDay(nextMonday(live.today)))}</p>
          {counted && (
            <div className={styles.meterGap}>
              <Meter window={counted} text={copy.meter(counted.have, counted.need, counted.of)} sector="SKIL" />
            </div>
          )}
        </div>
      </Card>

      <div className={styles.note}>
        <Moved
          live={live}
          areas={['C']}
          label={copy.doneTitle}
          breakdown={{ data: breakdown.data, loading: breakdown.loading, error: breakdown.error !== null, onRetry: () => void breakdown.refresh() }}
        />
      </div>

      {wins.length > 1 && (
        <Card variant="flat" className={styles.note}>
          <div className={styles.facts}>
            <h2 className={styles.factsTitle}>{copy.historyTitle}</h2>
            <ul className={styles.rows} aria-label={copy.historyLabel}>
              {wins.slice(0, 8).map((w) => (
                <li key={w.id} className={styles.row}>
                  <span className={styles.rowText}>
                    <span className={styles.rowTitle}>{w.title || copy.untitled[w.kind]}</span>
                    <span className={styles.rowDetail}>{sentLine(w)}</span>
                  </span>
                  <span className={styles.rowSide}>{formatDay(w.day)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      <div className={`${styles.actions} ${styles.note}`}>
        <Button variant="secondary" full onClick={() => setMode('form')}>
          {copy.replace}
        </Button>
      </div>

      <More className={styles.note}>
        {rules(thisWeek?.kind ?? null, thisWeek?.exam ?? null)}
      </More>
    </>
  );
}

function WinForm({ rules, onSaved }: { rules: (kind: WeeklyWinKind | null, exam: boolean | null) => ReactNode; onSaved: (live: MeLive | null) => void }) {
  const [kind, setKind] = useState<WeeklyWinKind | null>(null);
  const [hours, setHours] = useState<number | null>(null);
  const [exam, setExam] = useState<boolean | null>(null);
  const [level, setLevel] = useState<CertificateLevel | null>(null);
  const [title, setTitle] = useState('');
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complete = kind === 'skill' || (kind === 'course' && hours !== null) || (kind === 'certificate' && exam !== null && level !== null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (!complete || kind === null || saving) return;
    setSaving(true);
    setError(null);
    try {
      const localDate = deviceToday();
      const id = newClientId();
      // The kind and the choices the engine uses. The name is not in this request.
      const body: WeeklyWinRequest = { id, localDate, kind };
      const local: LocalWin = { id, day: localDate, kind, title: title.trim() };
      if (kind === 'course') {
        body.hours = hours;
        local.hours = hours;
      }
      if (kind === 'certificate' && exam !== null && level !== null) {
        body.exam = exam;
        body.level = level;
        local.exam = exam;
        local.level = level;
      }
      const res = await api.postWeeklyWin(body);
      deviceStore().update((d) => ({ ...d, wins: [...d.wins, { ...local, day: res.day }] }));
      onSaved(res.live);
    } catch (e) {
      setError(errorMessage(errorCodeOf(e)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate style={sectorStyle('SKIL')}>
      <div className={styles.group}>
        <h2 id="win-kind" className={styles.formTitle}>
          {copy.kindQuestion}
        </h2>
        <OptionList
          labelledBy="win-kind"
          options={WEEKLY_WIN_KINDS.map((k) => ({ value: k, label: copy.kinds[k].label, hint: copy.kinds[k].hint }))}
          value={kind}
          onSelect={(value) => setKind(value as WeeklyWinKind)}
        />
      </div>

      {kind === 'course' && (
        <div className={styles.group}>
          <p id="win-hours" className={styles.groupLabel}>
            {copy.hoursQuestion}
          </p>
          <OptionList
            compact
            labelledBy="win-hours"
            options={copy.hours.map((label, i) => ({ value: String(i), label }))}
            value={hours === null ? null : String(hours)}
            onSelect={(value) => setHours(Number(value))}
          />
        </div>
      )}

      {kind === 'certificate' && (
        <>
          <div className={styles.group}>
            <p id="win-exam" className={styles.groupLabel}>
              {copy.examQuestion}
            </p>
            <Pills<'yes' | 'no'>
              labelledBy="win-exam"
              value={exam === null ? null : exam ? 'yes' : 'no'}
              onChange={(value) => setExam(value === 'yes')}
              options={[
                { value: 'yes', label: copy.exam.yes },
                { value: 'no', label: copy.exam.no },
              ]}
            />
          </div>
          <div className={styles.group}>
            <p id="win-level" className={styles.groupLabel}>
              {copy.levelQuestion}
            </p>
            <Pills<CertificateLevel>
              labelledBy="win-level"
              value={level}
              onChange={setLevel}
              options={CERTIFICATE_LEVELS.map((l) => ({ value: l, label: copy.levels[l] }))}
            />
          </div>
        </>
      )}

      {kind !== null && <Field label={copy.titleLabel} hint={copy.titleHint} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />}

      {tried && !complete && <MicroError>{copy.incomplete}</MicroError>}
      <MicroError>{error}</MicroError>
      <div className={styles.actions}>
        <Button type="submit" size="lg" full disabled={saving}>
          {saving ? shared.saving : copy.save}
        </Button>
      </div>
      <More>{rules(kind, exam)}</More>
    </form>
  );
}
