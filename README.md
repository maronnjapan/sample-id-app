# Auth0 Token Vault 風 AWS 構成（検証・研修用）

Auth0 の **Token Vault** を AWS 上で再現する、研修・検証目的のプロジェクトです。
本物の Token Vault との完全一致は目指さず、**クライアントが叩く API のパス・パラメータ・
`grant_type`・レスポンス形式を Auth0 公式ドキュメントに揃える**ことで、Auth0 SDK との
互換性を意識した設計理解を深めることを狙いとしています。

> このブランチ（`claude/aws-token-vault-setup-XbPoT`）専用の README です。
> 他ブランチの内容とは独立しています。

## 目的

- Auth0 Token Vault が担っている責務を、自作することで具体的に理解する
- 「自作すると重い」という主張を裏付ける具体的な実装経験を得る
- 発表資料の説得力を高めるための実装ネタを蓄積する

## 実装スコープ（Step1〜3）

| Step | 内容 | 状態 |
|---|---|---|
| Step1 | `/oauth/token` の Refresh Token Exchange（`google-oauth2`、KMS Direct Encryption） | 実装済み |
| Step2 | Connected Accounts フロー（connect / connect入口 / provider callback / complete） | 実装済み |
| Step3 | Access Token Exchange（自前 RS256 JWT 検証）＋ 管理系 API（connections / accounts list / delete） | 実装済み |
| Step4〜5 | Envelope 暗号化 / Slack・GitHub 拡張の本格化 / 事前 refresh 等 | 未実装（今後） |

> provider 差分吸収は `google-oauth2` / `slack` / `github` の3つを定義済みですが、
> 動作確認の主対象は `google-oauth2` です。

## アーキテクチャ

```
Client ──▶ API Gateway (HTTP API)
                  │
        ┌─────────┼───────────────┐
        ▼         ▼               ▼
   oauth-token  connected-accounts  browser-flow
    Lambda        Lambda             Lambda
        │         │ (Lambda Authorizer 配下)
        └────┬────┴───────┬─────────┘
             ▼            ▼
        DynamoDB        KMS (CMK)
        5 tables    encrypt / decrypt
             │
             ▼
        Secrets Manager（provider client_secret / モック JWT 秘密鍵）

監査: CloudWatch Logs（構造化JSON・token値マスク） / CloudTrail（KMS・Secrets Manager 呼び出し）
```

### 認証方式

| エンドポイント | 認証 |
|---|---|
| `POST /oauth/token` | Lambda 本体で検証（`subject_token_type` で分岐。JWT Authorizer は使わない） |
| `/me/v1/connected-accounts/*` | Lambda Authorizer（モック Auth0 の RS256 JWT を自前鍵で検証） |
| `/connected-accounts/connect`, `/_internal/provider-callback` | 認証なし（ticket / session 照合で保護） |

### DynamoDB テーブル

`ConnectedAccounts`(PK/SK + GSI1/GSI2) / `ConnectSessions`(ticket PK + auth_session GSI + TTL) /
`PendingConnections`(connect_code PK + TTL) / `RefreshTokens`(refresh_token のハッシュ PK) /
`ApiClients`(client_id PK)。

## エンドポイント

| メソッド | パス | 用途 |
|---|---|---|
| POST | `/oauth/token` | refresh / access token を外部 provider の access token と交換 |
| POST | `/me/v1/connected-accounts/connect` | Connected Accounts フロー開始 |
| POST | `/me/v1/connected-accounts/complete` | Connected Accounts フロー完了 |
| GET | `/me/v1/connected-accounts/connections` | コネクション一覧 |
| GET | `/me/v1/connected-accounts/accounts[?connection=]` | connected account 一覧 |
| DELETE | `/me/v1/connected-accounts/accounts/{connectedAccountId}` | connected account 削除 |
| GET | `/connected-accounts/connect?ticket=` | provider 認可画面への入口（302） |
| GET | `/_internal/provider-callback?code=&state=` | provider からのリダイレクト受付 |

## ディレクトリ構成

