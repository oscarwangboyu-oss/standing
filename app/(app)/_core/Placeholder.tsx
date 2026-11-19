import { placeholder, type PlaceholderScreen } from '@/copy/core';
import { Spot } from '@/ui';
import styles from './core.module.css';

/** What a route shows until its screen is built: an empty lot, the name of the screen, one sentence. */
export function Placeholder({ screen }: { screen: PlaceholderScreen }) {
  return (
    <div className={styles.placeholder}>
      <Spot kind="lot" />
      <h1 className="t-h1">{placeholder.titles[screen]}</h1>
      <p className="t-body">{placeholder.line}</p>
    </div>
  );
}
