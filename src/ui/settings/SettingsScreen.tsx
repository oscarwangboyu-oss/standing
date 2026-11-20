'use client';

/**
 * The settings screen (PROMPT.md section 11): ticker, recovery code, restore, consent,
 * export, delete, the Daily Open reminder, the documents and the version line.
 *
 * Everything here acts on the record of this device through the typed client. The screen is
 * open to everyone (no route guard), so it also serves a device without a record: that person
 * can connect to an existing record with a recovery code.
 */
import { useEffect, useId, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { api, errorCodeOf, isRetryable, refreshMe, useConfig, useDevice, useMe } from '@/client/api';
import { clearAllSlots, device, newClientId } from '@/client/device';
import { flagsOf } from '@/client/flags';
import { ROUTES } from '@/client/nav';
import { check } from '@/client/session';
import { today } from '@/client/today';
import { settings as copy } from '@/copy/settings';
import { CURRENT } from '@/engine/registry';
import { CONSENT_VERSIONS, type ConsentState } from '@/shared/api';
import {
  Block,
  Button,
  Card,
  Entry,
  EntryList,
  Field,
  IconCalendar,
  IconDownload,
  IconInfo,
  IconClose,
  Note,
  Rule,
  Sheet,
  SkeletonText,
  Spot,
  Ticker,
  Toast,
  useToast,
} from '@/ui';
import { DEFAULT_REMINDER_TIME, TIME_PATTERN, dailyOpenIcs } from './ics';
import { ActionList, ActionRow } from './Row';
import { saveFile } from './save';
import styles from './settings.module.css';

// ---------------------------------------------------------------- helpers

const noop = () => () => {};
/** False on the server and during hydration, true after: the device record is read only then. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

/** One sentence for a failed call. */
function messageOf(error: unknown): string {
  const code = errorCodeOf(error);
  if (code === 'network') return copy.errors.offline;
  if (code === 'unauthorized') return copy.errors.gone;
  if (isRetryable(error)) return copy.errors.server;
  return copy.errors.generic;
}

/** "Nov 19, 2026" in the person's own calendar. */
function dayOf(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type Notify = (message: ReactNode) => void;

function Problem({ children }: { children: ReactNode }) {
  if (children === null || children === undefined || children === false) return null;
  return (
    <p className={styles.problem} role="alert">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------- ticker

function TickerBlock({ ticker }: { ticker: string | null }) {
  return (
    <Block title={copy.ticker.title} id="settings-ticker">
      <Card>
        <div className={styles.tickerLine}>
          {ticker ? (
            <Ticker variant="chip" size="lg">
              {ticker}
            </Ticker>
          ) : (
            <span className={styles.noTicker}>{copy.ticker.none}</span>
          )}
          <p className={styles.text}>{ticker ? copy.ticker.with : copy.ticker.without}</p>
        </div>
        <p className={styles.small}>{copy.ticker.how}</p>
        <div className={styles.actions}>
          <Button variant="secondary" size="sm" href={ROUTES.retake}>
            {copy.ticker.retake}
          </Button>
        </div>
      </Card>
    </Block>
  );
}

// ---------------------------------------------------------------- recovery code

function RecoveryBlock({ code, notify }: { code: string | null; notify: Notify }) {
  const [shown, setShown] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const codeId = useId();

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      notify(copy.recovery.copied);
    } catch {
      setShown(true);
      notify(copy.recovery.copyFailed);
    }
  };

  const rotate = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const { recoveryCode } = await api.rotateRecovery();
      device().patch({ recoveryCode });
      setShown(true);
      setAsking(false);
      notify(copy.recovery.rotated);
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Block title={copy.recovery.title} id="settings-recovery">
      <Card>
        <p className={styles.text}>{copy.recovery.what}</p>
        {code ? (
          <div className={styles.codeBox}>
            <span className={styles.codeLabel} id={`${codeId}-label`}>
              {copy.recovery.codeLabel}
            </span>
            <output className={styles.code} aria-labelledby={`${codeId}-label`} data-hidden={!shown || undefined}>
              {shown ? code : copy.recovery.hidden}
            </output>
          </div>
        ) : (
          <Note tone="info" className={styles.gap}>
            <p>{copy.recovery.notHere}</p>
          </Note>
        )}
        <div className={styles.actions}>
          {code && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setShown((s) => !s)} aria-pressed={shown}>
                {shown ? copy.recovery.hide : copy.recovery.show}
              </Button>
              <Button variant="secondary" size="sm" onClick={copyCode}>
                {copy.recovery.copy}
              </Button>
            </>
          )}
          <Button variant={code ? 'quiet' : 'secondary'} size="sm" onClick={() => setAsking(true)}>
            {copy.recovery.rotate}
          </Button>
        </div>
      </Card>
      <Sheet open={asking} onClose={() => !busy && setAsking(false)} title={copy.recovery.rotateTitle}>
        <p className={styles.text}>{copy.recovery.rotateText}</p>
        <Problem>{problem}</Problem>
        <div className={styles.sheetActions}>
          <Button full onClick={rotate} disabled={busy}>
            {copy.recovery.rotateConfirm}
          </Button>
          <Button variant="quiet" full onClick={() => setAsking(false)} disabled={busy}>
            {copy.data.cancel}
          </Button>
        </div>
      </Sheet>
    </Block>
  );
}

