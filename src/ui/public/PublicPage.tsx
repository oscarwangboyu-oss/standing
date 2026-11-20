import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { START_HREF } from '@/copy/landing';
import { draft, publicClosing, publicNav, type PageSection } from '@/copy/public';
import { TopBar } from '../AppShell';
import { Button } from '../Button';
import { cx } from '../cx';
import { Footer } from '../Footer';
import { IconArrowRight, IconInfo } from '../icons';
import { Column } from '../PublicShell';
import { Tag } from '../Tag';
import { MAST_H, MAST_STREET, MastScene, type MastTower } from './MastScene';
import styles from './page.module.css';

export interface PublicPageProps {
  /** The path of this page, to mark it in the navigation. */
  path: string;
  title: string;
  lead: string;
  /** The towers at the foot of the heading. */
  towers: readonly MastTower[];
  /** Draw the horizon and its tag in the heading scene. */
  scale?: boolean;
  /** The page is a draft that awaits legal review: a tag by the title and a notice under the heading. */
  isDraft?: boolean;
  children: ReactNode;
}

/**
 * The frame of the short public pages: the heading under the same sky as the landing page, with
 * a few towers on the street; the content; the action; the footer with the required statements.
 */
export function PublicPage({ path, title, lead, towers, scale, isDraft = false, children }: PublicPageProps) {
  return (
    <div className={styles.page}>
      <div className={styles.mast} style={{ '--street': MAST_STREET / MAST_H } as CSSProperties}>
        <TopBar
          wide
          right={
            <nav className={styles.nav} aria-label={publicNav.label}>
              {publicNav.links.map((l) => (
                <Link key={l.href} href={l.href} aria-current={l.href === path ? 'page' : undefined}>
                  {l.label}
                </Link>
              ))}
              <span className={styles.navStart}>
                <Button href={START_HREF} variant="secondary" size="sm">
                  {publicNav.start}
                </Button>
              </span>
            </nav>
          }
        />
        <Column className={styles.mastInner}>
          <div className={styles.mastText}>
            {isDraft && (
              <p className={styles.mastTag}>
                <Tag kind="sample">{draft.tag}</Tag>
                <span>{draft.updated}</span>
              </p>
            )}
            <h1 className={styles.title}>{title}</h1>
            <p className={styles.lead}>{lead}</p>
          </div>
          <div className={styles.mastArt}>
            <MastScene towers={towers} scale={scale} />
          </div>
        </Column>
        <div className={styles.mastStreet} aria-hidden="true" />
      </div>

      <main className={styles.main}>
        {isDraft && (
          <Column>
            <div className={styles.draft} role="note">
              <span className={styles.draftIcon}>
                <IconInfo size={22} />
              </span>
              <div>
                <p className={styles.draftTitle}>{draft.title}</p>
                <p className={styles.draftText}>{draft.text}</p>
              </div>
            </div>
          </Column>
        )}
        {children}
      </main>

      <section className={styles.closing} aria-labelledby="closing-title">
        <Column className={styles.closingInner}>
          <div>
            <h2 id="closing-title" className={styles.closingTitle}>
              {publicClosing.title}
            </h2>
            <p className={styles.closingFact}>{publicClosing.fact}</p>
          </div>
          <Button href={START_HREF} size="lg" iconEnd={<IconArrowRight size={22} />}>
            {publicClosing.cta}
          </Button>
        </Column>
      </section>
      <Footer wide links={[...publicNav.links, publicNav.restoreLink]} className={styles.footer} />
    </div>
  );
}

/** A titled part of a public page that is laid out by hand (the about page). */
export function PageBlock({ id, title, lead, children, className }: { id: string; title: string; lead?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cx(styles.block, className)} aria-labelledby={`${id}-title`}>
      <header className={styles.blockHead}>
        <h2 id={`${id}-title`} className={styles.h2}>
          {title}
        </h2>
        {lead && <p className={styles.blockLead}>{lead}</p>}
      </header>
      {children}
    </section>
  );
}

/** Paragraphs and a plain list, set as running text. */
export function Prose({ text, list }: { text?: readonly string[]; list?: readonly string[] }) {
  return (
    <div className={styles.prose}>
      {text?.map((t) => (
        <p key={t}>{t}</p>
      ))}
      {list && (
        <ul>
          {list.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface DocSectionsProps {
  sections: readonly PageSection[];
  /** Number the sections, as legal texts do, so a section can be referred to. */
  numbered?: boolean;
  /** A drawing shown after the text of a section, by section id. */
  figures?: Readonly<Record<string, ReactNode>>;
  /** In these sections the list comes before the paragraphs. */
  listFirst?: readonly string[];
}

/**
 * A text in sections with a list of contents: a fold-out above the text on a phone, a column
 * that stays in view from 900px.
 */
export function DocSections({ sections, numbered = false, figures, listFirst }: DocSectionsProps) {
  const label = (s: PageSection, i: number) => (numbered ? `${i + 1}. ${s.title}` : s.title);
  const links = (
    <ol className={styles.tocList}>
      {sections.map((s, i) => (
        <li key={s.id}>
          <a href={`#${s.id}`}>{label(s, i)}</a>
        </li>
      ))}
    </ol>
  );
  return (
    <Column className={styles.doc}>
      <details className={styles.tocFold}>
        <summary>{publicNav.onThisPage}</summary>
        {links}
      </details>
      <nav className={styles.toc} aria-label={publicNav.onThisPage}>
        <p className={styles.tocTitle}>{publicNav.onThisPage}</p>
        {links}
      </nav>
      <div className={styles.docBody}>
        {sections.map((s, i) => (
          <section key={s.id} id={s.id} className={styles.docSection} aria-labelledby={`${s.id}-title`}>
            <h2 id={`${s.id}-title`} className={styles.docTitle}>
              {label(s, i)}
            </h2>
            {listFirst?.includes(s.id) ? (
              <>
                <Prose list={s.list} />
                <Prose text={s.text} />
              </>
            ) : (
              <Prose text={s.text} list={s.list} />
            )}
            {figures?.[s.id] && <div className={styles.figure}>{figures[s.id]}</div>}
          </section>
        ))}
      </div>
    </Column>
  );
}
