import type { Employee, EmployeeTransaction, Expense } from '../types/erp';
import type { StoreState } from './storeState';
import { businessDate } from './dates';
import { recordExpense, cancelExpense } from './ledger';

const money = (value:number) => Number(value.toFixed(2));
export const currentPayrollPeriod = () => businessDate().slice(0,7);
export function payrollBalance(employee:Employee) {
  const earned = employee.salaryType === 'يومية' ? money(employee.workedDaysThisMonth * employee.dailyRate) : employee.baseMonthlySalary;
  const balance = money((employee.openingPayable ?? 0) + earned + employee.totalBonuses - employee.totalAdvances - employee.totalDeductions - employee.totalPaidOut);
  return {earned, balance, payable:Math.max(0,balance)};
}
const actionField = {'سلفة':'totalAdvances', 'خصم/عجز':'totalDeductions', 'مكافأة':'totalBonuses', 'صرف راتب':'totalPaidOut'} as const;
export function recordEmployeeAction(state:StoreState, employeeId:string, type:EmployeeTransaction['type'], amount:number, notes:string, partnerId:string, paidFrom:EmployeeTransaction['paidFrom']='درج المحل'):StoreState {
  if (type === 'إقفال شهر') throw new Error('استخدم إقفال الشهر المخصص');
  const employee = state.employees.find((e)=>e.id===employeeId);
  const partner = state.partners.find((p)=>p.id===partnerId);
  if (!employee || !partner) throw new Error('العامل أو الشريك غير موجود');
  const period = employee.payrollPeriod ?? currentPayrollPeriod();
  if (period !== currentPayrollPeriod()) throw new Error('أقفل شهر العامل السابق قبل تسجيل حركات الشهر الجديد');
  if (!Number.isFinite(amount) || (type==='حضور يومية' ? amount < 0 : amount <= 0)) throw new Error('مبلغ حركة العامل غير صالح');
  if (type==='حضور يومية' && employee.salaryType!=='يومية') throw new Error('الحضور اليومي مخصص للعامل بنظام اليومية');
  if (type==='صرف راتب' && amount > payrollBalance(employee).payable + 0.001) throw new Error('المبلغ أكبر من صافي مستحقات العامل');
  const transaction:EmployeeTransaction = {
    id:crypto.randomUUID(), date:businessDate(), employeeId, employeeName:employee.name, type,
    amount:type==='حضور يومية' ? employee.dailyRate : money(amount), notes, partnerName:partner.name,
    payrollPeriod:period, accountingVersion:1, partnerId,
  };
  let next = state;
  if (type==='صرف راتب' || type==='سلفة') {
    if (!['درج المحل','خزنة الشركة','من جيب الشريك'].includes(paidFrom)) throw new Error('اختر مصدر الصرف');
    next = recordExpense(next, {
      date:transaction.date, category:'رواتب ويوميات', title:`${type} — ${employee.name} — ${period}`,
      amount:transaction.amount, paidFrom, partnerName:partner.name, notes,
      sourceEmployeeTransactionId:transaction.id,
    }, partnerId);
    transaction.expenseId = next.expenses[0].id;
    transaction.paidFrom = paidFrom;
  }
  return {...next,
    employees:next.employees.map((e)=>e.id!==employeeId ? e : type==='حضور يومية'
      ? {...e,payrollPeriod:period,workedDaysThisMonth:e.workedDaysThisMonth+1}
      : {...e,payrollPeriod:period,[actionField[type]]:money(e[actionField[type]]+transaction.amount)}),
    employeeTransactions:[transaction,...next.employeeTransactions],
  };
}
export function reverseEmployeeAction(state:StoreState, id:string, actor:string):StoreState {
  const transaction = state.employeeTransactions.find((t)=>t.id===id);
  if (!transaction || transaction.reversedAt || transaction.type==='إقفال شهر' || transaction.accountingVersion!==1) throw new Error('الحركة غير قابلة للعكس أو أُلغيت بالفعل');
  const employee=state.employees.find((e)=>e.id===transaction.employeeId);
  if (!employee || employee.payrollPeriod!==transaction.payrollPeriod) throw new Error('الحركة تخص شهرًا مقفلًا؛ سجّل تسوية في الشهر الحالي');
  let next=state;
  if (transaction.expenseId) {
    const expense = state.expenses.find((e)=>e.id===transaction.expenseId && e.sourceEmployeeTransactionId===transaction.id);
    if (!expense || expense.isCancelled) throw new Error('مصروف الحركة يحتاج مراجعة قبل العكس');
    // The only allowed path reverses the cash entry and employee movement together.
    next=cancelExpense({...state,expenses:state.expenses.map((e)=>e.id===expense.id ? {...e,sourceEmployeeTransactionId:undefined} : e)},expense.id,actor);
    next={...next,expenses:next.expenses.map((e)=>e.id===expense.id ? {...e,sourceEmployeeTransactionId:transaction.id} : e)};
  }
  const employees=next.employees.map((e)=> {
    if(e.id!==employee.id) return e;
    if(transaction.type==='حضور يومية') {
      if(e.workedDaysThisMonth<1) throw new Error('رصيد الحضور لا يسمح بعكس الحركة');
      return {...e,workedDaysThisMonth:e.workedDaysThisMonth-1};
    }
    const field=actionField[transaction.type as keyof typeof actionField];
    if(e[field]+0.001<transaction.amount) throw new Error('رصيد العامل لا يسمح بعكس الحركة');
    return {...e,[field]:money(e[field]-transaction.amount)};
  });
  return {...next,employees,employeeTransactions:next.employeeTransactions.map((t)=>t.id===id?{...t,reversedAt:new Date().toISOString(),reversedBy:actor}:t)};
}
export function closePayrollPeriod(state:StoreState, employeeId:string, partnerId:string):StoreState {
  const employee=state.employees.find((e)=>e.id===employeeId),partner=state.partners.find((p)=>p.id===partnerId);
  if(!employee || !partner) throw new Error('العامل أو الشريك غير موجود');
  const period=employee.payrollPeriod ?? currentPayrollPeriod();
  if(period>=currentPayrollPeriod()) throw new Error('إقفال الشهر متاح بعد انتهائه فقط');
  if(state.employeeTransactions.some((t)=>t.employeeId===employeeId && t.type==='إقفال شهر' && t.payrollPeriod===period)) throw new Error('الشهر مقفل بالفعل');
  const {earned,balance}=payrollBalance(employee);
  const nextMonth=new Date(`${period}-01T12:00:00Z`);nextMonth.setUTCMonth(nextMonth.getUTCMonth()+1);
  const record:EmployeeTransaction={id:crypto.randomUUID(),date:businessDate(),employeeId,employeeName:employee.name,type:'إقفال شهر',amount:0,notes:`إقفال ${period} وترحيل المتبقي`,partnerName:partner.name,partnerId,accountingVersion:1,payrollPeriod:period,
    closingSummary:{openingPayable:employee.openingPayable??0,earned,advances:employee.totalAdvances,deductions:employee.totalDeductions,bonuses:employee.totalBonuses,paidOut:employee.totalPaidOut,carryForward:balance}};
  return {...state,employees:state.employees.map((e)=>e.id!==employeeId?e:{...e,payrollPeriod:nextMonth.toISOString().slice(0,7),openingPayable:balance,workedDaysThisMonth:0,totalAdvances:0,totalDeductions:0,totalBonuses:0,totalPaidOut:0}),employeeTransactions:[record,...state.employeeTransactions]};
}
