/* =========================================================
   app.js — Credit Card Expense Tracker (MANGA EDITION)
   =========================================================
   API settings are entered in the settings dialog.
   ========================================================= */
const API_BASE_URL = apiSettings.url;
const API_KEY = apiSettings.key;

function buildMonthParam(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function buildGetUrl(year, month, limit = 100) {
  const url = new URL(API_BASE_URL);
  if (API_KEY) url.searchParams.set('key', API_KEY);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('month', buildMonthParam(year, month));
  return url.toString();
}
/* =========================================================
   State
   ========================================================= */
let state = {
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  allData: [],
  totalCount: 0,
  totalAmount: 0,
  lastSync: null,
  incomplete: false,
  syncFailed: false,
  dailySummaries: [],
  loading: false,
  editingTxnIndex: -1, // Currently editing transaction index in state.allData
  selectedIcon: null,  // Currently selected custom icon in modal
  DEBUG_MODE: false,    // [DEBUG] Set to true to bypass filters and show raw data
  // Filter states
  selectedCategory: 'ALL',
  selectedType: 'ALL',
  searchKeyword: '',
};

const ICON_OPTIONS = [
  { id: 'default-card', icon: '💳' },
  { id: 'seven', icon: '<div class="brand-icon seven-eleven"><span></span><span></span><span></span></div>' },
  { id: 'familymart', icon: '<div class="brand-icon familymart"><span></span><span></span><span></span></div>' },
  { id: 'supermarket', icon: '🛒' },
  { id: 'food', icon: '☕' },
  { id: 'delivery', icon: '🛵' },
  { id: 'transport', icon: '🅿️' },
  { id: 'shopping', icon: '📦' },
  { id: 'subscription', icon: '🎬' },
  { id: 'game', icon: '🎮' },
  { id: 'health', icon: '🏥' },
  { id: 'bill', icon: '🧾' },
];

/* =========================================================
   DOM References
   ========================================================= */
const $ = id => document.getElementById(id);
const els = {
  monthLabel: $('month-label'),
  btnPrev: $('btn-prev-month'),
  btnNext: $('btn-next-month'),
  btnRefresh: $('btn-refresh'),
  refreshIcon: $('refresh-icon'),
  totalAmount: $('total-amount'),
  totalCount: $('total-count'),
  lastSync: $('last-sync'),
  txnList: $('txn-list'),
  txnStatus: $('txn-status'),
  statusMessage: $('status-message'),
  statusSub: $('status-sub'),
  loadingOverlay: $('loading-overlay'),
  errorToast: $('error-toast'),
  errorMsg: $('error-msg'),
  // Modal refs
  editModal: $('edit-modal'),
  editMerchant: $('edit-merchant'),
  editAmount: $('edit-amount'),
  editNote: $('edit-note'),
  iconGrid: $('icon-grid'),
  iconPreview: $('modal-icon-preview'), // Added for real-time preview
  btnSave: $('btn-edit-save'),
  btnCancel: $('btn-edit-cancel'),
  btnClose: $('btn-modal-close'),
  // Debug refs
  debugStatus: $('debug-status'),
  debugCount: $('debug-count'),
  debugRawList: $('debug-raw-list'),
  // Filter refs
  filterCategory: $('filter-category'),
  filterType: $('filter-type'),
  filterKeyword: $('filter-keyword'),
  // Add refs
  btnAddTxn: $('btn-add-txn'),
  addModal: $('add-modal'),
  addMerchant: $('add-merchant'),
  addAmount: $('add-amount'),
  addDate: $('add-date'),
  addCategory: $('add-category'),
  addNote: $('add-note'),
  btnAddSave: $('btn-add-save'),
  btnAddCancel: $('btn-add-cancel'),
  btnAddClose: $('btn-add-close'),
};

/* =========================================================
   Merchant Configuration (Expandable Mapping)
   ========================================================= */
const MERCHANT_CONFIG = [
  // 7-11 / 統一超商 (專屬三色條紋 Icon)
  {
    pattern: /7-11|711|統一超商/i,
    label: '購物',
    icon: '<div class="brand-icon seven-eleven" aria-label="7-11"><span></span><span></span><span></span></div>'
  },
  // FamilyMart / 全盈 Pay (專屬三色條紋 Icon，視為全家系列)
  {
    pattern: /全家|FamilyMart|全盈|全盈pay|全盈\+PAY/i,
    label: '購物',
    icon: '<div class="brand-icon familymart" aria-label="FamilyMart"><span></span><span></span><span></span></div>'
  },
  { pattern: /uber eats|foodpanda|外送/i, label: '外送', icon: '🛵' },
  { pattern: /netflix|disney|youtube|串流|spotify/i, label: '訂閱', icon: '🎬' },
  { pattern: /steam|遊戲|game|xbox|playstation/i, label: '娛樂', icon: '🎮' },
  { pattern: /全聯|px mart|carrefour|costco|好市多|家樂福|超市/i, label: '購物', icon: '🛒' },
  { pattern: /麥當勞|McDonald|kfc|漢堡|burger|pizza|coco|飲料|珍珠|茶|咖啡|coffee|starbucks/i, label: '餐飲', icon: '☕' },
  { pattern: /加油|油站|shell|台塑|cpc/i, label: '交通', icon: '⛽' },
  { pattern: /amazon|momo|蝦皮|shopee|pchome|博客來/i, label: '網購', icon: '📦' },
  { pattern: /停車|parking|uber(?! eats)|taxi|計程|捷運|高鐵/i, label: '交通', icon: '🅿️' },
  { pattern: /醫院|診所|藥局|醫療/i, label: '醫療', icon: '🏥' },
  { pattern: /ibon|繳費|水費|電費|瓦斯|帳單/i, label: '帳單', icon: '🧾' },
  { pattern: /健身|gym|wellness/i, label: '運動', icon: '💪' },
];

function getMerchantConfig(merchant) {
  for (const config of MERCHANT_CONFIG) {
    if (config.pattern.test(merchant)) return config;
  }
  return { label: '消費', icon: '💳' };
}

function getMerchantIcon(item) {
  // 1. Priority: Custom selected icon
  if (item.custom_icon) {
    const opt = ICON_OPTIONS.find(o => o.id === item.custom_icon);
    if (opt) return opt.icon;
  }

  // 2. Priority: Merchant pattern mapping
  return getMerchantConfig(item.merchant || '').icon;
}

function getCategory(merchant) {
  return getMerchantConfig(merchant).label;
}

/* =========================================================
   Format helpers
   ========================================================= */
function getAmountClass(type) {
  if (type === 'income') return 'income';
  if (type === 'refund') return 'refund';
  return 'expense';
}

function formatTxnDate(dateStr) {
  if (!dateStr) return '(無日期)';
  const normalizedDate = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T');
  const d = new Date(normalizedDate);
  if (isNaN(d.getTime())) return dateStr || '(格式錯誤)';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}

function formatSyncTime(date) {
  if (!date) return '—';
  const d = new Date(date);
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mi}:${ss}`;
}

function formatMonthLabel(year, month) {
  return `${year}年${month}月`;
}

function formatAmount(item) {
  const amount = Number(item.amount || 0);
  const formatted = Math.abs(amount).toLocaleString('zh-TW');
  const sign = item.type === 'refund' ? '+' : '-';
  return `${sign}$${formatted}`;
}

/* =========================================================
   Modal Actions
   ========================================================= */
function initIconGrid() {
  els.iconGrid.innerHTML = ICON_OPTIONS.map(opt => `
    <div class="icon-opt" data-id="${opt.id}" title="${opt.id}">${opt.icon}</div>
  `).join('');

  els.iconGrid.querySelectorAll('.icon-opt').forEach(el => {
    el.addEventListener('click', () => {
      els.iconGrid.querySelectorAll('.icon-opt').forEach(i => i.classList.remove('selected'));
      el.classList.add('selected');
      state.selectedIcon = el.dataset.id;

      // Real-time preview update
      els.iconPreview.innerHTML = el.innerHTML;
    });
  });
}

function openEditModal(txnIndex) {
  const txn = state.allData[txnIndex];
  if (!txn) return;

  state.editingTxnIndex = txnIndex;
  state.selectedIcon = txn.custom_icon || null;

  els.editMerchant.value = txn.merchant || '';
  els.editAmount.value = txn.amount || '';
  els.editNote.value = txn.note || '';

  // Reset icon selection and preview
  els.iconGrid.querySelectorAll('.icon-opt').forEach(el => {
    const isSelected = el.dataset.id === state.selectedIcon;
    el.classList.toggle('selected', isSelected);
    if (isSelected) els.iconPreview.innerHTML = el.innerHTML;
  });

  if (!state.selectedIcon) els.iconPreview.innerHTML = '❓';

  els.editModal.classList.remove('hidden');
}

function closeEditModal() {
  els.editModal.classList.add('hidden');
  state.editingTxnIndex = -1;
  state.selectedIcon = null;
}

function openAddModal() {
  els.addMerchant.value = '';
  els.addAmount.value = '';
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  els.addDate.value = now.toISOString().slice(0, 16);
  els.addCategory.value = '餐飲';
  els.addNote.value = '';
  els.addModal.classList.remove('hidden');
}

function closeAddModal() {
  els.addModal.classList.add('hidden');
}

async function saveEdit() {
  const index = state.editingTxnIndex;
  if (index === -1) return;

  const merchant = els.editMerchant.value.trim();
  const amount = parseFloat(els.editAmount.value);
  const note = els.editNote.value.trim();

  if (!merchant) { showError('請輸入店家名稱'); return; }
  if (!Number.isFinite(amount)) { showError('請輸入有效金額'); return; }

  // UI Feedback: Loading state
  const originalBtnText = els.btnSave.textContent;
  els.btnSave.textContent = 'SAVING...';
  els.btnSave.classList.add('loading');
  els.btnSave.disabled = true;

  try {
    const txnToUpdate = {
      ...state.allData[index],
      merchant,
      amount,
      note,
      custom_icon: state.selectedIcon
    };

    // Background API call
    await saveTransactionEdit(txnToUpdate);

    closeEditModal();
    await fetchData();
  } catch (err) {
    console.error('[saveEdit] Failed:', err);
    await fetchData();
    showError('儲存結果待確認：' + err.message + '。已嘗試同步，請核對紀錄後再操作。');
  } finally {
    // Reset button state
    els.btnSave.textContent = originalBtnText;
    els.btnSave.classList.remove('loading');
    els.btnSave.disabled = false;
  }
}

/**
 * Update a single transaction in state.allData using email_id
 */
function updateTransactionInState(updatedItem) {
  if (!updatedItem || !updatedItem.email_id) return;
  const idx = state.allData.findIndex(t => t.email_id === updatedItem.email_id);
  if (idx !== -1) {
    state.allData[idx] = { ...state.allData[idx], ...updatedItem };
  }
}

/**
 * Official save function: POST to Google Apps Script
 */
async function saveTransactionEdit(txn) {
  if (!API_BASE_URL) { openApiSettings(); throw new Error('請先設定 API'); }
  return requestApi(buildGetUrl(state.year, state.month), {
    method: 'POST',
    body: JSON.stringify({ email_id: txn.email_id, merchant: txn.merchant,
      amount: txn.amount, note: txn.note, custom_icon: txn.custom_icon })
  });
}

async function saveAddTransaction() {
  if (!API_BASE_URL) { openApiSettings(); return; }
  const merchant = els.addMerchant.value.trim();
  const amount = parseFloat(els.addAmount.value);
  const dateStr = els.addDate.value;
  const category = els.addCategory.value;
  const note = els.addNote.value.trim();

  if (!merchant) { showError('請輸入店家名稱'); return; }
  if (!Number.isFinite(amount)) { showError('請輸入有效金額'); return; }
  if (!dateStr) { showError('請選擇日期時間'); return; }

  const d = new Date(dateStr);
  if (!Number.isFinite(d.getTime())) { showError('請輸入有效日期'); return; }
  const formattedDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;

  const newTxn = {
    email_id: 'manual_' + Date.now(),
    merchant,
    amount,
    txn_date: formattedDate,
    category,
    note,
    type: 'expense'
  };

  const originalBtnText = els.btnAddSave.textContent;
  els.btnAddSave.textContent = 'SAVING...';
  els.btnAddSave.classList.add('loading');
  els.btnAddSave.disabled = true;

  try {
    await requestApi(buildGetUrl(state.year, state.month), {
      method: 'POST', body: JSON.stringify(newTxn)
    });

    closeAddModal();
    await fetchData(); // 成功後重新讀取
  } catch (err) {
    console.error('[saveAddTransaction] failed:', err);
    await fetchData();
    showError('新增結果待確認：' + err.message + '。已嘗試同步，請核對紀錄，避免重複新增。');
  } finally {
    els.btnAddSave.textContent = originalBtnText;
    els.btnAddSave.classList.remove('loading');
    els.btnAddSave.disabled = false;
  }
}

/* =========================================================
   Filtering by month
   ========================================================= */
function filterByMonth(data, year, month) {
  return data.filter(txn => {
    const d = new Date((txn.txn_date || txn.created_at || '').replace(' ', 'T'));
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  });
}

/* =========================================================
   Render
   ========================================================= */
function renderSummary(filtered) {
  let count = 0;
  let amount = 0;

  if (state.selectedCategory === 'ALL' && state.selectedType === 'ALL' && !state.searchKeyword) {
    count = state.totalCount || 0;
    amount = state.totalAmount || 0;
  } else {
    count = filtered.length;
    amount = filtered.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }

  els.totalAmount.textContent = `$${amount.toLocaleString('zh-TW')}`;
  els.totalCount.textContent = `${count} 筆`;
  els.lastSync.textContent = formatSyncTime(state.lastSync);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function renderTransactionItem(item, originalIndex) {
  const icon = getMerchantIcon(item);
  const amountCls = getAmountClass(item?.type || 'expense');
  const amountStr = formatAmount(item);
  const category = item?.category || getCategory(item?.merchant || '');

  return `
    <div class="txn-card anim-slide-up" data-index="${originalIndex}">
      <!-- 左側：圖示區 (固定寬度) -->
      <div class="txn-left">
        <div class="txn-icon">${icon}</div>
      </div>

      <!-- 中間：資訊區 (彈性寬度) -->
      <div class="txn-center">
        <div class="txn-merchant">${escapeHtml(item?.merchant || '未辨識店家')}</div>
        <div class="txn-meta">
          <span class="txn-date">${escapeHtml(formatTxnDate(item?.txn_date || item?.created_at))}</span>
          <span class="txn-category">${escapeHtml(category)}</span>
          <span class="txn-type-label ${amountCls}">${item?.type === 'refund' ? '退款' : '支出'}</span>
        </div>
        ${item?.note ? `
          <div class="txn-note-row">
            <span class="txn-note">${escapeHtml(item.note)}</span>
          </div>
        ` : ''}
      </div>

      <!-- 右側：金額與操作區 (固定寬度) -->
      <div class="txn-right-side">
        <div class="txn-amount-group" data-action="quick-edit">
          <div class="txn-amount ${amountCls}">${amountStr}</div>
          <div class="txn-currency">${escapeHtml(item?.currency || 'TWD')}</div>
        </div>
      </div>
    </div>
  `;
}


function renderTxnList(filtered) {
  els.txnList.innerHTML = '';

  if (filtered.length === 0) {
    els.txnStatus.classList.remove('hidden');
    els.statusMessage.textContent = '本月尚無消費紀錄';
    els.statusSub.textContent = 'NO DATA — 切換月份或重新整理';
    return;
  }

  els.txnStatus.classList.add('hidden');

  // We need to keep a reference to the original index in state.allData for editing
  // Map our filtered items to include their original index
  const indexedData = filtered.map(item => ({
    item,
    originalIndex: state.allData.indexOf(item)
  }));

  const sorted = [...indexedData].sort((a, b) => {
    return new Date((b.item.txn_date || b.item.created_at || '').replace(' ', 'T'))
      - new Date((a.item.txn_date || a.item.created_at || '').replace(' ', 'T'));
  });

  sorted.forEach((obj, index) => {
    const li = document.createElement('li');
    li.style.animationDelay = `${index * 0.05}s`;
    li.innerHTML = renderTransactionItem(obj.item, obj.originalIndex);
    els.txnList.appendChild(li);
  });
}

function renderDebugView(data) {
  if (!els.debugStatus) return;
  els.debugStatus.textContent = `Status: ${state.loading ? 'Syncing...' : 'Ready'}`;
  els.debugCount.textContent = `Total Raw Count: ${data.length}`;

  if (data.length > 0) {
    els.debugRawList.innerHTML = data.map((item, i) => `
      <div style="border-bottom: 1px solid #ccc; font-size: 10px; padding: 2px 0;">
        [${i}] ${escapeHtml(item.txn_date || '??-??')} | <b>${escapeHtml(item.merchant || '(無店家)')}</b> | 
        ${escapeHtml(item.amount !== undefined ? '$' + item.amount : '(無金額)')} | 
        ${escapeHtml(item.category || '(無分類)')}
      </div>
    `).join('');
  } else {
    els.debugRawList.innerHTML = '<div style="color:red;">No data loaded from API.</div>';
  }
}

function render() {
  els.monthLabel.textContent = formatMonthLabel(state.year, state.month);

  let filtered = state.DEBUG_MODE ? state.allData : filterByMonth(state.allData, state.year, state.month);

  if (state.selectedCategory !== 'ALL') {
    filtered = filtered.filter(item => {
      const cat = item.category || getCategory(item.merchant || '');
      return cat === state.selectedCategory;
    });
  }

  if (state.selectedType !== 'ALL') {
    filtered = filtered.filter(item => item.type === state.selectedType);
  }

  if (state.searchKeyword.trim() !== '') {
    const kw = state.searchKeyword.trim().toLowerCase();
    filtered = filtered.filter(item => {
      const merchant = (item.merchant || '').toLowerCase();
      const note = (item.note || '').toLowerCase();
      return merchant.includes(kw) || note.includes(kw);
    });
  }

  // Update debugging view
  renderDebugView(state.allData);

  let notice = document.getElementById('data-completeness');
  if (!notice) {
    notice = document.createElement('p');
    notice.id = 'data-completeness';
    notice.setAttribute('role', 'status');
    notice.style.cssText = 'padding:12px;color:#fcd34d;line-height:1.6';
    els.txnList.before(notice);
  }
  notice.textContent = state.syncFailed
    ? '同步失敗：目前顯示的是先前資料，請重新同步確認。'
    : state.incomplete ? `目前只載入 ${state.allData.length} 筆，後端限制回傳數量；搜尋與分類統計僅涵蓋已載入資料。` : '';
  renderSummary(filtered);
  renderDaily();
  renderTxnList(filtered);
}

function dailyTotals(data, date) {
  const totals = Object.create(null);
  for (const item of data) {
    if (String(item.txn_date || item.created_at || '').slice(0, 10) !== date) continue;
    if (item.amount === '' || item.amount == null) continue;
    const amount = Number(item.amount);
    if (!Number.isFinite(amount)) continue;
    const currency = String(item.currency || 'TWD');
    const group = totals[currency] ||= { count: 0, expense: 0, refund: 0, categories: Object.create(null) };
    if (item.type === 'refund') group.refund += amount;
    else if (!item.type || item.type === 'expense') {
      group.count++;
      group.expense += amount;
      const category = item.category || getCategory(item.merchant || '');
      group.categories[category] = (group.categories[category] || 0) + amount;
    }
  }
  return totals;
}

function renderDaily() {
  const input = $('daily-date');
  const month = buildMonthParam(state.year, state.month);
  input.min = month + '-01';
  input.max = month + '-' + String(new Date(state.year, state.month, 0).getDate()).padStart(2, '0');
  if (!input.value || !input.value.startsWith(month)) {
    const now = new Date();
    input.value = month === buildMonthParam(now.getFullYear(), now.getMonth() + 1)
      ? month + '-' + String(now.getDate()).padStart(2, '0') : input.max;
  }
  const totals = dailyTotals(state.allData, input.value);
  const entries = Object.entries(totals);
  const money = n => Number(n.toFixed(2)).toLocaleString('zh-TW');
  $('daily-totals').textContent = entries.length ? entries.map(([currency, g]) =>
    `${currency} 支出 ${money(g.expense)}（${g.count} 筆）${g.refund ? `，退款 ${money(g.refund)}` : ''}`).join('；') : '當日沒有消費紀錄';
  $('daily-categories').textContent = entries.map(([currency, g]) =>
    Object.entries(g.categories).map(([category, amount]) => `${category} ${currency} ${money(amount)}`).join('、')).filter(Boolean).join('；');
  const summary = state.dailySummaries.find(item => item.date === input.value);
  const canonical = value => value && typeof value === 'object'
    ? Object.keys(value).sort().map(key => [key, canonical(value[key])]) : value;
  let current = false;
  try { current = JSON.stringify(canonical(JSON.parse(summary.totals_json))) === JSON.stringify(canonical(totals)); } catch (_) { /* No valid saved snapshot. */ }
  $('daily-analysis').textContent = summary?.analysis && current && !state.incomplete && !state.syncFailed
    ? `AI 分析：${summary.analysis}（${summary.updated_at} 更新）`
    : summary?.analysis && !current ? '交易已有變動，AI 分析將在下次同步時更新' : 'AI 分析尚未產生';
  if (state.incomplete || state.syncFailed) $('daily-totals').textContent += '（資料可能不完整）';
}

/* =========================================================
   API / Data loading
   ========================================================= */

async function fetchData() {
  if (!API_BASE_URL) {
    setLoading(false);
    document.getElementById('loadingScreen')?.classList.add('hidden');
    openApiSettings();
    return;
  }
  if (state.loading) return;
  state.loading = true;

  setLoading(true);
  if (els.debugStatus) els.debugStatus.textContent = 'Status: Fetching from API...';

  try {
    const json = await readMonthData(limit => buildGetUrl(state.year, state.month, limit));
    state.incomplete = json.incomplete;
    state.allData = Array.isArray(json.data) ? json.data : [];
    state.dailySummaries = Array.isArray(json.daily_summaries) ? json.daily_summaries : [];
    state.totalCount = Number(json.total_count || 0);
    state.totalAmount = Number(json.total_amount || 0);
    state.lastSync = new Date();
    state.syncFailed = false;

    render();

    if (els.debugStatus) {
      els.debugStatus.textContent = `Status: Loaded ${state.allData.length} rows for ${buildMonthParam(state.year, state.month)}`;
    }
  } catch (err) {
    state.syncFailed = true;
    console.error('[fetchData Error]', err);

    showError(`載入失敗：${err.message}`);
    if (els.debugStatus) {
      els.debugStatus.textContent = `Status: Error - ${err.message}`;
    }
    render();
  } finally {
    state.loading = false;
    setLoading(false);
    hideLoadingScreen();
  }
}

function hideLoadingScreen() {
  const loadingScreen = document.getElementById('loadingScreen');
  if (loadingScreen) {
    loadingScreen.classList.add('hidden');
  }
}

/* =========================================================
   UI State helpers
   ========================================================= */
function setLoading(on) {
  els.loadingOverlay.classList.toggle('hidden', !on);
  els.refreshIcon.classList.toggle('spinning', on);
  els.btnRefresh.disabled = on;
}

let toastTimer;
function showError(msg) {
  els.errorMsg.textContent = msg;
  els.errorToast.classList.remove('hidden');
  void els.errorToast.offsetWidth;
  els.errorToast.classList.add('show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.errorToast.classList.remove('show');
    setTimeout(() => { els.errorToast.classList.add('hidden'); }, 350);
  }, 4000);
}

/* =========================================================
   Month navigation
   ========================================================= */
function goPrevMonth() {
  if (state.loading) return;
  state.month--;
  if (state.month < 1) {
    state.month = 12;
    state.year--;
  }
  updateNavButtons();
  fetchData();
}

function goNextMonth() {
  if (state.loading) return;
  const now = new Date();
  if (
    state.year > now.getFullYear() ||
    (state.year === now.getFullYear() && state.month >= now.getMonth() + 1)
  ) return;

  state.month++;
  if (state.month > 12) {
    state.month = 1;
    state.year++;
  }

  updateNavButtons();
  fetchData();
}

function updateNavButtons() {
  const now = new Date();
  const isCurrentMonth = state.year === now.getFullYear() && state.month === now.getMonth() + 1;
  els.btnNext.style.opacity = isCurrentMonth ? '0.25' : '1';
  els.btnNext.style.pointerEvents = isCurrentMonth ? 'none' : 'auto';
}

/* =========================================================
   Event Listeners
   ========================================================= */
els.btnRefresh.addEventListener('click', () => { fetchData(); });
$('daily-date').addEventListener('change', renderDaily);
els.btnPrev.addEventListener('click', () => { goPrevMonth(); });
els.btnNext.addEventListener('click', () => { goNextMonth(); });

// Filter Listeners
els.filterCategory.addEventListener('change', (e) => { state.selectedCategory = e.target.value; render(); });
els.filterType.addEventListener('change', (e) => { state.selectedType = e.target.value; render(); });
els.filterKeyword.addEventListener('input', (e) => { state.searchKeyword = e.target.value; render(); });

// Modal Listeners
els.btnClose.addEventListener('click', closeEditModal);
els.btnCancel.addEventListener('click', closeEditModal);
els.btnSave.addEventListener('click', saveEdit);

if (els.btnAddTxn) els.btnAddTxn.addEventListener('click', openAddModal);
if (els.btnAddClose) els.btnAddClose.addEventListener('click', closeAddModal);
if (els.btnAddCancel) els.btnAddCancel.addEventListener('click', closeAddModal);
if (els.btnAddSave) els.btnAddSave.addEventListener('click', saveAddTransaction);

window.addEventListener('click', (e) => {
  if (e.target === els.editModal) closeEditModal();
  if (e.target === els.addModal) closeAddModal();
});

// Pull-to-refresh
let touchStartY = 0;
document.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; }, { passive: true });
document.addEventListener('touchend', e => {
  const diff = e.changedTouches[0].clientY - touchStartY;
  if (diff > 80 && window.scrollY <= 0 && !state.loading) {
    fetchData();
  }
}, { passive: true });

/* =========================================================
   Interaction: Long Press & Quick Edit
   ========================================================= */
let pressTimer = null;

function setupTransactionInteractions() {
  const container = els.txnList;
  if (!container) return;

  const startPress = (e) => {
    const card = e.target.closest('.txn-card');
    if (!card || e.button === 2) return; // 排除右鍵

    // If clicking quick-edit zone, don't start long-press timer
    if (e.target.closest('[data-action="quick-edit"]')) return;

    const index = card.dataset.index;
    card.classList.add('pressing');

    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      card.classList.remove('pressing');
      if (navigator.vibrate) navigator.vibrate(40); // Haptic feedback
      openEditModal(parseInt(index));
      pressTimer = null;
    }, 500);
  };

  const cancelPress = (e) => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
    const card = e.target.closest('.txn-card');
    if (card) card.classList.remove('pressing');
  };

  // Touch handling
  let lastTouchY = 0;
  container.addEventListener('touchstart', (e) => {
    lastTouchY = e.touches[0].clientY;
    startPress(e);
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    const currentY = e.touches[0].clientY;
    if (Math.abs(currentY - lastTouchY) > 10) cancelPress(e); // Cancel on scroll
  }, { passive: true });

  container.addEventListener('touchend', cancelPress);
  container.addEventListener('touchcancel', cancelPress);

  // Mouse handling
  container.addEventListener('mousedown', startPress);
  container.addEventListener('mouseup', cancelPress);
  container.addEventListener('mouseleave', cancelPress);

  // Prevent context menu to ensure long-press works reliably on mobile
  container.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.txn-card')) e.preventDefault();
  });

  // Quick edit on amount click
  container.addEventListener('click', (e) => {
    const quickEdit = e.target.closest('[data-action="quick-edit"]');
    if (quickEdit) {
      e.stopPropagation();
      const card = quickEdit.closest('.txn-card');
      const index = card.dataset.index;
      if (navigator.vibrate) navigator.vibrate(20);
      openEditModal(parseInt(index));
    }
  });
}


/* =========================================================
   Init
   ========================================================= */
function init() {
  updateNavButtons();
  initIconGrid();
  setupTransactionInteractions();




  fetchData();
}

window.onload = () => {
  init();
};
