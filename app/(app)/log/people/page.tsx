'use client';

/**
 * People Nudge: pick up to three people to reconnect with this week, then log who you reached.
 * The names stay on this device. The server receives how many people were picked and what each
 * person reached is to you: counts and categories.
 */
import { useState, type FormEvent } from 'react';
import { api, applyLive, errorCodeOf, useAsync, useDevice, useMe } from '@/client/api';
import { device as deviceStore, newClientId, type LocalPerson } from '@/client/device';
import { useFlags } from '@/client/flags';
import { ROUTES } from '@/client/nav';
import { today as deviceToday } from '@/client/today';
import { people as copy, shared } from '@/copy/micro';
import { NUDGE_CATEGORIES, dayNumber, getAlgo, weekOf, type NudgeCategory } from '@/engine';
import type { MeLive } from '@/shared/api';
import { Button, Card, Field, IconCheck, Note, formatDay, sectorStyle } from '@/ui';
import { daysWithoutRecord, nextMonday } from '@/ui/market/live';
import { Facts, Moved, MicroClosed, MicroError, MicroHead, MicroSkeleton, MicroState, Pills, errorMessage } from '@/ui/micro/parts';
import styles from '@/ui/micro/micro.module.css';

const BACK = { href: ROUTES.log, label: shared.backLabel, name: shared.back };
const sameWeek = (a: string, b: string): boolean => weekOf(dayNumber(a)) === weekOf(dayNumber(b));
const CATEGORY_OPTIONS = NUDGE_CATEGORIES.map((c) => ({ value: c, label: copy.categories[c] }));

export default function PeoplePage() {
  const me = useMe();
  const flags = useFlags();
  const head = <MicroHead title={copy.title} lead={copy.lead} sectors={['NETW']} back={BACK} />;

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
  if (!flags.flags.peopleNudge) {
    return (
      <>
        {head}
        <MicroClosed name={copy.name} home={ROUTES.market} />
      </>
    );
  }
  if (!me.data.live) return <MicroSkeleton />;
  return (
    <>
      {head}
      <PeopleNudge live={me.data.live} />
    </>
  );
}

function PeopleNudge({ live }: { live: MeLive }) {
  const device = useDevice();
  const params = getAlgo().live.peopleNudge;
  const [picking, setPicking] = useState(false);
  const [sentHere, setSentHere] = useState(false);
  const done = live.apps.peopleNudge.recordedThisWeek;
  const breakdown = useAsync(() => api.dayBreakdown({ day: live.today, today: live.today }), [live.today, live.sectors.N.target], {
    enabled: live.apps.peopleNudge.recordedToday,
  });

  const thisWeek = device.people.filter((p) => sameWeek(p.pickedOn, live.today));
  const reached = thisWeek.filter((p) => p.reachedOn !== null);
  // The week's log on the server may come from another device. This device knows what it sent
  // only when it sent it in this visit, or holds a person it marked as reached.
  const knowsLog = sentHere || reached.length > 0;

  const privacy = (
    <Note title={copy.privacyTitle} className={styles.noteTop}>
      <p>{copy.privacy}</p>
    </Note>
  );
  const rules = (
    <Facts
      sector="NETW"
      title={copy.rulesTitle}
      items={[copy.rules.reach(params.maxPerWeek, params.reach.minWeeks, params.reach.windowWeeks), copy.rules.mentor, copy.rules.halt(params.haltAfterDays)]}
    />
  );
  const halted = live.sectors.N.status === 'halted' && live.sectors.N.haltedSince && (
    <Note title={shared.haltedTitle('Network')} className={styles.noteTop}>
      <p>{copy.halted(formatDay(live.sectors.N.haltedSince), daysWithoutRecord(live, 'N') ?? params.haltAfterDays)}</p>
    </Note>
  );

  if (thisWeek.length === 0 || picking) {
    return (
      <>
        {halted}
        {done && thisWeek.length === 0 && (
          <Note className={styles.noteTop}>
            <p>{copy.doneNoLocal}</p>
          </Note>
        )}
        {privacy}
        <PickForm
          max={params.maxPerWeek}
          current={thisWeek}
          today={live.today}
          onSave={(next) => {
            deviceStore().update((d) => ({ ...d, people: [...d.people.filter((p) => !sameWeek(p.pickedOn, live.today)), ...next] }));
            setPicking(false);
          }}
        />
        <div className={styles.note}>{rules}</div>
      </>
    );
  }

  const counts = NUDGE_CATEGORIES.map((c) => ({ c, n: reached.filter((p) => p.category === c).length })).filter((x) => x.n > 0);

  return (
    <>
      {halted}
      <ReachLog
        people={thisWeek}
        recorded={done && knowsLog}
        onSaved={(next) => {
          setSentHere(true);
          applyLive(next);
        }}
      />
      <div className={styles.center}>
        <Button variant="quiet" onClick={() => setPicking(true)}>
          {copy.changePicks}
        </Button>
      </div>

      {done && (
        <>
          <div className={styles.note}>
            <Moved
              live={live}
              areas={['N']}
              label={copy.doneTitle}
              breakdown={{ data: breakdown.data, loading: breakdown.loading, error: breakdown.error !== null, onRetry: () => void breakdown.refresh() }}
            />
          </div>
          <Card className={styles.note} sector="NETW">
            <div className={styles.facts}>
              <p className={styles.resultLabel}>{copy.doneTitle}</p>
              {knowsLog ? <h2 className="t-h3">{copy.summary(reached.length, thisWeek.length)}</h2> : <p className={styles.resultLine}>{copy.doneNoLocal}</p>}
              <p className={styles.resultLine}>{copy.nextDue(formatDay(nextMonday(live.today)))}</p>
            </div>
          </Card>
          {knowsLog && <div className={styles.note}>
            <Facts
              sector="NETW"
              title={copy.sentTitle}
              items={[
                copy.sentPlanned(thisWeek.length),
                copy.sentReached(counts.map((x) => copy.sentCount(x.n, copy.categories[x.c]))),
                copy.sentNoNames,
              ]}
            />
          </div>}
        </>
      )}
      <div className={styles.note}>{rules}</div>
      <div className={styles.note}>{privacy}</div>
    </>
  );
}

