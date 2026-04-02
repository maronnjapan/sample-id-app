'use client';

import { useState } from 'react';
import { decodeJWTPayload, copyToClipboard, TokenPayload } from '@/lib/token-utils';

interface TokenExchangeClientProps {
  session: {
    user?: { name?: string | null; email?: string | null; image?: string | null };
    idTokenPayload?: TokenPayload | null;
    idTokenPreview?: string;
  };
}

/**
 * Token Exchange デモクライアントコンポーネント
 * Okta Org認可サーバーでのToken Exchangeを実行し、ID-JAGの中身を表示する
 */
export function TokenExchangeClient({ session }: TokenExchangeClientProps) {
  const [copySuccess, setCopySuccess] = useState<{ [key: string]: boolean }>({});
  const [scope, setScope] = useState('');
  const [audience, setAudience] = useState('');
  const [tokenExchangeResult, setTokenExchangeResult] = useState<Record<string, unknown> | null>(null);
  const [tokenExchangeError, setTokenExchangeError] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleCopy = async (text: string, key: string) => {
    try {
      await copyToClipboard(text);
      setCopySuccess(prev => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setCopySuccess(prev => ({ ...prev, [key]: false }));
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleTokenExchange = async () => {
    if (!audience.trim()) {
      setTokenExchangeError('audience は必須です。');
      setErrorHint('現在 Okta 側の制約により http://localhost:5001 のみ受け付けられます。');
      return;
    }

    setIsLoading(true);
    setTokenExchangeResult(null);
    setTokenExchangeError(null);
    setErrorHint(null);

    try {
      const response = await fetch('/api/token-exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: scope || undefined,
          audience,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setTokenExchangeResult(data);
      } else {
        setTokenExchangeError(data.error);
        if (data.hint) {
          setErrorHint(data.hint);
        }
      }
    } catch (error) {
      setTokenExchangeError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  // ID-JAGはレスポンスの access_token フィールドに入る
  const idJagToken = tokenExchangeResult?.access_token as string | undefined;
  const idJagPayload: TokenPayload | null = idJagToken
    ? decodeJWTPayload(idJagToken)
    : null;

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6 text-black">
        Okta Org認可サーバー Token Exchange Demo
      </h1>

      {session?.user ? (
        <div className="space-y-6">
          {/* セッション情報 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-2 text-black">現在のセッション情報</h2>
            <pre className="bg-white p-3 rounded border text-sm overflow-x-auto text-black">
              {JSON.stringify(session.user, null, 2)}
            </pre>
          </div>

          {/* 元のID Token ペイロード（デコード済み、生トークンは非表示） */}
          {session.idTokenPayload && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-2 text-black">元のID Token</h2>
              {session.idTokenPreview && (
                <div className="bg-white p-3 rounded border mb-3">
                  <code className="text-sm break-all text-gray-500">
                    {session.idTokenPreview}
                  </code>
                  <p className="text-xs text-gray-400 mt-1">
                    ※ セキュリティ上、生トークンはサーバー側でのみ保持しています
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <h3 className="font-medium text-black">
                  ID Token ペイロード
                  <span className="text-xs text-gray-500 ml-2">(decoded only / not verified)</span>
                </h3>
                <pre className="bg-white p-3 rounded border text-sm overflow-x-auto text-black">
                  {JSON.stringify(session.idTokenPayload, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Token Exchange 設定 */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4 text-black">Token Exchange 設定</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-black mb-2">
                  Audience（ID-JAG の送り先アプリの Client ID または Issuer URL）:
                  <span className="text-red-500 ml-1">*</span>
                </label>
                <input
                  type="text"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="http://localhost:5001"
                  className="w-full p-2 border border-gray-300 rounded-md text-black"
                />
                <p className="text-xs text-amber-600 mt-1 font-medium">
                  注意: Okta 側の制約により、現在は <code>http://localhost:5001</code> のみ受け付けられます。それ以外の値を指定すると Okta がエラーを返します。
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-black mb-2">
                  Scope（リソースアプリで許可されたスコープ）:
                </label>
                <input
                  type="text"
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  placeholder="例: chat.read chat.history"
                  className="w-full p-2 border border-gray-300 rounded-md text-black"
                />
              </div>
              <button
                onClick={handleTokenExchange}
                disabled={isLoading || !audience.trim()}
                className="w-full bg-purple-500 hover:bg-purple-600 disabled:bg-purple-300 text-white py-2 px-4 rounded-md"
              >
                {isLoading ? 'Token Exchange 実行中...' : 'Token Exchange 実行（ID Token → ID-JAG）'}
              </button>
            </div>
          </div>

          {/* Token Exchange 成功 */}
          {tokenExchangeResult && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-lg font-semibold text-black">Token Exchange 成功</h2>
                {idJagToken && (
                  <button
                    onClick={() => handleCopy(idJagToken, 'idjag')}
                    className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm"
                  >
                    {copySuccess.idjag ? 'コピー済み!' : 'ID-JAGをコピー'}
                  </button>
                )}
              </div>
              <div className="space-y-3">
                {/* ID-JAGトークン表示 */}
                {idJagToken && (
                  <div>
                    <h3 className="font-medium text-black">ID-JAG (Identity Assertion JWT):</h3>
                    <div className="bg-white p-3 rounded border mt-1">
                      <code className="text-sm break-all text-black">
                        {idJagToken.substring(0, 100)}...
                      </code>
                    </div>
                  </div>
                )}

                {/* ID-JAGペイロード */}
                {idJagPayload && (
                  <div>
                    <h3 className="font-medium text-black">
                      ID-JAG ペイロード
                      <span className="text-xs text-gray-500 ml-2">(decoded only / not verified)</span>
                    </h3>
                    <pre className="bg-white p-3 rounded border text-sm overflow-x-auto mt-1 text-black">
                      {JSON.stringify(idJagPayload, null, 2)}
                    </pre>
                  </div>
                )}

                {/* 生レスポンス */}
                <div>
                  <h3 className="font-medium text-black">Token Exchange レスポンス全体:</h3>
                  <pre className="bg-white p-3 rounded border text-sm overflow-x-auto mt-1 text-black">
                    {JSON.stringify(tokenExchangeResult, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* Token Exchange エラー */}
          {tokenExchangeError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-2 text-black">Token Exchange エラー</h2>
              <div className="bg-white p-3 rounded border">
                <code className="text-sm text-red-600">{tokenExchangeError}</code>
              </div>
              {errorHint && (
                <div className="mt-2 p-2 bg-yellow-100 border border-yellow-300 rounded-md">
                  <p className="text-sm text-yellow-800">ヒント: {errorHint}</p>
                </div>
              )}
            </div>
          )}

          {/* 使用方法 */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-2 text-black">使用方法</h2>
            <div className="space-y-2 text-sm text-black">
              <div>
                <strong>前提条件:</strong> Okta管理画面で Cross App Access (XAA) を有効化し、
                Managed Connections でアプリ間の接続を設定済みであること
              </div>
              <div>
                <strong>Audience:</strong> リソースアプリのclient_id等を指定（どの値が受け入れられるかを検証）
              </div>
              <div>
                <strong>Scope:</strong> リソースアプリで許可されたスコープを指定
              </div>
              <div>
                <strong>実行:</strong> Token Exchangeボタンを押して、Org認可サーバーにID-JAGを要求
              </div>
            </div>
          </div>

          {/* 技術解説 */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-2 text-black">技術解説</h2>
            <div className="space-y-2 text-sm text-black">
              <div>
                <strong>Token Exchange (RFC 8693):</strong>{' '}
                既存トークンを別のトークンに交換するOAuth 2.0の拡張仕様
              </div>
              <div>
                <strong>ID-JAG:</strong>{' '}
                Identity Assertion JWT。IdPが署名した中間トークンで、
                リソースアプリの認可サーバーがアクセストークンを発行する際の入力として使う
              </div>
              <div>
                <strong>Org認可サーバー:</strong>{' '}
                /oauth2/v1/token エンドポイント。本アプリではここだけでID-JAGの発行が完結するかを検証する
              </div>
              <div>
                <strong>検証の目的:</strong>{' '}
                Custom認可サーバーを使わず、Org認可サーバー単体でID-JAGを取得できるか、
                取得できた場合にどのようなクレームが含まれるかを確認する
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="text-black">ログインが必要です</div>
        </div>
      )}
    </div>
  );
}
