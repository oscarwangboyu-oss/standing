'use client';

/**
 * The team dashboard (PROMPT.md section 7.2, gates from docs/roadmap.txt).
 *
 * A passphrase screen, then a read-only board built from the /api/team endpoints. The
 * passphrase is kept in the memory of this page only and travels in the Authorization header.
 * Everything shown is a total: no table here has a row for one person.
 */
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { errorCodeOf, useAsync, useConfig } from '@/client/api';
import { team as copy } from '@/copy/team';
import type { RoleId } from '@/engine';
import { createTeamClient, type StandingTeamClient } from '@/shared/client';
import { Button, Card, Note, Spot, Wordmark, formatDay } from '@/ui';
import { AppsSummary, AppsWeeks, Daily, Report, Returns } from './Activity';
import { Attention } from './Attention';
import { Norms, Prices } from './Cohorts';
import { Items } from './Items';
import { ROLE_IDS, roleLabel } from './labels';
import { CsvButton, Loaded, Section, Select, SimulatedContext, SubHead, stamp } from './parts';
import { Gates, Overview } from './Scoreboard';
import { Tests } from './Tests';
import styles from './team.module.css';

// ---------------------------------------------------------------- the passphrase screen

function Gate({ closed, onOpen }: { closed: boolean; onOpen: (passphrase: string) => void }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [shut, setShut] = useState(false);
  const inputId = useId();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!value) {
      setProblem(copy.gate.empty);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      // Any team call checks the passphrase. The report table is the lightest.
      await createTeamClient({ getToken: () => value }).report();
      onOpen(value);
    } catch (error) {
      const code = errorCodeOf(error);
      if (code === 'team_closed') setShut(true);
      else if (code === 'team_unauthorized' || code === 'unauthorized') setProblem(copy.gate.wrong);
      else if (code === 'network') setProblem(copy.gate.offline);
      else setProblem(copy.gate.failed);
      setBusy(false);
    }
  };

  return (
    <main className={styles.gatePage}>
      <Card pad="lg" className={styles.gateCard}>
        <Spot kind={closed || shut ? 'halted' : 'building'} size={120} />
        {closed || shut ? (
          <div className={styles.gateIntro}>
            <h1 className="t-h2">{copy.gate.closedTitle}</h1>
            <p className={styles.sectionLead}>{copy.gate.closed}</p>
          </div>
        ) : (
          <>
            <div className={styles.gateIntro}>
              <h1 className="t-h2">{copy.gate.title}</h1>
              <p className={styles.sectionLead}>{copy.gate.lead}</p>
            </div>
            <form className={styles.gateForm} onSubmit={submit} noValidate>
              <div className={styles.pass}>
                <label className={styles.passLabel} htmlFor={inputId}>
                  {copy.gate.label}
                </label>
                <input
                  id={inputId}
                  className={styles.passInput}
                  type="password"
                  name="team-passphrase"
                  autoComplete="off"
                  value={value}
                  onChange={(event) => {
                    setValue(event.target.value);
                    if (problem) setProblem(null);
                  }}
                  aria-invalid={problem ? true : undefined}
                  aria-describedby={`${inputId}-hint${problem ? ` ${inputId}-error` : ''}`}
                />
                {problem && (
                  <p id={`${inputId}-error`} className={styles.passError} role="alert">
                    {problem}
                  </p>
                )}
                <p id={`${inputId}-hint`} className={styles.passHint}>
                  {copy.gate.hint}
                </p>
              </div>
              <Button type="submit" full disabled={busy}>
                {busy ? copy.gate.checking : copy.gate.submit}
              </Button>
            </form>
          </>
        )}
      </Card>
    </main>
  );
}

// ---------------------------------------------------------------- the board

const NAV = ['attention', 'gates', 'overview', 'items', 'prices', 'norms', 'returns', 'apps', 'tests', 'report'] as const;
type NavId = (typeof NAV)[number];

/**
 * Keeps the heights of the sticky simulated-data banner and the sticky section nav in CSS
 * variables on the board (--demo-h, --nav-h), so the nav sits under the banner and a section
 * scrolled to by a link lands under both. Marks the section in view in the nav.
 */
