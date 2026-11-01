// Read-only diagnostics: transpiles source in memory with simulated React state.
// Does not start the app, execute effects, or access the live database.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const results = [];
let hooks = [], cursor = 0, seed = {}, screen = 'home';
const react = {
  useState(init) {
    const id = cursor++;
    const value = id === 0 && screen !== null ? screen : typeof init === 'function' ? init() : init;
    hooks[id] = value;
    return [value, next => { hooks[id] = typeof next === 'function' ? next(hooks[id]) : next; }];
  },
  useMemo: fn => fn(), useEffect() {},
};
const components = new Proxy({}, {get: (_, key) => String(key)});
function load(relative, instrument = false) {
  const file = path.join(root, relative);
  let source = fs.readFileSync(file, 'utf8');
  if (typeof instrument === 'function') source = instrument(source);
  else if (instrument) source = source.replace('if (!loggedPartnerId) {', 'globalThis.auditApi = {handleExecuteProduction,handleImportCashierRows,deductSoldItemsFromInventory,handleClearTransactionsKeepCatalog}; if (!loggedPartnerId) {');
  const output = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX}}).outputText;
  const ctx = {
    exports: {}, console, Date, Map, Math,
    setTimeout: () => 0,
    localStorage: {getItem: () => JSON.stringify(seed)},
    sessionStorage: {getItem: () => 'p1'},
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return {jsx: (type, props) => ({type, props}), jsxs: (type, props) => ({type, props})};
      if (name.includes('initialData')) return data;
      if (name.includes('cashierExcelParser')) return parser;
      if (name.includes('components/')) return components;
      if (name.includes('supabaseSync')) return {getSupabaseClient: () => null};
      if (name === 'lucide-react') return components;
      return require(name);
    },
  };
  vm.runInNewContext(output, ctx, {filename: relative});
  return ctx;
}
const data = load('src/data/initialData.ts').exports;
const parser = load('src/lib/cashierExcelParser.ts').exports;
function app(nextSeed = {}, nextScreen = 'home') {
  seed = nextSeed; screen = nextScreen; hooks = []; cursor = 0;
  const ctx = load('src/App.tsx', true);
  return {tree: ctx.exports.default(), api: ctx.auditApi};
}
function find(node, type) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === type) return node.props;
  for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, type); if (found) return found; }
  return null;
}
function check(name, fn) {
  try { const evidence = fn(); results.push({name, reproduced: true, evidence}); }
  catch (e) { results.push({name, reproduced: false, error: e.message}); }
}
const bean = {id:'bean',code:'B1',name:'Coffee',category:'raw_bean',baseUnit:'kg',stock:1,costPrice:100,retailPrice:200,hasRecipe:false,supplierPrices:[]};
const line = {itemId:'bean',normalizedQtyInBaseUnit:5};
check('overselling silently clips inventory shortage', () => {
  const {api} = app({items:[bean]});
  const after = api.deductSoldItemsFromInventory([line],[bean]);
  assert.equal(after[0].stock,0);
  return {stockBefore:1,sold:5,stockAfter:after[0].stock,unrecordedShortage:4};
});
check('sample quarter-kilo row becomes eight kilos', () => {
  const row = parser.mapRawCashierRows([{'الكود':'B1','اسم الصنف':'ربع بن سادة فاتح (250 جم)','الكمية':8,'الوحدة':'ربع كيلو','الإجمالي':1080}],[bean])[0];
  assert.equal(row.unitHint,'kg'); assert.equal(row.quantity,8);
  return {expectedKg:2,actualKg:row.quantity};
});
check('negative return quantity becomes positive sale', () => {
  const row = parser.mapRawCashierRows([{'Name':'Coffee','Quantity':-2,'Unit':'kg','Total':-400}],[bean])[0];
  assert.equal(row.quantity,2); assert.equal(row.totalPrice,400);
  return {inputQty:-2,outputQty:row.quantity,inputTotal:-400,outputTotal:row.totalPrice};
});
check('item code column overwrites product name', () => {
  const row = parser.mapRawCashierRows([{Name:'Coffee','Item Code':'B1',Quantity:1}],[bean])[0];
  assert.equal(row.rawName,'B1'); assert.equal(row.matchedItem,undefined);
  return {rawName:row.rawName,matched:false};
});
check('importing same file twice creates two invoices', () => {
  const {api} = app({items:[bean],salesInvoices:[]});
  const rows = [{rawName:'Coffee',quantity:0.25,unitHint:'kg',totalPrice:50,matchedItem:bean}];
  api.handleImportCashierRows(rows,'same.xlsx'); api.handleImportCashierRows(rows,'same.xlsx');
  const invoices = hooks.find(v => Array.isArray(v) && v[0]?.sourceFile === 'same.xlsx');
  assert.equal(invoices.length,2);
  return {sameFileImports:2,invoices:invoices.length};
});
check('invoice return does not restore stock or customer debt', () => {
  const invoice = {id:'s1',invoiceNumber:'POS-1',totalAmount:200,remainingAmount:200,customerId:'c1',items:[line]};
  const {tree} = app({items:[bean],salesInvoices:[invoice],customers:[{id:'c1',balance:200}]},'sales_invoices');
  find(tree,'SalesInvoicesAndReturnsScreen').onReturnInvoice('s1');
  const inventory = hooks.find(v => Array.isArray(v) && v[0]?.id === 'bean');
  const customers = hooks.find(v => Array.isArray(v) && v[0]?.id === 'c1');
  const sales = hooks.find(v => Array.isArray(v) && v[0]?.id === 's1');
  assert.equal(sales[0].isReturned,true); assert.equal(inventory[0].stock,1); assert.equal(customers[0].balance,200);
  return {returned:true,stockUnchanged:1,debtUnchanged:200};
});
check('deleting payment does not reverse balance', () => {
  const {tree} = app({suppliers:[{id:'sup1',balance:100}],accountPayments:[]},'suppliers');
  const props = find(tree,'SuppliersAndCustomersScreen');
  props.onPaySupplier('sup1',40);
  let payments = hooks.find(v => Array.isArray(v) && v[0]?.targetType === 'supplier');
  props.onDeletePayment(payments[0].id);
  const supplier = hooks.find(v => Array.isArray(v) && v[0]?.id === 'sup1')[0];
  assert.equal(supplier.balance,60);
  assert.equal(hooks.some(v => Array.isArray(v) && v[0]?.targetType === 'supplier'),false);
  return {originalBalance:100,payment:40,balanceAfterPaymentDeletion:60};
});
check('reset leaves partner withdrawals unchanged', () => {
  const {api} = app({partners:[{...data.INITIAL_PARTNERS[0],totalWithdrawals:123}]});
  api.handleClearTransactionsKeepCatalog();
  const partner = hooks.find(v => Array.isArray(v) && v[0]?.id === 'p1')[0];
  assert.equal(partner.totalWithdrawals,123); assert.equal(partner.totalWithdrawn,0);
  return {totalWithdrawals:123,wrongFieldCreated:'totalWithdrawn'};
});
check('production succeeds with missing ingredient', () => {
  const blend = {...bean,id:'blend',category:'manufactured_blend',recipe:[{ingredientId:'deleted',quantity:1000,unit:'gram'}]};
  const {api} = app({items:[blend]});
  const result = api.handleExecuteProduction('blend',1,'diagnostic');
  assert.equal(result.ok,true);
  return {missingIngredient:'deleted',productionAccepted:result.ok};
});
check('backup restore omits partners', () => {
  const original = {...data.INITIAL_PARTNERS[0],name:'Original'};
  const {tree} = app({partners:[original]},'more');
  find(tree,'MoreMenuScreen').onRestoreBackupJson({partners:[{...original,name:'Restored'}]});
  const partner = hooks.find(v => Array.isArray(v) && v[0]?.id === 'p1')[0];
  assert.equal(partner.name,'Original');
  return {backupName:'Restored',actualName:partner.name};
});
check('empty profit report fabricates chart values', () => {
  screen = null; cursor = 0;
  const ctx = load('src/components/ReportsAndInsightsScreens.tsx', source => source.replace('const maxBarValue = useMemo(', 'globalThis.reportAudit = {stats,dailyChartData}; const maxBarValue = useMemo('));
  ctx.exports.ProfitReportsScreen({items:[],salesInvoices:[],expenses:[],partners:[],onBack(){}});
  assert.equal(ctx.reportAudit.stats.netProfit,0);
  assert.equal(ctx.reportAudit.dailyChartData.length,4);
  return {actualNetProfit:0,fabricatedChartTotal:ctx.reportAudit.dailyChartData.reduce((s,d)=>s+d.value,0)};
});
check('supplier overpayment loses credit', () => {
  const {tree} = app({suppliers:[{id:'sup1',balance:100}],accountPayments:[]},'suppliers');
  find(tree,'SuppliersAndCustomersScreen').onPaySupplier('sup1',150);
  const supplier = hooks.find(v=>Array.isArray(v)&&v[0]?.id==='sup1')[0];
  assert.equal(supplier.balance,0);
  return {oldDebt:100,paid:150,expectedCredit:50,recordedBalance:supplier.balance};
});
check('print HTML contains unescaped stored markup', () => {
  screen = null; cursor = 0;
  const ctx = load('src/components/ReceiptAndStatementModals.tsx');
  let printed = '';
  ctx.window = {open:()=>({document:{write:html=>{printed=html;},close(){}}})};
  const payload = '<img src=x onerror="window.__audit=1">';
  const tree = ctx.exports.InvoiceReceiptModal({invoice:{invoiceNumber:'1',date:'2026-11-01',customerName:payload,partnerName:'test',items:[],discount:0,totalAmount:0,paidAmount:0,remainingAmount:0},onClose(){}});
  function printButton(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.type==='button' && find(node,'Printer')) return node.props;
    for (const child of [node.props?.children].flat(Infinity)) {const result=printButton(child);if(result)return result;}
    return null;
  }
  printButton(tree).onClick();
  assert.equal(printed.includes(payload),true);
  return {unescapedMarkupReachedDocumentWrite:true,browserScriptExecutionTested:false};
});
const report = {date:'2026-11-01',method:'Source executed in memory; React state simulated; effects disabled; no live data accessed.',results};
fs.writeFileSync(path.join(__dirname,'diagnostic-results.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if (results.some(r => !r.reproduced)) process.exitCode = 1;
