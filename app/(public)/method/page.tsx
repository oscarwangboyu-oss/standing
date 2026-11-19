import type { Metadata } from 'next';
import { method as copy } from '@/copy/public';
import { GradeFigure, ScaleRulerFigure, SplitFigure, TimingFigure } from '@/ui/public/MethodFigures';
import { DocSections, PublicPage } from '@/ui/public/PublicPage';

export const metadata: Metadata = {
  title: copy.meta.title,
  description: copy.meta.description,
};

/** The same building at 85, 100 and 115: one standard deviation below the median, the median, one above. */
const TOWERS = [
  { code: 'SKIL', price: 85 },
  { code: 'SKIL', price: 100 },
  { code: 'SKIL', price: 115 },
] as const;

export default function MethodPage() {
  return (
    <PublicPage path="/method" title={copy.title} lead={copy.lead} towers={TOWERS} scale>
      <DocSections
        sections={copy.sections}
        figures={{
          value: <SplitFigure />,
          price: <ScaleRulerFigure />,
          timing: <TimingFigure />,
          checks: <GradeFigure />,
        }}
      />
    </PublicPage>
  );
}
