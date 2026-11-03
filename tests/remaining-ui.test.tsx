// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  StaffAndPayrollScreen,
  StocktakingScreen,
} from "../src/components/StocktakingAndStaffScreens";
import { SalesPosScreen } from "../src/components/SalesAndCashierSyncScreens";
import { ProductionAndRecipesScreen } from "../src/components/ProductionAndRecipesScreen";
import { emptyStore, validateStore } from "../src/lib/storeState";
import { MoreMenuScreen } from "../src/components/ManagementScreens";
import { INITIAL_PARTNERS } from "../src/data/initialData";
import { INITIAL_ITEMS, INITIAL_EMPLOYEES } from "../src/data/initialData";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("keeps a rejected expense editable and assigns its Cairo business date", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-01T22:30:00Z"));
  const save = vi.fn(() => false);
  const noop = () => {};
  render(
    <MoreMenuScreen
      initialSubPage="expenses"
      expenses={[]}
      partners={INITIAL_PARTNERS}
      auditLogs={[]}
      shifts={[]}
      currentPartner={INITIAL_PARTNERS[0]}
      onAddExpense={save}
      onDeleteExpense={noop}
      onUpdatePartnerAccount={noop}
      onClearAllDemoData={noop}
      onClearTransactionsKeepCatalog={noop}
      onRestoreDefaultDemoData={noop}
      onDownloadBackupJson={noop}
      onExportFullExcel={noop}
      onRestoreBackupJson={noop}
      onLogout={noop}
      onNavigate={noop}
      onBack={noop}
    />,
  );
  fireEvent.change(screen.getByPlaceholderText("بيان المصروف باختصار..."), {
    target: { value: "Test expense" },
  });
  fireEvent.change(screen.getByPlaceholderText("المبلغ (ج.م)"), {
    target: { value: "50" },
  });
  fireEvent.click(screen.getByRole("button", { name: "حفظ المصروف" }));
  expect(save.mock.calls[0][0].date).toBe("2026-11-02");
  expect(screen.getByRole("alert").textContent).toContain("لم يُحفظ");
  expect(
    (screen.getByPlaceholderText("بيان المصروف باختصار...") as HTMLInputElement)
      .value,
  ).toBe("Test expense");
});
it("requires recipe ingredients while creating a new blend", () => {
  const save = vi.fn((item) => {
    validateStore({ ...emptyStore, items: [{ ...item, id: "new-blend" }] });
    return true;
  });
  render(
    <ProductionAndRecipesScreen
      items={[]}
      productionBatches={[]}
      currentPartnerName="Owner"
      onExecuteProduction={() => ({ ok: false, message: "" })}
      onSaveItemRecipe={() => {}}
      onCreateNewBlendOrDrink={save}
      onBack={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "جديد" }));
  fireEvent.change(screen.getByLabelText('اسم الصنف'),{target:{value:'New blend'}});
  fireEvent.click(screen.getByRole('button',{name:'حفظ الصنف والوصفة'}));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toContain('حدد مكونات الوصفة');
});
const bean = {
  ...INITIAL_ITEMS.find((i) => i.category === "raw_bean")!,
  name: "Test bean",
  stock: 10,
};
const emp = {
  ...INITIAL_EMPLOYEES[0],
  salaryType: "شهري" as const,
  baseMonthlySalary: 100,
  totalAdvances: 0,
  totalDeductions: 0,
  totalPaidOut: 0,
  totalBonuses: 0,
};
it("keeps the payroll amount editable after rejecting an overpayment and permits retry", () => {
  const save = vi.fn();
  render(
    <StaffAndPayrollScreen
      employees={[emp]}
      transactions={[]}
      onRecordEmployeeAction={save}
      onAddNewEmployee={() => {}}
      onDeleteEmployee={() => {}}
      onBack={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "صرف راتب" }));
  fireEvent.change(screen.getByLabelText("مبلغ حركة العامل"), {
    target: { value: "101" },
  });
  fireEvent.click(screen.getByRole("button", { name: "حفظ وتأكيد" }));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByText(/المبلغ أكبر من صافي/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("مبلغ حركة العامل"), {
    target: { value: "100" },
  });
  fireEvent.click(screen.getByRole("button", { name: "حفظ وتأكيد" }));
  expect(save).toHaveBeenCalledWith(
    emp.id,
    "صرف راتب",
    100,
    expect.any(String),
    "درج المحل",
  );
});
it("rejects a blank inventory count rather than applying the previous valid number", () => {
  const save = vi.fn();
  render(
    <StocktakingScreen
      items={[bean]}
      auditRecords={[]}
      employees={[]}
      currentPartnerName="Owner"
      onCommitStocktaking={save}
      onBack={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText("الرصيد الفعلي: Test bean"), {
    target: { value: "9" },
  });
  fireEvent.change(screen.getByLabelText("الرصيد الفعلي: Test bean"), {
    target: { value: "" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: /اعتماد الجرد وتحديث المخزن/ }),
  );
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toContain(
    "الفارغ لا يعني صفرًا",
  );
});
it("preserves grams as a base quantity across count unit changes and retains a rejected count", () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const save = vi.fn(() => false);
  render(
    <StocktakingScreen
      items={[bean]}
      auditRecords={[]}
      employees={[]}
      currentPartnerName="Owner"
      onCommitStocktaking={save}
      onBack={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "إدخال بالجرام (جم)" }));
  fireEvent.change(screen.getByLabelText("الرصيد الفعلي: Test bean"), {
    target: { value: "9500" },
  });
  fireEvent.click(screen.getByRole("button", { name: "إدخال بالكيلو (كجم)" }));
  expect(
    (screen.getByLabelText("الرصيد الفعلي: Test bean") as HTMLInputElement)
      .value,
  ).toBe("9.5");
  fireEvent.click(
    screen.getByRole("button", { name: /اعتماد الجرد وتحديث المخزن/ }),
  );
  expect(save.mock.calls[0][0][0].actualStock).toBe(9.5);
  expect(screen.getByRole("alert").textContent).toContain("لم يُعتمد");
  expect(
    (screen.getByLabelText("الرصيد الفعلي: Test bean") as HTMLInputElement)
      .value,
  ).toBe("9.5");
});
it("does not attach a retail cash sale to the first wholesale customer", () => {
  const save = vi.fn();
  render(
    <SalesPosScreen
      items={[bean]}
      customers={[
        {
          id: "c",
          name: "Wholesale",
          phone: "",
          type: "جملة - كافيه",
          balance: 0,
          totalSales: 0,
          invoicesCount: 0,
        },
      ]}
      currentPartnerName="Owner"
      onSaveSale={save}
      onBack={() => {}}
      onNavigateToCashierSync={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "بيع المحل" }));
  fireEvent.click(screen.getByRole("button", { name: "+ ربع" }));
  fireEvent.click(screen.getByRole("button", { name: /حفظ|إتمام|تأكيد/ }));
  expect(save.mock.calls[0][0].saleType).toBe("retail");
  expect(save.mock.calls[0][0].customerId).toBeUndefined();
});

it('requires an explicit physical count for cashier deficits before stocktaking',()=>{
 const save=vi.fn();vi.spyOn(window,'confirm').mockReturnValue(true);
 render(<StocktakingScreen items={[{...bean,stock:-2}]} auditRecords={[]} employees={[]} currentPartnerName="Owner" onCommitStocktaking={save} onBack={()=>{}}/>);
 expect(screen.getByText('بانتظار العد الفعلي')).toBeTruthy();expect(screen.queryByText('✓ مطابق للميزان')).toBeNull();
 expect((screen.getByLabelText('الرصيد الفعلي: Test bean') as HTMLInputElement).value).toBe('');
 fireEvent.click(screen.getByRole('button',{name:/اعتماد الجرد وتحديث المخزن/}));
 expect(save).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toContain('بالسالب');
 fireEvent.change(screen.getByLabelText('الرصيد الفعلي: Test bean'),{target:{value:'0'}});
 fireEvent.click(screen.getByRole('button',{name:/اعتماد الجرد وتحديث المخزن/}));
 expect(save).toHaveBeenCalledWith([expect.objectContaining({systemStock:-2,actualStock:0,difference:2})],expect.any(String),undefined);
});
