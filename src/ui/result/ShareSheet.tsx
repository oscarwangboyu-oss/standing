'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ROUTES } from '@/client/nav';
import { share as copy } from '@/copy/result';
import { Button } from '../Button';
import { copyText } from '../compare/pending';
import { IconDownload, IconLink, IconShare } from '../icons';
import { ShareCard } from '../share/ShareCard';
import { DEFAULT_SHARE_FORMAT, SHARE_FORMATS, shareSize, type ShareCardData, type ShareFormat } from '../share/layout';
import { renderShareCard } from '../share/render';
import shareStyles from '../share/share.module.css';
import { Sheet } from '../Sheet';
import { Toast, useToast } from '../Toast';
import styles from './result.module.css';

export interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  /** Ticker, overall price, five sector prices and the type name. null without an overall price. */
  data: ShareCardData | null;
  /** Called each time the image was shared or saved, or the link was copied. */
  onShared: () => void;
}

/** True when this browser can hand a PNG file to the system share sheet. */
function canShareFiles(): boolean {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
    return navigator.canShare({ files: [new File([new Uint8Array(1)], 'standing.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** The outline of a shape, drawn to its proportions. */
function Frame({ format }: { format: ShareFormat }) {
  const { width, height } = shareSize(format);
  const h = 15;
  const w = Math.round((h * width) / height * 10) / 10;
  return (
    <svg className={shareStyles.frame} width={w + 2} height={h + 2} viewBox={`0 0 ${w + 2} ${h + 2}`} aria-hidden="true" focusable="false">
      <rect x={1} y={1} width={w} height={h} rx={2.4} />
    </svg>
  );
}

/** Story or post, as a radio group: one tab stop, the arrow keys move and choose. */
function FormatPicker({ value, onChange }: { value: ShareFormat; onChange: (format: ShareFormat) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = SHARE_FORMATS[(SHARE_FORMATS.indexOf(value) + step + SHARE_FORMATS.length) % SHARE_FORMATS.length] as ShareFormat;
    onChange(next);
    root.current?.querySelector<HTMLButtonElement>(`[data-format="${next}"]`)?.focus();
  };
  return (
    <div ref={root} role="radiogroup" aria-label={copy.format} className={shareStyles.formats} onKeyDown={onKeyDown}>
      {SHARE_FORMATS.map((format) => (
        <button
          key={format}
          type="button"
          role="radio"
          aria-checked={format === value}
          tabIndex={format === value ? 0 : -1}
          className={shareStyles.format}
          data-format={format}
          onClick={() => onChange(format)}
        >
          <Frame format={format} />
          {copy.formats[format].name}
          <span className={shareStyles.ratio}>{copy.formats[format].ratio}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * The share sheet: the shape, the image as it will be saved, then share it (where the browser
 * can share a file), save it, or copy a link to the front page, and what the image holds. The
 * image is drawn on this device.
 */
export function ShareSheet({ open, onClose, data, onShared }: ShareSheetProps) {
  // The sheet is a modal dialog on the top layer, so its messages are shown inside it.
  const toast = useToast();
  const onMessage = toast.show;
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState(false);
  const [format, setFormat] = useState<ShareFormat>(DEFAULT_SHARE_FORMAT);
  useEffect(() => {
    setFiles(canShareFiles());
  }, []);
  const size = shareSize(format);

  const make = async (): Promise<{ blob: Blob; name: string } | null> => {
    if (!data) return null;
    setBusy(true);
    try {
      return { blob: await renderShareCard(data, format), name: copy.fileName(data.ticker) };
    } catch {
      onMessage(copy.failed);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const made = await make();
    if (!made) return;
    download(made.blob, made.name);
    onMessage(copy.saved);
    onShared();
  };

  const shareImage = async () => {
    const made = await make();
    if (!made) return;
    const file = new File([made.blob], made.name, { type: 'image/png' });
    try {
      await navigator.share({ files: [file], title: copy.shareTitle });
      onShared();
    } catch (error) {
      // The person closed the system sheet: nothing to say. Anything else: fall back to a download.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      download(made.blob, made.name);
      onMessage(copy.saved);
      onShared();
    }
  };

  const copyLink = async () => {
    const ok = await copyText(`${window.location.origin}${ROUTES.landing}`);
    onMessage(ok ? copy.copied : copy.copyFailed);
    if (ok) onShared();
  };

  return (
    <Sheet open={open} onClose={onClose} title={copy.title}>
      <div className={styles.share}>
        {data ? (
          <>
            <FormatPicker value={format} onChange={setFormat} />
            <div className={shareStyles.preview}>
              <ShareCard key={format} data={data} format={format} />
            </div>
          </>
        ) : (
          <p className={styles.shareLead}>{copy.noOverall}</p>
        )}
        <div className={styles.shareActions}>
          {files && (
            <Button size="lg" full icon={<IconShare size={20} />} onClick={shareImage} disabled={busy || !data} data-action="share-image">
              {copy.shareImage}
            </Button>
          )}
          <Button variant={files ? 'secondary' : 'primary'} size="lg" full icon={<IconDownload size={20} />} onClick={save} disabled={busy || !data} data-action="save-image">
            {copy.saveImage}
          </Button>
          <Button variant="secondary" size="lg" full icon={<IconLink size={20} />} onClick={copyLink} data-action="copy-link">
            {copy.copyLink}
          </Button>
        </div>
        <p className={styles.shareLead}>{copy.lead}</p>
        <p className={styles.shareNote}>
          {data ? `${copy.size(size.width, size.height)} ` : ''}
          {copy.linkNote}
        </p>
      </div>
      <Toast>{toast.message}</Toast>
    </Sheet>
  );
}
