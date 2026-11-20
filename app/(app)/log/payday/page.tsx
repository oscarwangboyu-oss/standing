'use client';

/**
 * Payday Check: a setup once, then three numbers each payday. The amounts are kept on this
 * device only (src/client/device.ts). This device turns them into bands with the engine's
 * paydayBandsFor and posts the bands; the server has no field an amount could arrive in.
 */
import { useState, type FormEvent } from 'react';
import { api, applyLive, errorCodeOf, useAsync, useDevice, useMe } from '@/client/api';
import { device as deviceStore, newClientId, type LocalPayday } from '@/client/device';
import { useFlags } from '@/client/flags';
import { ROUTES } from '@/client/nav';
import { today as deviceToday } from '@/client/today';
import { payday as copy, shared } from '@/copy/micro';
import { PAY_FREQUENCIES, getAlgo, getBank, paydayBandsFor, type PayFrequency, type PaydayBands, type PaydayLocal, type PaydaySetup } from '@/engine';
import type { MeLive, MeResponse } from '@/shared/api';
import { Button, Card, Field, Note, OptionList, formatDay, sectorStyle } from '@/ui';
import { daysWithoutRecord, nextPayday } from '@/ui/market/live';
import { Facts, More, Moved, MicroClosed, MicroError, MicroHead, MicroSkeleton, MicroState, Recorded, errorMessage, useTopOnChange } from '@/ui/micro/parts';
import styles from '@/ui/micro/micro.module.css';

const BACK = { href: ROUTES.log, label: shared.backLabel, name: shared.back };

/** "1,250.50" or "$1250" to a number of 0 or more. null for anything else. */
function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

