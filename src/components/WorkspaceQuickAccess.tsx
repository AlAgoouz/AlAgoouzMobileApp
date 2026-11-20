import React, { useEffect, useState } from 'react';
import { Moon, Search, Sun } from 'lucide-react';
import { canWrite, type UserAccess } from '../lib/userAccess';
import { useThemePreference } from '../lib/theme';
import { ActionButton } from './ActionButton';
import { RecordPicker } from './RecordPicker';
import { sectionLinks } from './workspaceSections';

export function WorkspaceQuickAccess({
  member,
  onNavigate,
  showButton,
}: {
  member: UserAccess;
  onNavigate: (screen: string) => void;
  showButton: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { effective, toggleComfortScheme } = useThemePreference();

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.code !== 'KeyK') return;
      if (event.defaultPrevented || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      setOpen(true);
    }
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  const options = sectionLinks
    .filter((link) => (!link.ownerOnly || member.isOwner) && (link.id !== 'sales_pos' || canWrite(member, 'sales')))
    .map((link) => ({ id: link.id, title: link.title, detail: link.description }));

  return (
    <>
      {showButton && (
        <div className="workspace-quick-access">
          <ActionButton
            onClick={toggleComfortScheme}
            aria-label={effective === 'dark' ? 'التبديل إلى وضع النهار' : 'التبديل إلى وضع المناوبة الليلية'}
            title={effective === 'dark' ? 'وضع النهار' : 'المناوبة الليلية'}
          >
            {effective === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            <span className="hidden sm:inline">{effective === 'dark' ? 'نهاري' : 'ليلي'}</span>
          </ActionButton>
          <ActionButton onClick={() => setOpen(true)}>
            <Search size={16} aria-hidden="true" /> انتقال سريع <kbd dir="ltr" aria-hidden="true">Ctrl+K</kbd>
          </ActionButton>
        </div>
      )}
      {open && (
        <RecordPicker
          title="انتقال سريع"
          searchLabel="ابحث عن شاشة أو عملية"
          options={options}
          onClose={() => setOpen(false)}
          onSelect={(id) => {
            setOpen(false);
            onNavigate(id);
          }}
        />
      )}
    </>
  );
}
