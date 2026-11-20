import React from 'react';
import { Coffee, type LucideIcon } from 'lucide-react';

export function EmptyState({
  icon: Icon = Coffee,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state" role="status">
      <Icon size={28} aria-hidden="true" />
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
