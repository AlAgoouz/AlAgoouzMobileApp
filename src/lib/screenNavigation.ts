export type MoreSubTab =
  | 'menu'
  | 'data_control'
  | 'expenses'
  | 'partners'
  | 'cloud';

const VALID_SCREENS = new Set([
  'home',
  'sections',
  'users',
  'shop_menu',
  'purchase',
  'recipes',
  'production',
  'sales_pos',
  'cashier_sync',
  'products',
  'inventory',
  'shortages',
  'suppliers',
  'customers',
  'sales_invoices',
  'insights',
  'reports',
  'stocktaking',
  'staff_payroll',
  'more',
]);

const VALID_TABS = new Set<MoreSubTab>([
  'menu',
  'data_control',
  'expenses',
  'partners',
  'cloud',
]);

export function readNavigationFromWindow(win: Window = window): {
  screen: string;
  tab: MoreSubTab;
} {
  const state = win.history.state as
    | { screen?: unknown; tab?: unknown }
    | null
    | undefined;
  const params = new URLSearchParams(win.location.search);
  const paramScreen = params.get('screen');
  const paramTab = params.get('tab');

  const rawScreen =
    typeof state?.screen === 'string'
      ? state.screen
      : typeof paramScreen === 'string'
        ? paramScreen
        : 'home';
  const rawTab =
    typeof state?.tab === 'string'
      ? state.tab
      : typeof paramTab === 'string'
        ? paramTab
        : 'menu';

  const screen = VALID_SCREENS.has(rawScreen) ? rawScreen : 'home';
  const tab = VALID_TABS.has(rawTab as MoreSubTab)
    ? (rawTab as MoreSubTab)
    : 'menu';

  return { screen, tab };
}

export function buildNavigationUrl(
  screen: string,
  tab: MoreSubTab,
  loc: Location = window.location,
): string {
  const params = new URLSearchParams(loc.search);
  if (!screen || screen === 'home') {
    params.delete('screen');
    params.delete('tab');
  } else {
    params.set('screen', screen);
    if (screen === 'more' && tab !== 'menu') {
      params.set('tab', tab);
    } else {
      params.delete('tab');
    }
  }
  const query = params.toString();
  return `${loc.pathname}${query ? `?${query}` : ''}${loc.hash}`;
}