```
bin/app.ts                      CDK アプリエントリ
lib/token-vault-stack.ts        CDK スタック（全 AWS リソース定義）
src/handlers/                   Lambda ハンドラ（oauth-token / connected-accounts / browser-flow / jwt-authorizer）
src/common/                     共通モジュール（kms / dynamo / jwt / providers / tokens / clients / logger ほか）
src/types.ts                    共通型
scripts/mint-jwt.ts             モック Auth0 として RS256 JWT を発行する開発用スクリプト
scripts/seed.ts                 ApiClients / RefreshTokens / ConnectedAccounts を投入する検証用スクリプト
```

## 前提

- Node.js 22 系
- **AWS CLI v2**（`aws sso login` に必要）
- デプロイ先 AWS アカウントと、SSO で利用できるプロファイル

## セットアップ & デプロイ

このプロジェクトは **静的なアクセスキーを使いません**。AWS CLI の SSO プロファイルで
一時クレデンシャルを取得し、CDK / 補助スクリプトはその資格情報チェーンを利用します。

### 1. 依存インストール

```bash
npm install
```

### 2. AWS SSO でログイン

```bash
# 初回のみ（プロファイル未設定の場合）
aws configure sso --profile token-vault

# 以降はこれだけ。ブラウザで承認すると一時クレデンシャルがキャッシュされる
aws sso login --profile token-vault
```

以降のコマンドは `AWS_PROFILE` と `AWS_REGION` を環境変数で渡します
（AWS CLI / CDK / AWS SDK v3 はいずれもこのプロファイル＝SSO の一時クレデンシャルを参照します。
アクセスキーの export は不要です）。

```bash
export AWS_PROFILE=token-vault
export AWS_REGION=ap-northeast-1
```

### 3. CDK ブートストラップ（アカウント/リージョン初回のみ）

```bash
npm run -s build          # 型チェック
npx cdk bootstrap         # AWS_PROFILE のプロファイルで実行される
```

> `npx cdk deploy -- --profile token-vault` のように `--profile` を直接渡すことも可能です。

### 4. デプロイ

```bash
npx cdk diff
npx cdk deploy
```

デプロイが完了すると、ターミナルに次のような出力（CfnOutput）が表示されます。

```
Outputs:
TokenVaultStack.ApiBaseUrl       = https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com
TokenVaultStack.KmsKeyArn        = arn:aws:kms:ap-northeast-1:123456789012:key/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
TokenVaultStack.ProviderSecretName = token-vault/providers
TokenVaultStack.ConnectUri       = https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/connected-accounts/connect
```

### 4-1. デプロイ後に出力値を再取得する

`cdk deploy` の出力を見逃した場合は、以下のいずれかの方法で取得できます。

**方法A: CloudFormation スタックから一括取得**

```bash
aws cloudformation describe-stacks \
  --stack-name TokenVaultStack \
  --query "Stacks[0].Outputs" \
  --output table
```

**方法B: 値を個別に取得**

```bash
# API Gateway のベース URL
aws cloudformation describe-stacks \
  --stack-name TokenVaultStack \
  --query "Stacks[0].Outputs[?OutputKey=='ApiBaseUrl'].OutputValue" \
  --output text

# KMS キーの ARN
aws cloudformation describe-stacks \
  --stack-name TokenVaultStack \
  --query "Stacks[0].Outputs[?OutputKey=='KmsKeyArn'].OutputValue" \
  --output text
```

**方法C: AWS リソースから直接取得**

```bash
# API Gateway（HTTP API 名 "token-vault" で絞り込み）
aws apigatewayv2 get-apis \
  --query "Items[?Name=='token-vault'].ApiEndpoint" \
  --output text

# KMS（エイリアス alias/token-vault で検索）
aws kms describe-key \
  --key-id alias/token-vault \
  --query "KeyMetadata.Arn" \
  --output text
```

取得した値は後続のステップ（`--kms-key-arn` / `API_BASE_URL`）で使用します。

### 5. シークレットの投入

`scripts/mint-jwt.ts` でモック Auth0 の RS256 鍵を生成します。

```bash
npx tsx scripts/mint-jwt.ts \
  --issuer https://mock-auth0.example.com/ \
  --sub 'auth0|demo-user' \
  --api-identifier https://api.example.com \
  --my-account-audience https://token-vault.example.com/me/ \
  --client-id demo-client
```

