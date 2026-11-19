import type { Metadata } from 'next';
import { team as copy } from '@/copy/team';
import { TeamDashboard } from '@/ui/team/TeamDashboard';

// The dashboard is for the team: it stays out of search results.
export const metadata: Metadata = { title: copy.metaTitle, robots: { index: false, follow: false } };

/**
 * /team. Outside the (app) group on purpose: no bottom navigation, no route guard, no device
 * record. The page brings its own frame and its own <main>.
 */
export default function Page() {
  return <TeamDashboard />;
}
