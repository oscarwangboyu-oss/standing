'use client';

/**
 * /start: what the check is, the general notice, 18 or older, the background, the optional
 * state and ticker, then the separate consent for body and mind answers. One decision per
 * screen. The plot beside it is prepared as the person goes: an empty street, then five lots.
 *
 * Nothing is sent before the last step. Starting the check (the person's record, the consents,
 * the session) is session.ts; this file only collects the input for it.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { errorCodeOf } from '@/client/api';
import { device } from '@/client/device';
import { ROUTES } from '@/client/nav';
import { StartError, check, normalizeTicker } from '@/client/session';
import { useShell } from '@/client/shell';
import { start as copy, stateNames } from '@/copy/check';
import { ROLE_IDS, getBank, type RoleId } from '@/engine';
import { CONSENT_VERSIONS, US_STATES } from '@/shared/api';
import { Button, Card, Field, Note, OptionList, Spot, type Option } from '@/ui';
import { PlotCard } from '@/ui/check/PlotCard';
import { SelectField } from '@/ui/check/SelectField';
import styles from '@/ui/check/check.module.css';

type StepId = 'intro' | 'notice' | 'adult' | 'age' | 'role' | 'state' | 'ticker' | 'health' | `q:${string}`;

const TITLE_ID = 'start-title';

/** What this device already knows, read once when the screen opens. */
function readPlan() {
  const record = device().get();
  const signedIn = record.deviceToken !== null;
  const retake = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('retake') === '1';
  return {
    /** A person who has a check gets the short introduction. */
    again: retake || record.hasCheck,
    /** The general notice was agreed to in its current version: it is not asked twice. */
    generalKnown: signedIn && record.consent?.general.version === CONSENT_VERSIONS.general,
    /** The same for body and mind answers. A person who said no before is asked again. */
    healthKnown: signedIn && record.consent?.health?.version === CONSENT_VERSIONS.health,
    age: record.profile?.age ?? null,
    role: record.profile?.role ?? null,
    usState: record.profile?.usState ?? '',
    ticker: record.ticker ?? record.profile?.ticker ?? null,
  };
}

/** Consonants only, so a suggestion never spells a word. */
const TICKER_LETTERS = 'BCDFGHJKLMNPRSTVWXZ';

function suggestTicker(): string {
  const letters = TICKER_LETTERS.split('');
  let code = '';
  for (let i = 0; i < 4; i += 1) {
    const at = Math.floor(Math.random() * letters.length);
    code += letters.splice(at, 1)[0];
  }
  return code;
}

/** How many lots are marked out while a step is on screen. */
function lotsAt(step: StepId): number {
  if (step === 'intro' || step === 'notice' || step === 'adult') return 0;
  if (step === 'age') return 1;
  if (step === 'role') return 2;
  if (step === 'state' || step === 'ticker') return 4;
  if (step === 'health') return 5;
  return 3;
}

const STATE_OPTIONS = [{ value: '', label: copy.state.none }, ...US_STATES.map((code) => ({ value: code as string, label: stateNames[code] ?? code }))];