出力された `secrets_manager_field.mock_jwt_private_key_pem` と、利用する provider の
`client_id` / `client_secret` を Secrets Manager のシークレット
`token-vault/providers` に JSON で登録します。

```jsonc
{
  "google":  { "client_id": "...", "client_secret": "..." },
  "mock_jwt_private_key_pem": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
}
```

```bash
aws secretsmanager put-secret-value \
  --secret-id token-vault/providers \
  --secret-string "file://minted-jwt.json"
```

> `--issuer` / `--my-account-audience` は CDK の context（`jwtIssuer` /
> `myAccountAudience`）と一致させてください。変更する場合は
> `npx cdk deploy -c jwtIssuer=... -c myAccountAudience=...`。

### 6. 検証データの投入（Step1）

```bash
npx tsx scripts/seed.ts \
  --client-id demo-client --client-secret demo-secret \
  --user-id 'auth0|demo-user' --refresh-token 'rt_demo_value' \
  --kms-key-arn <CfnOutput の KmsKeyArn> \
  --google-access-token <Google access token> \
  --google-refresh-token <Google refresh token>
```

`--google-*` / `--kms-key-arn` を省略すると `ApiClients` と `RefreshTokens` のみ投入します。

## 動作確認例

### Refresh Token Exchange（Step1）

```bash
curl -s -X POST "<API_BASE_URL>/oauth/token" \
  -H 'content-type: application/json' \
  -d '{
    "client_id": "demo-client",
    "client_secret": "demo-secret",
    "subject_token": "rt_demo_value",
    "grant_type": "urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token",
    "subject_token_type": "urn:ietf:params:oauth:token-type:refresh_token",
    "requested_token_type": "http://auth0.com/oauth/token-type/federated-connection-access-token",
    "connection": "google-oauth2"
  }'
```

成功すると Google の access token が Auth0 形式（`access_token` / `scope` /
`expires_in` / `issued_token_type` / `token_type`）で返ります。
access token が失効していれば内部で provider に refresh をかけて返します。

### Access Token Exchange（Step3）

`scripts/seed.ts --client-type custom_api_client --api-identifier https://api.example.com`
で Custom API Client を作成し、`mint-jwt.ts` の `access_token_subject_token` を
`subject_token`、`subject_token_type` を
`urn:ietf:params:oauth:token-type:access_token` にして同じエンドポイントへ。

### My Account API（Step2/3）

`Authorization: Bearer <mint-jwt の my_account_api_token>` を付けて
`/me/v1/connected-accounts/*` を呼び出します。

## リソースの削除

```bash
npx cdk destroy
```

全リソースに `RemovalPolicy.DESTROY` を設定済みで、`cdk destroy` で一括削除されます
（S3 は中身も自動削除）。**ただし KMS キーは AWS の仕様上、即時削除できず最短 7 日の
削除待機期間**があります（`pendingWindow: 7` を設定済み。これ以上短縮は不可）。
それ以外（DynamoDB / Lambda / API Gateway / S3 / CloudTrail 等）は即時削除されます。

## セキュリティ上の扱い

- access_token / refresh_token / subject_token / client_secret /
  ticket / auth_session / connect_code は **ログに出力しない**（logger で再帰マスク）
- token は KMS 暗号化して DynamoDB に保存（平文保存しない）
- provider の client_secret とモック JWT 秘密鍵は Secrets Manager 管理
- `client_secret` は平文保存せず scrypt ハッシュで照合
- `redirect_uri` は完全一致で検証
- IAM は最小権限（各 Lambda に必要なテーブル/キーのみ付与）
- **静的アクセスキーを使わず、AWS SSO の一時クレデンシャルで運用**

## 検証用なので意図的に省略しているもの

本物の Auth0 ログイン処理（モック）、refresh token rotation、MRRT の完全再現、
DPoP、多リージョン、VPC エンドポイント、WAF、詳細なリトライ/サーキットブレーカー、
refresh の競合制御、本番運用品質のセキュリティ・可用性・スケーラビリティ。