const money = (value: number): string => `${copy.currency}${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
/** On leaving a field: "2400" reads "2,400". Text that is not an amount stays as typed, so its error can say why. */
const tidy = (text: string): string => {
  const value = parseAmount(text);
  return value === null ? text : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
};
const percent = (share: number | null): string => (share === null ? copy.noShare : `${Math.round(share * 100)}%`);
const byDay = (a: LocalPayday, b: LocalPayday): number => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0);

export default function PaydayPage() {
  const me = useMe();
  const flags = useFlags();
  const head = <MicroHead title={copy.title} lead={copy.lead} sectors={['WLTH']} back={BACK} />;

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
  if (!flags.flags.payday) {
    return (
      <>
        {head}
        <MicroClosed name={copy.name} home={ROUTES.market} />
      </>
    );
  }
  if (!live) return <MicroSkeleton />;
  if (!live.apps.payday.eligible) {
    return (
      <>
        {head}
        <MicroState title={copy.notEligibleTitle} actions={<Button variant="secondary" href={ROUTES.log}>{shared.backLabel}</Button>}>
          <p>{copy.notEligible}</p>
        </MicroState>
      </>
    );
  }
  return <Payday me={me.data} live={live} />;
}

function Payday({ me, live }: { me: MeResponse; live: MeLive }) {
  const device = useDevice();
  const params = getAlgo().live.payday;
  const { setup, entries } = device.payday;
  const [mode, setMode] = useState<'auto' | 'entry' | 'setup'>('auto');
  // A payday saved in this visit: the mark of the done state fills in once.
  const [justSaved, setJustSaved] = useState(false);
  const breakdown = useAsync(() => api.dayBreakdown({ day: live.today, today: live.today }), [live.today, live.sectors.W.target], {
    enabled: live.apps.payday.recordedToday,
  });

  // Which wealth answers the three numbers can move for this person, read off the last full check.
  const shareKey = me.latest?.result.steps.find((s) => s.id === params.shareItemId)?.key ?? null;
  const savesShare = shareKey === params.saveShare.versionKey;
  const baseline = live.apps.payday.baseline;
  const movesRunway = !!baseline && baseline.runwayOption !== null && baseline.runwayKey !== null && params.runway.versionKeys.includes(baseline.runwayKey);

  const updates = (
    <Facts
      sector="WLTH"
      title={copy.updatesTitle}
      items={[
        savesShare ? copy.updates.shareSave(params.averagePeriods) : copy.updates.shareDebt,
        movesRunway ? copy.updates.runway : copy.updates.runwayStays,
        copy.updates.stays,
        copy.updates.halt(params.haltAfterDays),
      ]}
    />
  );
  const privacyFacts = <Facts sector="WLTH" title={copy.privacyTitle} items={copy.privacyFacts} />;
  const privacy = (
    <Note title={copy.privacyTitle} className={styles.noteTop}>
      <p>{copy.privacy}</p>
    </Note>
  );
  const sorted = [...entries].sort(byDay);
  const todayEntry = sorted.find((e) => e.day === live.today) ?? null;
  const showDone = !!setup && mode === 'auto' && live.apps.payday.recordedToday;
  const screen = !setup || mode === 'setup' ? 'setup' : showDone ? 'done' : 'entry';
  const top = useTopOnChange(screen);
  // Once a payday is recorded, the line that says so is the heading of the screen.
  const head = showDone ? <MicroHead sectors={['WLTH']} back={BACK} /> : <MicroHead title={copy.title} lead={copy.lead} sectors={['WLTH']} back={BACK} />;
  const halted = live.sectors.W.status === 'halted' && live.sectors.W.haltedSince && (
    <Note title={shared.haltedTitle('Wealth')} className={styles.noteTop}>
      <p>{copy.halted(formatDay(live.sectors.W.haltedSince), daysWithoutRecord(live, 'W') ?? params.haltAfterDays)}</p>
    </Note>
  );

  if (screen === 'setup' || !setup) {
    return (
      <>
        {head}
        {privacy}
        <SetupForm
          initial={setup}
          onSave={(next) => {
            deviceStore().update((d) => ({ ...d, payday: { ...d.payday, setup: next } }));
            setMode(setup ? 'auto' : 'entry');
          }}
        />
        <More className={styles.note}>
          {privacyFacts}
          {updates}
        </More>
      </>
    );
  }

  if (screen === 'entry') {
    return (
      <>
        {head}
        {halted}
        {privacy}
        <EntryForm
          setup={setup}
          entries={sorted}
          correcting={todayEntry}
          baseline={baseline}
          onSaved={(live) => {
            applyLive(live);
            setJustSaved(true);
            setMode('auto');
          }}
        />
        <div className={styles.center}>
          <Button variant="quiet" onClick={() => setMode('setup')}>
            {copy.changeSetup}
          </Button>
        </div>
        <More className={styles.note}>
          {privacyFacts}
          {updates}
        </More>
      </>
    );
  }

  // ---------------------------------------------------------------- recorded today
  let computed: { bands: PaydayBands; local: PaydayLocal } | null = null;
  if (todayEntry) {
    try {
      computed = paydayBandsFor({ setup, entries: sorted, baseline });
    } catch {
      computed = null;
    }
  }
  const bank = getBank();
  const shareBand = (k: number): string => bank.items[params.shareItemId]?.versions.find((v) => v.key === params.saveShare.versionKey)?.opts[k]?.en ?? '';
  const runwayBand = (k: number): string => bank.items[params.runwayItemId]?.versions.find((v) => v.key === baseline?.runwayKey)?.opts[k]?.en ?? '';

  // Months of savings count paydays after the day of the check. On that day there is none yet.
  const afterCheck = baseline ? sorted.some((e) => e.day > baseline.day) : true;

  return (
    <>
      {head}
      <Recorded
        level={1}
        headingRef={top}
        sector="WLTH"
        fresh={justSaved}
        title={copy.savedTitle}
        detail={copy.savedDetail(formatDay(todayEntry?.day ?? live.today))}
      />
      <Moved
        live={live}
        areas={['W']}
        label={copy.wealthNow}
        breakdown={{ data: breakdown.data, loading: breakdown.loading, error: breakdown.error !== null, onRetry: () => void breakdown.refresh() }}
      />

      {computed && (
        <>
          <Card className={styles.note}>
            <div className={styles.facts}>
              <h2 className={styles.factsTitle}>{copy.compareTitle}</h2>
              <p className={styles.factsNote}>{copy.compareNote}</p>
              {sorted.length > 1 ? (
                <table className={styles.compare}>
                  <thead>
                    <tr>
                      <th scope="col">
                        <span className="vh">{copy.compareTitle}</span>
                      </th>
                      <th scope="col">{copy.last}</th>
                      <th scope="col">{copy.now}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">{copy.saveShare}</th>
                      <td>{percent(computed.local.previousSaveShare)}</td>
                      <td>{percent(computed.local.saveShare)}</td>
                    </tr>
                    <tr>
                      <th scope="row">{copy.spendShare}</th>
                      <td>{percent(computed.local.previousSpendShare)}</td>
                      <td>{percent(computed.local.spendShare)}</td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <p className={styles.resultLine}>{copy.compareFirst}</p>
              )}
              <table className={`${styles.compare} ${styles.compareWide}`}>
                <tbody>
                  {sorted.length === 1 && (
                    <>
                      <tr>
                        <th scope="row">{copy.saveShare}</th>
                        <td>{percent(computed.local.saveShare)}</td>
                      </tr>
                      <tr>
                        <th scope="row">{copy.spendShare}</th>
                        <td>{percent(computed.local.spendShare)}</td>
                      </tr>
                    </>
                  )}
                  {computed.local.averageSaveShare !== null && sorted.length > 1 && (
                    <tr>
                      <th scope="row">{copy.averageShare(Math.min(sorted.length, params.averagePeriods))}</th>
                      <td>{percent(computed.local.averageSaveShare)}</td>
                    </tr>
                  )}
                  {computed.local.runwayMonthsSinceCheck !== null && afterCheck && (
                    <tr>
                      <th scope="row">{copy.monthsSinceCheck}</th>
                      <td>{(Math.round(computed.local.runwayMonthsSinceCheck * 10) / 10).toFixed(1)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {computed.local.runwayMonthsSinceCheck !== null && !afterCheck && (
                <p className={styles.resultLine}>{copy.monthsFromNext(formatDay(nextPayday(live.today, setup.frequency)))}</p>
              )}
            </div>
          </Card>
        </>
      )}

      {sorted.length > 0 && (
        <Card variant="flat" className={styles.note}>
          <div className={styles.facts}>
            <h2 className={styles.factsTitle}>{copy.historyTitle}</h2>
            <p className={styles.factsNote}>{copy.historyNote}</p>
            <ul className={styles.rows} aria-label={copy.historyLabel}>
              {[...sorted]
                .reverse()
                .slice(0, 6)
                .map((e) => (
                  <li key={e.id} className={styles.row}>
                    <span className={styles.rowText}>
                      <span className={styles.rowTitle}>{formatDay(e.day)}</span>
                      <span className={styles.rowDetail}>{copy.historyRow(money(e.income), money(e.spending ?? 0), money(e.savings))}</span>
                    </span>
                  </li>
                ))}
            </ul>
            <p className={styles.factsNote}>{copy.setupSummary(copy.frequencies[setup.frequency], money(setup.essentialMonthly))}</p>
          </div>
        </Card>
      )}

      <More className={styles.note}>
        {computed && (
          <Facts
            sector="WLTH"
            title={copy.sentTitle}
            items={[
              computed.bands.saveShare !== null ? copy.sentShare(shareBand(computed.bands.saveShare), computed.bands.periods) : copy.sentNoShare,
              computed.bands.saveShare !== null && !savesShare && copy.sentShareUnused,
              computed.bands.runway !== null ? copy.sentRunway(runwayBand(computed.bands.runway)) : copy.sentNoRunway,
            ]}
          />
        )}
        {updates}
        {privacyFacts}
      </More>

      <div className={`${styles.actions} ${styles.note}`}>
        <Button variant="secondary" full onClick={() => setMode('entry')}>
          {copy.correct}
        </Button>
        <div className={styles.center}>
          <Button variant="quiet" onClick={() => setMode('setup')}>
            {copy.changeSetup}
          </Button>
        </div>
      </div>
    </>
  );
}

function SetupForm({ initial, onSave }: { initial: PaydaySetup | null; onSave: (setup: PaydaySetup) => void }) {
  const [frequency, setFrequency] = useState<PayFrequency | null>(initial?.frequency ?? null);
  const [essential, setEssential] = useState(initial ? tidy(String(initial.essentialMonthly)) : '');
  const [tried, setTried] = useState(false);
  const amount = parseAmount(essential);
  const essentialError = tried && (amount === null || amount <= 0) ? copy.errors.essential : undefined;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (frequency === null || amount === null || amount <= 0) return;
    onSave({ frequency, essentialMonthly: amount });
  };
  return (
    <form className={styles.form} onSubmit={submit} noValidate style={sectorStyle('WLTH')}>
      <h2 className={styles.formTitle}>{copy.setupTitle}</h2>
      <p className={styles.formLead}>{copy.setupLead}</p>
      <div className={styles.group}>
        <p id="pay-frequency" className={styles.groupLabel}>
          {copy.frequency}
        </p>
        <OptionList
          compact
          labelledBy="pay-frequency"
          options={PAY_FREQUENCIES.map((f) => ({ value: f, label: copy.frequencies[f] }))}
          value={frequency}
          onSelect={(value) => setFrequency(value as PayFrequency)}
        />
        {tried && frequency === null && <MicroError>{copy.errors.frequency}</MicroError>}
      </div>
      <Field
        label={copy.essential}
        kind="number"
        prefix={copy.currency}
        hint={copy.essentialHint}
        error={essentialError}
        value={essential}
        onChange={(e) => setEssential(e.target.value)}
        onBlur={() => setEssential(tidy)}
      />
      <div className={styles.actions}>
        <Button type="submit" size="lg" full>
          {copy.saveSetup}
        </Button>
      </div>
    </form>
  );
}

function EntryForm({
  setup,
  entries,
  correcting,
  baseline,
  onSaved,
}: {
  setup: PaydaySetup;
  /** Oldest first. */
  entries: LocalPayday[];
  /** Today's entry on this device, when the numbers of today are being corrected. */
  correcting: LocalPayday | null;
  baseline: MeLive['apps']['payday']['baseline'];
  onSaved: (live: MeLive | null) => void;
}) {
  const last = entries[entries.length - 1] ?? null;
  const [income, setIncome] = useState(correcting ? tidy(String(correcting.income)) : last ? tidy(String(last.income)) : '');
  const [spending, setSpending] = useState(correcting ? tidy(String(correcting.spending)) : '');
  const [savings, setSavings] = useState(correcting ? tidy(String(correcting.savings)) : '');
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const values = { income: parseAmount(income), spending: parseAmount(spending), savings: parseAmount(savings) };
  const fieldError = (value: number | null) => (tried && value === null ? copy.errors.required : undefined);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (values.income === null || values.spending === null || values.savings === null || saving) return;
    setSaving(true);
    setError(null);
    try {
      const localDate = deviceToday();
      const id = newClientId();
      const amounts = { day: localDate, income: values.income, spending: values.spending, savings: values.savings };
      // One payday a day on this device: a second save of the same day corrects the first.
      const others = entries.filter((e) => e.day !== localDate);
      const { bands } = paydayBandsFor({ setup, entries: [...others, amounts], baseline });
      // Bands only. The three amounts are not in this request.
      const res = await api.postPayday({
        id,
        localDate,
        periods: bands.periods,
        saveShare: bands.saveShare,
        runway: bands.runway,
        baselineDay: bands.baselineDay,
      });
      deviceStore().update((d) => ({ ...d, payday: { setup: d.payday.setup, entries: [...others, { ...amounts, id }] } }));
      onSaved(res.live);
    } catch (e) {
      setError(errorMessage(errorCodeOf(e)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate style={sectorStyle('WLTH')}>
      <h2 className={styles.formTitle}>{correcting ? copy.correctTitle : copy.entryTitle}</h2>
      <p className={styles.formLead}>{copy.setupSummary(copy.frequencies[setup.frequency], money(setup.essentialMonthly))}</p>
      <Field
        label={copy.income}
        kind="number"
        prefix={copy.currency}
        hint={last ? copy.incomeHint : copy.incomeHintFirst}
        error={fieldError(values.income)}
        value={income}
        onChange={(e) => setIncome(e.target.value)}
        onBlur={() => setIncome(tidy)}
      />
      <Field
        label={copy.spending}
        kind="number"
        prefix={copy.currency}
        hint={copy.spendingHint}
        error={fieldError(values.spending)}
        value={spending}
        onChange={(e) => setSpending(e.target.value)}
        onBlur={() => setSpending(tidy)}
      />
      <Field
        label={copy.savings}
        kind="number"
        prefix={copy.currency}
        error={fieldError(values.savings)}
        value={savings}
        onChange={(e) => setSavings(e.target.value)}
        onBlur={() => setSavings(tidy)}
      />
      <MicroError>{error}</MicroError>
      <div className={styles.actions}>
        <Button type="submit" size="lg" full disabled={saving}>
          {saving ? shared.saving : copy.save}
        </Button>
      </div>
    </form>
  );
}
