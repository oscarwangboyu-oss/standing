/**
 * Names for the ids the team API returns: roles, age bands, sectors and question stems.
 * Roles have short names in the copy file; everything else is read from the question bank.
 */
import { team as copy } from '@/copy/team';
import { CURRENT, ROLE_IDS, getBank, type AreaId, type Bank, type RoleId } from '@/engine';
import { AREA_CODE, type SectorCode } from '@/ui';

export { ROLE_IDS };

/** The bank of a version, or the current one when this page does not carry that version. */
export function bankOf(version?: string): Bank {
  try {
    return getBank(version ?? CURRENT.bank);
  } catch {
    return getBank();
  }
}

export function roleLabel(role: RoleId | null): string {
  return role === null ? copy.common.allRoles : copy.roles[role];
}

/** A role id that came back as text (the fairness test groups by it). */
export function roleLabelOf(text: string): string {
  return (ROLE_IDS as readonly string[]).includes(text) ? copy.roles[text as RoleId] : text;
}

export function ageLabel(age: number | null, bank: Bank = bankOf()): string {
  if (age === null) return copy.common.allAges;
  return bank.ages[age]?.en ?? String(age);
}

export function cohortLabel(role: RoleId | null, age: number | null, bank: Bank = bankOf()): string {
  if (role === null && age === null) return copy.common.everyone;
  if (role === null) return ageLabel(age, bank);
  if (age === null) return roleLabel(role);
  return `${roleLabel(role)}, ${ageLabel(age, bank)}`;
}

const AREAS = ['C', 'W', 'N', 'B', 'M'] as const satisfies readonly AreaId[];
export const DISPLAY_AREAS: readonly AreaId[] = AREAS;

/** The ticker of a sector, or null for the ladder section. */
export function sectorOf(area: string): SectorCode | null {
  return (AREAS as readonly string[]).includes(area) ? AREA_CODE[area as AreaId] : null;
}

/** The English stem and options of a question version. null when this bank does not have it. */
export function questionOf(bank: Bank, itemId: string, versionKey: string): { stem: string; options: string[] } | null {
  const item = Object.hasOwn(bank.items, itemId) ? bank.items[itemId] : undefined;
  const version = item?.versions.find((v) => v.key === versionKey);
  if (!version) return null;
  return { stem: version.q.en, options: version.opts.map((o) => o.en) };
}
