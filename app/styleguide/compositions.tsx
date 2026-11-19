'use client';

/**
 * The five reference compositions. Screen agents copy these: the structure, the order and the
 * components are the specification of each screen. Text here is sample text; real text lives in
 * src/copy.
 */
import { useEffect, useRef, useState } from 'react';
import {
  AppShell,
  BaselineNote,
  Block,
  Button,
  Card,
  Change,
  Entry,
  EntryList,
  FeatureEntry,
  IconArrowRight,
  IconButton,
  IconClose,
  IconCompare,
  IconDownload,
  IconLink,
  IconPayday,
  IconPeople,
  IconRetake,
  IconSettings,
  IconShare,
  IconWin,
  Note,
  OptionList,
  Pentagon,
  Price,
  PriceChart,
  ProgressCount,
  QuoteHead,
  Ruler,
  SECTOR_CODES,
  SectorBoard,
  SectorRow,
  SectorTag,
  ShareCard,
  SkylineCard,
  Spot,
  StatStrip,
  Streak,
  Tape,
  TapeCode,
  Ticker,
  Toast,
  TypeCard,
  Useful,
  formatChange,
  formatPrice,
  renderShareCard,
  sectorStyle,
  sharedDomain,
  skylineTop,
  useOpen,
  useToast,
  type SectorCode,
} from '@/ui';
import { changes, history, historyValues, other, prices, question, sample, sectorHistory, share, week } from './data';
import styles from './compositions.module.css';

/* ---------- 1. A question of the check ---------- */

export function QuestionScreen() {
  const [built, setBuilt] = useState(question.build.BODY.built);
  const [chosen, setChosen] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  // In the product a choice moves on to the next question. Here it adds the floor and stays, so the motion can be seen again.
  const answer = (value: string) => {
    setChosen(value);
    setBuilt((b) => (b >= question.build.BODY.total ? question.build.BODY.built : b + 1));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setChosen(null), 900);
  };

  const build = { ...question.build, BODY: { built, total: question.build.BODY.total } };
  const at = question.inSector.current + (built - question.build.BODY.built);
  return (
    <AppShell
      embedded
      fill
      headerRight={
        <IconButton label="Leave the check">
          <IconClose />
        </IconButton>
      }
      aside={<SkylineCard prices={{}} build={build} active={question.sector} legend={false} />}
    >
      <div className={styles.question} style={sectorStyle(question.sector)}>
        <ProgressCount current={question.current + (at - question.inSector.current)} total={question.total} sector={question.sector} inSector={{ current: Math.min(at, question.inSector.total), total: question.inSector.total }} />
        <h1 id="q-text" className={styles.questionText}>
          {question.text}
        </h1>
        <OptionList key="B3" options={question.options} value={chosen} onSelect={answer} labelledBy="q-text" />
      </div>
      <div className={styles.skip}>
        <Button variant="quiet">{question.skip}</Button>
      </div>
    </AppShell>
  );
}

/* ---------- 2. The result reveal ---------- */

const TAGS: Partial<Record<SectorCode, 'leader' | 'laggard'>> = { SKIL: 'leader', WLTH: 'laggard' };

