'use client';

import { useState } from 'react';
import { decodeJWTPayload, copyToClipboard, TokenPayload } from '@/lib/token-utils';

interface TokenExchangeClientProps {
  session: any;
}

export function TokenExchangeClient({
  session
}: TokenExchangeClientProps) {
  const [copySuccess, setCopySuccess] = useState<{ [key: string]: boolean }>({});
  const [scope, setScope] = useState('test-delegate');
  const [audience, setAudience] = useState('');
  const [tokenExchangeResult, setTokenExchangeResult] = useState(null);
  const [tokenExchangeError, setTokenExchangeError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const scopeOptions = ['test-delegate'];
  const audienceOptions = ['test-exchange-client'];

  const handleCopy = async (text: string, key: string) => {
    try {
      await copyToClipboard(text);
      setCopySuccess({ ...copySuccess, [key]: true });
      setTimeout(() => {
        setCopySuccess(prev => ({ ...prev, [key]: false }));
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleTokenExchange = async () => {
    setIsLoading(true);
    setTokenExchangeResult(null);
    setTokenExchangeError(null);

    try {
      const response = await fetch('/api/token-exchange', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scope: scope || undefined,
          audience: audience || undefined,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setTokenExchangeResult(data);
      } else {
        setTokenExchangeError(data.error + (data.details ? ` - ${data.details}` : ''));
      }
    } catch (error) {
      setTokenExchangeError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const originalTokenPayload: TokenPayload | null = session?.accessToken
    ? decodeJWTPayload(session.accessToken)
    : null;

  const exchangedTokenPayload: TokenPayload | null = tokenExchangeResult?.access_token
    ? decodeJWTPayload(tokenExchangeResult.access_token)
    : null;

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6 text-black">Keycloak Token Exchange Demo</h1>

      {session && session.user ? (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-2 text-black">🔐 現在のセッション情報</h2>
            <pre className="bg-white p-3 rounded border text-sm overflow-x-auto text-black">
              {JSON.stringify(session.user, null, 2)}
            </pre>
          </div>

          {session.accessToken && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-lg font-semibold text-black">🎫 元のアクセストークン</h2>
                <button
                  onClick={() => handleCopy(session.accessToken, 'original')}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm"
                >
                  {copySuccess.original ? 'コピー済み!' : 'トークンをコピー'}
                </button>
              </div>
              <div className="bg-white p-3 rounded border mb-3">
                <code className="text-sm break-all text-black">
                  {session.accessToken.substring(0, 100)}...
                </code>
              </div>

              {originalTokenPayload && (
                <div className="space-y-2">
                  <h3 className="font-medium text-black">トークン詳細情報:</h3>
                  <div className="bg-white p-3 rounded border space-y-2">
                    <div className="text-sm text-black">
                      <strong>Scope:</strong> {originalTokenPayload.scope || 'N/A'}
                    </div>
                    <div className="text-sm text-black">
                      <strong>Audience:</strong> {
                        Array.isArray(originalTokenPayload.aud)
                          ? originalTokenPayload.aud.join(', ')
                          : originalTokenPayload.aud || 'N/A'
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4 text-black">🔄 Token Exchange 設定</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-black mb-2">Scope:</label>
                <div className="flex gap-2">
                  <select
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                    className="flex-1 p-2 border border-gray-300 rounded-md text-black"
                  >
                    <option value="">選択してください</option>
                    {scopeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {scope && (
                    <button
                      onClick={() => setScope('')}
                      className="px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md text-sm"
                    >
                      削除
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-black mb-2">Audience:</label>
                <div className="flex gap-2">
                  <select
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    className="flex-1 p-2 border border-gray-300 rounded-md text-black"
                  >
                    <option value="">選択してください</option>
                    {audienceOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {audience && (
                    <button
                      onClick={() => setAudience('')}
                      className="px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md text-sm"
                    >
                      削除
                    </button>
                  )}
                </div>
                {audience && (
                  <div className="mt-2 p-2 bg-yellow-100 border border-yellow-300 rounded-md">
                    <p className="text-sm text-yellow-800">
                      ⚠️ audienceを設定するとscopeのダウングレード等が期待通りに動作しない場合があります
                    </p>
                  </div>
                )}
              </div>
              <button
                onClick={handleTokenExchange}
                disabled={isLoading}
                className="w-full bg-purple-500 hover:bg-purple-600 disabled:bg-purple-300 text-white py-2 px-4 rounded-md"
              >
                {isLoading ? 'Token Exchange 実行中...' : 'Token Exchange 実行'}
              </button>
            </div>
          </div>

          {tokenExchangeResult && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-lg font-semibold text-black">✅ Token Exchange 成功</h2>
                <button
                  onClick={() => handleCopy(tokenExchangeResult.access_token, 'exchanged')}
                  className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm"
                >
                  {copySuccess.exchanged ? 'コピー済み!' : 'トークンをコピー'}
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <h3 className="font-medium text-black">新しいアクセストークン:</h3>
                  <div className="bg-white p-3 rounded border mt-1">
                    <code className="text-sm break-all text-black">
                      {tokenExchangeResult.access_token?.substring(0, 100)}...
                    </code>
                  </div>
                </div>

                {exchangedTokenPayload && (
                  <div>
                    <h3 className="font-medium text-black">交換後トークン詳細情報:</h3>
                    <div className="bg-white p-3 rounded border space-y-2 mt-1">
                      <div className="text-sm text-black">
                        <strong>Scope:</strong> {exchangedTokenPayload.scope || 'N/A'}
                      </div>
                      <div className="text-sm text-black">
                        <strong>Audience:</strong> {
                          Array.isArray(exchangedTokenPayload.aud)
                            ? exchangedTokenPayload.aud.join(', ')
                            : exchangedTokenPayload.aud || 'N/A'
                        }
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="font-medium text-black">Token Exchange レスポンス詳細:</h3>
                  <pre className="bg-white p-3 rounded border text-sm overflow-x-auto mt-1 text-black">
                    {JSON.stringify(tokenExchangeResult, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {tokenExchangeError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-2 text-black">❌ Token Exchange エラー</h2>
              <div className="bg-white p-3 rounded border">
                <code className="text-sm text-red-600">
                  {tokenExchangeError}
                </code>
              </div>
            </div>
          )}

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-2 text-black">💡 使用方法</h2>
            <div className="space-y-2 text-sm text-black">
              <div><strong>Scope変更テスト:</strong> 異なるscopeを入力してトークンのscopeがどう変わるか確認</div>
              <div><strong>Audience変更テスト:</strong> audienceを設定してaudが指定したもののみなっているかを確認</div>
              <div><strong>空欄テスト:</strong> 両方空欄にしてデフォルト動作を確認</div>
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