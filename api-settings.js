/* Browser-local API configuration. */
const apiStorageKey = 'expense-tracker-api:' + location.pathname;
let apiSettings = { url: '', key: '' };
try {
  const saved = JSON.parse(localStorage.getItem(apiStorageKey));
  if (saved && typeof saved.url === 'string' && typeof saved.key === 'string') {
    const url = new URL(saved.url);
    if (['https:', 'http:'].includes(url.protocol)) apiSettings = saved;
  }
} catch (_) { /* First visit or unavailable storage: show setup. */ }

let apiSettingsTesting = false;
const apiDialog = document.createElement('dialog');
apiDialog.addEventListener('cancel', event => { if (apiSettingsTesting) event.preventDefault(); });
apiDialog.className = 'api-settings-dialog';
apiDialog.innerHTML = `
  <form id="api-settings-form">
    <h2 id="api-settings-title">API 設定</h2>
    <p>輸入你的 Apps Script Web App 網址與 API Key。</p>
    <label for="api-url">API 網址</label>
    <input id="api-url" type="url" required placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off">
    <label for="api-key">API Key（選填）</label>
    <input id="api-key" type="password" autocomplete="off" placeholder="後端需要驗證時填寫">
    <p class="api-settings-hint">設定只儲存在目前瀏覽器，清除瀏覽器資料後需重新輸入。Key 會保存在此裝置，請使用信任的裝置。</p>
    <p id="api-settings-error" role="alert"></p>
    <div class="api-settings-actions">
      <button type="button" id="api-settings-cancel">取消</button>
      <button type="submit">儲存並連線</button>
    </div>
  </form>`;
apiDialog.setAttribute('aria-labelledby', 'api-settings-title');
document.body.appendChild(apiDialog);
const apiButton = document.createElement('button');
apiButton.type = 'button';
apiButton.className = 'api-settings-button';
apiButton.textContent = '⚙ API 設定';
document.querySelector('.app-header').appendChild(apiButton);
function openApiSettings() {
  if (apiSettingsTesting) return;
  document.getElementById('api-url').value = apiSettings.url;
  document.getElementById('api-key').value = apiSettings.key;
  document.getElementById('api-settings-error').textContent = '';
  if (!apiDialog.open) apiDialog.showModal();
}
apiButton.addEventListener('click', openApiSettings);
document.getElementById('api-settings-cancel').addEventListener('click', () => { if (!apiSettingsTesting) apiDialog.close(); });
document.getElementById('api-settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (apiSettingsTesting) return;
  const error = document.getElementById('api-settings-error');
  let url;
  try {
    url = new URL(document.getElementById('api-url').value.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error();
  } catch (_) {
    error.textContent = '請輸入有效的 HTTP 或 HTTPS API 網址。';
    return;
  }
  const key = document.getElementById('api-key').value.trim() || url.searchParams.get('key') || '';
  url.searchParams.delete('key');
  url.hash = '';
  const submit = event.target.querySelector('button[type=submit]');
  apiSettingsTesting = true;
  submit.disabled = true;
  submit.textContent = '測試連線中…';
  error.textContent = '';
  try {
    const probe = new URL(url);
    if (key) probe.searchParams.set('key', key);
    const now = new Date();
    probe.searchParams.set('month', `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    probe.searchParams.set('limit', '1');
    const result = await requestApi(probe.toString(), { cache: 'no-store' });
    if (!Array.isArray(result.data)) throw new Error('API 缺少交易清單 data');
  } catch (err) {
    error.textContent = `連線失敗：${err.message}。原設定已保留。`;
    apiSettingsTesting = false;
    submit.disabled = false;
    submit.textContent = '儲存並連線';
    return;
  }
  try {
    localStorage.setItem(apiStorageKey, JSON.stringify({ url: url.toString(), key }));
  } catch (_) {
    error.textContent = '瀏覽器無法儲存設定，請允許網站儲存資料後再試。';
    apiSettingsTesting = false;
    submit.disabled = false;
    submit.textContent = '儲存並連線';
    return;
  }
  location.reload();
});
