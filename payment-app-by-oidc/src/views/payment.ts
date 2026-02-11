export function renderPaymentPage(): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Step-up Authentication Payment</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }

    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 40px;
      width: 100%;
      max-width: 480px;
    }

    .header {
      text-align: center;
      margin-bottom: 32px;
    }

    .header h1 {
      color: #1a1a2e;
      font-size: 24px;
      margin-bottom: 8px;
    }

    .header p {
      color: #666;
      font-size: 14px;
    }

    .form-group {
      margin-bottom: 20px;
    }

    .form-group label {
      display: block;
      color: #333;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .form-group input {
      width: 100%;
      padding: 14px 16px;
      border: 2px solid #e0e0e0;
      border-radius: 10px;
      font-size: 16px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .form-group input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
    }

    .form-group input::placeholder {
      color: #aaa;
    }

    .amount-input-wrapper {
      position: relative;
    }

    .amount-input-wrapper::before {
      content: '¥';
      position: absolute;
      left: 16px;
      top: 50%;
      transform: translateY(-50%);
      color: #666;
      font-size: 16px;
      font-weight: 600;
    }

    .amount-input-wrapper input {
      padding-left: 36px;
    }

    .btn {
      width: 100%;
      padding: 16px;
      border: none;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
    }

    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-secondary {
      background: #f0f0f0;
      color: #333;
      margin-top: 12px;
    }

    .btn-secondary:hover {
      background: #e0e0e0;
    }

    /* Status Section */
    .status-section {
      display: none;
    }

    .status-card {
      background: #f8f9fa;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
    }

    .status-icon {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      font-size: 36px;
    }

    .status-icon.pending {
      background: #fff3cd;
      animation: pulse 2s infinite;
    }

    .status-icon.completed {
      background: #d4edda;
    }

    .status-icon.rejected {
      background: #f8d7da;
    }

    .status-icon.expired {
      background: #e2e3e5;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }

    .status-title {
      font-size: 20px;
      font-weight: 600;
      color: #1a1a2e;
      margin-bottom: 8px;
    }

    .status-message {
      color: #666;
      font-size: 14px;
      margin-bottom: 16px;
    }

    .status-details {
      background: white;
      border-radius: 8px;
      padding: 16px;
      margin-top: 16px;
      text-align: left;
    }

    .status-details .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #eee;
    }

    .status-details .detail-row:last-child {
      border-bottom: none;
    }

    .status-details .detail-label {
      color: #666;
      font-size: 13px;
    }

    .status-details .detail-value {
      color: #333;
      font-weight: 600;
      font-size: 13px;
    }

    .countdown {
      font-size: 14px;
      color: #666;
      margin-top: 12px;
    }

    .countdown span {
      font-weight: 600;
      color: #667eea;
    }

    /* Loading Spinner */
    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #e0e0e0;
      border-top-color: #667eea;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Error Message */
    .error-message {
      background: #f8d7da;
      color: #721c24;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 14px;
      display: none;
    }

    /* Phone illustration */
    .phone-illustration {
      margin: 20px auto;
      width: 120px;
      height: 200px;
      background: #1a1a2e;
      border-radius: 20px;
      padding: 10px;
      position: relative;
    }

    .phone-screen {
      background: white;
      border-radius: 12px;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 10px;
    }

    .phone-screen .okta-logo {
      font-size: 10px;
      font-weight: bold;
      color: #007dc1;
      margin-bottom: 8px;
    }

    .phone-screen .phone-message {
      font-size: 8px;
      color: #333;
      text-align: center;
      margin-bottom: 10px;
    }

    .phone-buttons {
      display: flex;
      gap: 8px;
    }

    .phone-btn {
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 8px;
      font-weight: bold;
    }

    .phone-btn.approve {
      background: #28a745;
      color: white;
    }

    .phone-btn.deny {
      background: #dc3545;
      color: white;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Step-up Auth Payment Demo</h1>
      <p>Okta Verify Push を必須にした再認証フロー</p>
    </div>

    <div class="error-message" id="errorMessage"></div>

    <!-- Payment Form -->
    <form id="paymentForm" class="form-section">
      <div class="form-group">
        <label for="userEmail">メールアドレス</label>
        <input
          type="email"
          id="userEmail"
          name="user_email"
          placeholder="user@example.com"
          required
        />
      </div>

      <div class="form-group">
        <label for="amount">支払い金額</label>
        <div class="amount-input-wrapper">
          <input
            type="number"
            id="amount"
            name="amount"
            placeholder="10000"
            min="1"
            required
          />
        </div>
      </div>

      <div class="form-group">
        <label for="description">説明</label>
        <input
          type="text"
          id="description"
          name="description"
          placeholder="商品購入"
          required
        />
      </div>

      <button type="submit" class="btn btn-primary" id="submitBtn">
        支払いを開始
      </button>
    </form>

    <!-- Status Section -->
    <div id="statusSection" class="status-section">
      <div class="status-card">
        <div class="status-icon" id="statusIcon">
          <div class="spinner"></div>
        </div>
        <div class="status-title" id="statusTitle">承認待ち</div>
        <div class="status-message" id="statusMessage">
          スマートフォンのOkta Verifyを確認してください
        </div>

        <!-- Phone Illustration -->
        <div class="phone-illustration" id="phoneIllustration">
          <div class="phone-screen">
            <div class="okta-logo">Okta Verify</div>
            <div class="phone-message" id="phoneMessage">¥10,000の支払いを承認</div>
            <div class="phone-buttons">
              <div class="phone-btn approve">承認</div>
              <div class="phone-btn deny">拒否</div>
            </div>
          </div>
        </div>

        <div class="countdown" id="countdown">
          残り時間: <span id="countdownTime">300</span>秒
        </div>

        <div class="status-details" id="statusDetails" style="display: none;">
          <div class="detail-row">
            <span class="detail-label">支払いID</span>
            <span class="detail-value" id="detailPaymentId">-</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">金額</span>
            <span class="detail-value" id="detailAmount">-</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">説明</span>
            <span class="detail-value" id="detailDescription">-</span>
          </div>
          <div class="detail-row" id="detailCompletedRow" style="display: none;">
            <span class="detail-label">完了日時</span>
            <span class="detail-value" id="detailCompletedAt">-</span>
          </div>
        </div>
      </div>

      <button type="button" class="btn btn-secondary" id="resetBtn">
        新しい支払いを開始
      </button>
    </div>
  </div>

  <script>
    const form = document.getElementById('paymentForm');
    const statusSection = document.getElementById('statusSection');
    const errorMessage = document.getElementById('errorMessage');
    const submitBtn = document.getElementById('submitBtn');
    const resetBtn = document.getElementById('resetBtn');

    resetStatusUI();
    initializeFromQuery();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError();

      const userEmailInput = document.getElementById('userEmail');
      const amountInput = document.getElementById('amount');
      const descriptionInput = document.getElementById('description');
      const userEmail = userEmailInput instanceof HTMLInputElement ? userEmailInput.value : '';
      const amountValue = amountInput instanceof HTMLInputElement ? amountInput.value : '0';
      const description = descriptionInput instanceof HTMLInputElement ? descriptionInput.value : '';
      const amount = parseInt(amountValue, 10);

      submitBtn.disabled = true;
      submitBtn.textContent = 'Oktaへリダイレクト中...';

      try {
        const response = await fetch('/api/payment/initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_email: userEmail, amount, description }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error_description || 'エラーが発生しました');
        }

        window.location.href = data.authorize_url;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        showError(message);
        submitBtn.disabled = false;
        submitBtn.textContent = '支払いを開始';
      }
    });

    resetBtn.addEventListener('click', () => {
      window.location.href = '/';
    });

    async function loadPaymentStatus(paymentId, fallback) {
      try {
        const response = await fetch(`/api/payment/${paymentId}/status`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error_description || 'ステータスの取得に失敗しました');
        }

        document.getElementById('detailPaymentId').textContent = paymentId;
        document.getElementById('detailAmount').textContent = data.amount
          ? '¥' + Number(data.amount).toLocaleString()
          : '-';
        document.getElementById('detailDescription').textContent = data.description || '-';
        updateStatusUI(data);
      } catch (error) {
        if (fallback) {
          updateStatusUI({ status: fallback.status, reason: fallback.reason });
        }
        const message = error instanceof Error ? error.message : String(error);
        showError(message);
      }
    }

    function initializeFromQuery() {
      const params = new URLSearchParams(window.location.search);
      const status = params.get('status');
      const paymentId = params.get('payment');
      const reason = params.get('reason');

      if (!status) {
        return;
      }

      if (status === 'error') {
        showError(reason || '認証でエラーが発生しました');
        return;
      }

      showStatusSection();

      if (paymentId) {
        loadPaymentStatus(paymentId, { status, reason });
      } else {
        updateStatusUI({ status, reason });
      }
    }

    function showStatusSection() {
      form.style.display = 'none';
      statusSection.style.display = 'block';
    }

    function updateStatusUI(data) {
      const statusIcon = document.getElementById('statusIcon');
      const statusTitle = document.getElementById('statusTitle');
      const statusMessage = document.getElementById('statusMessage');
      const phoneIllustration = document.getElementById('phoneIllustration');
      const countdown = document.getElementById('countdown');
      const statusDetails = document.getElementById('statusDetails');

      countdown.style.display = 'none';

      switch (data.status) {
        case 'completed':
          statusIcon.className = 'status-icon completed';
          statusIcon.innerHTML = '&#10004;';
          statusTitle.textContent = '支払い完了';
          statusMessage.textContent = 'Okta Verify で承認されたため支払いを完了しました';
          phoneIllustration.style.display = 'none';
          statusDetails.style.display = 'block';
          if (data.completed_at) {
            document.getElementById('detailCompletedRow').style.display = 'flex';
            document.getElementById('detailCompletedAt').textContent =
              new Date(data.completed_at).toLocaleString('ja-JP');
          }
          break;
        case 'rejected':
          statusIcon.className = 'status-icon rejected';
          statusIcon.innerHTML = '&#10008;';
          statusTitle.textContent = '支払い拒否';
          statusMessage.textContent = data.reason || 'Okta Verifyで拒否されました';
          phoneIllustration.style.display = 'none';
          statusDetails.style.display = 'block';
          document.getElementById('detailCompletedRow').style.display = 'none';
          break;
        case 'expired':
          statusIcon.className = 'status-icon expired';
          statusIcon.innerHTML = '&#8987;';
          statusTitle.textContent = 'タイムアウト';
          statusMessage.textContent = data.reason || '期限内に承認されませんでした';
          phoneIllustration.style.display = 'none';
          statusDetails.style.display = 'block';
          document.getElementById('detailCompletedRow').style.display = 'none';
          break;
        default:
          statusIcon.className = 'status-icon pending';
          statusIcon.innerHTML = '<div class="spinner"></div>';
          statusTitle.textContent = '承認待ち';
          statusMessage.textContent = 'Okta Verify で承認を完了してください';
          phoneIllustration.style.display = 'block';
          statusDetails.style.display = 'none';
          document.getElementById('detailCompletedRow').style.display = 'none';
          break;
      }
    }

    function resetStatusUI() {
      document.getElementById('statusIcon').className = 'status-icon pending';
      document.getElementById('statusIcon').innerHTML = '<div class="spinner"></div>';
      document.getElementById('statusTitle').textContent = '承認待ち';
      document.getElementById('statusMessage').textContent =
        'Okta Verify で承認を完了してください';
      document.getElementById('phoneIllustration').style.display = 'none';
      document.getElementById('countdown').style.display = 'none';
      document.getElementById('statusDetails').style.display = 'none';
      document.getElementById('detailCompletedRow').style.display = 'none';
      document.getElementById('detailPaymentId').textContent = '-';
      document.getElementById('detailAmount').textContent = '-';
      document.getElementById('detailDescription').textContent = '-';
      document.getElementById('detailCompletedAt').textContent = '-';
    }

    function showError(message) {
      errorMessage.textContent = message;
      errorMessage.style.display = 'block';
    }

    function hideError() {
      errorMessage.style.display = 'none';
    }
  </script>
</body>
</html>`;
}