function useStickyNav(demo: boolean) {
  const rootRef = useRef<HTMLDivElement>(null);
  const demoRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [current, setCurrent] = useState<NavId>(NAV[0]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      root.style.setProperty('--demo-h', `${demoRef.current?.offsetHeight ?? 0}px`);
      root.style.setProperty('--nav-h', `${navRef.current?.offsetHeight ?? 0}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (demoRef.current) observer.observe(demoRef.current);
    if (navRef.current) observer.observe(navRef.current);
    return () => observer.disconnect();
  }, [demo]);

  useEffect(() => {
    // The section in view is the last one whose top has passed under the sticky bars.
    let frame = 0;
    const update = () => {
      frame = 0;
      const offset = (demoRef.current?.offsetHeight ?? 0) + (navRef.current?.offsetHeight ?? 0) + 24;
      let found: NavId = NAV[0];
      for (const id of NAV) {
        const el = document.getElementById(`team-${id}`);
        if (el && el.getBoundingClientRect().top - offset <= 0) found = id;
      }
      setCurrent(found);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    // On a phone the nav is one row that scrolls sideways: keep the current link in it.
    const list = navRef.current?.querySelector('ul');
    const link = list?.querySelector<HTMLElement>(`[data-nav="${current}"]`);
    if (!list || !link || list.scrollWidth <= list.clientWidth) return;
    const left = link.offsetLeft - (list.clientWidth - link.offsetWidth) / 2;
    list.scrollTo({ left: Math.max(0, left) });
  }, [current]);

  return { rootRef, demoRef, navRef, current };
}

function Board({ client, onLock }: { client: StandingTeamClient; onLock: () => void }) {
  const [role, setRole] = useState('all');
  const itemRole: RoleId | null = role === 'all' ? null : (role as RoleId);

  const overview = useAsync(() => client.overview(), [client]);
  const gates = useAsync(() => client.gates(), [client]);
  // All roles feeds the attention list and the table; one role only the table.
  const allItems = useAsync(() => client.items(null), [client]);
  const roleItems = useAsync(() => client.items(itemRole), [client, itemRole], { enabled: itemRole !== null });
  const items = itemRole === null ? allItems : roleItems;
  const prices = useAsync(() => client.prices(), [client]);
  const norms = useAsync(() => client.norms(), [client]);
  const returns = useAsync(() => client.returns(), [client]);
  const apps = useAsync(() => client.apps(), [client]);
  const daily = useAsync(() => client.daily(), [client]);
  const tests = useAsync(() => client.tests(), [client]);
  const report = useAsync(() => client.report(), [client]);

  const all = [overview, gates, allItems, ...(itemRole === null ? [] : [roleItems]), prices, norms, returns, apps, daily, tests, report];
  const refresh = () => {
    for (const view of all) void view.refresh();
  };
  const loading = all.some((view) => view.loading);

  // Simulated people behind any table on this page.
  const demoPeople = Math.max(0, ...all.map((view) => view.data?.demoPeople ?? 0));
  const demoChecks = overview.data?.demoChecks ?? null;

  const roleOptions = useMemo(() => [{ value: 'all', label: copy.common.allRoles }, ...ROLE_IDS.map((id) => ({ value: id as string, label: roleLabel(id) }))], []);

  const sticky = useStickyNav(demoPeople > 0);

  return (
    <SimulatedContext value={demoPeople > 0}>
      <div className={styles.boardRoot} ref={sticky.rootRef}>
      {demoPeople > 0 && (
        <div className={styles.demo} role="status" ref={sticky.demoRef}>
          <div className={styles.demoInner}>
            <strong className={styles.demoTitle}>{copy.demo.title}</strong>
            <span className={styles.demoText}>{copy.demo.text(demoPeople, demoChecks)}</span>
          </div>
        </div>
      )}
      <main className={styles.main}>
        <header className={styles.pageHead}>
          <div>
            <h1 className="t-h1">{copy.title}</h1>
            <p className={styles.sectionLead}>{copy.lead}</p>
            {overview.data && (
              <p className={styles.meta}>
                {copy.meta.generated(stamp(overview.data.generatedAt))}. {copy.meta.versions(overview.data.versions.algo, overview.data.versions.bank, overview.data.versions.norm)}
              </p>
            )}
          </div>
          <div className={styles.tools}>
            <Button variant="secondary" size="sm" onClick={refresh} disabled={loading}>
              {copy.meta.refresh}
            </Button>
            <Button variant="quiet" size="sm" onClick={onLock}>
              {copy.gate.lock}
            </Button>
          </div>
        </header>

        <nav className={styles.nav} aria-label={copy.meta.sections} ref={sticky.navRef}>
          <ul>
            {NAV.map((id) => (
              <li key={id}>
                <a href={`#team-${id}`} data-nav={id} aria-current={sticky.current === id ? 'location' : undefined}>
                  {copy.nav[id]}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <Attention gates={gates} items={allItems} tests={tests} />

        <Section id="team-gates" title={copy.gates.title} tools={<CsvButton client={client} table="gates" name={copy.gates.table} file="standing-gates" />}>
          <Loaded view={gates}>{(data) => <Gates data={data} />}</Loaded>
        </Section>

        <Section id="team-overview" title={copy.overview.title} tools={<CsvButton client={client} table="overview" name={copy.overview.table} file="standing-overview" />}>
          <Loaded view={overview}>{(data) => <Overview data={data} />}</Loaded>
        </Section>

        <Section
          id="team-items"
          title={copy.items.title}
          lead={items.data ? copy.items.lead(items.data.bankVersion) : undefined}
          tools={
            <>
              <Select label={copy.items.filter} value={role} onChange={setRole} options={roleOptions} />
              <CsvButton client={client} table="items" name={copy.items.table} params={{ role: itemRole }} file={`standing-items-${role}`} />
            </>
          }
        >
          <Loaded view={items}>{(data) => <Items data={data} />}</Loaded>
        </Section>

        <Section id="team-prices" title={copy.prices.title} lead={copy.prices.lead} tools={<CsvButton client={client} table="prices" name={copy.prices.table} file="standing-prices" />}>
          <Loaded view={prices}>{(data) => <Prices data={data} />}</Loaded>
        </Section>

        <Section id="team-norms" title={copy.norms.title} lead={copy.norms.lead} tools={<CsvButton client={client} table="norms" name={copy.norms.table} file="standing-norms" />}>
          <Loaded view={norms}>{(data) => <Norms data={data} />}</Loaded>
        </Section>

        <Section id="team-returns" title={copy.returns.title} lead={copy.returns.lead} tools={<CsvButton client={client} table="returns" name={copy.returns.table} file="standing-returns" />}>
          <Loaded view={returns}>{(data) => <Returns data={data} />}</Loaded>
        </Section>

        <Section
          id="team-apps"
          title={copy.apps.title}
          lead={copy.apps.lead}
          tools={<CsvButton client={client} table="apps" name={copy.apps.summaryTable} params={{ table: 'summary' }} file="standing-apps-summary" />}
        >
          <Loaded view={apps}>{(data) => <AppsSummary data={data} />}</Loaded>
          <div className={styles.pair}>
            <div>
              <SubHead title={copy.apps.weeks} tools={<CsvButton client={client} table="apps" name={copy.apps.weeksTable} file="standing-apps-weeks" />} />
              <Loaded view={apps}>{(data) => <AppsWeeks data={data} />}</Loaded>
            </div>
            <div>
              <SubHead
                title={copy.apps.daily}
                lead={daily.data ? copy.apps.dailyLead(formatDay(daily.data.weeksFrom)) : undefined}
                tools={<CsvButton client={client} table="daily" name={copy.apps.dailyTable} file="standing-daily" />}
              />
              <Loaded view={daily}>{(data) => <Daily data={data} />}</Loaded>
            </div>
          </div>
        </Section>

        <Section id="team-tests" title={copy.tests.title} tools={<CsvButton client={client} table="tests" name={copy.tests.table} file="standing-tests" />}>
          <Loaded view={tests}>{(data) => <Tests data={data} />}</Loaded>
        </Section>

        <Section id="team-report" title={copy.report.title} lead={copy.report.lead} tools={<CsvButton client={client} table="report" name={copy.report.table} file="standing-report" />}>
          <Loaded view={report}>{(data) => <Report data={data} />}</Loaded>
        </Section>
      </main>
      </div>
    </SimulatedContext>
  );
}

// ---------------------------------------------------------------- the page

export function TeamDashboard() {
  const config = useConfig();
  const [passphrase, setPassphrase] = useState<string | null>(null);
  const client = useMemo(() => (passphrase === null ? null : createTeamClient({ getToken: () => passphrase })), [passphrase]);
  const closed = config.data !== null && !config.data.teamOpen;

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <Wordmark href="/" />
        <span className={styles.topLabel}>{copy.title}</span>
      </header>
      {client === null ? <Gate closed={closed} onOpen={setPassphrase} /> : <Board client={client} onLock={() => setPassphrase(null)} />}
      {config.error && client === null && (
        <div className={styles.gateNote}>
          <Note tone="info">
            <p>{copy.gate.failed}</p>
          </Note>
        </div>
      )}
    </div>
  );
}
