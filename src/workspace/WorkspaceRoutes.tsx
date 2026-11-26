import type { ActiveWorkspace } from './useWorkspaceController';
import { OperationsRoutes } from './OperationsRoutes';
import { CatalogRoutes } from './CatalogRoutes';
import { ContactRoutes } from './ContactRoutes';
import { FinanceRoutes } from './FinanceRoutes';
import { SettingsRoutes } from './SettingsRoutes';

export function WorkspaceRoutes({ workspace }: { workspace: ActiveWorkspace }) {
  switch (workspace.activeScreen) {
    case 'purchase':
    case 'recipes':
    case 'production':
    case 'sales_pos':
    case 'cashier_sync':
    case 'stocktaking':
      return <OperationsRoutes workspace={workspace} />;
    case 'products':
    case 'inventory':
    case 'shortages':
      return <CatalogRoutes workspace={workspace} />;
    case 'suppliers':
    case 'customers':
      return <ContactRoutes workspace={workspace} />;
    case 'sales_invoices':
    case 'insights':
    case 'reports':
    case 'staff_payroll':
      return <FinanceRoutes workspace={workspace} />;
    case 'users':
    case 'shop_menu':
    case 'more':
      return <SettingsRoutes workspace={workspace} />;
    default:
      return null;
  }
}
