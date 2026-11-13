import React, {useMemo, useState} from 'react';
import {Check, Search} from 'lucide-react';
import {Modal} from './Modal';
import {RecordPagination, useRecordPage} from './RecordPagination';

export interface PickerOption {
  id: string;
  title: string;
  detail?: string;
  keywords?: string;
}

const normalize = (value: string) => value.normalize('NFKC').toLowerCase()
  .replace(/[أإآ]/g, 'ا').replace(/[\u064b-\u065f\u0640]/g, '')
  .replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) % 16));

export function RecordPicker({title, searchLabel, options, selectedId, onSelect, onClose}: {
  title: string;
  searchLabel: string;
  options: readonly PickerOption[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return options;
    return options.filter(option => {
      const target = normalize([option.title, option.detail, option.keywords].filter(Boolean).join(' '));
      return terms.every(term => target.includes(term));
    });
  }, [query, options]);
  const page = useRecordPage(results, query, 12);
  return <Modal title={title} layout="side" onClose={onClose}>
    <label className="picker-search">
      <Search size={18} aria-hidden="true" />
      <input data-initial-focus type="search" aria-label={searchLabel} placeholder={searchLabel}
        value={query} onChange={event => setQuery(event.target.value)} />
    </label>
    {page.total > page.pageSize && <RecordPagination {...page} />}
    {results.length ? <ul className="picker-options">
      {page.visible.map(option => <li key={option.id}>
        <button type="button" className="picker-option" aria-pressed={selectedId === option.id} onClick={() => onSelect(option.id)}>
          <span><strong>{option.title}</strong>{option.detail && <small>{option.detail}</small>}</span>
          {selectedId === option.id && <Check size={18} aria-hidden="true" />}
        </button>
      </li>)}
    </ul> : <p className="record-state" role="status">مفيش نتائج مطابقة للبحث.</p>}
  </Modal>;
}
