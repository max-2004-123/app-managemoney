const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const nodes = {};
const node = () => ({ value: '', textContent: '', style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener(type, fn) { this[type] = fn; }, before() {}, setAttribute() {}, querySelectorAll() { return []; } });
const document = { getElementById: id => nodes[id] ||= node(), addEventListener() {}, createElement: node };
let posts = 0, body;
let supports = false;
const context = vm.createContext({
  document, window: { addEventListener() {} }, navigator: {}, URL, console,
  apiSettings: { url: 'https://example.test', key: 'secret' }, openApiSettings() {},
  requestApi: async (_, options, timeout) => { posts++; body = JSON.parse(options.body); assert.equal(timeout, 90000); return { ok: true }; },
  readMonthData: async () => ({ ok: true, data: [], total_count: 0, total_amount: 0, capabilities: supports ? { daily_report_test: true } : {} })
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), context);
(async () => {
  await vm.runInContext('fetchData()', context);
  assert.equal(nodes['daily-test-button'].disabled, true);
  await vm.runInContext('testDailyReport()', context);
  assert.equal(posts, 0);
  supports = true;
  await vm.runInContext('fetchData()', context);
  assert.equal(nodes['daily-test-button'].disabled, false);
  nodes['daily-date'].value = '2026-11-07';
  await vm.runInContext('testDailyReport()', context);
  assert.equal(posts, 1);
  assert.equal(body.action, 'test_daily_report');
  assert.equal(body.date, '2026-11-07');
  assert.match(nodes['daily-test-status'].textContent, /報告已更新/);
  console.log('PASS: old backend cannot receive test action; supported backend receives selected date');
})().catch(error => { console.error(error); process.exitCode = 1; });
