'use client';

/**
 * The developer panel: a small button in the corner that opens a sheet. It is loaded only in
 * development or when the address carried ?debug=1 (useDebug). It can start a check with a
 * random background, answer a check randomly to the end, and show what the device holds.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { dev as copy } from '@/copy/core';
import { configResource, meResource, queue, useDevice, useResource } from '@/client/api';
import { clearAllSlots, type DeviceRecord } from '@/client/device';
import { ROUTES, type Standing } from '@/client/nav';
import { check, type StartInput } from '@/client/session';
import { ROLE_IDS, getBank } from '@/engine';
import { Button, Sheet } from '@/ui';
import styles from './core.module.css';

const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

const randomInt = (below: number): number => Math.floor(Math.random() * below);

/** A valid start with a random age band, role and background answers. Health consent is given. */
function randomStart(): StartInput {
  const bank = getBank();
  const role = ROLE_IDS[randomInt(ROLE_IDS.length)];
  const extra: Record<string, number> = {};
  for (const question of bank.extra[role]) extra[question.id] = randomInt(question.opts.length);
  return {
    background: { age: randomInt(bank.ages.length), role, extra },
    healthConsent: true,
    ticker: `DEV${randomInt(10)}`,
  };
}

/** Outside development the two secrets are cut short: the panel can be opened on a real device. */
function shownDevice(record: DeviceRecord): DeviceRecord {
  if (IS_DEVELOPMENT) return record;
  const cut = (secret: string | null) => (secret === null ? null : `${secret.slice(0, 4)}... (${secret.length} characters)`);
  return { ...record, deviceToken: cut(record.deviceToken), recoveryCode: cut(record.recoveryCode) };
}

const nextFrame = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export default function DevPanel({ standing }: { standing: Standing }) {
  const router = useRouter();
  const controller = check();
  const events = queue();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.get, controller.get);
  const queued = useSyncExternalStore(events.subscribe, events.size, () => 0);
  const record = useDevice();
  const me = useResource(meResource);
  const config = useResource(configResource);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
    } catch {
      setMessage(copy.failed);
    } finally {
      setBusy(false);
    }
  };

  const answerToEnd = async () => {
    await controller.load();
    for (let turn = 0; turn < 300; turn += 1) {
      const now = controller.get();
      if (now.status !== 'question' || !now.view) break;
      const view = now.view;
      const seconds = 3 + Math.random() * 6;
      const roll = Math.random();
      if (roll < 0.06) controller.skip(seconds);
      else if (roll < 0.1) controller.notApplicable(seconds);
      else controller.select(view.options[randomInt(view.options.length)].index, seconds);
      setMessage(copy.progress(view.position.current, view.position.total));
      if (turn % 4 === 3) await nextFrame();
    }
    if (controller.get().status === 'question') return;
    setMessage(copy.completing);
    const end = await controller.complete();
    if (end.status !== 'done') {
      setMessage(copy.failed);
      return;
    }
    setMessage(copy.done);
    setOpen(false);
    router.push(ROUTES.result);
  };

  const start = async () => {
    await controller.start(randomStart());
    router.push(ROUTES.check);
  };

  const forget = () => {
    clearAllSlots();
    window.location.assign(ROUTES.landing);
  };

  const hasOpenCheck = snapshot.state !== null;
  const data = open
    ? JSON.stringify(
        {
          standing,
          device: shownDevice(record),
          check: { status: snapshot.status, error: snapshot.error?.message ?? null, state: snapshot.state, view: snapshot.view, reveal: snapshot.reveal },
          queue: events.pending(),
          me: me.data,
          config: config.data,
        },
        null,
        2,
      )
    : '';

  const copyData = async () => {
    try {
      await navigator.clipboard.writeText(data);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <button type="button" className={styles.devOpen} aria-label={copy.open} title={copy.open} onClick={() => setOpen(true)}>
        Dev
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={copy.title}>
        <div className={styles.dev}>
          <p className={`t-small ${styles.devNote}`}>{copy.note}</p>
          <div className={styles.devActions}>
            <Button variant="secondary" size="sm" disabled={busy || hasOpenCheck} onClick={() => void run(start)}>
              {copy.start}
            </Button>
            <Button variant="secondary" size="sm" disabled={busy || !hasOpenCheck} onClick={() => void run(answerToEnd)}>
              {copy.answer}
            </Button>
            {IS_DEVELOPMENT && (
              <Button variant="quiet" size="sm" disabled={busy} title={copy.forgetHint} onClick={forget}>
                {copy.forget}
              </Button>
            )}
          </div>
          <dl className={styles.devFacts}>
            <dt>{copy.status}</dt>
            <dd role="status">
              {message ?? (hasOpenCheck ? copy.progress(snapshot.state?.steps.length ?? 0, snapshot.view?.position.total ?? snapshot.state?.steps.length ?? 0) : copy.noCheck)}
              {queued > 0 ? ` (${queued})` : ''}
            </dd>
          </dl>
          <div>
            <div className={styles.devDataHead}>
              <h3 className="t-label">{copy.data}</h3>
              <Button variant="quiet" size="sm" onClick={() => void copyData()}>
                {copied ? copy.copied : copy.copy}
              </Button>
            </div>
            <pre className={styles.devData} tabIndex={0}>
              {data}
            </pre>
          </div>
        </div>
      </Sheet>
    </>
  );
}