// ---------------------------------------------------------------- restore

/** /settings?restore=1 (ROUTES.restore) opens the sheet at once: the link on the start screen goes there. */
const askedToRestore = (): boolean =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('restore') === '1';

function RestoreBlock({ hasRecord }: { hasRecord: boolean }) {
  const [open, setOpen] = useState(false);
  // After hydration, so the server markup and the first client render agree.
  useEffect(() => {
    if (askedToRestore()) setOpen(true);
  }, []);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const recoveryCode = value.trim();
    if (!recoveryCode) {
      setProblem(copy.restore.empty);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const restored = await api.restore({ recoveryCode });
      const before = device().get();
      if (before.deviceToken) {
        // The token this device held is replaced: the server forgets it. A failure changes nothing here.
        await api.signOut().catch(() => undefined);
        // Another person's record: what was kept only on this device belongs to the previous one.
        if (before.userId !== restored.userId) clearAllSlots();
      }
      device().restore(restored);
      // A full load, so nothing read for the previous record stays in memory.
      window.location.assign(ROUTES.market);
    } catch (error) {
      setProblem(errorCodeOf(error) === 'recovery_code_invalid' ? copy.restore.invalid : messageOf(error));
      setBusy(false);
    }
  };

  return (
    <Block title={copy.restore.title} id="settings-restore">
      <Card>
        <p className={styles.text}>{copy.restore.text}</p>
        <div className={styles.actions}>
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            {copy.restore.open}
          </Button>
        </div>
      </Card>
      <Sheet open={open} onClose={() => !busy && setOpen(false)} title={copy.restore.sheetTitle}>
        <form onSubmit={submit} className={styles.form} noValidate>
          {hasRecord && (
            <Note tone="info">
              <p>{copy.restore.replaces}</p>
            </Note>
          )}
          <Field
            label={copy.restore.label}
            hint={copy.restore.hint}
            error={problem ?? undefined}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (problem) setProblem(null);
            }}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            name="recovery-code"
          />
          <Button type="submit" full disabled={busy}>
            {copy.restore.submit}
          </Button>
        </form>
      </Sheet>
    </Block>
  );
}

// ---------------------------------------------------------------- consent

