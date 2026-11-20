'use client';

/**
 * What needs a look this week, at the top of the board: the gates that are not met, the question
 * versions over the most red lines, and the scoring tests that warn. Each entry links to its row
 * further down. It reads the same responses as the sections it points to, so it can never
 * disagree with them.
 */
import type { ReactNode } from 'react';
import type { AsyncView } from '@/client/api';
import { team as copy } from '@/copy/team';
import type { TeamGatesResponse, TeamItemsResponse, TeamTestsResponse } from '@/shared/api';
import { IconCheck, IconChevron, SectorTag, SkeletonText, Tag } from '@/ui';
import { breachesOf, byBreaches, isRed, itemAnchor } from './breaches';
import { bankOf, questionOf, sectorOf } from './labels';
import { Flag, Section, Status } from './parts';
import { gateCounts, gateLine, gateValue } from './Scoreboard';
import { viewsOf } from './Tests';
import styles from './team.module.css';

/** How many question versions the list shows. The question table has the rest. */
const TOP_QUESTIONS = 5;

function Block<T>({ title, view, wide, children }: { title: string; view: AsyncView<T>; wide?: boolean; children: (data: T) => ReactNode }) {
  return (
    <div className={wide ? styles.attnBlockWide : styles.attnBlock}>
      <h3 className={styles.attnTitle}>{title}</h3>
      {view.data ? children(view.data) : view.error ? <p className={styles.attnClear}>{copy.attention.failed}</p> : <SkeletonText lines={2} />}
    </div>
  );
}

function Clear({ children }: { children: ReactNode }) {
  return (
    <p className={styles.attnClear}>
      <IconCheck size={18} />
      {children}
    </p>
  );
}

export interface AttentionProps {
  gates: AsyncView<TeamGatesResponse>;
  /** The question table over all roles, whatever the role filter of the table says. */
  items: AsyncView<TeamItemsResponse>;
  tests: AsyncView<TeamTestsResponse>;
}

export function Attention({ gates, items, tests }: AttentionProps) {
  const notMet = gates.data?.gates.filter((g) => g.met === false) ?? [];
  const red = items.data ? byBreaches(items.data.rows).filter(isRed) : [];
  const testViews = tests.data ? viewsOf(tests.data) : [];
  const warns = testViews.filter((t) => t.verdict === 'warn');
  const short = testViews.filter((t) => t.verdict === 'insufficient_data').length;
  const ready = gates.data !== null && items.data !== null && tests.data !== null;
  const bank = items.data ? bankOf(items.data.bankVersion) : null;

  return (
    <Section id="team-attention" title={copy.attention.title} lead={ready ? copy.attention.summary(notMet.length, red.length, warns.length) : undefined}>
      <div className={styles.attention}>
        <div className={styles.attnSide}>
          <Block title={copy.attention.gates} view={gates}>
            {() =>
              notMet.length === 0 ? (
                <Clear>{copy.attention.gatesNone}</Clear>
              ) : (
                <ul className={styles.attnList}>
                  {notMet.map((gate) => {
                    const counts = gateCounts(gate);
                    return (
                      <li key={gate.id}>
                        <a className={styles.attnLink} href={`#team-gate-${gate.id}`}>
                          <span className={styles.attnMain}>
                            <span className={styles.attnStatusInline}>
                              <Status kind="not_met">{copy.gates.notMet}</Status>
                            </span>
                            <span className={styles.attnName}>{copy.gates.names[gate.id]}</span>
                            <span className={styles.attnFigure}>{copy.attention.against(gateValue(gate, gate.value), gateLine(gate))}</span>
                            {counts && <span className={styles.attnBasis}>{counts}</span>}
                          </span>
                          <span className={styles.attnStatusSide}>
                            <Status kind="not_met">{copy.gates.notMet}</Status>
                          </span>
                          <IconChevron size={18} className={styles.attnChevron} />
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )
            }
          </Block>
          <Block title={copy.attention.tests} view={tests}>
            {() => (
              <>
                {warns.length === 0 ? (
                  <Clear>{copy.attention.testsNone}</Clear>
                ) : (
                  <ul className={styles.attnList}>
                    {warns.map((test) => (
                      <li key={test.id}>
                        <a className={styles.attnLink} href={`#team-test-${test.id}`}>
                          <span className={styles.attnMain}>
                            <span className={styles.attnStatusInline}>
                              <Status kind="not_met">{copy.tests.verdicts.warn}</Status>
                            </span>
                            <span className={styles.attnName}>{copy.tests.names[test.id]}</span>
                            {test.reasons.map((reason) => (
                              <span key={reason} className={styles.attnBasis}>
                                {copy.tests.reasons[reason] ?? reason}
                              </span>
                            ))}
                          </span>
                          <span className={styles.attnStatusSide}>
                            <Status kind="not_met">{copy.tests.verdicts.warn}</Status>
                          </span>
                          <IconChevron size={18} className={styles.attnChevron} />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {short > 0 && <p className={styles.attnNote}>{copy.attention.testsShort(short, testViews.length)}</p>}
              </>
            )}
          </Block>
        </div>

        <Block title={copy.attention.questions} view={items} wide>
          {(data) =>
            red.length === 0 ? (
              <Clear>{copy.attention.questionsNone}</Clear>
            ) : (
              <>
                <p className={styles.attnNote}>{copy.attention.questionsLead(Math.min(TOP_QUESTIONS, red.length), red.length)}</p>
                <ol className={styles.attnList}>
                  {red.slice(0, TOP_QUESTIONS).map((row) => {
                    const question = bank ? questionOf(bank, row.itemId, row.versionKey) : null;
                    const sector = sectorOf(row.area);
                    return (
                      <li key={`${row.itemId}/${row.versionKey}`}>
                        <a className={styles.attnLink} href={`#${itemAnchor(row)}`}>
                          <span className={styles.attnMain}>
                            <span className={styles.questionHead}>
                              <span className={styles.questionId}>
                                {row.itemId}/{row.versionKey}
                              </span>
                              {sector ? <SectorTag code={sector} size="sm" /> : <Tag>{copy.common.ladder}</Tag>}
                            </span>
                            <span className={styles.attnStem}>{question?.stem ?? copy.items.stemMissing}</span>
                            <span className={styles.attnBreaches}>
                              {breachesOf(row, data.redLines).map((b) => (
                                <span key={b.metric} className={styles.attnBreach}>
                                  <Flag>{b.label}</Flag>
                                  <span className={styles.attnBasis}>{b.basis}</span>
                                </span>
                              ))}
                            </span>
                          </span>
                          <IconChevron size={18} className={styles.attnChevron} />
                        </a>
                      </li>
                    );
                  })}
                </ol>
                {red.length > TOP_QUESTIONS && (
                  <a className={styles.attnMore} href="#team-items">
                    {copy.attention.questionsAll(red.length)}
                  </a>
                )}
              </>
            )
          }
        </Block>
      </div>
    </Section>
  );
}
