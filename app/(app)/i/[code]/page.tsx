import { InviteScreen } from '@/ui/compare/InviteScreen';

/** The page someone opens from an invite link. Public: it needs no record on the device. */
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <InviteScreen code={code} />;
}
