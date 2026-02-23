function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderExecItem(exec: {
  description: string
  method: string
  endpoint: string
  requestHeaders?: Record<string, string>
  requestBody?: Record<string, unknown>
  responseBody?: Record<string, unknown>
}): string {
  let html = `<li style="margin-bottom:16px;padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">`
  html += `<p style="font-weight:600;color:#1e293b;margin-bottom:8px;">${escapeHtml(exec.description)}</p>`
  html += `<p style="margin-bottom:6px;"><strong>エンドポイント：</strong><code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;font-size:0.8rem;">${escapeHtml(exec.method)} ${escapeHtml(exec.endpoint)}</code></p>`
  if (exec.requestHeaders) {
    html += `<p style="margin-bottom:4px;font-weight:600;color:#475569;">リクエストヘッダー</p>`
    html += `<pre style="margin-top:4px;padding:8px;background:#0f172a;color:#e2e8f0;border-radius:6px;font-size:0.75rem;white-space:pre-wrap;word-break:break-all;">${escapeHtml(JSON.stringify(exec.requestHeaders, null, 2))}</pre>`
  }
  if (exec.requestBody) {
    html += `<p style="margin-bottom:4px;font-weight:600;color:#475569;">リクエストボディ</p>`
    html += `<pre style="margin-top:4px;padding:8px;background:#0f172a;color:#e2e8f0;border-radius:6px;font-size:0.75rem;white-space:pre-wrap;word-break:break-all;">${escapeHtml(JSON.stringify(exec.requestBody, null, 2))}</pre>`
  }
  if (exec.responseBody) {
    html += `<p style="margin-bottom:4px;font-weight:600;color:#475569;">レスポンスボディ</p>`
    html += `<pre style="margin-top:4px;padding:8px;background:#0f172a;color:#e2e8f0;border-radius:6px;font-size:0.75rem;white-space:pre-wrap;word-break:break-all;">${escapeHtml(JSON.stringify(exec.responseBody, null, 2))}</pre>`
  }
  html += `</li>`
  return html
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('exchange-refresh-btn')
  const result = document.getElementById('exchange-refresh-result')
  const logDiv = document.getElementById('refresh-exec-log')
  if (!btn || !result) return

  btn.addEventListener('click', async () => {
    btn.setAttribute('disabled', 'true')
    result.textContent = '取得中...'
    result.style.display = 'block'

    try {
      const res = await fetch('/exchange-refresh', { method: 'POST' })
      const data = await res.json() as { success: boolean; execInfo?: typeof Object; error?: string }
      if (data.success && data.execInfo && logDiv) {
        result.style.display = 'none'
        logDiv.innerHTML = `<ol style="padding-left:16px;color:#64748b;">${renderExecItem(data.execInfo as any)}</ol>`
      } else {
        result.textContent = `エラー: ${(data as any).error ?? '不明なエラー'}`
      }
    } catch (err) {
      result.textContent = `エラー: ${String(err)}`
    } finally {
      btn.removeAttribute('disabled')
    }
  })
})
