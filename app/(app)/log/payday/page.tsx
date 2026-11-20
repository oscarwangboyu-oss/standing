'use client';

/**
 * Payday Check (PROMPT.md section 10): a setup once, then four numbers each payday. Take-home
 * pay (filled in from the last payday), the money that can be used now, what went to debt and
 * what was saved. The amounts are kept on this device only (src/client/device.ts). This device
 * turns them into bands with the engine's paydayBandsFor and posts the bands; the server has no
 * field an amount could arrive in.
 */
import { useState, type FormEvent } from 'react';
import { api, applyLive, errorCodeOf, useAsync, useDevice, useMe } from '@/client/api';
import { device as deviceStore, newClientId, type LocalPayday } from '@/client/device';
import { useFlags } from '@/client/flags';
import { ROUTES } from '@/client/nav';
import { today as deviceToday } from '@/client/today';
import { payday as copy, shared } from '@/copy/micro';
import {
  PAY_FREQUENCIES,
  getAlgo,
  getBank,
  paydayBandsFor,
  type PayFrequency,
  type PaydayAmounts,
  type PaydayBands,
  type PaydayLocal,
  type PaydaySetup,
} from '@/engine';
import type { MeLive, MeResponse, PaydayEntryRequest } from '@/shared/api';
import { Button, Card, Field, Note, OptionList, formatDay, sectorStyle } from '@/ui';
import { daysWithoutRecord } from '@/ui/market/live';
import { Facts, More, Moved, MicroClosed, MicroError, MicroHead, MicroSkeleton, MicroState, Recorded, errorMessage, useTopOnChange } from '@/ui/micro/parts';
import styles from '@/ui/micro/micro.module.css';

const BACK = { href: ROUTES.log, label: shared.backLabel, name: shared.back };

/** Weeks in a month: 52 weeks over 12 months. A calendar fact, used to say a short runway in weeks. */
const WEEKS_PER_MONTH = 52 / 12;

/** "1,250.50" or "$1250" to a number of 0 or more. null for anything else. */
function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

