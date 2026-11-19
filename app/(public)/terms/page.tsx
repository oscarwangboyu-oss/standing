import type { Metadata } from 'next';
import { terms as copy } from '@/copy/public';
import { DocSections, PublicPage } from '@/ui/public/PublicPage';

export const metadata: Metadata = {
  title: copy.meta.title,
  description: copy.meta.description,
};

const TOWERS = [
  { code: 'NETW', price: 104 },
  { code: 'SKIL', price: 92 },
  { code: 'WLTH', price: 99 },
] as const;

export default function TermsPage() {
  return (
    <PublicPage path="/terms" title={copy.title} lead={copy.lead} towers={TOWERS} isDraft>
      <DocSections sections={copy.sections} numbered />
    </PublicPage>
  );
}