function ConsentBlock({ consent, healthVersion, notify }: { consent: ConsentState | null; healthVersion: string; notify: Notify }) {
  const [asking, setAsking] = useState<'give' | 'withdraw' | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const given = consent?.health ?? null;

  const save = async (granted: boolean) => {
    setBusy(true);
    setProblem(null);
    try {
      const answer = await api.setConsent({ kind: 'health', granted, version: healthVersion });
      device().patch({ consent: answer.consent });
      setAsking(null);
      notify(granted ? copy.consent.givenToast : copy.consent.withdrawnToast);
      void refreshMe();
      // The server turned an unfinished check into a three-sector check, or back: read it again.
      const controller = check();
      if (controller.get().state) void controller.resync();
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (busy) return;
    setAsking(null);
    setProblem(null);
  };

  return (
    <Block title={copy.consent.title} id="settings-consent">
      <Card>
        <div className={styles.consentItem}>
          <div className={styles.consentHead}>
            <h3 className={styles.itemTitle}>{copy.consent.general}</h3>
            <span className={styles.state}>{consent ? copy.consent.agreed(dayOf(consent.general.at)) : copy.consent.unknown}</span>
          </div>
          <p className={styles.small}>{copy.consent.generalText}</p>
        </div>
        <Rule className={styles.rule} />
        <div className={styles.consentItem}>
          <div className={styles.consentHead}>
            <h3 className={styles.itemTitle}>{copy.consent.health}</h3>
            <span className={styles.state}>{!consent ? copy.consent.unknown : given ? copy.consent.given(dayOf(given.at)) : copy.consent.notGiven}</span>
          </div>
          <p className={styles.small}>{copy.consent.healthText}</p>
          {consent && (
            <div className={styles.actions}>
              <Button variant="secondary" size="sm" onClick={() => setAsking(given ? 'withdraw' : 'give')}>
                {given ? copy.consent.withdraw : copy.consent.give}
              </Button>
            </div>
          )}
        </div>
      </Card>

      <Sheet open={asking === 'give'} onClose={close} title={copy.consent.giveTitle}>
        <div className={styles.stack}>
          {copy.consent.giveText.map((line) => (
            <p key={line} className={styles.text}>
              {line}
            </p>
          ))}
          <Note tone="info">
            <p>{copy.consent.giveEffect}</p>
          </Note>
        </div>
        <Problem>{problem}</Problem>
        <div className={styles.sheetActions}>
          <Button full onClick={() => save(true)} disabled={busy}>
            {copy.consent.giveConfirm}
          </Button>
          <Button variant="quiet" full onClick={close} disabled={busy}>
            {copy.data.cancel}
          </Button>
        </div>
      </Sheet>

      <Sheet open={asking === 'withdraw'} onClose={close} title={copy.consent.withdrawTitle}>
        <div className={styles.stack}>
          {copy.consent.withdrawText.map((line) => (
            <p key={line} className={styles.text}>
              {line}
            </p>
          ))}
        </div>
        <Problem>{problem}</Problem>
        <div className={styles.sheetActions}>
          <Button full onClick={() => save(false)} disabled={busy}>
            {copy.consent.withdrawConfirm}
          </Button>
          <Button variant="quiet" full onClick={close} disabled={busy}>
            {copy.data.cancel}
          </Button>
        </div>
      </Sheet>
    </Block>
  );
}

// ---------------------------------------------------------------- export and delete

function DataBlock({ notify }: { notify: Notify }) {
  const [exporting, setExporting] = useState(false);
  const [exportProblem, setExportProblem] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const exportData = async () => {
    setExporting(true);
    setExportProblem(null);
    try {
      const server = await api.exportData();
      const record = device().get();
      // The server never received these: they exist on this device only.
      const onThisDevice = { payday: record.payday, wins: record.wins, people: record.people };
      saveFile(copy.data.fileName(today()), 'application/json', `${JSON.stringify({ ...server, onThisDevice }, null, 2)}\n`);
      notify(copy.data.exported);
    } catch (error) {
      setExportProblem(messageOf(error));
    } finally {
      setExporting(false);
    }
  };

  const leave = () => {
    clearAllSlots();
    // A full load of the landing page: nothing of this record stays in memory.
    window.location.replace(ROUTES.landing);
  };

  const deleteData = async () => {
    setDeleting(true);
    setProblem(null);
    try {
      await api.deleteData();
      leave();
    } catch (error) {
      // The server no longer knows this token: the record is already gone. Clear the device too.
      if (errorCodeOf(error) === 'unauthorized') {
        leave();
        return;
      }
      setProblem(messageOf(error));
      setDeleting(false);
    }
  };

  const close = () => {
    if (deleting) return;
    setAsking(false);
    setUnderstood(false);
    setProblem(null);
  };

  return (
    <Block title={copy.data.title} id="settings-data">
      <Card pad="none">
        <ActionList label={copy.data.title}>
          <ActionRow
            icon={<IconDownload />}
            title={exporting ? copy.data.exporting : copy.data.export}
            detail={copy.data.exportText}
            onClick={exportData}
            busy={exporting}
          />
          <ActionRow icon={<IconClose />} title={copy.data.delete} detail={copy.data.deleteText} onClick={() => setAsking(true)} />
        </ActionList>
      </Card>
      <Problem>{exportProblem}</Problem>

      <Sheet open={asking} onClose={close} title={copy.data.deleteTitle}>
        <p className={styles.text}>{copy.data.deleteLead}</p>
        <ul className={styles.bullets}>
          {copy.data.deleteItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <Note tone="info" className={styles.gap}>
          <p>{copy.data.deleteNoUndo}</p>
        </Note>
        <label className={styles.checkLine}>
          <input type="checkbox" className={styles.checkbox} checked={understood} onChange={(event) => setUnderstood(event.target.checked)} disabled={deleting} />
          <span>{copy.data.deleteCheck}</span>
        </label>
        <Problem>{problem}</Problem>
        <div className={styles.sheetActions}>
          <Button full onClick={deleteData} disabled={!understood || deleting}>
            {deleting ? copy.data.deleting : copy.data.deleteConfirm}
          </Button>
          <Button variant="quiet" full onClick={close} disabled={deleting}>
            {copy.data.cancel}
          </Button>
        </div>
      </Sheet>
    </Block>
  );
}

// ---------------------------------------------------------------- calendar

function CalendarBlock({ allowed, notify }: { allowed: boolean; notify: Notify }) {
  const [time, setTime] = useState(DEFAULT_REMINDER_TIME);
  const timeId = useId();
  const valid = TIME_PATTERN.test(time);

  const add = () => {
    const ics = dailyOpenIcs({
      time,
      startDay: today(),
      url: new URL(ROUTES.open, window.location.origin).toString(),
      uid: `${newClientId()}@standing`,
      stamp: new Date(),
      title: copy.calendar.eventTitle,
      text: copy.calendar.eventText,
    });
    if (!ics) return;
    saveFile(copy.calendar.fileName, 'text/calendar;charset=utf-8', ics);
    notify(copy.calendar.added);
  };

  return (
    <Block title={copy.calendar.title} id="settings-calendar">
      <Card>
        <p className={styles.text}>{copy.calendar.text}</p>
        {allowed ? (
          <div className={styles.timeLine}>
            <div className={styles.timeField}>
              <label className={styles.timeLabel} htmlFor={timeId}>
                {copy.calendar.time}
              </label>
              <input id={timeId} className={styles.timeInput} type="time" value={time} onChange={(event) => setTime(event.target.value)} required />
            </div>
            <Button variant="secondary" icon={<IconCalendar size={20} />} onClick={add} disabled={!valid}>
              {copy.calendar.add}
            </Button>
          </div>
        ) : (
          <Note tone="info" className={styles.gap}>
            <p>{copy.calendar.needsConsent}</p>
          </Note>
        )}
      </Card>
    </Block>
  );
}

// ---------------------------------------------------------------- about

function AboutBlock({ versions }: { versions: { algo: number; bank: string; norm: string } }) {
  return (
    <Block title={copy.about.title} id="settings-about">
      <Card pad="none">
        <EntryList label={copy.about.label}>
          <Entry href={ROUTES.method} icon={<IconInfo />} title={copy.about.method} detail={copy.about.methodText} />
          <Entry href={ROUTES.privacy} icon={<IconInfo />} title={copy.about.privacy} detail={copy.about.privacyText} />
          <Entry href={ROUTES.terms} icon={<IconInfo />} title={copy.about.terms} detail={copy.about.termsText} />
        </EntryList>
      </Card>
      <p className={styles.versions}>
        <span className="vh">{copy.about.versionsLabel}: </span>
        {copy.about.versions(versions.algo, versions.bank, versions.norm)}
      </p>
    </Block>
  );
}

// ---------------------------------------------------------------- the screen

export function SettingsScreen() {
  const hydrated = useHydrated();
  const record = useDevice();
  const me = useMe();
  const config = useConfig();
  const toast = useToast(4200);

  const versions = config.data?.versions ?? CURRENT;
  const hasRecord = record.deviceToken !== null;
  const consent = me.data?.consent ?? record.consent;
  const ticker = me.data?.user.ticker ?? record.ticker;
  const flags = flagsOf(config.data);

  return (
    <div className={styles.screen}>
      <header className={styles.head}>
        <h1 className="t-h1">{copy.title}</h1>
        <p className="t-small">{copy.lead}</p>
      </header>

      {!hydrated ? (
        <Card>
          <SkeletonText lines={4} />
        </Card>
      ) : hasRecord ? (
        <>
          {me.error && !me.data && (
            <Note tone="info" className={styles.loadNote}>
              <p>{copy.errors.load}</p>
              <Button variant="quiet" size="sm" onClick={() => void me.refresh()}>
                {copy.errors.retry}
              </Button>
            </Note>
          )}
          <TickerBlock ticker={ticker} />
          <RecoveryBlock code={record.recoveryCode} notify={toast.show} />
          <ConsentBlock consent={consent} healthVersion={config.data?.consentVersions.health ?? CONSENT_VERSIONS.health} notify={toast.show} />
          <DataBlock notify={toast.show} />
          {flags.dailyOpen && <CalendarBlock allowed={consent?.health != null} notify={toast.show} />}
          <RestoreBlock hasRecord />
        </>
      ) : (
        <>
          <Card className={styles.empty}>
            <Spot kind="lot" size={132} />
            <div>
              <h2 className="t-h3">{copy.empty.title}</h2>
              <p className={styles.small}>{copy.empty.text}</p>
            </div>
            <Button variant="secondary" href={ROUTES.start}>
              {copy.empty.start}
            </Button>
          </Card>
          <RestoreBlock hasRecord={false} />
        </>
      )}

      <AboutBlock versions={versions} />
      <Toast>{toast.message}</Toast>
    </div>
  );
}