interface Slot {
  id: string;
  name: string;
  category: NudgeCategory | null;
  reachedOn: string | null;
}

/** Pick one to three people. Saved on this device only: nothing is sent at this step. */
function PickForm({ max, current, today, onSave }: { max: number; current: LocalPerson[]; today: string; onSave: (people: LocalPerson[]) => void }) {
  const [slots, setSlots] = useState<Slot[]>(() =>
    Array.from({ length: max }, (_, i) => {
      const p = current[i];
      return p ? { id: p.id, name: p.name, category: p.category, reachedOn: p.reachedOn } : { id: newClientId(), name: '', category: null, reachedOn: null };
    }),
  );
  const [error, setError] = useState<string | null>(null);
  const change = (i: number, fields: Partial<Slot>) => setSlots((all) => all.map((s, at) => (at === i ? { ...s, ...fields } : s)));
  const usesMentor = slots.some((s) => s.category === 'mentor');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const named = slots.filter((s) => s.name.trim() !== '');
    if (named.length === 0) return setError(copy.pickError);
    if (named.some((s) => s.category === null)) return setError(copy.categoryError);
    setError(null);
    onSave(named.map((s) => ({ id: s.id, name: s.name.trim(), category: s.category as NudgeCategory, pickedOn: today, reachedOn: s.reachedOn })));
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate style={sectorStyle('NETW')}>
      <h2 className={styles.formTitle}>{copy.pickTitle}</h2>
      <p className={styles.formLead}>{copy.pickLead}</p>
      <div className={styles.people}>
        {slots.map((slot, i) => (
          <Card key={slot.id} variant="flat" pad="sm">
            <div className={styles.personCard}>
              <Field label={copy.person(i + 1)} placeholder={copy.namePlaceholder} value={slot.name} maxLength={40} onChange={(e) => change(i, { name: e.target.value })} />
              <div className={styles.group}>
                <p id={`person-cat-${i}`} className={styles.timeLabel}>
                  {copy.category}
                </p>
                <Pills<NudgeCategory> labelledBy={`person-cat-${i}`} value={slot.category} onChange={(category) => change(i, { category })} options={CATEGORY_OPTIONS} />
              </div>
            </div>
          </Card>
        ))}
      </div>
      {usesMentor && <p className={styles.resultLine}>{copy.mentorHint}</p>}
      <MicroError>{error}</MicroError>
      <div className={styles.actions}>
        <Button type="submit" size="lg" full>
          {copy.savePicks}
        </Button>
        <p className={styles.skyNote}>{copy.picksSavedHere}</p>
      </div>
    </form>
  );
}

/** Tick who was reached, then save. Each save sends the whole week again; the last one of the week counts. */
function ReachLog({ people, recorded, onSaved }: { people: LocalPerson[]; recorded: boolean; onSaved: (live: MeLive | null) => void }) {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set(people.filter((p) => p.reachedOn !== null).map((p) => p.id)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedIds = new Set(people.filter((p) => p.reachedOn !== null).map((p) => p.id));
  const dirty = people.some((p) => ticked.has(p.id) !== savedIds.has(p.id));

  const toggle = (id: string) =>
    setTicked((before) => {
      const next = new Set(before);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      const localDate = deviceToday();
      // Counts and categories. No name is in this request.
      const res = await api.postPeopleNudge({
        id: newClientId(),
        localDate,
        planned: people.length,
        reached: people.filter((p) => ticked.has(p.id)).map((p) => p.category),
      });
      const ids = new Set(people.map((p) => p.id));
      deviceStore().update((d) => ({
        ...d,
        people: d.people.map((p) => (ids.has(p.id) ? { ...p, reachedOn: ticked.has(p.id) ? (p.reachedOn ?? res.day) : null } : p)),
      }));
      onSaved(res.live);
    } catch (e) {
      setError(errorMessage(errorCodeOf(e)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.form} style={sectorStyle('NETW')}>
      <div>
        <h2 className={styles.formTitle}>{copy.logTitle}</h2>
        <p className={styles.formLead} style={{ marginTop: 'var(--s-1)' }}>
          {copy.logLead}
        </p>
      </div>
      <Card>
        <ul className={styles.reachList}>
          {people.map((p) => {
            const on = ticked.has(p.id);
            return (
              <li key={p.id} className={styles.reachItem}>
                <button type="button" role="checkbox" aria-checked={on} aria-label={copy.markReached(p.name)} className={styles.reach} onClick={() => toggle(p.id)} disabled={saving}>
                  <span className={styles.reachBox} aria-hidden="true">
                    <IconCheck size={18} />
                  </span>
                  <span className={styles.reachText}>
                    <span className={styles.reachName}>{p.name}</span>
                    <span className={styles.reachMeta}>{copy.categories[p.category]}</span>
                  </span>
                  <span className={styles.reachState}>{on ? copy.reached : copy.notYet}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
      <MicroError>{error}</MicroError>
      <div className={styles.actions}>
        <Button size="lg" full onClick={() => void save()} disabled={saving || !dirty}>
          {saving ? shared.saving : recorded ? copy.saveAgain : copy.save}
        </Button>
        {!dirty && recorded && <p className={styles.skyNote}>{copy.nothingNew}</p>}
      </div>
    </div>
  );
}
