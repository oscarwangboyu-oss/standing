'use client';

/**
 * /i/[code]: what a person sees when they open an invite link. Public: it works without a
 * record on this device. It names the inviter by ticker only, says what comparing shows and
 * what it never shows, then offers one action:
 * - "Start the check" for a person without a result. The code is kept on the device and
 *   accepted on the result screen when the check is done.
 * - "Accept" for a person who already has a result.
 */
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api, errorCodeOf, useAsync, useMe } from '@/client/api';
import { ROUTES } from '@/client/nav';
import { useStanding } from '@/client/runtime';
import { useShell } from '@/client/shell';
import { invite as copy, list as listCopy, privacy } from '@/copy/compare';
import { Button, Card, IconCheck, IconClose, IconLink, Note, SECTOR_CODES, Skeleton, SkeletonText, SkylineCard, Spot, Toast, formatDay, useToast, type SectorCode } from '@/ui';
import { acceptInviteOnce, copyText, inviteLink, isInviteCode, pendingInvite } from './pending';
import styles from './compare.module.css';

const CODE_AREA = { SKIL: 'C', WLTH: 'W', NETW: 'N', BODY: 'B', MIND: 'M' } as const;

function Stopped({ title, line, children }: { title: string; line: string; children?: ReactNode }) {
  return (
    <div className={styles.message}>
      <Spot kind="lot" />
      <h1 className="t-h1">{title}</h1>
      <p className={styles.lead}>{line}</p>
      {children && <div className={styles.messageActions}>{children}</div>}
    </div>
  );
}

export function InviteScreen({ code }: { code: string }) {
  useShell({ footer: true });
  const router = useRouter();
  const toast = useToast();
  const standing = useStanding();
  const me = useMe();
  const valid = isInviteCode(code);
  const lookup = useAsync(() => api.lookupInvite(code), [code], { enabled: valid });
  const [accepting, setAccepting] = useState(false);
  const [problem, setProblem] = useState(false);

  const elsewhere = standing.hasCompleted ? (
    <Button variant="secondary" href={ROUTES.compare}>
      {copy.toCompare}
    </Button>
  ) : (
    <>
      <Button variant="secondary" href={ROUTES.start}>
        {copy.toStart}
      </Button>
      <Button variant="quiet" href={ROUTES.landing}>
        {copy.toFront}
      </Button>
    </>
  );

  if (!valid || (lookup.error && errorCodeOf(lookup.error) === 'invite_invalid')) {
    return (
      <Stopped title={copy.invalidTitle} line={copy.invalid}>
        {elsewhere}
      </Stopped>
    );
  }
  if (lookup.error && !lookup.data) {
    return (
      <Stopped title={copy.failedTitle} line={copy.failed}>
        <Button variant="secondary" onClick={() => void lookup.refresh()}>
          {copy.retry}
        </Button>
      </Stopped>
    );
  }
  if (!lookup.data) {
    return (
      <div className={styles.waiting}>
        <span className="vh">{copy.loading}</span>
        <Skeleton height={150} radius={22} />
        <Skeleton width="80%" height={40} radius={12} />
        <SkeletonText lines={3} />
      </div>
    );
  }

  const found = lookup.data;
  if (found.own) {
    return (
      <Stopped title={copy.ownTitle} line={copy.own}>
        {found.status === 'open' && (
          <Button icon={<IconLink size={18} />} onClick={async () => toast.show((await copyText(inviteLink(code))) ? listCopy.copied : listCopy.copyFailed)}>
            {listCopy.copy}
          </Button>
        )}
        <Button variant="secondary" href={ROUTES.compare}>
          {copy.toCompare}
        </Button>
        <Toast>{toast.message}</Toast>
      </Stopped>
    );
  }
  if (found.status === 'expired') {
    return (
      <Stopped title={copy.expiredTitle} line={copy.expired(formatDay(found.expiresAt))}>
        {elsewhere}
      </Stopped>
    );
  }
  if (found.status === 'accepted') {
    return (
      <Stopped title={copy.usedTitle} line={copy.used}>
        {elsewhere}
      </Stopped>
    );
  }

  const keep = () => pendingInvite().set({ code, fromTicker: found.fromTicker });
  const start = () => {
    keep();
    router.push(standing.hasOpenCheck ? ROUTES.check : ROUTES.start);
  };
  const accept = async () => {
    setAccepting(true);
    setProblem(false);
    try {
      const answer = await acceptInviteOnce(code);
      pendingInvite().clear();
      router.push(`${ROUTES.compare}?id=${encodeURIComponent(answer.comparison.id)}`);
    } catch (error) {
      const reason = errorCodeOf(error);
      if (reason === 'check_required') start();
      else if (reason === 'invite_invalid' || reason === 'invite_own') void lookup.refresh();
      else setProblem(true);
      setAccepting(false);
    }
  };

  const latest = me.data?.latest?.result ?? null;
  const own: Partial<Record<SectorCode, number | null>> = {};
  if (latest) for (const sector of SECTOR_CODES) own[sector] = latest.sectors[CODE_AREA[sector]].price;

  return (
    <>
      <div className={styles.inviteArt}>{standing.hasCompleted && latest ? <SkylineCard prices={own} size="small" legend={false} /> : <Spot kind="building" size={200} />}</div>
      <h1 className="t-h1">{copy.title(found.fromTicker)}</h1>
      <p className={styles.lead}>{copy.lead}</p>

      <Card className={styles.terms}>
        <section aria-labelledby="i-shows">
          <h2 id="i-shows" className="t-h3">
            {copy.showsTitle}
          </h2>
          <ul className={styles.termList}>
            {copy.shows.map((line) => (
              <li key={line}>
                <span className={styles.termIcon}>
                  <IconCheck size={16} />
                </span>
                {line}
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="i-hides">
          <h2 id="i-hides" className="t-h3">
            {copy.hidesTitle}
          </h2>
          <ul className={styles.termList}>
            {copy.hides.map((line) => (
              <li key={line}>
                <span className={styles.termIcon}>
                  <IconClose size={16} />
                </span>
                {line}
              </li>
            ))}
          </ul>
        </section>
      </Card>

      <div className={styles.inviteAction}>
        {!standing.known ? (
          <Skeleton height={56} radius={999} />
        ) : standing.hasCompleted ? (
          <>
            <Button size="lg" full onClick={accept} disabled={accepting} data-action="accept-invite">
              {accepting ? copy.accepting : copy.accept}
            </Button>
            <p className={styles.caption}>{copy.acceptNote}</p>
          </>
        ) : (
          <>
            <Button size="lg" full onClick={start} data-action="start-check">
              {standing.hasOpenCheck ? copy.resume : copy.start}
            </Button>
            <p className={styles.caption}>{standing.hasOpenCheck ? copy.resumeNote : copy.startNote}</p>
          </>
        )}
        {problem && (
          <p className={styles.error} role="alert">
            {copy.acceptFailed}
          </p>
        )}
        <p className={styles.caption}>{copy.expires(formatDay(found.expiresAt))}</p>
      </div>

      <Note className={styles.note} title={privacy.title}>
        <p>{privacy.line}</p>
      </Note>
    </>
  );
}
