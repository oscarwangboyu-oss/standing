import type { Metadata } from 'next';
import { pages } from '@/copy/check';
import { StartFlow } from './StartFlow';

export const metadata: Metadata = { title: pages.start };

/** /start: consent and background, one decision per screen. /start?retake=1 begins another check. */
export default function Page() {
  return <StartFlow />;
}