const money = (value: number): string => `${copy.currency}${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const moneyOrNull = (value: number | null | undefined): string | null => (value === null || value === undefined ? null : money(value));
/** On leaving a field: "2400" reads "2,400". Text that is not an amount stays as typed, so its error can say why. */
const tidy = (text: string): string => {
  const value = parseAmount(text);
  return value === null ? text : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
};
/** A stored amount back in a field, or an empty field when the payday has none. */
const asField = (value: number | null | undefined): string => (value === null || value === undefined ? '' : tidy(String(value)));
const percent = (share: number): string => `${Math.round(share * 100)}%`;
const byDay = (a: LocalPayday, b: LocalPayday): number => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0);

/** Months to one decimal: "2.5", "3". */
const tenths = (months: number): string => (Math.round(months * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 });

/** Months of essential spending in words: "About 2.5 months", and under a month in weeks. */
function runwayWords(months: number): string {
  const rounded = Math.round(months * 10) / 10;
  if (rounded >= 1) return rounded === 1 ? copy.runway.oneMonth : copy.runway.months(tenths(months));
  const weeks = Math.round(months * WEEKS_PER_MONTH);
  return weeks >= 1 ? copy.runway.weeks(weeks) : copy.runway.underWeek;
}

/** Which W5 wording the check in force asked: the share saved (high tier), the share to debt, or neither. */
type ShareKind = 'save' | 'debt' | 'none';

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

  // Which wealth answers the four numbers move for this person, read off the last full check:
  // W3 when it was asked in months, and W5 in the wording it was asked in.
  const stepKey = (id: string): string | null => me.latest?.result.steps.find((s) => s.id === id)?.key ?? null;
  const shareKey = stepKey(params.shareItemId);
  const shareKind: ShareKind =
    shareKey === params.saveShare.versionKey ? 'save' : shareKey !== null && params.debtShare.versionKeys.includes(shareKey) ? 'debt' : 'none';
  const runwayKey = stepKey(params.runwayItemId);
  const movesRunway = runwayKey !== null && params.runway.versionKeys.includes(runwayKey);
  const baseline = live.apps.payday.baseline;

  const updates = (
    <Facts
      sector="WLTH"
      title={copy.updatesTitle}
      items={[
        movesRunway ? copy.updates.runway : copy.updates.runwayStays,
        shareKind === 'save'
          ? copy.updates.shareSave(params.averagePeriods)
          : shareKind === 'debt'
            ? copy.updates.shareDebt(params.averagePeriods)
            : copy.updates.shareStays,
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
  // This payday's numbers, and the same numbers as they stood at the payday before, all
  // computed here from the amounts on this device.
  let now: { bands: PaydayBands; local: PaydayLocal } | null = null;
  let before: { bands: PaydayBands; local: PaydayLocal } | null = null;
  if (todayEntry) {
    try {
      now = paydayBandsFor({ setup, entries: sorted, baseline });
      before = sorted.length > 1 ? paydayBandsFor({ setup, entries: sorted.slice(0, -1), baseline }) : null;
    } catch {
      now = null;
      before = null;
    }
  }
  const latest = sorted[sorted.length - 1] ?? null;
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;

  // The payday before is compared with this one when it has the same numbers: a payday recorded
  // before money now and debt were asked has spending instead.
  const comparable = !!previous && previous.balance !== null && previous.balance !== undefined;
  // The share the table shows: the one the check asked for, the debt share when it asked neither.
  const shown: 'save' | 'debt' = shareKind === 'save' ? 'save' : 'debt';
  const shareLabel = shown === 'save' ? copy.saveShare : copy.debtShare;
  const hasDebt = (e: PaydayAmounts | null): boolean => !!e && e.debt !== null && e.debt !== undefined;
  /** A share in a cell: the percentage, or why there is none. */
  const shareCell = (share: number | null, entry: PaydayAmounts | null): string =>
    share !== null ? percent(share) : !entry || (shown === 'debt' && !hasDebt(entry)) ? copy.notRecorded : copy.noShare;
  const shareOf = (r: { local: PaydayLocal } | null): number | null => (!r ? null : shown === 'save' ? r.local.saveShare : r.local.debtShare);
  const meanOf = (r: { local: PaydayLocal } | null): number | null =>
    !r ? null : shown === 'save' ? r.local.averageSaveShare : r.local.averageDebtShare;
  // Paydays behind each mean: the last averagePeriods with take-home pay, for debt with a debt figure.
  const recent = sorted.slice(-params.averagePeriods).filter((e) => e.income > 0);
  const counted = { save: recent.length, debt: recent.filter(hasDebt).length };
  const runwayCell = (months: number | null): string => (months === null ? copy.notRecorded : tenths(months));

  const bank = getBank();
  const optionText = (itemId: string, key: string, k: number): string =>
    bank.items[itemId]?.versions.find((v) => v.key === key)?.opts[k]?.en ?? '';
  const runwayBand = (k: number): string => optionText(params.runwayItemId, movesRunway && runwayKey ? runwayKey : params.runway.versionKeys[0], k);
  const saveBand = (k: number): string => optionText(params.shareItemId, params.saveShare.versionKey, k);
  const debtBand = (k: number): string =>
    optionText(params.shareItemId, shareKind === 'debt' && shareKey ? shareKey : params.debtShare.versionKeys[0], k);
  const debtSent = now && now.bands.debtShare !== null && now.bands.debtShare !== undefined ? now.bands.debtShare : null;
  const sentSave = now && (now.bands.saveShare !== null ? copy.sentShare(saveBand(now.bands.saveShare), counted.save) : copy.sentNoShare);
  const sentDebt = now && (debtSent !== null ? copy.sentDebt(debtBand(debtSent), counted.debt) : copy.sentNoDebt);

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

      {now && (
        <Card className={styles.note}>
          <div className={styles.facts}>
            <h2 className={styles.factsTitle}>{now.local.runwayMonths !== null ? runwayWords(now.local.runwayMonths) : copy.compareTitle}</h2>
            <p className={styles.factsNote}>{now.local.runwayMonths !== null ? copy.runway.note(money(setup.essentialMonthly)) : copy.compareNote}</p>
            {before && comparable ? (
              <table className={`${styles.compare} ${styles.compareWide}`}>
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
                  {(now.local.runwayMonths !== null || before.local.runwayMonths !== null) && (
                    <tr>
                      <th scope="row">{copy.runwayRow}</th>
                      <td>{runwayCell(before.local.runwayMonths)}</td>
                      <td>{runwayCell(now.local.runwayMonths)}</td>
                    </tr>
                  )}
                  <tr>
                    <th scope="row">{shareLabel}</th>
                    <td>{shareCell(shareOf(before), previous)}</td>
                    <td>{shareCell(shareOf(now), latest)}</td>
                  </tr>
                  {counted[shown] > 1 && (
                    <tr>
                      <th scope="row">{copy.averageShare(counted[shown])}</th>
                      <td>{shareCell(meanOf(before), previous)}</td>
                      <td>{shareCell(meanOf(now), latest)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <>
                <p className={styles.resultLine}>{previous ? copy.compareOlder : copy.compareFirst}</p>
                <table className={`${styles.compare} ${styles.compareWide}`}>
                  <tbody>
                    <tr>
                      <th scope="row">{shareLabel}</th>
                      <td>{shareCell(shareOf(now), latest)}</td>
                    </tr>
                    {counted[shown] > 1 && (
                      <tr>
                        <th scope="row">{copy.averageShare(counted[shown])}</th>
                        <td>{shareCell(meanOf(now), latest)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </Card>
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
                      <span className={styles.rowDetail}>
                        {copy.historyRow({
                          income: money(e.income),
                          balance: moneyOrNull(e.balance),
                          debt: moneyOrNull(e.debt),
                          spending: moneyOrNull(e.spending),
                          savings: money(e.savings),
                        })}
                      </span>
                    </span>
                  </li>
                ))}
            </ul>
            <p className={styles.factsNote}>{copy.setupSummary(copy.frequencies[setup.frequency], money(setup.essentialMonthly))}</p>
          </div>
        </Card>
      )}

      <More className={styles.note}>
        {now && (
          <Facts
            sector="WLTH"
            title={copy.sentTitle}
            items={[
              now.bands.runway !== null ? copy.sentRunway(runwayBand(now.bands.runway)) : copy.sentNoRunway,
              shown === 'save' ? sentSave : sentDebt,
              shown === 'save' ? sentDebt : sentSave,
              copy.sentCounts[shareKind],
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
  // Take-home pay starts from the last payday. The other three are typed each time; a payday
  // being corrected starts from what was typed, and an older one has no money now or debt.
  const [income, setIncome] = useState(asField(correcting ? correcting.income : last?.income));
  const [balance, setBalance] = useState(asField(correcting?.balance));
  const [debt, setDebt] = useState(asField(correcting?.debt));
  const [savings, setSavings] = useState(asField(correcting?.savings));
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const values = { income: parseAmount(income), balance: parseAmount(balance), debt: parseAmount(debt), savings: parseAmount(savings) };
  const fieldError = (value: number | null) => (tried && value === null ? copy.errors.required : undefined);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (values.income === null || values.balance === null || values.debt === null || values.savings === null || saving) return;
    setSaving(true);
    setError(null);
    try {
      const localDate = deviceToday();
      const id = newClientId();
      const amounts: PaydayAmounts = { day: localDate, income: values.income, balance: values.balance, debt: values.debt, savings: values.savings };
      // One payday a day on this device: a second save of the same day corrects the first.
      const others = entries.filter((e) => e.day !== localDate);
      const { bands } = paydayBandsFor({ setup, entries: [...others, amounts], baseline });
      // Bands only. None of the four amounts is in this request. The runway comes from the money
      // available now, so it carries no baseline day.
      const request: PaydayEntryRequest = {
        id,
        localDate,
        periods: bands.periods,
        saveShare: bands.saveShare,
        debtShare: bands.debtShare ?? null,
        runway: bands.runway,
        baselineDay: bands.baselineDay,
      };
      const res = await api.postPayday(request);
      deviceStore().update((d) => ({
        ...d,
        payday: { setup: d.payday.setup, entries: [...d.payday.entries.filter((e) => e.day !== localDate), { ...amounts, id }] },
      }));
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
        label={copy.balance}
        kind="number"
        prefix={copy.currency}
        hint={copy.balanceHint}
        error={fieldError(values.balance)}
        value={balance}
        onChange={(e) => setBalance(e.target.value)}
        onBlur={() => setBalance(tidy)}
      />
      <Field
        label={copy.debt}
        kind="number"
        prefix={copy.currency}
        hint={copy.debtHint}
        error={fieldError(values.debt)}
        value={debt}
        onChange={(e) => setDebt(e.target.value)}
        onBlur={() => setDebt(tidy)}
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
