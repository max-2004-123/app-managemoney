/* =========================================================
   app.js — Credit Card Expense Tracker (MANGA EDITION)
   =========================================================
   替換此處的 API_URL 為你的 Apps Script Web App 網址
   Replace API_URL with your Apps Script Web App URL
   ========================================================= */
const API_BASE_URL = 'https://script.google.com/macros/s/AKfycbwD9LJiNBUlWzERwUWUBHebDwM-yS_chjhf8K_fAsEYPoDm0Gx78PNqJlRkf93bIUfx/exec';
const API_KEY = 'sk_7fA9xK3LmP2Qz8RwYvT6N1cB';
const API_POST_URL = `${API_BASE_URL}?key=${API_KEY}`;

function buildMonthParam(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function buildGetUrl(year, month, limit = 100) {
  const url = new URL(API_BASE_URL);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('month', buildMonthParam(year, month));
  return url.toString();
}
/* =========================================================
   Mock data for development (used when API_URL is default)
   ========================================================= */
const MOCK_DATA = {
  ok: true,
  total_count: 8,
  total_amount: 6936,
  count: 8,
  data: [
    { email_id: 'm1', created_at: '2026-04-14 09:00:00', txn_date: '2026-04-14 08:30:00', bank: '國泰世華', card: '****1234', merchant: 'Uber Eats', amount: 325, currency: 'TWD', type: 'expense' },
    { email_id: 'm2', created_at: '2026-04-13 14:22:00', txn_date: '2026-04-13 14:10:00', bank: '玉山銀行', card: '****5678', merchant: 'PX Mart 全聯福利中心', amount: 1028, currency: 'TWD', type: 'expense' },
    { email_id: 'm3', created_at: '2026-04-12 20:05:00', txn_date: '2026-04-12 19:55:00', bank: '國泰世華', card: '****1234', merchant: 'Netflix', amount: 270, currency: 'TWD', type: 'expense' },
    { email_id: 'm4', created_at: '2026-04-11 12:34:00', txn_date: '2026-04-11 12:20:00', bank: '中信銀行', card: '****9012', merchant: 'Family Mart 全家便利商店', amount: 145, currency: 'TWD', type: 'expense' },
    { email_id: 'm5', created_at: '2026-04-10 09:00:00', txn_date: '2026-04-10 08:50:00', bank: '玉山銀行', card: '****5678', merchant: 'ibon 繳費', amount: 500, currency: 'TWD', type: 'expense' },
    { email_id: 'm6', created_at: '2026-04-09 18:40:00', txn_date: '2026-04-09 18:30:00', bank: '國泰世華', card: '****1234', merchant: '麥當勞 McDonald\'s', amount: 198, currency: 'TWD', type: 'expense' },
    { email_id: 'm7', created_at: '2026-04-08 11:00:00', txn_date: '2026-04-08 10:55:00', bank: '中信銀行', card: '****9012', merchant: 'Costco 好市多', amount: 3890, currency: 'TWD', type: 'expense' },
    { email_id: 'm8', created_at: '2026-04-07 22:10:00', txn_date: '2026-04-07 22:05:00', bank: '玉山銀行', card: '****5678', merchant: 'Steam 遊戲儲值', amount: 560, currency: 'TWD', type: 'expense' },
  ]
};

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
  loading: false,
  editingTxnIndex: -1, // Currently editing transaction index in state.allData
  selectedIcon: null,  // Currently selected custom icon in modal
  DEBUG_MODE: false,    // [DEBUG] Set to true to bypass filters and show raw data
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

async function saveEdit() {
  const index = state.editingTxnIndex;
  if (index === -1) return;

  const merchant = els.editMerchant.value.trim();
  const amount = parseFloat(els.editAmount.value);
  const note = els.editNote.value.trim();

  if (!merchant) { showError('請輸入店家名稱'); return; }
  if (isNaN(amount)) { showError('請輸入有效金額'); return; }

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
    console.log('[App] Saving transaction to backend...', txnToUpdate.email_id);
    const result = await saveTransactionEdit(txnToUpdate);

    if (result && result.ok && result.data) {
      // 3. Update state with AUTHORITATIVE data from backend
      updateTransactionInState(result.data);
      console.log('[App] Local state updated with backend result.');
    } else {
      // Fallback: If no data returned but OK, just use what we have locally
      state.allData[index] = txnToUpdate;
    }

    render();
    closeEditModal();
  } catch (err) {
    console.error('[saveEdit] Failed:', err);
    showError('儲存失敗：' + err.message);
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
  // If it's a mock URL, simulate a successful update
  if (isDefaultUrl(API_POST_URL)) {
    console.log('[Mock API] Simulating POST success...');
    await new Promise(r => setTimeout(r, 800));
    return { ok: true, data: txn };
  }

  try {
    const requestUrl = buildGetUrl(state.year, state.month, 100);

    const res = await fetch(requestUrl, {
      method: 'POST',
      body: JSON.stringify({
        email_id: txn.email_id,
        merchant: txn.merchant,
        amount: txn.amount,
        note: txn.note,
        custom_icon: txn.custom_icon
      })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // GAS often returns HTML sometimes, handle carefully
    const text = await res.text();
    console.log('[API raw response]', text);

    let result;
    try {
      result = JSON.parse(text);
    } catch (e) {
      throw new Error('API 回傳格式錯誤 (非 JSON)');
    }

    if (!result.ok) {
      throw new Error(result.error || '後端更新失敗');
    }

    return result;
  } catch (err) {
    console.error('[API POST] failed:', err);
    throw err;
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
function renderSummary() {
  const amount = state.totalAmount || 0;
  const count = state.totalCount || 0;

  els.totalAmount.textContent = `$${amount.toLocaleString('zh-TW')}`;
  els.totalCount.textContent = `${count} 筆`;
  els.lastSync.textContent = formatSyncTime(state.lastSync);
}

function renderTransactionItem(item, originalIndex) {
  const icon = getMerchantIcon(item);
  const amountCls = getAmountClass(item?.type || 'expense');
  const amountStr = formatAmount(item);
  const category = item?.category || getCategory(item?.merchant || '');

  return `
    <div class="txn-card anim-slide-up">
      <!-- 左側：圖示區 -->
      <div class="txn-icon-wrap">
        <div class="txn-icon">${icon}</div>
      </div>

      <!-- 中間：資訊區 -->
      <div class="txn-info-wrap">
        <div class="txn-merchant">${item?.merchant || '未辨識店家'}</div>
        <div class="txn-meta">
          <span class="meta-item txn-date">${formatTxnDate(item?.txn_date || item?.created_at)}</span>
          <span class="meta-dot"></span>
          <span class="meta-item txn-bank">${item?.bank || ''} ${item?.card || ''}</span>
          <span class="meta-dot"></span>
          <span class="txn-category">${category}</span>
          <span class="txn-type-label ${amountCls}">${item?.type === 'refund' ? '退款' : '支出'}</span>
        </div>
        ${item?.note ? `
          <div class="txn-note-row">
            <span class="txn-note">${item.note}</span>
          </div>
        ` : ''}
      </div>

      <!-- 右側：金額區 -->
      <div class="txn-amount-wrap">
        <div class="txn-amount ${amountCls}">${amountStr}</div>
        <div class="txn-currency">${item?.currency || 'TWD'}</div>
      </div>

      <!-- 操作區 -->
      <div class="txn-action-wrap">
        <button class="btn-txn-edit" onclick="openEditModal(${originalIndex})" title="編輯">🖋️</button>
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
        [${i}] ${item.txn_date || '??-??'} | <b>${item.merchant || '(無店家)'}</b> | 
        ${item.amount !== undefined ? '$' + item.amount : '(無金額)'} | 
        ${item.category || '(無分類)'}
      </div>
    `).join('');
  } else {
    els.debugRawList.innerHTML = '<div style="color:red;">No data loaded from API.</div>';
  }
}

function render() {
  els.monthLabel.textContent = formatMonthLabel(state.year, state.month);

  // [DEBUG] Bypass month filter if DEBUG_MODE is on
  let filtered;
  if (state.DEBUG_MODE) {
    console.warn('[DEBUG] Month filtering is currently bypassed.');
    filtered = state.allData;
  } else {
    filtered = filterByMonth(state.allData, state.year, state.month);
  }

  // Update debugging view
  renderDebugView(state.allData);

  renderSummary();
  renderTxnList(filtered);
}

/* =========================================================
   API / Data loading
   ========================================================= */
const isDefaultUrl = url => !url || url.includes('replace-with-your-own-key');

async function fetchData() {
  if (state.loading) return;
  state.loading = true;

  setLoading(true);
  if (els.debugStatus) els.debugStatus.textContent = 'Status: Fetching from API...';

  try {
    let json;
    const requestUrl = buildGetUrl(state.year, state.month, 100);

    console.group('🚀 API Fetching Debug');
    console.log('API request URL:', requestUrl);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(requestUrl, {
        method: 'GET',
        cache: 'no-store',
        redirect: 'follow',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      console.log(`Response Status: ${res.status} ${res.statusText}`);
      console.log(`Final URL: ${res.url}`);
      console.log(`Content-Type: ${res.headers.get('content-type') || '(none)'}`);

      const text = await res.text();
      console.log(`Raw text preview (${text.length} chars):`, text.substring(0, 300));

      try {
        json = JSON.parse(text);
      } catch (parseErr) {
        console.log('================ RAW RESPONSE START ================');
        console.log(text);
        console.log('================ RAW RESPONSE END ==================');

        if (text.trim().toLowerCase().startsWith('<!doctype html>') || text.includes('<html')) {
          throw new Error('API returned HTML instead of JSON. Possible Apps Script auth/permission page.');
        } else if (text.trim() === '') {
          throw new Error('API returned an empty response.');
        } else {
          throw new Error('API returned invalid JSON.');
        }
      }
    } catch (apiErr) {
      console.warn('Live API failed:', apiErr);
      if (apiErr.name === 'AbortError') {
        throw new Error('API request timed out after 10 seconds.');
      }
      throw apiErr;
    }

    console.log('Parsed JSON:', json);
    console.groupEnd();

    if (!json.ok) {
      throw new Error(json.error || 'API returned ok: false');
    }

    state.allData = Array.isArray(json.data) ? json.data : [];
    state.totalCount = Number(json.total_count || 0);
    state.totalAmount = Number(json.total_amount || 0);
    state.lastSync = new Date();

    render();

    if (els.debugStatus) {
      els.debugStatus.textContent = `Status: Loaded ${state.allData.length} rows for ${buildMonthParam(state.year, state.month)}`;
    }
  } catch (err) {
    console.error('[fetchData Error]', err);
    console.groupEnd();
    showError(`載入失敗：${err.message}`);
    if (els.debugStatus) {
      els.debugStatus.textContent = `Status: Error - ${err.message}`;
    }
    render();
  } finally {
    state.loading = false;
    setLoading(false);
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
  state.month--;
  if (state.month < 1) {
    state.month = 12;
    state.year--;
  }
  updateNavButtons();
  fetchData();
}

function goNextMonth() {
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
els.btnPrev.addEventListener('click', () => { goPrevMonth(); });
els.btnNext.addEventListener('click', () => { goNextMonth(); });

// Modal Listeners
els.btnClose.addEventListener('click', closeEditModal);
els.btnCancel.addEventListener('click', closeEditModal);
els.btnSave.addEventListener('click', saveEdit);
window.addEventListener('click', (e) => {
  if (e.target === els.editModal) closeEditModal();
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
   Init
   ========================================================= */
function init() {
  updateNavButtons();
  initIconGrid();

  if (isDefaultUrl(API_GET_URL)) {
    const notice = document.createElement('div');
    notice.style.cssText = `
      background:#1a1a28; border-bottom:3px solid #000; color:#eab308;
      font-size:11px; padding:8px 16px; text-align:center; font-weight:700;
      font-family:'Noto Sans TC',sans-serif; letter-spacing:0.5px;
    `;
    notice.innerHTML = '⚡ <span style="color:#a855f7">DEMO MODE</span> — 請替換 app.js 中的 API_URL';
    document.body.insertBefore(notice, document.getElementById('app'));
  }

  fetchData();
}

init();
