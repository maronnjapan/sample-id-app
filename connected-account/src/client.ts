document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('exchange-refresh-btn')
  const result = document.getElementById('exchange-refresh-result')
  if (!btn || !result) return

  btn.addEventListener('click', async () => {
    btn.setAttribute('disabled', 'true')
    result.textContent = '取得中...'
    result.style.display = 'block'

    try {
      const res = await fetch('/exchange-refresh', { method: 'POST' })
      const data = await res.json() as { success: boolean; refreshResult: string }
      result.textContent = data.refreshResult
    } catch (err) {
      result.textContent = `エラー: ${String(err)}`
    } finally {
      btn.removeAttribute('disabled')
    }
  })
})
