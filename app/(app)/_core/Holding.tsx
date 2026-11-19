import { Skeleton, SkeletonQuote } from '@/ui';
import styles from './core.module.css';

/** Shown while the guards do not know yet where the person belongs, and while they are being sent on. */
export function Holding() {
  return (
    <div className={styles.holding}>
      <SkeletonQuote />
      <Skeleton height={132} radius={22} />
      <Skeleton height={88} radius={22} />
    </div>
  );
}
