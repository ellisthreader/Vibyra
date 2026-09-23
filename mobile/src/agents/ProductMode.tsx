import { useEffect, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { readFlag, writeFlag } from '../transport/deviceFlags';
import { SegmentedControl } from '../ui/SegmentedControl';

export type ProductMode = 'work' | 'agent';
export function useProductMode(identity: string | null) {
  const key = `product-mode.${encodeURIComponent(identity ?? 'guest')}`;
  const [choice, setChoice] = useState<{ key: string; mode: ProductMode }>({ key, mode: 'work' });
  const epoch = useRef(0);
  useEffect(() => {
    const version = ++epoch.current;
    let active = true;
    void readFlag(key)
      .then((value) => {
        if (active && version === epoch.current)
          setChoice({ key, mode: value === 'agent' ? 'agent' : 'work' });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [key]);
  const mode = choice.key === key ? choice.mode : 'work';
  const choose = (mode: ProductMode) => {
    ++epoch.current;
    Keyboard.dismiss();
    setChoice({ key, mode });
    void writeFlag(key, mode).catch(() => {});
  };
  return [mode, choose] as const;
}
export function ProductModeSwitch({
  mode,
  onChange,
}: {
  mode: ProductMode;
  onChange(mode: ProductMode): void;
}) {
  return (
    <SegmentedControl<ProductMode>
      center
      options={['work', 'agent']}
      value={mode}
      onChange={onChange}
      labels={{ work: 'Code', agent: 'Agents' }}
    />
  );
}
