import type { Metadata } from 'next';
import { settings as copy } from '@/copy/settings';
import { SettingsScreen } from '@/ui/settings/SettingsScreen';

export const metadata: Metadata = { title: copy.metaTitle };

/** /settings. The frame (top bar, dock, footer with the statements) comes from app/(app)/layout.tsx. */
export default function Page() {
  return <SettingsScreen />;
}
