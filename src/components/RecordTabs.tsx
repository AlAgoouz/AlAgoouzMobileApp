import React from 'react';

export function RecordTabs<T extends string>({label, tabs, value, onChange}: {
  label: string;
  tabs: readonly {id: T; label: string}[];
  value: T;
  onChange: (id: T) => void;
}) {
  return <nav className="record-tabs" aria-label={label}>{tabs.map(tab =>
    <button key={tab.id} type="button" aria-pressed={value === tab.id} onClick={() => onChange(tab.id)}>
      {tab.label}
    </button>
  )}</nav>;
}
