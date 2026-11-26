import {decimalValue} from '../lib/decimalInput';
import { Users as HeaderUsers } from 'lucide-react';
import {OperationHeader} from './OperationHeader';
import {Modal} from './Modal';
import {SupplierPurchasePanels} from './SupplierPurchasePanels';
import {matchesRecordSearch} from '../lib/recordSearch';
import {supplierPurchaseHistory} from '../lib/supplierPurchases';
import {ContactEditModal} from './ContactEditModal';
import React, { useState, useMemo } from "react";
import {RecordPagination,useRecordPage} from './RecordPagination';
import {checkCustomerDetails,checkSupplierDetails} from '../lib/contactDetails';
import { Plus, Trash2, FileText } from 'lucide-react';
import { Supplier, Customer, SalesInvoice, PurchaseInvoice, AccountPaymentRecord } from "../types/erp";
import { AccountStatementModal } from "./ReceiptAndStatementModals";

export const SuppliersAndCustomersScreen: React.FC<{
  mode: "suppliers" | "customers";
  initialStatementId?: string;
  listView?:{query:string;page:number};
  onListViewChange?:(view:{query:string;page:number})=>void;
  onOpenPurchase?: (id:string)=>void;
  onOpenSale?: (id:string)=>void;
  suppliers: Supplier[];
  customers: Customer[];
  purchaseInvoices: PurchaseInvoice[];
  salesInvoices: SalesInvoice[];
  accountPayments: AccountPaymentRecord[];
  onPaySupplier: (
    supplierId: string,
    amount: number,
    notes?: string,
  ) => boolean;
  onCollectCustomer: (
    customerId: string,
    amount: number,
    notes?: string,
  ) => boolean;
  onDeletePayment?: (paymentId: string) => void;
  onAddSupplier: (sup: Omit<Supplier, "id">) => void|boolean;
  onUpdateContact?:(mode:'suppliers'|'customers',id:string,details:{name:string;phone:string;area?:string;address?:string;representativeName?:string})=>boolean;
  onDeleteSupplier: (id: string) => void;
  onAddCustomer: (cust: Omit<Customer, "id">) => void|boolean;
  onDeleteCustomer: (id: string) => void;
  canManageContacts?: boolean;
  canManagePayments?: boolean;
  onBack: () => void;
}> = ({
  mode,
  initialStatementId,
  listView,
  onListViewChange,
  onOpenPurchase,
  onOpenSale,
  suppliers,
  customers,
  purchaseInvoices,
  salesInvoices,
  accountPayments,
  onPaySupplier,
  onUpdateContact,
  onCollectCustomer,
  onDeletePayment,
  onAddSupplier,
  onDeleteSupplier,
  onAddCustomer,
  onDeleteCustomer,
  canManageContacts = true,
  canManagePayments = true,
  onBack,
}) => {
  const [localView,setLocalView]=useState({query:'',page:0});
  const view=listView??localView;
  const {query}=view;
  const setView=onListViewChange??setLocalView;
  const matchingSuppliers=useMemo(()=>suppliers.filter(supplier=>
    matchesRecordSearch(query,supplier.name,supplier.phone,supplier.address,supplier.representativeName)),[suppliers,query]);
  const matchingCustomers=useMemo(()=>customers.filter(customer=>
    matchesRecordSearch(query,customer.name,customer.phone,customer.area)),[customers,query]);
  const pagination={page:view.page,setPage:(next:number)=>setView({...view,page:next})};
  const supplierPage=useRecordPage(matchingSuppliers,query,20,pagination);
  const customerPage=useRecordPage(matchingCustomers,query,20,pagination);
  const page=mode==='suppliers'?supplierPage:customerPage;
  const [editingContact,setEditingContact]=useState<Customer|Supplier|null>(null);
  const [payModalTarget, setPayModalTarget] = useState<{
    id: string;
    name: string;
    balance: number;
  } | null>(null);
  const [statementTargetId, setStatementTargetId] = useState<string | null>(initialStatementId ?? null);
  const [amountInput, setAmountInput] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newArea,setNewArea]=useState('');
  const [newAddress,setNewAddress]=useState('');
  const [newRepresentative,setNewRepresentative]=useState('');
  const [newBalance, setNewBalance] = useState("0");
  const [addModalError, setAddModalError] = useState("");
  const [payModalError, setPayModalError] = useState("");

  const activeStatementEntity = useMemo(() => {
    if (!statementTargetId) return null;
    if (mode === "suppliers") {
      return suppliers.find((s) => s.id === statementTargetId) || null;
    }
    return customers.find((c) => c.id === statementTargetId) || null;
  }, [statementTargetId, mode, suppliers, customers]);

  const handleCreate = () => {
    try {
      if(mode==='suppliers')checkSupplierDetails({name:newName,phone:newPhone,address:newAddress,representativeName:newRepresentative});
      else checkCustomerDetails({name:newName,phone:newPhone,area:newArea});
    }catch(error){setAddModalError((error as Error).message);return;}
    if (!newName.trim()) {
      setAddModalError("أدخل الاسم أولاً");
      return;
    }
    const balance = decimalValue(newBalance);
    if (!Number.isFinite(balance) || balance < 0) {
      setAddModalError("الرصيد الافتتاحي يجب أن يكون رقمًا غير سالب");
      return;
    }
    if (mode === "suppliers") {
      const accepted=onAddSupplier({
        name: newName.trim(),
        phone: newPhone.trim(),
        address:newAddress.trim(),
        representativeName:newRepresentative.trim(),
        category: "مورد بن وخامات",
        balance:0,
        totalPurchases: 0,
        invoicesCount: 0,
      });
      if(accepted===false){setAddModalError("لم يتم حفظ المورد؛ راجع التنبيه");return;}
    } else {
      const accepted=onAddCustomer({
        name: newName.trim(),
        phone: newPhone.trim(),
        area:newArea.trim(),
        type: "جملة - كافيه",
        balance,
        totalSales: 0,
        invoicesCount: 0,
      });
      if(accepted===false){setAddModalError("لم يتم حفظ العميل؛ راجع التنبيه");return;}
    }
    setAddModalError("");
    setNewName("");
    setNewPhone("");
    setNewArea('');setNewAddress('');setNewRepresentative('');
    setNewBalance("0");
    setShowAddModal(false);
  };

  return (
    <div className="operation-screen min-h-screen pb-24">
      <OperationHeader title={<>{mode === "suppliers"
            ? `الموردين (${suppliers.length})`
            : `العملاء (${customers.length})`}</>} description={<>بيانات التواصل وسجل المعاملات والأرصدة.</>} icon={HeaderUsers} onBack={onBack}>{canManageContacts && <button
          type="button"
          onClick={() => setShowAddModal(true)}
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          إضافة
        </button>}</OperationHeader>

      <div className="record-workspace">
        <label className="record-search">{mode==='suppliers'?'بحث في الموردين':'بحث في العملاء'}
          <input type="search" value={query} onChange={event=>setView({query:event.target.value,page:0})}
            placeholder={mode==='suppliers'?'الاسم أو التليفون أو المندوب':'الاسم أو التليفون أو المنطقة'}/>
        </label>
        {!page.total&&<p className="record-state" role="status">{query.trim()?'مفيش نتائج مطابقة للبحث.':mode==='suppliers'?'لسه مفيش موردين مسجلين.':'لسه مفيش عملاء مسجلين.'}</p>}
        {page.total>page.pageSize&&<RecordPagination {...page}/>}
        <div className="contact-records">
          {mode === "suppliers"
            ? supplierPage.visible.map(sup=>{
                const purchases=supplierPurchaseHistory(purchaseInvoices,sup.id);
                return <article key={sup.id} className="record-card space-y-3">
                  <div className="record-heading mb-0">
                    <div>
                      <h2 className="font-black text-ink-strong">{sup.name}</h2>
                      <p>{sup.phone} — {sup.address||'العنوان غير مسجل'}</p>
                      <p>المندوب: {sup.representativeName||'غير مسجل'}</p>
                    </div>
                    <span className="record-badge">{purchases.purchases.length} فواتير</span>
                  </div>
                  <dl className="record-facts mb-0">
                    <div><dt>إجمالي الشراء</dt><dd>{purchases.total.toLocaleString('ar-EG')} ج.م</dd></div>
                    <div><dt>عدد الفواتير</dt><dd>{purchases.purchases.length}</dd></div>
                  </dl>
                  <div className="register-actions">
                    {canManageContacts&&onUpdateContact&&<button type="button" onClick={()=>setEditingContact(sup)} className="action-button flex-1">تعديل البيانات</button>}
                    {canManageContacts&&<button type="button" onClick={()=>onDeleteSupplier(sup.id)} className="action-button text-status-danger border-status-danger-line">حذف المورد</button>}
                  </div>
                  <SupplierPurchasePanels data={purchases} onOpenInvoice={onOpenPurchase}/>
                </article>;
              })
            : customerPage.visible.map((cust) => (
                <article
                  key={cust.id}
                  className="record-card space-y-3"
                >
                  <div className="record-heading mb-0">
                    <div>
                      <h2 className="font-black text-ink-strong">
                        {cust.name}
                      </h2>
                      <p>
                        {cust.type} • {cust.phone}
                      </p>
                      <p>المنطقة: {cust.area || 'غير مسجلة'}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-end">
                        <div className="text-xs text-ink">عليه</div>
                        <div
                          className={`text-sm font-black ${
                            cust.balance > 0
                              ? "text-gold"
                              : "text-status-ok"
                          }`}
                        >
                          {cust.balance.toLocaleString("ar-EG")} ج.م
                        </div>
                      </div>
                      {canManageContacts && <button
                        type="button"
                        onClick={() => onDeleteCustomer(cust.id)}
                        className="action-button text-status-danger border-status-danger-line"
                        aria-label={`حذف ${cust.name}`}
                        title="حذف العميل"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>}
                    </div>
                  </div>
                  <div className="record-actions pt-2 border-t border-line-subtle">
                    {canManageContacts&&onUpdateContact&&<button type="button" className="action-button" onClick={()=>setEditingContact(cust)}>تعديل البيانات</button>}
                    <button
                      type="button"
                      onClick={() => setStatementTargetId(cust.id)}
                      className="record-action flex items-center justify-center gap-1.5"
                    >
                      <FileText className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>كشف حساب تفصيلي / واتساب</span>
                    </button>
                    {canManagePayments && cust.balance > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setPayModalTarget({
                            id: cust.id,
                            name: cust.name,
                            balance: cust.balance,
                          });
                          setAmountInput(String(cust.balance));
                        }}
                        className="operation-primary"
                      >
                        تحصيل دفعة
                      </button>
                    )}
                  </div>
                </article>
              ))}
        </div>
      </div>

      {canManageContacts&&editingContact&&onUpdateContact&&<ContactEditModal target={editingContact} mode={mode} onSave={(id,details)=>onUpdateContact(mode,id,details)} onClose={()=>setEditingContact(null)}/>}
      {/* نافذة كشف الحساب التفصيلي للمورد أو العميل */}
      {activeStatementEntity && (
        <AccountStatementModal
          mode={mode === "suppliers" ? "supplier" : "customer"}
          target={activeStatementEntity}
          onOpenInvoice={mode==="customers"&&onOpenSale?(id)=>{setStatementTargetId(null);onOpenSale(id);}:onOpenPurchase}
          purchaseInvoices={purchaseInvoices}
          salesInvoices={salesInvoices}
          accountPayments={accountPayments}
          onRecordPayment={canManagePayments ? (amt, notes) => {
            if (mode === "suppliers") {
              return onPaySupplier(activeStatementEntity.id, amt, notes);
            } else {
              return onCollectCustomer(activeStatementEntity.id, amt, notes);
            }
          } : undefined}
          onDeletePayment={canManagePayments ? onDeletePayment : undefined}
          onClose={() => setStatementTargetId(null)}
        />
      )}

      {canManagePayments && payModalTarget && (
        <Modal title={<>{mode === "suppliers" ? "سداد للمورد:" : "تحصيل من العميل:"} {" "}  {payModalTarget.name}</>}  onClose={()=>setPayModalTarget(null)} footer={<div className="flex gap-2 w-full">
              <button
                type="button"
                onClick={() => {
                  const val = decimalValue(amountInput);
                  if (!Number.isFinite(val) || val <= 0) {
                    setPayModalError("أدخل مبلغًا صحيحًا أكبر من صفر");
                    return;
                  }
                  const ok =
                    mode === "suppliers"
                      ? onPaySupplier(payModalTarget.id, val)
                      : onCollectCustomer(payModalTarget.id, val);
                  if (!ok) {
                    setPayModalError(
                      "رفض النظام الحركة (راجع المبلغ والرصيد)؛ جرّب قيمة أخرى",
                    );
                    return;
                  }
                  setPayModalError("");
                  setPayModalTarget(null);
                }}
                className="operation-primary flex-1"
              >
                تأكيد
              </button>
              <button
                type="button"
                onClick={() => setPayModalTarget(null)}
                className="action-button"
              >
                إلغاء
              </button>
            </div>}><div className="operation-caption">
              {mode === "suppliers" ? "له حاليًا" : "عليه حاليًا"}:{" "}
              <b>
                {(mode === "suppliers"
                  ? suppliers.find((s) => s.id === payModalTarget.id)?.balance
                  : customers.find((c) => c.id === payModalTarget.id)
                      ?.balance) ?? payModalTarget.balance}
                {" ج.م"}
              </b>
            </div>
<input
              type="text" inputMode="decimal"
              aria-label="المبلغ"
              value={amountInput}
              onChange={(e) => {
                setAmountInput(e.target.value);
                if (payModalError) setPayModalError("");
              }}
              className="operation-input font-black text-center"
            />
{payModalError && (
              <p role="alert" className="field-error text-center">
                {payModalError}
              </p>
            )}</Modal>
      )}

      {canManageContacts && showAddModal && (
        <Modal title={<>{mode === "suppliers" ? "إضافة مورد جديد" : "إضافة عميل جديد"}</>}  onClose={()=>setShowAddModal(false)} footer={<div className="flex gap-2 w-full">
              <button
                type="button"
                onClick={handleCreate}
                className="operation-primary flex-1"
              >
                حفظ
              </button>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="action-button"
              >
                إلغاء
              </button>
            </div>}><input
              type="text"
              aria-label="الاسم"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="الاسم باختصار..."
              className="operation-input font-bold"
            />
<input
              type="text"
              aria-label="رقم التليفون"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="رقم التليفون..."
              className="operation-input font-bold"
            />
{mode==='customers' ? <input aria-label="منطقة العميل" value={newArea} onChange={e=>setNewArea(e.target.value)} placeholder="المنطقة" className="operation-input"/> : <>
              <input aria-label="عنوان المورد" value={newAddress} onChange={e=>setNewAddress(e.target.value)} placeholder="العنوان" className="operation-input"/>
              <input aria-label="اسم المندوب" value={newRepresentative} onChange={e=>setNewRepresentative(e.target.value)} placeholder="اسم المندوب" className="operation-input"/>
            </>}
{addModalError && <p role="alert" className="field-error">{addModalError}</p>}
{mode==='customers'&&<input
              type="text" inputMode="decimal"
              aria-label="الرصيد الافتتاحي"
              value={newBalance}
              onChange={(e) => setNewBalance(e.target.value)}
              placeholder="الرصيد الافتتاحي (ج.م)"
              className="operation-input font-bold"
            />}</Modal>
      )}
    </div>
  );
};
