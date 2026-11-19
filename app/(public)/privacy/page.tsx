import type { Metadata } from 'next';
import { privacy as copy } from '@/copy/public';
import { DocSections, PublicPage } from '@/ui/public/PublicPage';

export const metadata: Metadata = {
  title: copy.meta.title,
  description: copy.meta.description,
};

/** The bank, the body tower and the mind tower: money, body and mind are the answers this notice is most about. */
const TOWERS = [
  { code: 'WLTH', price: 100 },
  { code: 'BODY', price: 106 },
  { code: 'MIND', price: 94 },
] as const;

export default function PrivacyPage() {
  return (
    <PublicPage path="/privacy" title={copy.title} lead={copy.lead} towers={TOWERS} isDraft>
      <DocSections sections={copy.sections} numbered listFirst={['not']} />
    </PublicPage>
  );
}
