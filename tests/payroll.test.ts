import {afterEach,expect,it,vi} from 'vitest';
import {emptyStore,validateStore,createBackup,parseBackup} from '../src/lib/storeState';
import {recordEmployeeAction,reverseEmployeeAction,closePayrollPeriod,payrollBalance} from '../src/lib/payroll';
import {cancelExpense,operatingExpenses} from '../src/lib/ledger';
import {INITIAL_PARTNERS,INITIAL_EMPLOYEES} from '../src/data/initialData';
afterEach(()=>vi.useRealTimers());
function start(){
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
  return {...emptyStore,partners:[{...INITIAL_PARTNERS[0],sharePercent:100,totalPaidFromPocket:0,totalWithdrawals:0}],employees:[{...INITIAL_EMPLOYEES[0],id:'worker',salaryType:'شهري' as const,baseMonthlySalary:1000,payrollPeriod:'2026-11',openingPayable:0,workedDaysThisMonth:0,totalAdvances:0,totalDeductions:0,totalBonuses:0,totalPaidOut:0}]};
}
it('links advances and final salary to separate cash expenses without counting an advance twice',()=>{
  let state=recordEmployeeAction(start(),'worker','سلفة',200,'Advance','p1');
  expect(payrollBalance(state.employees[0]).payable).toBe(800);
  state=recordEmployeeAction(state,'worker','صرف راتب',800,'Salary','p1');
  expect(payrollBalance(state.employees[0]).payable).toBe(0);
  expect(operatingExpenses(state.expenses)).toBe(1000);
  expect(state.employeeTransactions.every((t)=>state.expenses.some((e)=>e.id===t.expenseId&&e.sourceEmployeeTransactionId===t.id))).toBe(true);
  expect(parseBackup(JSON.parse(JSON.stringify(createBackup(state))))).toEqual(validateStore(state));
});
it('reverses a salary and its pocket-funded expense atomically, exactly once',()=>{
  const paid=recordEmployeeAction(start(),'worker','صرف راتب',400,'Salary','p1','من جيب الشريك');
  expect(paid.partners[0].totalPaidFromPocket).toBe(400);
  expect(()=>cancelExpense(paid,paid.expenses[0].id,'Owner')).toThrow('حركة عامل');
  const reversed=reverseEmployeeAction(paid,paid.employeeTransactions[0].id,'Owner');
  expect(reversed.partners[0].totalPaidFromPocket).toBe(0);
  expect(reversed.employees[0].totalPaidOut).toBe(0);
  expect(operatingExpenses(reversed.expenses)).toBe(0);
  expect(reversed.employeeTransactions[0].reversedAt).toBeTruthy();
  expect(()=>reverseEmployeeAction(reversed,paid.employeeTransactions[0].id,'Owner')).toThrow();
});
it('refuses inconsistent payroll-expense links during restore',()=>{
  const paid=recordEmployeeAction(start(),'worker','صرف راتب',100,'Salary','p1');
  expect(()=>validateStore({...paid,expenses:[{...paid.expenses[0],amount:99}]})).toThrow('لا يطابق');
});
it('closes a finished month, preserves its evidence and carries unpaid balances',()=>{
  let state=recordEmployeeAction(start(),'worker','سلفة',200,'Advance','p1');
  state=recordEmployeeAction(state,'worker','صرف راتب',500,'Salary','p1');
  expect(()=>closePayrollPeriod(state,'worker','p1')).toThrow('بعد انتهائه');
  vi.setSystemTime(new Date('2026-12-01T12:00:00Z'));
  expect(()=>recordEmployeeAction(state,'worker','مكافأة',10,'Bonus','p1')).toThrow('أقفل');
  const closed=closePayrollPeriod(state,'worker','p1');
  expect(closed.employees[0].payrollPeriod).toBe('2026-12');
  expect(closed.employees[0].openingPayable).toBe(300);
  expect(payrollBalance(closed.employees[0]).payable).toBe(1300);
  expect(closed.employeeTransactions[0].closingSummary?.carryForward).toBe(300);
  expect(()=>reverseEmployeeAction(closed,state.employeeTransactions[0].id,'Owner')).toThrow('شهرًا مقفلًا');
  expect(()=>closePayrollPeriod(closed,'worker','p1')).toThrow();
  expect(validateStore(closed).employeeTransactions).toHaveLength(3);
});
it('preserves a negative carried balance instead of silently losing it',()=>{
  let state=recordEmployeeAction(start(),'worker','خصم/عجز',1200,'Deduction','p1');
  vi.setSystemTime(new Date('2026-12-01T12:00:00Z'));
  state=closePayrollPeriod(state,'worker','p1');
  expect(state.employees[0].openingPayable).toBe(-200);
  expect(payrollBalance(state.employees[0]).payable).toBe(800);
});
