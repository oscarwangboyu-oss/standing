'use client';

import { useState } from 'react';
import { Button, Field, OptionList, Sheet, Toast, Useful, sectorStyle, useToast } from '@/ui';

export function SheetDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open a sheet
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Why BODY moved">
        <p style={{ color: 'var(--ink-2)' }}>Sleep moved from 6 to 7 hours to 7 to 9 hours over the last seven days. That is +3.10 for BODY, inside the daily limit of 2 points a day.</p>
        <div style={{ marginTop: 'var(--s-5)' }}>
          <Button full onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </Sheet>
    </>
  );
}

export function ToastDemo() {
  const toast = useToast();
  return (
    <>
      <Button variant="secondary" onClick={() => toast.show('Link copied')}>
        Show a toast
      </Button>
      <Toast>{toast.message}</Toast>
    </>
  );
}

export function OptionDemo() {
  const [value, setValue] = useState<string | null>('2');
  return (
    <div style={sectorStyle('MIND')}>
      <OptionList
        label="How are you right now?"
        value={value}
        onSelect={setValue}
        options={[
          { value: '0', label: 'Very low' },
          { value: '1', label: 'Low' },
          { value: '2', label: 'Fine', hint: 'Chosen: the sector colour, a ring and a check' },
          { value: '3', label: 'Good' },
          { value: '4', label: 'Not available', disabled: true },
        ]}
      />
    </div>
  );
}

export function FieldDemo() {
  const [ticker, setTicker] = useState('RIVR');
  return (
    <div style={{ display: 'grid', gap: 'var(--s-5)' }}>
      <Field label="Ticker" hint="2 to 6 letters or digits. It does not have to be unique." value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} maxLength={6} />
      <Field label="Take-home pay each period" kind="number" prefix="$" suffix="a period" defaultValue="2,150" hint="This amount stays on this device." />
      <Field label="Recovery code" defaultValue="4F7K" error="This code is 12 characters. Check it and enter it again." />
    </div>
  );
}

export function UsefulDemo() {
  return <Useful />;
}
