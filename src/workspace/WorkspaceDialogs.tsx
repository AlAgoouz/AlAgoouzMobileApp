import { StockMovementModal } from "../components/StockMovementModal";
import { ExpenseRecordDetail } from "../components/ExpenseRecordDetail";
import { CashierDayDetail } from "../components/CashierDayDetail";
import { correctedCashierCost } from "../lib/cashierCosts";
import React from "react";
import type { ActiveWorkspace } from './useWorkspaceController';

const InvoiceReceiptModal = React.lazy(() =>
  import("../components/ReceiptAndStatementModals").then((module) => ({
    default: module.InvoiceReceiptModal,
  })),
);

export function WorkspaceDialogs({ workspace }: { workspace: ActiveWorkspace }) {
  const {
    cloud, setMovementId, setExpenseDetailId, setCashierDetailId, openCustomer, items, customers,
    expenseDetail, cashierDetail, movementItem, cashierCosts, receiptModalInvoice,
    setReceiptModalInvoice,
  } = workspace;

  return <>
    {expenseDetail&&<ExpenseRecordDetail expense={expenseDetail} onClose={()=>setExpenseDetailId(undefined)}/>}
    {cashierDetail&&<CashierDayDetail day={{...cashierDetail,correctedTotalCost:correctedCashierCost(cashierDetail,cashierCosts.get(cashierDetail.id)),
      costCorrections:cashierCosts.get(cashierDetail.id)?.map(({line,...detail})=>({itemId:line.itemId,...detail}))}} names={Object.fromEntries(items.map(item=>[item.id,item.name]))} onClose={()=>setCashierDetailId(undefined)}/>}
    {movementItem&&<StockMovementModal item={movementItem} documents={cloud.state} onClose={()=>setMovementId(undefined)}/> }
    {receiptModalInvoice && (
      <InvoiceReceiptModal
        invoice={receiptModalInvoice}
        onOpenCustomer={openCustomer}
        customerPhone={
          customers.find(
            (c) =>
              c.id === receiptModalInvoice.customerId ||
              (!receiptModalInvoice.customerId && c.name === receiptModalInvoice.customerName),
          )?.phone || ""
        }
        onClose={() => setReceiptModalInvoice(null)}
      />
    )}
  </>;
}