export function ResultScreen() {
  const open = useOpen(historyValues);
  const domain = sharedDomain(SECTOR_CODES.map((c) => sectorHistory[c]));
  const toast = useToast();
  return (
    <AppShell
      embedded
      footer
      headerRight={
        <Button variant="secondary" size="sm" icon={<IconShare size={18} />}>
          Share
        </Button>
      }
      aside={
        <div className={styles.asideStack}>
          <SkylineCard prices={prices} rise />
          <div className={styles.wideOnly}>
            <TypeCard pair={sample.pair} />
          </div>
        </div>
      }
    >
      <QuoteHead ticker={sample.ticker} cohort={sample.cohort} price={sample.price} change={sample.change} open={open} />
      <StatStrip
        className={styles.stats}
        stats={[
          { label: 'Issue price', value: formatPrice(sample.issue) },
          { label: 'All-time high', value: formatPrice(sample.high) },
          { label: 'All-time low', value: formatPrice(sample.low) },
          { label: 'Data grade', value: sample.grade },
        ]}
      />

      <Block title="Price history" id="r-history">
        <Card>
          <PriceChart points={history} open={open} />
          <Tape className={styles.tape}>
            <TapeCode code="SKIL" /> leads at 111.20. <TapeCode code="BODY" /> is the top gainer, <Change value={3.1} size="sm" />. <TapeCode code="WLTH" /> is the laggard at 96.85.
          </Tape>
        </Card>
        <Useful className={styles.useful} />
      </Block>

      <Block title="Sectors" id="r-sectors">
        <Card>
          <SectorBoard label="Sector prices">
            {SECTOR_CODES.map((code) => (
              <SectorRow key={code} code={code} price={prices[code]} change={changes[code]} tag={TAGS[code]} history={sectorHistory[code]} domain={domain} />
            ))}
          </SectorBoard>
        </Card>
        <Useful className={styles.useful} />
      </Block>

      <Block title="Your shape" id="r-shape">
        <div className={styles.narrowOnly}>
          <TypeCard pair={sample.pair} />
        </div>
        <Card className={styles.shape}>
          <Pentagon prices={prices} />
          <p className={styles.caption}>The dashed ring is 100, the issue price. The rim is 130 and the centre is 70.</p>
        </Card>
        <Useful className={styles.useful} />
      </Block>

      <BaselineNote className={styles.baseline} />

      <div className={styles.actions}>
        <Button size="lg" full icon={<IconShare size={20} />} onClick={() => toast.show('Image saved')}>
          Share my skyline
        </Button>
        <Button variant="secondary" size="lg" full icon={<IconCompare size={20} />}>
          Compare with a friend
        </Button>
      </div>
      <Toast>{toast.message}</Toast>
    </AppShell>
  );
}

/* ---------- 3. The market home ---------- */

export function MarketScreen() {
  const domain = sharedDomain(SECTOR_CODES.map((c) => sectorHistory[c]));
  return (
    <AppShell
      embedded
      nav="market"
      aside={<SkylineCard prices={prices} size="small" lit={{ SKIL: false, WLTH: false, NETW: false, BODY: true, MIND: true }} />}
    >
      <QuoteHead ticker={sample.ticker} cohort={sample.cohort} price={sample.price} change={sample.change} since="since yesterday" />
      <div className={styles.against}>
        <p className={styles.againstLine}>
          <span>Against the issue price</span>
          <Change value={sample.price - sample.issue} size="sm" />
        </p>
        <Ruler value={sample.price} />
      </div>

      <Block label="Today">
        <FeatureEntry
          href="/open"
          sector="MIND"
          eyebrow="Daily Open"
          title="Open today"
          detail="Three questions about sleep, movement and how you feel. About 15 seconds."
          action="Open today"
          art={<Spot kind="sunrise" size={148} />}
        />
        <Card className={styles.streak} variant="flat">
          <Streak days={week} count={6} />
        </Card>
      </Block>

      <Block title="Sectors" id="m-sectors">
        <Card>
          <SectorBoard label="Sector prices">
            {SECTOR_CODES.map((code) => (
              <SectorRow key={code} code={code} price={prices[code]} change={changes[code]} history={sectorHistory[code]} domain={domain} onSelect={() => undefined} />
            ))}
          </SectorBoard>
        </Card>
      </Block>

      <Block title="Keep it current" id="m-more">
        <Card pad="none">
          <EntryList label="More ways to update your price">
            <Entry href="/payday" sector="WLTH" icon={<IconPayday />} title="Payday Check" detail="Three numbers each payday. Amounts stay on this device." status="Nov 28" />
            <Entry href="/win" sector="SKIL" icon={<IconWin />} title="Weekly Win" detail="One thing you got better at this week." status="Friday" />
            <Entry href="/people" sector="NETW" icon={<IconPeople />} title="People Nudge" detail="Who you were in touch with this week." />
            <Entry href="/check" icon={<IconRetake />} title="Retake the check" detail="A full retake is due 90 days after the last one." status="Jan 29" />
            <Entry href="/settings" icon={<IconSettings />} title="Settings" detail="Recovery code, export and delete." />
          </EntryList>
        </Card>
      </Block>
    </AppShell>
  );
}

/* ---------- 4. Compare ---------- */