export function StartFlow() {
  const router = useRouter();
  const bank = getBank();
  const [plan] = useState(readPlan);
  const [suggested] = useState(() => (plan.ticker ? null : suggestTicker()));

  const [at, setAt] = useState<StepId>('intro');
  const [under, setUnder] = useState(false);
  const [age, setAge] = useState<number | null>(plan.age !== null && plan.age < bank.ages.length ? plan.age : null);
  const [role, setRole] = useState<RoleId | null>(plan.role && (ROLE_IDS as readonly string[]).includes(plan.role) ? plan.role : null);
  const [extra, setExtra] = useState<Record<string, number>>({});
  const [usState, setUsState] = useState<string>(plan.usState ?? '');
  const [ticker, setTicker] = useState<string>(plan.ticker ?? suggested ?? '');
  const [tickerError, setTickerError] = useState(false);
  const [health, setHealth] = useState<boolean | null>(plan.healthKnown ? true : null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<'offline' | 'failed' | null>(null);

  const stepsFor = (r: RoleId | null): StepId[] => [
    'intro',
    ...(plan.generalKnown ? [] : (['notice', 'adult'] as const)),
    'age',
    'role',
    ...(r ? bank.extra[r].map((q): StepId => `q:${q.id}`) : []),
    'state',
    'ticker',
    ...(plan.healthKnown ? [] : (['health'] as const)),
  ];
  const steps = stepsFor(role);
  const last = steps[steps.length - 1];

  useShell({ aside: <PlotCard lots={under ? 0 : lotsAt(at)} />, footer: at === 'intro' || under });

  // A new step starts at the top, and a keyboard continues from its heading.
  const title = useRef<HTMLHeadingElement>(null);
  const stepKey = `${at}:${String(under)}`;
  const focusedStep = useRef(stepKey);
  useEffect(() => {
    // Not when the screen opens: only when the step changed.
    if (focusedStep.current === stepKey) return;
    focusedStep.current = stepKey;
    window.scrollTo(0, 0);
    title.current?.focus({ preventScroll: true });
  }, [stepKey]);

  const go = (step: StepId) => {
    setProblem(null);
    setAt(step);
  };
  const after = (step: StepId, list: StepId[] = steps) => list[list.indexOf(step) + 1];
  const before = steps[steps.indexOf(at) - 1];

  const submit = async (healthConsent: boolean) => {
    if (busy || age === null || role === null) return;
    setBusy(true);
    setProblem(null);
    try {
      await check().start({ background: { age, role, extra }, healthConsent, usState: usState || null, ticker: ticker.trim() || null });
      // The guard of the layout sends the person on as well; this is the same destination.
      router.replace(ROUTES.check);
    } catch (error) {
      setBusy(false);
      if (error instanceof StartError) {
        // Every step checks its own input, so this is a step that was passed without an answer.
        if (error.field === 'ticker') setTickerError(true);
        go(error.field === 'age' ? 'age' : error.field === 'role' ? 'role' : error.field === 'usState' ? 'state' : error.field === 'ticker' ? 'ticker' : `q:${error.questionId ?? ''}`);
        return;
      }
      setProblem(errorCodeOf(error) === 'network' ? 'offline' : 'failed');
    }
  };

  /** Moves on from a step, or starts the check when it was the last one. */
  const leave = (step: StepId, list: StepId[] = steps) => {
    const next = after(step, list);
    if (next) go(next);
    else void submit(health ?? false);
  };

  const submitTicker = (event: FormEvent) => {
    event.preventDefault();
    try {
      normalizeTicker(ticker);
    } catch {
      setTickerError(true);
      return;
    }
    setTickerError(false);
    leave('ticker');
  };

  if (under) {
    return (
      <div className={styles.under}>
        <Spot kind="lot" />
        <h1 ref={title} tabIndex={-1} className={styles.title}>
          {copy.under.title}
        </h1>
        <p className={styles.lead}>{copy.under.text}</p>
        <Button variant="secondary" href={ROUTES.landing}>
          {copy.under.action}
        </Button>
      </div>
    );
  }

  const outcome = at === last && (busy || problem) && (
    <div className={styles.problem}>
      {busy && (
        <p className={styles.status} role="status">
          {copy.starting}
        </p>
      )}
      {problem && (
        <Note tone="info">
          <p role="alert">{problem === 'offline' ? copy.offline : copy.failed}</p>
        </Note>
      )}
      {problem && at === 'health' && health !== null && (
        <Button variant="secondary" onClick={() => void submit(health)}>
          {copy.retry}
        </Button>
      )}
    </div>
  );

  const heading = (text: string, eyebrow?: string) => (
    <div className={styles.head}>
      {eyebrow !== undefined && <span className={styles.eyebrow}>{eyebrow}</span>}
      <h1 id={TITLE_ID} ref={title} tabIndex={-1} className={styles.title}>
        {text}
      </h1>
    </div>
  );

  let body;
  if (at === 'intro') {
    const text = plan.again ? copy.again : copy.intro;
    body = (
      <>
        {heading(text.title)}
        <div className={styles.lines}>
          {text.lines.map((line) => (
            <p key={line} className="t-lead">
              {line}
            </p>
          ))}
        </div>
        <p className={styles.fact}>{text.fact}</p>
        <div className={styles.actions}>
          <Button size="lg" full onClick={() => leave('intro')}>
            {text.action}
          </Button>
        </div>
      </>
    );
  } else if (at === 'notice') {
    body = (
      <>
        {heading(copy.notice.title, copy.eyebrow.consentOne)}
        <Card variant="raised" pad="md">
          <dl className={styles.notice}>
            {copy.notice.items.map((item) => (
              <div key={item.label} className={styles.noticeRow}>
                <dt>{item.label}</dt>
                <dd>{item.text}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <p className={styles.more}>
          {copy.notice.more} <Link href={ROUTES.privacy}>{copy.notice.privacy}</Link> {copy.notice.and} <Link href={ROUTES.terms}>{copy.notice.terms}</Link>.
        </p>
        <div className={styles.actions}>
          <Button size="lg" full onClick={() => leave('notice')}>
            {copy.notice.action}
          </Button>
        </div>
      </>
    );
  } else if (at === 'adult') {
    const options: Option[] = [
      { value: 'yes', label: copy.adult.yes },
      { value: 'no', label: copy.adult.no },
    ];
    body = (
      <>
        {heading(copy.adult.title, copy.eyebrow.about)}
        <p className={styles.lead}>{copy.adult.lead}</p>
        <OptionList key="adult" options={options} onSelect={(value) => (value === 'yes' ? leave('adult') : setUnder(true))} labelledBy={TITLE_ID} />
      </>
    );
  } else if (at === 'age') {
    body = (
      <>
        {heading(bank.baseQ.age.en, copy.eyebrow.about)}
        <OptionList
          key="age"
          options={bank.ages.map((band, i) => ({ value: String(i), label: band.en }))}
          value={age === null ? null : String(age)}
          onSelect={(value) => {
            setAge(Number(value));
            leave('age');
          }}
          labelledBy={TITLE_ID}
        />
      </>
    );
  } else if (at === 'role') {
    body = (
      <>
        {heading(bank.baseQ.role.en, copy.eyebrow.about)}
        <OptionList
          key="role"
          compact
          options={bank.roles.map((r) => ({ value: r.id, label: r.en }))}
          value={role}
          onSelect={(value) => {
            const picked = value as RoleId;
            // The background questions belong to the situation: another situation, other questions.
            if (picked !== role) setExtra({});
            setRole(picked);
            leave('role', stepsFor(picked));
          }}
          labelledBy={TITLE_ID}
        />
      </>
    );
  } else if (at === 'state') {
    body = (
      <>
        {heading(copy.state.title, copy.eyebrow.about)}
        <p className={styles.lead}>{copy.state.lead}</p>
        <SelectField label={copy.state.label} value={usState} onChange={setUsState} options={STATE_OPTIONS} />
        <div className={styles.actions}>
          <Button size="lg" full onClick={() => leave('state')}>
            {usState === '' ? copy.state.skip : copy.state.action}
          </Button>
        </div>
      </>
    );
  } else if (at === 'ticker') {
    body = (
      <>
        {heading(copy.ticker.title, copy.eyebrow.ticker)}
        <p className={styles.lead}>{copy.ticker.lead}</p>
        <form className={styles.step} onSubmit={submitTicker} noValidate>
          <Field
            label={copy.ticker.label}
            value={ticker}
            onChange={(event) => {
              setTicker(event.target.value.toUpperCase());
              setTickerError(false);
            }}
            maxLength={6}
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="next"
            disabled={busy}
            hint={suggested ? copy.ticker.hint(suggested) : copy.ticker.hintKept}
            error={tickerError ? copy.ticker.error : undefined}
          />
          <div className={styles.actions}>
            <Button type="submit" size="lg" full disabled={busy}>
              {ticker.trim() === '' ? copy.ticker.skip : copy.ticker.action}
            </Button>
          </div>
        </form>
      </>
    );
  } else if (at === 'health') {
    const options: Option[] = [
      { value: 'yes', label: copy.health.yes, hint: copy.health.yesHint },
      { value: 'no', label: copy.health.no, hint: copy.health.noHint },
    ];
    body = (
      <>
        {heading(copy.health.title, copy.eyebrow.consentTwo)}
        <div className={styles.lines}>
          {copy.health.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <OptionList
          key="health"
          options={options}
          value={busy && health !== null ? (health ? 'yes' : 'no') : null}
          disabled={busy}
          onSelect={(value) => {
            setHealth(value === 'yes');
            void submit(value === 'yes');
          }}
          labelledBy={TITLE_ID}
        />
      </>
    );
  } else {
    const id = at.slice(2);
    const question = role ? bank.extra[role].find((q) => q.id === id) : undefined;
    body = question && (
      <>
        {heading(question.q.en, copy.eyebrow.about)}
        <OptionList
          key={at}
          compact={question.opts.length > 6}
          options={question.opts.map((option, i) => ({ value: String(i), label: option.en }))}
          value={extra[id] === undefined ? null : String(extra[id])}
          onSelect={(value) => {
            setExtra((current) => ({ ...current, [id]: Number(value) }));
            leave(at);
          }}
          labelledBy={TITLE_ID}
        />
      </>
    );
  }

  return (
    <>
      <div className={styles.step}>
        {body}
        {outcome}
      </div>
      {before !== undefined && !busy && (
        <div className={styles.foot}>
          <Button variant="quiet" onClick={() => go(before)}>
            {copy.back}
          </Button>
        </div>
      )}
    </>
  );
}
