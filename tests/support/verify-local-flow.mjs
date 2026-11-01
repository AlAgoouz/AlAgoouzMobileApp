// Verifies the state produced by the manual browser acceptance flow.
// This script is restricted to the disposable loopback gateway.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const modules = new Map();
function loadTs(file) {
  file = path.resolve(file);
  if (modules.has(file)) return modules.get(file);
  const exports = {};
  modules.set(file, exports);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports,
    require: (name) => name.startsWith('.') ? loadTs(path.resolve(path.dirname(file), name + '.ts')) : require(name),
    console, Date, Map, Set, crypto,
  }, { filename: file });
  return exports;
}
const auth = await fetch('http://127.0.0.1:5281/auth/v1/token?grant_type=password', {
  method: 'POST', headers: {'Content-Type':'application/json'},
  body: JSON.stringify({email:'owner1@local.test',password:'Local-Test-Only-123!'}),
});
assert.equal(auth.status, 200);
const session = await auth.json();
const response = await fetch('http://127.0.0.1:5281/rest/v1/bon_elagouz_store?id=eq.main_store', {
  headers: {Authorization:`Bearer ${session.access_token}`},
});
assert.equal(response.status, 200);
const row = await response.json();
const {fromCloud, createBackup, parseBackup} = loadTs('src/lib/storeState.ts');
const state = fromCloud(row);
const {INITIAL_ITEMS, INITIAL_CUSTOMERS} = loadTs('src/data/initialData.ts');
const raw = state.items.find((i) => i.name === 'بن برازيلي فاتح');
const blend = state.items.find((i) => i.name === 'توليفة سادة فاتح');
assert.equal(row.version, 3);
assert.equal(raw.stock, 38.5);
assert.equal(blend.stock, 32.25);
assert.equal(state.purchaseInvoices[0].totalAmount, 360);
assert.equal(state.purchaseInvoices[0].inventoryBefore.find((i) => i.id === raw.id).stock, 42.5);
assert.equal(state.purchaseInvoices[0].inventoryAfter.find((i) => i.id === raw.id).stock, 43.5);
assert.equal(state.productionBatches[0].quantityProducedKg, 10);
assert.equal(state.productionBatches[0].totalBatchCost, 3940);
assert.equal(state.salesInvoices[0].totalAmount, 135);
assert.equal(state.salesInvoices[0].totalCost, 98.5);
assert.equal(state.salesInvoices[0].netProfit, 36.5);
assert.equal(state.salesInvoices[0].customerId, undefined);
assert.deepEqual(JSON.parse(JSON.stringify(state.customers)), JSON.parse(JSON.stringify(INITIAL_CUSTOMERS)));
const backup = JSON.stringify(createBackup(state));
assert.deepEqual(JSON.parse(JSON.stringify(parseBackup(JSON.parse(backup)))), JSON.parse(JSON.stringify(state)));
fs.writeFileSync('audit/browser-cycle-backup.local.json', backup);
const evidence = {
  environment: 'Disposable local PostgreSQL; no production writes',
  verifiedAt: new Date().toISOString(), version: row.version,
  purchase: {amount:360, rawBefore:INITIAL_ITEMS.find((i) => i.id === raw.id).stock, rawAfterPurchase:43.5},
  production: {quantity:10, cost:3940, rawAfterProduction:raw.stock},
  sale: {quantity:0.25, amount:135, cost:98.5, profit:36.5, blendFinalStock:blend.stock, customerAccountsUnchanged:true},
  backup: {restoredAndMatched:true, sha256:crypto.createHash('sha256').update(backup).digest('hex')},
};
fs.writeFileSync('audit/browser-cycle-results.json', JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
