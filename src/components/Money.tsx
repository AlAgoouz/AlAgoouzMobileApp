import React from 'react';
import {money} from '../lib/reporting';

export function Money({value}: {value: number | null}) {
  if (value === null) return <>{money(value)}</>;
  return <span className="money-amount"><bdi>{money(value)}</bdi>{' '}<small>ج.م</small></span>;
}
