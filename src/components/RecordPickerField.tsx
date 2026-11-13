import React, {useState} from 'react';
import {Search} from 'lucide-react';
import {RecordPicker, type PickerOption} from './RecordPicker';

export function RecordPickerField({label, searchLabel, options, value, onChange, disabled}: {
  label: string;
  searchLabel: string;
  options: readonly PickerOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find(option => option.id === value);
  return <div className="invoice-choice">
    <span>{label}</span>
    <button type="button" className="picker-trigger" aria-label={label} aria-haspopup="dialog"
      disabled={disabled || !options.length} onClick={() => setOpen(true)}>
      <Search size={17} aria-hidden="true" />{selected?.title ?? 'اختيار'}
    </button>
    {open && <RecordPicker title={label} searchLabel={searchLabel} options={options} selectedId={value}
      onSelect={id => {onChange(id); setOpen(false);}} onClose={() => setOpen(false)} />}
  </div>;
}