export function CompareScreen() {
  const top = skylineTop(prices, other.prices);
  return (
    <AppShell
      embedded
      width="wide"
      headerRight={
        <Button variant="secondary" size="sm" icon={<IconLink size={18} />}>
          Invite
        </Button>
      }
    >
      <h1 className="t-h1">Side by side</h1>
      <p className={styles.compareLead}>Two skylines on one scale. Both use the same horizon: 100.</p>

      <div className={styles.pair}>
        {[
          { ticker: sample.ticker, price: sample.price, prices, pair: sample.pair, seed: 7 },
          { ticker: other.ticker, price: other.price, prices: other.prices, pair: other.pair, seed: 12 },
        ].map((who) => (
          <section key={who.ticker} className={styles.person} aria-label={who.ticker}>
            <div className={styles.personHead}>
              <Ticker variant="chip">{who.ticker}</Ticker>
              <Price value={who.price} size="lg" />
            </div>
            <SkylineCard className={styles.narrowOnly} prices={who.prices} size="small" top={top} seed={who.seed} legend={false} />
            <SkylineCard className={styles.wideOnly} prices={who.prices} top={top} seed={who.seed} />
            <TypeCard pair={who.pair} compact />
          </section>
        ))}
      </div>

      <div className={styles.compareLower}>
      <Block title="Sector by sector" id="c-sectors">
        <Card>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">
                  <Ticker size="sm">{sample.ticker}</Ticker>
                </th>
                <th scope="col">
                  <span className="vh">Sector</span>
                </th>
                <th scope="col">
                  <Ticker size="sm">{other.ticker}</Ticker>
                </th>
              </tr>
            </thead>
            <tbody>
              {SECTOR_CODES.map((code) => {
                const a = prices[code];
                const b = other.prices[code];
                return (
                  <tr key={code} style={sectorStyle(code)}>
                    <td>
                      <Price value={a} size="md" />
                      <span className={styles.bar} aria-hidden="true">
                        <i style={{ width: `${Math.max(4, ((a - 70) / 60) * 100)}%` }} />
                      </span>
                    </td>
                    <th scope="row">
                      <SectorTag code={code} />
                      <span className={styles.gap}>{formatChange(a - b)}</span>
                    </th>
                    <td>
                      <Price value={b} size="md" />
                      <span className={styles.bar} aria-hidden="true">
                        <i style={{ width: `${Math.max(4, ((b - 70) / 60) * 100)}%` }} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className={styles.caption}>The middle column is {sample.ticker} minus {other.ticker}, in points. Bars run from 70 to 130.</p>
        </Card>
      </Block>

      <Block title="Two shapes" id="c-shape">
        <Card className={styles.shape}>
          <Pentagon prices={prices} other={other.prices} values={false} />
          <p className={styles.caption}>
            Solid: {sample.ticker}. Dashed: {other.ticker}. The dashed ring is 100.
          </p>
        </Card>
      </Block>

      </div>

      <Note className={styles.baseline} title="What a friend sees">
        <p>Your ticker, your prices and your type. Never your answers, and never your group.</p>
      </Note>
    </AppShell>
  );
}

/* ---------- 5. The share card ---------- */

export function ShareScreen() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const blob = await renderShareCard(share);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `standing-${share.ticker.toLowerCase()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.show('Image saved');
    } catch {
      toast.show('The image could not be made. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.share}>
      <div className={styles.shareCard}>
        <ShareCard data={share} />
      </div>
      <div className={styles.shareSide}>
        <h1 className="t-h1">Share your skyline</h1>
        <p className={styles.shareLead}>The image has your ticker, your overall price, your five sector prices and your type. It has none of your answers and it does not name your group.</p>
        <div className={styles.shareActions}>
          <Button size="lg" full icon={<IconDownload size={20} />} onClick={save} disabled={busy} data-action="save-share">
            Save image
          </Button>
          <Button variant="secondary" size="lg" full iconEnd={<IconArrowRight size={18} />}>
            Copy invite link
          </Button>
        </div>
        <p className={styles.caption}>1080 by 1350 pixels, PNG.</p>
      </div>
      <Toast>{toast.message}</Toast>
    </div>
  );
}
