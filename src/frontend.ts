/**
 * フロントエンドHTML生成
 *
 * OAuth Token Endpoint Cache-Control検証用のUIを提供する。
 */

export function getFrontendHTML(): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OAuth Token Endpoint Cache-Control 検証</title>
  <style>
    * {
      box-sizing: border-box;
    }

    html, body {
      margin: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      max-width: 1400px;
      margin: 0 auto;
      padding: 10px 20px;
      background-color: #f5f5f5;
      color: #333;
      display: flex;
      flex-direction: column;
    }

    .wrapper {
      height: 80vh;
      overflow: hidden;
      margin-bottom: 20px;
    }

    .main-container {
      display: flex;
      gap: 20px;
      align-items: flex-start;
      flex: 1;
      min-height: 0;
      overflow: hidden;
      height: 100%;
    }

    .left-panel {
      flex: 0 0 340px;
      max-height: 100%;
      overflow-y: auto;
    }

    .right-panel {
      flex: 1;
      min-width: 0;
      max-height: 100%;
      overflow-y: auto;
    }

    @media (max-width: 900px) {
      .main-container {
        flex-direction: column;
        overflow-y: auto;
      }
      .left-panel {
        flex: none;
        width: 100%;
        max-height: none;
        overflow-y: visible;
      }
      .right-panel {
        max-height: none;
        overflow-y: visible;
      }
    }

    h1 {
      color: #1a1a1a;
      border-bottom: 2px solid #007bff;
      padding-bottom: 8px;
      margin: 0 0 15px 0;
      font-size: 1.5em;
      flex-shrink: 0;
    }

    h2 {
      color: #444;
      margin: 0 0 15px 0;
      font-size: 1.2em;
    }

    .description {
      background-color: #e7f3ff;
      border-left: 4px solid #007bff;
      padding: 12px;
      margin-bottom: 15px;
      border-radius: 0 4px 4px 0;
      font-size: 14px;
    }

    .description p {
      margin: 0;
    }

    .form-group {
      margin-bottom: 12px;
    }

    label {
      display: block;
      font-weight: bold;
      margin-bottom: 4px;
      color: #555;
      font-size: 14px;
    }

    select, input[type="number"] {
      width: 100%;
      padding: 6px 8px;
      font-size: 14px;
      border: 1px solid #ccc;
      border-radius: 4px;
      background-color: white;
    }

    select[multiple] {
      height: 70px;
    }

    .radio-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .radio-option {
      display: flex;
      align-items: center;
      padding: 8px 10px;
      border: 2px solid #ddd;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
      font-size: 13px;
    }

    .radio-option:hover {
      border-color: #007bff;
      background-color: #f8f9fa;
    }

    .radio-option input[type="radio"] {
      margin-right: 12px;
      transform: scale(1.2);
    }

    .radio-option.with-cache {
      border-color: #28a745;
    }

    .radio-option.with-cache:hover {
      background-color: #d4edda;
    }

    .radio-option.without-cache {
      border-color: #dc3545;
    }

    .radio-option.without-cache:hover {
      background-color: #f8d7da;
    }

    .radio-option.no-header {
      border-color: #6c757d;
    }

    .radio-option.no-header:hover {
      background-color: #e9ecef;
    }

    button {
      background-color: #007bff;
      color: white;
      padding: 10px 20px;
      font-size: 14px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      width: 100%;
      transition: background-color 0.2s;
    }

    button:hover {
      background-color: #0056b3;
    }

    button:disabled {
      background-color: #6c757d;
      cursor: not-allowed;
    }

    .result {
      margin-top: 0;
      padding: 15px;
      background-color: white;
      border-radius: 6px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .result h3 {
      margin-top: 0;
      color: #333;
    }

    .token-display {
      background-color: #f8f9fa;
      padding: 15px;
      border-radius: 4px;
      word-break: break-all;
      font-family: 'Monaco', 'Consolas', monospace;
      font-size: 12px;
      max-height: 150px;
      overflow-y: auto;
      border: 1px solid #e9ecef;
    }

    .json-display {
      background-color: #272822;
      color: #f8f8f2;
      padding: 15px;
      border-radius: 4px;
      font-family: 'Monaco', 'Consolas', monospace;
      font-size: 13px;
      overflow-x: auto;
      white-space: pre-wrap;
    }

    .highlight {
      background-color: #ffeb3b;
      color: #333;
      padding: 2px 6px;
      border-radius: 3px;
      font-weight: bold;
    }

    .timestamp {
      color: #6c757d;
      font-size: 14px;
      margin-top: 10px;
    }

    .history {
      margin-top: 15px;
    }

    .history h2 {
      font-size: 1em;
      margin-bottom: 8px;
    }

    .history-item {
      background-color: white;
      padding: 10px 12px;
      margin-bottom: 8px;
      border-radius: 6px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border-left: 4px solid #007bff;
      font-size: 13px;
    }

    .history-item.cache-hit {
      border-left-color: #dc3545;
      background-color: #fff5f5;
    }

    .history-item.cache-miss {
      border-left-color: #28a745;
    }

    .history-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }

    .cache-badge {
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: bold;
    }

    .cache-badge.hit {
      background-color: #dc3545;
      color: white;
    }

    .cache-badge.miss {
      background-color: #28a745;
      color: white;
    }

    .accordion {
      background-color: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 6px;
      margin-bottom: 12px;
      overflow: hidden;
    }

    .accordion-header {
      background-color: #fff3cd;
      padding: 8px 12px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      user-select: none;
    }

    .accordion-header:hover {
      background-color: #ffe69c;
    }

    .accordion-header h3 {
      margin: 0;
      color: #856404;
      font-size: 16px;
    }

    .accordion-icon {
      color: #856404;
      font-size: 12px;
      transition: transform 0.2s;
    }

    .accordion.open .accordion-icon {
      transform: rotate(180deg);
    }

    .accordion-content {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease-out;
      background-color: #fffbeb;
    }

    .accordion.open .accordion-content {
      max-height: 500px;
    }

    .accordion-inner {
      padding: 15px;
      border-top: 1px solid #ffc107;
    }

    .accordion-inner p {
      margin: 0 0 8px 0;
      color: #856404;
    }

    .accordion-inner ol {
      margin: 0 0 15px 0;
      padding-left: 20px;
      color: #856404;
      font-size: 14px;
    }

    .accordion-inner ol:last-child {
      margin-bottom: 0;
    }

    .accordion-token {
      background-color: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 4px;
      margin-bottom: 15px;
    }

    .accordion-token .accordion-header {
      background-color: #f8f9fa;
      padding: 8px 12px;
    }

    .accordion-token .accordion-header:hover {
      background-color: #e9ecef;
    }

    .accordion-token .accordion-header h4 {
      margin: 0;
      color: #495057;
      font-size: 14px;
    }

    .accordion-token .accordion-icon {
      color: #495057;
    }

    .accordion-token .accordion-content {
      background-color: #fff;
    }

    .accordion-token .accordion-inner {
      padding: 10px 12px;
      border-top: 1px solid #dee2e6;
    }

    .clear-btn {
      background-color: #6c757d;
      margin-top: 10px;
    }

    .clear-btn:hover {
      background-color: #5a6268;
    }
  </style>
