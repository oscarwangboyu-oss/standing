'use client';

/**
 * /check: one question per screen. A tap on an answer moves straight to the next question and
 * the tower of the current sector gains a floor. Between two sectors there is one beat: the
 * finished building and the name of the next sector. At the end the result is priced and the
 * person goes to /result.
 *
 * Selection, timing, the queue and completing are session.ts. This file uses its controller
 * directly instead of useCheck(), for one reason: useCheck marks a question as shown as soon as
 * it is current, and here the question is not on screen yet during the beat between sectors.
 * The answer time must start when the person can read the question.
 */
import { forwardRef, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { queue } from '@/client/api';
import { ROUTES } from '@/client/nav';
import { MIN_ANSWER_SECONDS, check, sectionCounts, type CheckState, type QuestionView, type SectionCount } from '@/client/session';
import { useShell } from '@/client/shell';
import { check as copy } from '@/copy/check';
import { sectorNames } from '@/copy/common';
import { AREA_IDS } from '@/engine';
import {
  AREA_CODE,
  Button,
  IconButton,
  IconClose,
  Note,
  OptionList,
  SectorTag,
  Skeleton,
  SkylineCard,
  VisuallyHidden,
  cx,
  sectorStyle,
  type SectorCode,
} from '@/ui';
import styles from '@/ui/check/check.module.css';
import { isLongQuestion, splitQuestion } from '@/ui/check/question';

/** The beat between two sectors, and the moment "Pricing your five sectors" stays up. Interface settings, not scoring. */
const BEAT_MS = 1600;
const PRICING_MS = 1100;
const TITLE_ID = 'q-text';

type Build = Partial<Record<SectorCode, SectionCount>>;

/** Floors per sector of a check that has no question on screen (finished, or being priced). */
function buildOf(state: CheckState): Build {
  const counts = sectionCounts(state);
  const build: Build = {};
  for (const area of AREA_IDS) {
    if (!state.excludedAreas.includes(area)) build[AREA_CODE[area]] = counts[area];
  }
  return build;
}

/** What the beat between two sectors needs to remember of the question that was on screen. */
interface Seen {
  seq: number;
  section: QuestionView['section'];
  sector: SectorCode | null;
}

const seenOf = (view: QuestionView): Seen => ({ seq: view.seq, section: view.section, sector: view.sector });

const subscribeOnline = (listener: () => void) => {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
};

/** True while answers cannot be sent: the browser is offline, or the queue waits to try again. */
function useHeld(): boolean {
  const events = queue();
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const retrying = useSyncExternalStore(
    events.subscribe,
    () => events.retryIn() !== null,
    () => false,
  );
  return !online || retrying;
}

/** The question as the heading of the screen: a long one a size smaller, a closing parenthetical set apart. */
const QuestionTitle = forwardRef<HTMLHeadingElement, { text: string }>(function QuestionTitle({ text }, ref) {
  const { main, aside } = splitQuestion(text);
  return (
    <h1 id={TITLE_ID} ref={ref} tabIndex={-1} className={styles.title} data-long={isLongQuestion(main) || undefined}>
      {main}
      {aside !== null && (
        <>
          {' '}
          <span className={styles.titleAside}>{aside}</span>
        </>
      )}
    </h1>
  );
});

export function CheckFlow() {
  const router = useRouter();
  const controller = check();
  const snapshot = useSyncExternalStore(controller.subscribe, controller.get, controller.get);
  useEffect(() => {
    void controller.load();
  }, [controller]);
  const held = useHeld();

  const { status, state } = snapshot;
  const view = status === 'question' ? snapshot.view : null;

  // ---------- which question is on screen, and the beat between two sectors
  const [seen, setSeen] = useState<Seen | null>(null);
  const [beat, setBeat] = useState<{ from: SectorCode; seq: number } | null>(null);
  if (view && !beat && view.seq !== seen?.seq) {
    if (seen && seen.sector && seen.section !== view.section && view.seq === seen.seq + 1) setBeat({ from: seen.sector, seq: view.seq });
    else setSeen(seenOf(view));
  }
  const endBeat = useRef<() => void>(() => {});
  const beatAt = useRef(0);
  useEffect(() => {
    if (!beat) return;
    beatAt.current = performance.now();
    let over = false;
    const end = () => {
      if (over) return;
      over = true;
      const now = controller.get().view;
      setSeen(now ? seenOf(now) : null);
      setBeat(null);
    };
    endBeat.current = end;
    const timer = setTimeout(end, BEAT_MS);
    return () => {
      over = true;
      clearTimeout(timer);
    };
  }, [beat, controller]);
  /**
   * "Continue" during the beat. The second half of a double tap on the last answer of a sector
   * lands here: it is ignored for as long as an answer would be (MIN_ANSWER_SECONDS), so the
   * beat cannot be skipped by accident. The question after it has the same guard of its own.
   */
  const continueNow = () => {
    if (performance.now() - beatAt.current < MIN_ANSWER_SECONDS * 1000) return;
    endBeat.current();
  };

  const onScreen = view && !beat && seen?.seq === view.seq ? view : null;
  const onScreenSeq = onScreen?.seq ?? null;

  // The question is readable now: its "shown" event goes out and its answer time starts.
  const title = useRef<HTMLHeadingElement>(null);
  const answered = useRef(false);
  useEffect(() => {
    if (onScreenSeq === null) return;
    controller.shown();
    // After an answer the next question starts at the top and a keyboard continues from its text.
    if (answered.current) {
      window.scrollTo(0, 0);
      title.current?.focus({ preventScroll: true });
    }
  }, [controller, onScreenSeq]);

  // ---------- the end: one moment, then the result
  const [end, setEnd] = useState<'pricing' | 'waiting' | 'failed'>('pricing');
  const tried = useRef(false);
  const finish = useRef<(() => void) | null>(null);
  useEffect(() => {
    finish.current = () => {
      setEnd('pricing');
      void controller.complete().then((after) => {
        const reveal = after.reveal;
        if (reveal && (reveal.status === 'stored' || reveal.status === 'local')) {
          // The guard of the layout sends the person on as well; this is the same destination.
          router.replace(ROUTES.result);
        } else if (reveal?.status === 'waiting') setEnd('waiting');
        else if (reveal?.status === 'error') setEnd('failed');
        // Otherwise the server had another path and the check was read back: the questions go on.
      });
    };
  }, [controller, router]);
  useEffect(() => {
    if (status === 'question') {
      // Back among the questions (the check was read back from the server): the end starts over.
      tried.current = false;
      setEnd('pricing');
      return;
    }
    if (status !== 'finished' || tried.current) return;
    const timer = setTimeout(() => {
      tried.current = true;
      finish.current?.();
    }, PRICING_MS);
    return () => clearTimeout(timer);
  }, [status]);
  // Waiting for a connection: try again the moment it is back.
  useEffect(() => {
    if (end !== 'waiting') return;
    const retry = () => finish.current?.();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [end]);

  // ---------- the skyline: floors per answered question
  const live = useMemo<Build | null>(() => view?.build ?? (state ? buildOf(state) : null), [view, state]);
  const [kept, setKept] = useState<Build | null>(live);
  if (live && live !== kept) setKept(live);
  const build = live ?? kept ?? {};
  const active = onScreen?.sector ?? undefined;

  useShell({
    aside: <SkylineCard prices={{}} build={build} active={active} legend={false} />,
    headerRight: (
      <IconButton label={copy.leave} onClick={() => router.push(ROUTES.landing)}>
        <IconClose />
      </IconButton>
    ),
  });

  // ---------- a question
  if (onScreen) {
    const answer = (act: () => boolean) => {
      if (act()) answered.current = true;
    };
    return (
      <>
        <div className={styles.step} style={onScreen.sector ? sectorStyle(onScreen.sector) : undefined}>
          <div className={styles.meta}>
            {onScreen.sector ? <SectorTag code={onScreen.sector} name /> : <span className={styles.eyebrow}>{onScreen.sectionName}</span>}
            <p className={styles.count}>
              <VisuallyHidden>{copy.countPrefix} </VisuallyHidden>
              {copy.count(onScreen.position.current, onScreen.position.total)}
            </p>
          </div>
          <QuestionTitle ref={title} text={onScreen.text} />
          <OptionList
            key={`${onScreen.seq}:${onScreen.id}`}
            options={onScreen.options.map((option) => ({ value: String(option.index), label: option.label }))}
            onSelect={(value) => answer(() => controller.select(Number(value)))}
            labelledBy={TITLE_ID}
          />
        </div>
        <div className={styles.other}>
          <div className={styles.otherRow} role="group" aria-label={copy.otherLabel}>
            <Button variant="quiet" onClick={() => answer(() => controller.skip())}>
              {copy.skip}
            </Button>
            <Button variant="quiet" onClick={() => answer(() => controller.notApplicable())}>
              {copy.notApplicable}
            </Button>
          </div>
          {held && (
            <p className={styles.offline} role="status">
              {copy.offline}
            </p>
          )}
        </div>
      </>
    );
  }

  // ---------- the beat between two sectors
  if (beat && view) {
    return (
      <div className={cx(styles.beat, styles.between)} style={view.sector ? sectorStyle(view.sector) : undefined}>
        <div className={styles.beatText} role="status">
          <div className={styles.meta}>
            <SectorTag code={beat.from} name />
          </div>
          <h1 className={styles.title}>{copy.between.built(sectorNames[beat.from])}</h1>
          <p className={styles.next}>
            {view.sector ? (
              <>
                <span className={styles.nextLabel}>{copy.between.next}</span>
                <SectorTag code={view.sector} name />
                <span className={styles.nextCount}>{copy.between.questions(view.inSection.total)}</span>
              </>
            ) : (
              <span className={styles.nextLabel}>{copy.between.last}</span>
            )}
          </p>
        </div>
        {/* The beat moves on by itself. The bar shows how soon; the button moves on now. */}
        <span className={styles.beatBar} style={{ '--beat-ms': `${BEAT_MS}ms` } as CSSProperties} aria-hidden="true">
          <i />
        </span>
        <Button variant="quiet" inline onClick={continueNow}>
          {copy.between.go}
        </Button>
      </div>
    );
  }

  // ---------- the end
  if (status === 'finished' || status === 'completing' || status === 'done') {
    const sectors = Object.keys(build).length;
    if (status === 'finished' && end !== 'pricing') {
      const text = end === 'waiting' ? copy.waiting : copy.failed;
      return (
        <div className={styles.beat}>
          <h1 className={styles.title}>{text.title}</h1>
          <Note tone="info">
            <p role="status">{text.text}</p>
          </Note>
          <Button variant="secondary" onClick={() => finish.current?.()}>
            {copy.retry}
          </Button>
        </div>
      );
    }
    return (
      <div className={styles.beat} role="status">
        <h1 className={styles.title}>{copy.pricing(sectors)}</h1>
        <p className={styles.note}>{copy.pricingNote}</p>
      </div>
    );
  }

  // ---------- resuming
  return (
    <div className={styles.loading} role="status" aria-label={copy.loading}>
      <Skeleton height={26} width={132} radius={13} />
      <Skeleton height={76} radius={16} />
      <Skeleton height={60} radius={20} />
      <Skeleton height={60} radius={20} />
      <Skeleton height={60} radius={20} />
    </div>
  );
}
