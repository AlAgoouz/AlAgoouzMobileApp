import {lazy} from 'react';
import type { ActiveWorkspace } from './useWorkspaceController';
import { OperationsRoutes } from './OperationsRoutes';
import { CatalogRoutes } from './CatalogRoutes';
import { ContactRoutes } from './ContactRoutes';
import { FinanceRoutes } from './FinanceRoutes';
import { SettingsRoutes } from './SettingsRoutes';
import type { ExcelSection } from '../lib/excelWorkbook';

const ExcelTools=lazy(()=>import('../components/ExcelSectionTools').then(module=>({default:module.ExcelSectionTools})));
const excelSections:ReadonlySet<string>=new Set<ExcelSection>([
  'purchase','recipes','production','sales_pos','cashier_sync','stocktaking','products','inventory','shortages',
  'suppliers','customers','sales_invoices','staff_payroll','expenses','partners',
]);

function renderScreen(workspace:ActiveWorkspace) {
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

export function WorkspaceRoutes({ workspace }: { workspace: ActiveWorkspace }) {
  const {activeScreen,moreInitialTab,engine,member,partners,financialPartner,navigateScreen}=workspace;
  const section=activeScreen==='more'?moreInitialTab:activeScreen;
  return <>
    {excelSections.has(section)&&<ExcelTools key={section} section={section as ExcelSection} member={member}
      partners={partners} selectedPartnerId={financialPartner?.id} hasPending={()=>engine.hasPending}
      refresh={()=>engine.refresh()} openStocktaking={()=>navigateScreen('stocktaking')}/>}
    {renderScreen(workspace)}
  </>;
}
