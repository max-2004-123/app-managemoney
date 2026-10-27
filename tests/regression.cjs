const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
const reply = data => ({ ok: true, text: async () => JSON.stringify(data) });
function context(extra = {}) {
  return vm.createContext({ URL, AbortController, setTimeout, clearTimeout, console, ...extra });
}
function fakeDom() {
  const nodes = {};
  const node = () => ({ value: '', textContent: '', style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener(type, fn) { this[type] = fn; }, appendChild() {}, before() {}, setAttribute() {}, querySelectorAll() { return []; }, showModal() { this.open = true; }, close() { this.open = false; } });
  return { nodes, node, document: { createElement: node, body: node(), querySelector: node, addEventListener() {}, getElementById: id => nodes[id] ||= node() } };
}
(async () => {
  for (const name of ['app.js', 'api-client.js', 'api-settings.js']) new vm.Script(source(name));
  let calls = [];
  const c = context({ fetch: async url => {
    const limit = Number(new URL(url).searchParams.get('limit')); calls.push(limit);
    return reply({ ok: true, total_count: 250, data: Array(Math.min(limit, 250)).fill({}) });
  } });
  vm.runInContext(source('api-client.js'), c);
  let result = await vm.runInContext("readMonthData(limit => 'https://example.com/?limit=' + limit)", c);
  assert.equal(result.data.length, 250); assert.equal(result.incomplete, false); assert.deepEqual(calls, [100, 250]);
  c.fetch = async () => reply({ ok: true, total_count: 250, data: Array(100).fill({}) });
  result = await vm.runInContext("readMonthData(limit => 'https://example.com/?limit=' + limit)", c);
  assert.equal(result.incomplete, true);
  c.fetch = async () => ({ ok: false, status: 403, text: async () => '{}' });
  await assert.rejects(vm.runInContext("requestApi('https://example.com')", c), /403/);
  c.fetch = async () => ({ ok: true, text: async () => '<html>Login</html>' });
  await assert.rejects(vm.runInContext("requestApi('https://example.com')", c), /JSON/);
  let cleared = false;
  const timeout = context({ setTimeout: fn => setTimeout(fn, 5), clearTimeout: timer => { cleared = true; clearTimeout(timer); }, fetch: async (_, options) => ({ ok: true, text: () => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error(), { name: 'AbortError' })))) }) });
  vm.runInContext(source('api-client.js'), timeout);
  await assert.rejects(vm.runInContext("requestApi('https://example.com')", timeout), /15/); assert(cleared);
  console.log('PASS: growing limit, server cap, HTTP/JSON errors, body timeout and cleanup');

  const dom = fakeDom();
  const app = context({ document: dom.document, window: { addEventListener() {} }, navigator: {}, apiSettings: { url: 'https://example.com', key: 'a&b' }, requestApi: async () => ({ ok: true }), openApiSettings() {}, readMonthData: async () => ({ ok: true, data: [{ email_id: '1', merchant: '店家', amount: 300, txn_date: '2026-10-01' }], total_amount: 300, total_count: 1 }) });
  vm.runInContext(source('app.js'), app);
  const markup = vm.runInContext(`renderTransactionItem({ merchant: '<img src=x onerror=alert(1)>', note: '<script>x</script>', currency: '<b>TWD</b>', category: '<i>test</i>', txn_date: '<svg onload=x>', amount: 1 }, 0)`, app);
  assert(!markup.includes('<img')); assert(!markup.includes('<script')); assert(!markup.includes('<svg')); assert(markup.includes('&lt;'));
  await vm.runInContext(`state.year=2026; state.month=10; state.allData=[{email_id:'1',amount:100}]; state.editingTxnIndex=0; els.editMerchant.value='店家'; els.editAmount.value='300'; els.editNote.value=''; saveEdit()`, app);
  assert.equal(dom.nodes['total-amount'].textContent, '$300');
  assert.equal(vm.runInContext('state.totalAmount', app), 300);
  assert.equal(new URL(vm.runInContext('buildGetUrl(2026,10)', app)).searchParams.get('key'), 'a&b');
  console.log('PASS: unsafe fields escaped, edit resyncs total, key encoded');

  const ui = fakeDom(); const store = new Map([['expense-tracker-api:/test', JSON.stringify({ url: 'https://old.example', key: 'old' })]]);
  let reloads = 0; let fail = true;
  const settings = context({ document: ui.document, location: { pathname: '/test', reload() { reloads++; } }, localStorage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) }, requestApi: async () => { if (fail) throw new Error('403'); return { ok: true, data: [] }; } });
  vm.runInContext(source('api-settings.js'), settings);
  vm.runInContext('openApiSettings()', settings);
  ui.nodes['api-url'].value = 'https://new.example/exec'; ui.nodes['api-key'].value = 'new';
  const submit = ui.node(); const event = { preventDefault() {}, target: { querySelector: () => submit } };
  await ui.nodes['api-settings-form'].submit(event);
  assert.equal(JSON.parse([...store.values()][0]).key, 'old'); assert.equal(reloads, 0); assert.equal(submit.disabled, false);
  fail = false; await ui.nodes['api-settings-form'].submit(event);
  assert.equal(JSON.parse([...store.values()][0]).key, 'new'); assert.equal(reloads, 1);
  console.log('PASS: failed connection preserves settings; verified connection saves');
})().catch(error => { console.error(error); process.exitCode = 1; });

