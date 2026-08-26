import { useEffect, useRef, type CSSProperties } from 'react';
import { Option, Select } from '@ui5/webcomponents-react';
import type { SelectDomRef } from '@ui5/webcomponents-react';

export interface UiSelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: UiSelectOption[];
  onSelect: (value: string) => void;
  /** Bos secim satiri. Verilmezse bos secenek eklenmez. */
  placeholder?: string;
  disabled?: boolean;
  style?: CSSProperties;
}

/**
 * Kontrollu Select.
 *
 * `ui5-select` kendi secim durumunu iceride tutar. Sayfalar bugune kadar
 * secimi `<Option selected={...}>` ile veriyordu; React state sifirlandiginda
 * (ornegin "Formu Temizle" ya da kayit sonrasi form sifirlama) bilesen eski
 * secimi gostermeye devam ediyordu - kullanici temizlenmis bir formda onceki
 * emrin kumasini goruyordu.
 *
 * Burada secim tek kaynaktan (`value`) yonetilir ve her render sonrasi DOM
 * ile karsilastirilarak zorla eslenir; React prop degismedigi halde bilesenin
 * icerideki secimi kaymissa da duzeltilir.
 */
export function UiSelect({ value, options, onSelect, placeholder, disabled, style }: Props) {
  const ref = useRef<SelectDomRef>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && el.value !== value) el.value = value;
  });

  return (
    <Select
      ref={ref}
      value={value}
      disabled={disabled}
      style={style}
      onChange={(e) => {
        const selected = e.detail.selectedOption as HTMLElement & { value?: string };
        onSelect(selected?.value ?? '');
      }}
    >
      {placeholder !== undefined && <Option value="">{placeholder}</Option>}
      {options.map((o) => (
        <Option key={o.value} value={o.value}>
          {o.label}
        </Option>
      ))}
    </Select>
  );
}
