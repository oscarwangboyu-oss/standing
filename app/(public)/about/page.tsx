import type { Metadata } from 'next';
import Link from 'next/link';
import { brand } from '@/copy/common';
import { sample } from '@/copy/landing';
import { about as copy } from '@/copy/public';
import { Band, Column, IconArrowRight, SECTOR_CODES, SectorTag } from '@/ui';
import { PageBlock, Prose, PublicPage } from '@/ui/public/PublicPage';
import { Stages } from '@/ui/public/Stages';
import s from '@/ui/public/page.module.css';

export const metadata: Metadata = {
  title: copy.meta.title,
  description: copy.meta.description,
};

export default function AboutPage() {
  return (
    <PublicPage path="/about" title={copy.title} lead={copy.lead} towers={SECTOR_CODES.map((code) => ({ code, price: sample.prices[code] }))}>
      <Column>
        <PageBlock id="company" title={copy.company.title}>
          <div className={s.pair}>
            <Prose text={copy.company.text} />
            <dl className={s.facts}>
              {copy.company.facts.map((f) => (
                <div key={f.text}>
                  <dt>{f.figure}</dt>
                  <dd>{f.text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </PageBlock>

        <PageBlock id="product" title={copy.product.title}>
          <div className={s.pair}>
            <Prose text={copy.product.text} />
            <div className={s.side}>
              <p className={s.tags}>
                {SECTOR_CODES.map((code) => (
                  <SectorTag key={code} code={code} name />
                ))}
              </p>
              <Link href="/method" className={s.more}>
                {copy.product.method}
                <IconArrowRight size={18} />
              </Link>
            </div>
          </div>
        </PageBlock>
      </Column>

      <Band tone="sunk" className={s.planBand}>
        <PageBlock id="plan" title={copy.plan.title} lead={copy.plan.lead}>
          <Stages />
        </PageBlock>
      </Band>

      <Column>
        <PageBlock id="principles" title={copy.principles.title}>
          <ul className={s.rules}>
            {copy.principles.list.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </PageBlock>

        <PageBlock id="contact" title={copy.contact.title}>
          <p className={s.contact}>
            <span>{copy.contact.text}</span>
            <a href={`mailto:${brand.email}`}>{brand.email}</a>
          </p>
        </PageBlock>
      </Column>
    </PublicPage>
  );
}