</head>
<body>
  <h1>OAuth Token Endpoint Cache-Control 検証</h1>

  <div class="wrapper">
    <div class="main-container">
    <div class="left-panel">
      <h2>トークン取得設定</h2>

      <div class="form-group">
        <label for="scope">スコープ（複数選択可）</label>
        <select id="scope" multiple>
          <option value="read" selected>read</option>
          <option value="write">write</option>
          <option value="admin">admin</option>
        </select>
        <small style="color: #6c757d;">Ctrl/Cmdキーを押しながらクリックで複数選択</small>
      </div>

      <div class="form-group">
        <label for="expires_in">有効期限（秒）</label>
        <input type="number" id="expires_in" value="60" min="1" max="3600">
      </div>

      <div class="form-group">
        <label>エンドポイント選択</label>
        <div class="radio-group">
          <label class="radio-option with-cache">
            <input type="radio" name="endpoint" value="no-store-get">
            <div>
              <strong>no-store あり（GET）</strong>
              <br><small style="color: #28a745;">✓ キャッシュされない</small>
            </div>
          </label>
          <label class="radio-option with-cache">
            <input type="radio" name="endpoint" value="no-store-post" checked>
            <div>
              <strong>no-store あり（POST）</strong>
              <br><small style="color: #28a745;">✓ キャッシュされない</small>
            </div>
          </label>
          <label class="radio-option without-cache">
            <input type="radio" name="endpoint" value="max-age-get">
            <div>
              <strong>max-age あり（GET）</strong>
              <br><small style="color: #dc3545;">✗ キャッシュされる（60秒）</small>
            </div>
          </label>
          <label class="radio-option without-cache">
            <input type="radio" name="endpoint" value="max-age-post">
            <div>
              <strong>max-age あり（POST）</strong>
              <br><small style="color: #6c757d;">△ POSTはデフォルトでキャッシュされない</small>
            </div>
          </label>
          <label class="radio-option no-header">
            <input type="radio" name="endpoint" value="no-header-get">
            <div>
              <strong>Cache-Control なし（GET）</strong>
              <br><small style="color: #6c757d;">? ブラウザ依存</small>
            </div>
          </label>
          <label class="radio-option no-header">
            <input type="radio" name="endpoint" value="no-header-post">
            <div>
              <strong>Cache-Control なし（POST）</strong>
              <br><small style="color: #6c757d;">△ POSTはデフォルトでキャッシュされない</small>
            </div>
          </label>
        </div>
      </div>

      <button id="fetchToken" onclick="fetchToken()">トークンを取得</button>
    </div>

    <div class="right-panel">
      <div id="result" class="result" style="display: none; margin-top: 0;">
        <h3 style="margin-bottom: 5px;">取得結果</h3>
        <div class="timestamp" id="timestamp" style="margin-bottom: 10px;"></div>

        <h4 style="margin: 0 0 8px 0; font-size: 14px;">デコード済みペイロード</h4>
        <div class="json-display" id="decodedPayload" style="margin-bottom: 10px;"></div>

        <div class="accordion accordion-token" id="tokenAccordion">
          <div class="accordion-header" onclick="toggleAccordion('tokenAccordion')">
            <h4>アクセストークン（JWT生データ）</h4>
            <span class="accordion-icon">▼</span>
          </div>
          <div class="accordion-content">
            <div class="accordion-inner">
              <div class="token-display" id="accessToken"></div>
            </div>
          </div>
        </div>
      </div>

      <div id="resultPlaceholder" class="result" style="text-align: center; color: #6c757d; padding: 40px 20px; margin-top: 0;">
        <p style="font-size: 16px; margin: 0 0 5px 0;">← 左のフォームからトークンを取得</p>
        <p style="margin: 0; font-size: 13px;">結果がここに表示されます</p>
      </div>

      <div class="history" id="historySection" style="display: none;">
        <h2>リクエスト履歴 <small style="font-weight: normal; color: #6c757d; font-size: 11px;">同じjti = キャッシュヒット</small></h2>
        <div id="historyList"></div>
        <button class="clear-btn" onclick="clearHistory()" style="padding: 6px 12px; font-size: 12px;">履歴クリア</button>
      </div>
    </div>
  </div>
  </div>
  
        <div class="accordion" id="guideAccordion">
        <div class="accordion-header" onclick="toggleAccordion('guideAccordion')">
          <h3>説明・確認フロー（クリックで展開）</h3>
          <span class="accordion-icon">▼</span>
        </div>
        <div class="accordion-content">
          <div class="accordion-inner">
            <div class="description">
              <p><strong>目的:</strong> RFC 6749で規定されている<code>Cache-Control: no-store</code>ヘッダの重要性を、実際のブラウザキャッシュ動作を通じて体感する。</p>
            </div>
            <p><strong>【no-store あり】</strong></p>
            <ol>
              <li>GET/POST両方でスコープ変更→新しいjti ✓</li>
            </ol>
            <p><strong>【max-age あり - GET】</strong></p>
            <ol>
              <li>スコープ「read」で取得→スコープ「write」で再取得</li>
              <li>→ 同じjtiが返る（キャッシュされる）✗</li>
            </ol>
            <p><strong>【max-age あり - POST】</strong></p>
            <ol>
              <li>スコープ「read」で取得→スコープ「write」で再取得</li>
              <li>→ 新しいjtiが返る（POSTはキャッシュされない）</li>
            </ol>
            <p><strong>【Cache-Control なし】</strong></p>
            <ol>
              <li>GET: ブラウザ依存（キャッシュされる可能性あり）</li>
              <li>POST: デフォルトでキャッシュされない</li>
            </ol>
          </div>
        </div>
      </div>

  <script>
    // アコーディオンのトグル
    function toggleAccordion(id) {
      const accordion = document.getElementById(id);
      accordion.classList.toggle('open');
    }

    // 履歴を保持する配列
    let history = [];
    // 既知のjtiを追跡
    let knownJtis = new Set();

    // Base64URLデコード
    function base64UrlDecode(str) {
      let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) {
        base64 += '=';
      }
      return decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
    }

    // JWTをデコード
    function decodeJWT(token) {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }

      return {
        header: JSON.parse(base64UrlDecode(parts[0])),
        payload: JSON.parse(base64UrlDecode(parts[1])),
      };
    }

    // JSONを整形して強調表示
    function formatJSON(obj, highlightKeys = []) {
      let json = JSON.stringify(obj, null, 2);

      // 強調表示するキーをハイライト
      highlightKeys.forEach(key => {
        const regex = new RegExp(\`("\${key}":\\s*)("[^"]*"|\\d+)\`, 'g');
        json = json.replace(regex, \`$1<span class="highlight">$2</span>\`);
      });

      return json;
    }

    // トークンを取得
    async function fetchToken() {
      const button = document.getElementById('fetchToken');
      button.disabled = true;
      button.textContent = '取得中...';

      try {
        // 選択されたスコープを取得
        const scopeSelect = document.getElementById('scope');
        const selectedScopes = Array.from(scopeSelect.selectedOptions).map(opt => opt.value);
        const scope = selectedScopes.join(' ');

        // 有効期限を取得
        const expiresIn = parseInt(document.getElementById('expires_in').value, 10);

        // エンドポイントを選択
        const endpoint = document.querySelector('input[name="endpoint"]:checked').value;

        let response;
        const params = new URLSearchParams({ scope, expires_in: String(expiresIn) });

        // 6パターンのエンドポイント選択
        switch (endpoint) {
          case 'no-store-get':
            // no-store あり（GET）: キャッシュされない
            response = await fetch(\`/token-with-cache-control?\${params}\`, { method: 'GET' });
            break;
          case 'no-store-post':
            // no-store あり（POST）: キャッシュされない
            response = await fetch('/token-with-cache-control', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ scope, expires_in: expiresIn })
            });
            break;
          case 'max-age-get':
            // max-age あり（GET）: キャッシュされる（問題再現用）
            response = await fetch(\`/token-without-cache-control?\${params}\`, { method: 'GET' });
            break;
          case 'max-age-post':
            // max-age あり（POST）: POSTはデフォルトでキャッシュされない
            response = await fetch('/token-without-cache-control', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ scope, expires_in: expiresIn })
            });
            break;
          case 'no-header-get':
            // Cache-Control なし（GET）: ブラウザ依存
            response = await fetch(\`/token-no-cache-header?\${params}\`, { method: 'GET' });
            break;
          case 'no-header-post':
            // Cache-Control なし（POST）: POSTはデフォルトでキャッシュされない
            response = await fetch('/token-no-cache-header', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ scope, expires_in: expiresIn })
            });
            break;
          default:
            throw new Error('Unknown endpoint: ' + endpoint);
        }

        if (!response.ok) {
          throw new Error(\`HTTP error! status: \${response.status}\`);
        }

        const data = await response.json();
        const now = new Date();

        // JWTをデコード
        const decoded = decodeJWT(data.access_token);

        // キャッシュヒットの検出
        const isCacheHit = knownJtis.has(decoded.payload.jti);
        knownJtis.add(decoded.payload.jti);

        // 結果を表示（プレースホルダーを隠す）
        document.getElementById('resultPlaceholder').style.display = 'none';
        document.getElementById('result').style.display = 'block';
        document.getElementById('timestamp').textContent = \`取得時刻: \${now.toLocaleString('ja-JP')}\`;
        document.getElementById('accessToken').textContent = data.access_token;
        document.getElementById('decodedPayload').innerHTML = formatJSON(decoded.payload, ['scope', 'exp', 'iat', 'jti']);

        // 履歴に追加
        history.unshift({
          timestamp: now,
          endpoint: endpoint,
          requestedScope: scope,
          jti: decoded.payload.jti,
          actualScope: decoded.payload.scope,
          isCacheHit: isCacheHit
        });

        updateHistoryDisplay();

      } catch (error) {
        alert('エラーが発生しました: ' + error.message);
        console.error(error);
      } finally {
        button.disabled = false;
        button.textContent = 'トークンを取得';
      }
    }

    // 履歴表示を更新
    function updateHistoryDisplay() {
      const section = document.getElementById('historySection');
      const list = document.getElementById('historyList');

      if (history.length === 0) {
        section.style.display = 'none';
        return;
      }

      section.style.display = 'block';
      list.innerHTML = history.map((item, index) => \`
        <div class="history-item \${item.isCacheHit ? 'cache-hit' : 'cache-miss'}">
          <div class="history-header">
            <span>\${item.timestamp.toLocaleTimeString('ja-JP')}</span>
            \${item.isCacheHit
              ? '<span class="cache-badge hit">キャッシュ</span>'
              : '<span class="cache-badge miss">新規</span>'
            }
          </div>
          <div>
            <strong>\${
              item.endpoint === 'no-store-get' ? 'no-store(GET)' :
              item.endpoint === 'no-store-post' ? 'no-store(POST)' :
              item.endpoint === 'max-age-get' ? 'max-age(GET)' :
              item.endpoint === 'max-age-post' ? 'max-age(POST)' :
              item.endpoint === 'no-header-get' ? 'なし(GET)' : 'なし(POST)'
            }</strong> |
            scope: \${item.actualScope}
            \${item.requestedScope !== item.actualScope ? ' <span style="color: #dc3545;">⚠️</span>' : ''}<br>
            <code style="font-size: 11px;">\${item.jti.substring(0, 8)}...</code>
          </div>
        </div>
      \`).join('');
    }

    // 履歴をクリア
    function clearHistory() {
      history = [];
      knownJtis.clear();
      updateHistoryDisplay();
    }
  </script>
</body>
</html>`;
}
