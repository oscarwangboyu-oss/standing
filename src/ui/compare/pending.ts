'use client';

/**
 * What friend compare keeps on this device.
 *
 * - The invite a person opened before they had a result. The code waits here through the check
 *   and is accepted on the result screen once the result is stored.
 * - The links this device made. The server shows a code once and keeps only its hash, so the
 *   link of an invite that is still waiting can be copied again only from here.
 *
 * Both are emptied with the rest of the device data (clearAllSlots).
 */
import { useSyncExternalStore } from 'react';
import { api } from '@/client/api';
import { createSlot, deviceStorage, type Slot } from '@/client/device';
import { inviteRoute } from '@/client/nav';
import type { AcceptInviteResponse } from '@/shared/api';

export interface PendingInvite {
  code: string;
  /** Ticker of the person who sent it, for the line shown after acceptance. */
  fromTicker: string | null;
}

export interface MadeInvite {
  code: string;
  expiresAt: string;
}

/** A code as the server makes it: URL-safe characters only. */
const CODE = /^[A-Za-z0-9_-]{8,128}$/;

export function isInviteCode(value: unknown): value is string {
  return typeof value === 'string' && CODE.test(value);
}

function revivePending(value: unknown): PendingInvite | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Partial<PendingInvite>;
  if (!isInviteCode(v.code)) return null;
  return { code: v.code, fromTicker: typeof v.fromTicker === 'string' ? v.fromTicker : null };
}

function reviveMade(value: unknown): MadeInvite[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((v): v is MadeInvite => typeof v === 'object' && v !== null && isInviteCode((v as MadeInvite).code) && typeof (v as MadeInvite).expiresAt === 'string');
}

let pendingSlot: Slot<PendingInvite | null> | null = null;
let madeSlot: Slot<MadeInvite[]> | null = null;
const NO_INVITES: MadeInvite[] = [];

export function pendingInvite(): Slot<PendingInvite | null> {
  if (!pendingSlot) pendingSlot = createSlot<PendingInvite | null>({ storage: deviceStorage(), name: 'invite', version: 1, empty: null, revive: revivePending });
  return pendingSlot;
}

export function madeInvites(): Slot<MadeInvite[]> {
  if (!madeSlot) madeSlot = createSlot<MadeInvite[]>({ storage: deviceStorage(), name: 'invites-made', version: 1, empty: NO_INVITES, revive: reviveMade });
  return madeSlot;
}

export function usePendingInvite(): PendingInvite | null {
  const slot = pendingInvite();
  return useSyncExternalStore(slot.subscribe, slot.get, () => null);
}

export function useMadeInvites(): MadeInvite[] {
  const slot = madeInvites();
  return useSyncExternalStore(slot.subscribe, slot.get, () => NO_INVITES);
}

/** Remembers a link this device made, and drops the ones that have expired. */
export function rememberInvite(invite: MadeInvite, now: Date = new Date()): void {
  const iso = now.toISOString();
  madeInvites().update((list) => [invite, ...list.filter((i) => i.code !== invite.code && i.expiresAt > iso)]);
}

const accepting = new Map<string, Promise<AcceptInviteResponse>>();

/**
 * Accepts an invite once per code on this page: a second caller gets the answer of the first.
 * An invite is used up by its first acceptance, so asking twice would read as "already used".
 * A failed call is forgotten, so it can be tried again.
 */
export function acceptInviteOnce(code: string): Promise<AcceptInviteResponse> {
  const running = accepting.get(code);
  if (running) return running;
  const request = api.acceptInvite(code);
  accepting.set(code, request);
  request.catch(() => {
    if (accepting.get(code) === request) accepting.delete(code);
  });
  return request;
}

/** The address a friend opens. Built on the device: the server never sees a code in a URL of its API. */
export function inviteLink(code: string, origin: string = window.location.origin): string {
  return `${origin}${inviteRoute(code)}`;
}

/** Copies text. False when the browser refuses. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the selection method.
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
