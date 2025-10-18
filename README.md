
## 実際にセットアップしてみる
ここまででコードについては見ていきました。
なので、ここからは実際に各種プロジェクトの設定を行い、実際に動作確認をできるようにします。
なお、ここでは以下のことが前提になっています。
- Auth0のテナントが作成されていること
- Vercelアカウントが作成されてて、Vercel CLIがインストールされていること
- Cloudflareアカウントが作成されていること、Wrangler CLIがインストールされていること
上記については割愛しますので、各自で準備をお願いします。

### Auth0の設定手順

まず、Auth0側の設定から始めます。このシステムでは、3種類のアプリケーションを作成する必要があります。
最初に、ユーザー認証用のRegular Web Applicationを作成します。(Next.jsアプリケーション用)
Auth0 Dashboardにアクセスして、Applications → Applicationsを開き、Create Applicationをクリックします。
Nameには任意の名前（例えばsample-id-app）を入力し、Application TypeはRegular Web Applicationsを選択してCreateをクリックします。
作成後、Settingsタブで以下の情報をメモしておきます。

DomainはAuth0テナントのドメイン（例：your-tenant.us.auth0.com）で、Client IDはNext.jsのAUTH0_IDとして使用します。
Client SecretはAUTH0_SECRETとして使用します。
次に、Application URIsセクションを設定します。
Allowed Callback URLsにはhttp://localhost:3000/api/auth/callback/auth0を、Allowed Logout URLsにはhttp://localhost:3000を、Allowed Web Originsにもhttp://localhost:3000を設定します。
本番環境にデプロイする際は、本番URLも追加してください。
続いて、Regular Web Applicationに紐づけるAPIを作成します。
これの紐づけを行うことで、payloadが付与されたアクセストークンを取得することができます。
Applications → APIsを開き、Create APIをクリックします。
Nameには任意の名前（例：Sample ID App API）を入力し、Identifierには[https://sample-id-app/api](https://sample-id-app/api)のようなURIを設定します。
Signing AlgorithmはRS256を選択してCreateをクリックします。
このIdentifierがAUTH0_AUDIENCEとして使用されるので、メモしておきます。

最後に、Event Streamを作成するスクリプトを実行するためのアプリケーションを作成します。
Applications → Applicationsを開き、Create Applicationをクリックします。
Nameには任意の名前（例：Event Stream Manager）を入力し、Application TypeはMachine to Machine Applicationsを選択します。Select an APIでAuth0 Management APIを選択し、Permissionsでread:event_streams、create:event_streams、update:event_streams、delete:event_streamsをチェックしてAuthorizeをクリックします。
作成後、SettingsタブでClient IDとClient Secretをメモします。これらは、それぞれAUTH0_MANAGEMENT_CLIENT_IDとAUTH0_MANAGEMENT_CLIENT_SECRETとして使用します。
これで、Auth0側の設定が完了しました。

### Upstash Redisの準備（Vercel連携）

次に、Upstash Redisをセットアップします。今回はVercel経由で設定する方法を説明します。
まず、Vercelにログインして、Add New → Projectをクリックします。GitHubリポジトリをインポートするか、後で設定することもできます。（今回はリポジトリインポートは行っていません）
プロジェクトのStorageタブを開き、Create Databaseをクリックします。
Upstash Redisを選択し、Database Nameには任意の名前（例：sample-id-app-blocks）を入力します。
Regionはアプリケーションに近いリージョンを選択してCreate & Continueをクリックし、Connectをクリックしてプロジェクトに紐付けます。
これで、VercelプロジェクトにUpstash Redisの環境変数が自動的に追加されます。
ローカルにこれら環境変数が必要な場合は、vercel env pullコマンドを使用して.envファイルにダウンロードできます。
ただし、vercel linkなどでどのプロジェクトかを紐づける必要はありますが、今回ローカルで動かす予定はないので詳しい操作は割愛します。

```bash
UPSTASH_REDIS_REST_URL="https://xxx.upstash.io"
UPSTASH_REDIS_REST_TOKEN="AXXXxxx..."
```

コードではRedis.fromEnv()を使用しているため、これらの環境変数名である必要があります。

### Cloudflare Workerのデプロイ

次に、Cloudflare Workerをデプロイします。

まず、Wrangler CLIでCloudflareにログインします。wrangler loginコマンドを実行すると、ブラウザが開き、Cloudflareへのログインが求められます。

次に、Workerで使用する秘密鍵を生成します。notify-user-blockディレクトリに移動して、pnpm gen:private-keyコマンドを実行します。このコマンドにより、.envファイルにJWT_PRIVATE_KEYが書き込まれます。

まず、Worker URLを取得するために初回デプロイを行います。pnpm deployコマンドを実行すると、デプロイが完了して、https://notify-user-block.your-subdomain.workers.devのようなURLが表示されます。このURLをメモしておきます。

次に、.envファイルに以下の内容を追加・編集します。JWT_PRIVATE_KEYは既に生成されているはずです。APP_URLにはデプロイしたWorkerのURLを、AUTHORIZATION_SECRETSは空文字列で初期化し、NOTIFY_URLsにはNext.jsアプリケーションのブロック通知受信エンドポイント（例：http://localhost:3000/api/user-block）を設定します。AUTH0_TENANT_DOMAINにはAuth0のテナントドメインを、AUTH0_MANAGEMENT_CLIENT_IDとAUTH0_MANAGEMENT_CLIENT_SECRETには先ほどメモした値を、AUTH0_EVENT_STREAM_WEBHOOK_ENDPOINTにはWorkerのURL + /webhookを設定します。

環境変数をCloudflare Workerに設定します。以下のコマンドを実行します。

```bash
# JWT秘密鍵を設定
echo "$(grep JWT_PRIVATE_KEY .env | cut -d '=' -f2- | tr -d '\"')" | wrangler secret put JWT_PRIVATE_KEY

# Worker URLを設定
echo "https://notify-user-block.your-subdomain.workers.dev" | wrangler secret put APP_URL

# 通知先URLを設定
echo "https://your-next-app.vercel.app/api/user-block" | wrangler secret put NOTIFY_URLS
```

最後に、Auth0のEvent Streamを自動設定します。pnpm handle:event-streamコマンドを実行すると、ランダムなシークレットが生成され、.envのAUTHORIZATION_SECRETSが更新され、Workerにシークレットが設定され、Auth0でnotifyUserBlock Event Streamが作成または更新されます。

これで、Auth0でuser.updatedイベントが発生すると、WorkerのWebhookエンドポイントに通知が送信されるようになります。

### Next.jsアプリケーションの起動と確認

最後に、Next.jsアプリケーションをセットアップします。

client-and-resource-serverディレクトリで.env.localを作成します。以下の内容を設定してください。

```bash
# Auth0設定
AUTH0_ID="<Auth0のClient ID>"
AUTH0_SECRET="<Auth0のClient Secret>"
AUTH0_DOMAIN="your-tenant.us.auth0.com"
AUTH0_AUDIENCE="https://sample-id-app/api"

# NextAuth設定
AUTH_SECRET="$(openssl rand -base64 32)"

# アプリケーションURL
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Worker URL
USER_BLOCK_APP_URL="https://notify-user-block.your-subdomain.workers.dev"

# Upstash Redis
UPSTASH_REDIS_REST_URL="<VercelでコピーしたURL>"
UPSTASH_REDIS_REST_TOKEN="<Vercelでコピーしたトークン>"
```

依存関係をインストールし、開発サーバーを起動します。

```bash
pnpm install
pnpm dev
```

http://localhost:3000にアクセスして、アプリケーションが起動することを確認します。

### ユーザーブロック時の挙動確認

それでは、実際にユーザーブロック機能が動作するか確認してみましょう。

まず、Next.jsアプリケーション（http://localhost:3000）を開き、ログインボタンをクリックします。Auth0のログイン画面でテストユーザーでログインすると、/authedページにリダイレクトされ、APIレスポンスが表示されます。この時点では、正常にアクセスできるはずです。

次に、ユーザーをブロックします。Auth0 Dashboard → User Management → Usersを開き、ログインしたユーザーを選択して、Block Userボタンをクリックします。これにより、user.updatedイベントが発火し、Auth0からEvent Streamを通じてWorkerのwebhookエンドポイントに通知が送信され、WorkerはJWTを生成してNext.jsのapi/user-blockに送信し、RedisにブロックデータとしてUserIDがキーのtrueが保存されます。

数秒待った後、Next.jsアプリケーションで再リクエストボタンをクリックします。すると、「ユーザーはブロックされています」というエラーメッセージが表示されるはずです。

Workerの動作を詳しく確認したい場合は、wrangler tail --name notify-user-blockコマンドを実行します。このコマンドを実行した状態で、Auth0でユーザーをブロックすると、リアルタイムでログが表示されます。

Auth0側でもEvent Streamのログを確認できます。Auth0 Dashboard → Monitoring → Streamsを開き、notifyUserBlock Streamを選択して、HealthタブでイベントログをチェックできるのでEvents are being deliveredと表示されていることを確認しましょう。

最後に、RedisにブロックデータとしてUserIDがキーのtrueが保存されているかを確認します。Upstash Consoleにログインし、作成したRedisデータベースを選択して、Data Browserタブを開きます。ここで、ブロックされたユーザーのキー（例：auth0|123456789）がtrueで保存されていることを確認できます。

これで、システムが正常に動作していることが確認できました。
