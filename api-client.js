/* Shared transport: timeout covers both headers and body. */
async function requestApi(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    let result;
    try { result = JSON.parse(text); }
    catch (_) { throw new Error('API 未回傳 JSON，請確認部署網址與存取權限'); }
    if (!result || result.ok !== true) throw new Error(result?.error || 'API 回報失敗');
    return result;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`連線超過 ${timeoutMs / 1000} 秒，請稍後再試`);
    throw error;
  } finally { clearTimeout(timer); }
}

// The supplied backend only documents limit/month. Grow the limit instead of
// inventing offset/page semantics; report a cap when the server stops expanding.
async function readMonthData(makeUrl) {
  let limit = 100;
  let previousLength = -1;
  while (true) {
    const result = await requestApi(makeUrl(limit), { cache: 'no-store', redirect: 'follow' });
    if (!Array.isArray(result.data)) throw new Error('API 缺少交易清單 data');
    const count = Number(result.total_count);
    const knownTotal = Number.isInteger(count) && count >= result.data.length;
    const complete = knownTotal ? result.data.length >= count : result.data.length < limit;
    if (complete) return { ...result, incomplete: false };
    if (result.data.length <= previousLength || limit >= 10000) return { ...result, incomplete: true };
    previousLength = result.data.length;
    limit = Math.min(10000, Math.max(limit * 2, knownTotal ? count : 0));
  }
}
