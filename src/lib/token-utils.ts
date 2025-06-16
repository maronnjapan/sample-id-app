/** JWTトークンのペイロード構造を定義するインターフェース */
export interface TokenPayload {
  /** OAuth 2.0 スコープ */
  scope?: string;
  /** OAuth 2.0 オーディエンス（単一文字列または配列） */
  aud?: string | string[];
  /** JWT発行者 */
  iss?: string;
  /** JWT主体（ユーザーID等） */
  sub?: string;
  /** JWT有効期限（Unix時間） */
  exp?: number;
  /** JWT発行時刻（Unix時間） */
  iat?: number;
  /** その他のクレーム */
  [key: string]: any;
}

/**
 * JWTトークンのペイロード部分をデコードする
 * @param token JWTトークン文字列
 * @returns デコードされたペイロードオブジェクト、失敗時はnull
 */
export function decodeJWTPayload(token: string): TokenPayload | null {
  try {
    /** JWTは「ヘッダー.ペイロード.署名」の3部分に分かれている */
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    
    /** ペイロード部分（2番目の部分）を取得 */
    const payload = parts[1];
    /** Base64URLデコード（Base64の-と_を+と/に変換してからデコード） */
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    /** JSON文字列をオブジェクトに変換 */
    return JSON.parse(decoded);
  } catch (error) {
    console.error('Failed to decode JWT:', error);
    return null;
  }
}

/**
 * テキストをクリップボードにコピーする
 * モダンブラウザではnavigator.clipboard、古いブラウザではexecCommandを使用
 * @param text コピーするテキスト
 * @returns コピー処理のPromise
 */
export function copyToClipboard(text: string): Promise<void> {
  /** モダンブラウザでセキュアコンテキストの場合はnavigator.clipboardを使用 */
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  } else {
    /** 古いブラウザ向けのフォールバック処理 */
    const textArea = document.createElement('textarea');
    textArea.value = text;
    /** 画面に表示されない位置に配置 */
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    return new Promise((resolve, reject) => {
      /** execCommandでコピーを試行 */
      if (document.execCommand('copy')) {
        textArea.remove();
        resolve();
      } else {
        textArea.remove();
        reject(new Error('Unable to copy to clipboard'));
      }
    });
  }
}