import React from 'react';

export function ActionButton({type = 'button', variant = 'secondary', className, ...props}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
}) {
  return <button {...props} type={type} className={`action-button action-button-${variant}${className ? ' ' + className : ''}`}/>;
}
