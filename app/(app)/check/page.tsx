import type { Metadata } from 'next';
import { pages } from '@/copy/check';
import { CheckFlow } from './CheckFlow';

export const metadata: Metadata = { title: pages.check };

/** /check: the questions, one per screen. Leaving and returning resumes at the same question. */
export default function Page() {
  return <CheckFlow />;
}
