'use client';

import { useEffect, useRef, useState } from 'react';
import { demo as copy } from '@/copy/landing';
import { Button } from '../Button';
import { IconRetake } from '../icons';
import { OptionList } from '../OptionList';
import { ProgressCount } from '../ProgressCount';
import type { SectorCode } from '../sectors';
import { Skyline } from '../skyline/Skyline';
import { sectorStyle } from '../Tag';
import styles from './try.module.css';

const SECTOR: SectorCode = 'BODY';
/** A full-time employee: 10 capability, 6 wealth and 6 network questions come before Body. */
const BEFORE = { SKIL: { built: 10, total: 10 }, WLTH: { built: 6, total: 6 }, NETW: { built: 6, total: 6 }, MIND: { built: 0, total: 6 } } as const;

/**
 * Three real questions of the check, to try on the landing page. An answer adds a floor to the
 * Body tower, as in the check. Nothing is stored and nothing is sent.
 */
export function TryCheck() {
  /** Questions passed, answered or skipped. */
  const [step, setStep] = useState(0);
  /** Floors added by answers. A skipped question adds none. */
  const [floors, setFloors] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const done = step >= copy.questions.length;
  const question = copy.questions[Math.min(step, copy.questions.length - 1)]!;

  // After an answer the question changes under the finger. Move focus to the new text so a keyboard keeps its place.
  useEffect(() => {
    if (moved.current) heading.current?.focus({ preventScroll: true });
  }, [step]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const advance = (answered: boolean) => {
    if (timer.current) return;
    moved.current = true;
    if (answered) setFloors((f) => f + 1);
    // Leave the chosen answer on screen for a moment while the floor goes up.
    timer.current = setTimeout(
      () => {
        timer.current = null;
        setChosen(null);
        setStep((s) => s + 1);
      },
      answered ? 420 : 0,
    );
  };

  const restart = () => {
    moved.current = true;
    setStep(0);
    setFloors(0);
    setChosen(null);
  };

  const built = copy.sectorFirst - 1 + floors;
  const inSector = Math.min(copy.sectorFirst + step, copy.sectorTotal);

  return (
    <div className={styles.try} style={sectorStyle(SECTOR)}>
      <div className={styles.sky}>
        <Skyline prices={{}} build={{ ...BEFORE, [SECTOR]: { built, total: copy.sectorTotal } }} active={SECTOR} size="card" framed={false} horizonLabel={false} />
      </div>
      <div className={styles.body}>
        {done ? (
          <div className={styles.done}>
            <h3 ref={heading} tabIndex={-1} className={styles.question}>
              {copy.doneTitle}
            </h3>
            <p className={styles.doneText}>{copy.doneText}</p>
            <p className={styles.floors}>{copy.floors(floors)}</p>
            <div>
              <Button variant="secondary" size="md" icon={<IconRetake size={18} />} onClick={restart}>
                {copy.again}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <ProgressCount current={copy.first + step} total={copy.total} sector={SECTOR} inSector={{ current: inSector, total: copy.sectorTotal }} />
            <h3 ref={heading} tabIndex={-1} id="try-question" className={styles.question}>
              {question.text}
            </h3>
            <OptionList
              key={question.id}
              compact
              options={question.options.map((label) => ({ value: label, label }))}
              value={chosen}
              onSelect={(value) => {
                setChosen(value);
                advance(true);
              }}
              labelledBy="try-question"
            />
            <div className={styles.skip}>
              <Button variant="quiet" size="sm" onClick={() => advance(false)}>
                {copy.skip}
              </Button>
            </div>
          </>
        )}
      </div>
      <p className={styles.note}>{copy.note}</p>
    </div>
  );
}
