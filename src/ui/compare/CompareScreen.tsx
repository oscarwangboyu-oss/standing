'use client';

/**
 * /compare: make an invite link, see the invites that are still waiting and the comparisons that
 * exist. /compare?id=ID opens one of them side by side.
 */
import { useEffect, useState } from 'react';
import { api, errorCodeOf, useAsync } from '@/client/api';
import { ROUTES } from '@/client/nav';
import { useLocation } from '@/client/runtime';
import { useShell } from '@/client/shell';
import * as copy from '@/copy/compare';
import { typeForPair } from '@/copy/types';
import { ApiRequestError } from '@/shared/client';
import { AREA_CODE, Block, Button, Card, Entry, EntryList, IconCompare, IconLink, IconShare, Note, Skeleton, Spot, Ticker, Toast, formatDay, formatPrice, useToast } from '@/ui';
import { ComparisonView } from './ComparisonView';
import { copyText, inviteLink, rememberInvite, useMadeInvites, type MadeInvite } from './pending';
import styles from './compare.module.css';

export function CompareScreen() {
  const where = useLocation();
  const id = where ? new URLSearchParams(where.search).get('id') : null;
  return id ? <ComparisonView key={id} id={id} /> : <CompareList />;
}

function CompareList() {
  useShell({ width: 'col' });
  const toast = useToast();
  const list = useAsync(() => api.comparisons(), []);
  const made = useMadeInvites();
  const [fresh, setFresh] = useState<MadeInvite | null>(null);
  const [creating, setCreating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  const create = async () => {
    setCreating(true);
    setProblem(null);
    try {
      const invite = await api.createInvite();
      const kept = { code: invite.code, expiresAt: invite.expiresAt };
      rememberInvite(kept);
      setFresh(kept);
      void list.refresh();
    } catch (error) {
      if (errorCodeOf(error) === 'invite_limit') {
        const limit = error instanceof ApiRequestError ? error.details?.limit : null;
        setProblem(copy.list.limit(typeof limit === 'number' ? limit : null));
      } else setProblem(copy.list.createFailed);
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async (code: string) => {
    toast.show((await copyText(inviteLink(code))) ? copy.list.copied : copy.list.copyFailed);
  };
  const shareLink = async (code: string) => {
    try {
      await navigator.share({ title: copy.list.shareTitle, text: copy.list.shareText, url: inviteLink(code) });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) void copyLink(code);
    }
  };

  const comparisons = list.data?.comparisons ?? [];
  const waiting = list.data?.openInvites ?? [];

  return (
    <>
      <h1 className="t-h1">{copy.list.title}</h1>
      <p className={styles.lead}>{copy.list.lead}</p>

      {fresh ? (
        <Card className={styles.linkCard}>
          <h2 className="t-h3">{copy.list.linkTitle}</h2>
          <p className={styles.linkText} data-invite-link>
            {inviteLink(fresh.code)}
          </p>
          <div className={styles.linkActions}>
            <Button size="lg" full icon={<IconLink size={20} />} onClick={() => void copyLink(fresh.code)} data-action="copy-invite">
              {copy.list.copy}
            </Button>
            {canShare && (
              <Button variant="secondary" size="lg" full icon={<IconShare size={20} />} onClick={() => void shareLink(fresh.code)}>
                {copy.list.share}
              </Button>
            )}
          </div>
          <p className={styles.caption}>{copy.list.linkNote(formatDay(fresh.expiresAt))}</p>
        </Card>
      ) : null}

      <div className={styles.create}>
        <Button variant={fresh ? 'secondary' : 'primary'} size="lg" full icon={fresh ? undefined : <IconLink size={20} />} onClick={create} disabled={creating} data-action="create-invite">
          {creating ? copy.list.creating : fresh ? copy.list.again : copy.list.create}
        </Button>
        {problem && (
          <p className={styles.error} role="alert">
            {problem}
          </p>
        )}
      </div>

      <Block title={copy.list.comparisons} id="c-list">
        {!list.loaded ? (
          <Skeleton height={88} radius={22} />
        ) : list.error && !list.data ? (
          <div className={styles.failed}>
            <p>{copy.list.loadFailed}</p>
            <Button variant="secondary" size="sm" onClick={() => void list.refresh()}>
              {copy.list.retry}
            </Button>
          </div>
        ) : comparisons.length === 0 ? (
          <div className={styles.empty}>
            <Spot kind="lot" size={120} />
            <div>
              <p className={styles.emptyTitle}>{copy.list.none}</p>
              <p className={styles.emptyLine}>{copy.list.noneLine}</p>
            </div>
          </div>
        ) : (
          <Card pad="none">
            <EntryList label={copy.list.comparisonsLabel}>
              {comparisons.map((c) => {
                const type = c.other.type ? typeForPair(AREA_CODE[c.other.type[0]], AREA_CODE[c.other.type[1]]) : null;
                return (
                  <Entry
                    key={c.id}
                    href={`${ROUTES.compare}?id=${encodeURIComponent(c.id)}`}
                    icon={<IconCompare />}
                    title={<Ticker>{c.other.ticker ?? copy.view.noTickerOther}</Ticker>}
                    detail={copy.list.rowDetail(c.other.overall === null ? null : formatPrice(c.other.overall), type?.name ?? null)}
                    status={copy.list.since(formatDay(c.createdAt))}
                  />
                );
              })}
            </EntryList>
          </Card>
        )}
      </Block>

      {waiting.length > 0 && (
        <Block title={copy.list.pending} id="c-pending">
          <Card pad="none">
            <ul className={styles.pending} aria-label={copy.list.pendingLabel}>
              {waiting.map((invite) => {
                const mine = made.find((m) => m.expiresAt === invite.expiresAt);
                return (
                  <li key={invite.expiresAt} className={styles.pendingRow}>
                    <div className={styles.pendingText}>
                      <p className={styles.pendingTitle}>{copy.list.pendingRow(formatDay(invite.createdAt), formatDay(invite.expiresAt))}</p>
                      {!mine && <p className={styles.caption}>{copy.list.pendingElsewhere}</p>}
                    </div>
                    {mine && (
                      <Button variant="secondary" size="sm" onClick={() => void copyLink(mine.code)}>
                        {copy.list.copy}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        </Block>
      )}

      <Note className={styles.note} title={copy.privacy.title}>
        <p>{copy.privacy.line}</p>
      </Note>
      <Toast>{toast.message}</Toast>
    </>
  );
}
