## このブランチについて

このブランチはOktaのSWAによるログインを体感できます。

### 動作確認するための前提
動作確認をするためには以下の状態が揃っていることが前提です。  
- 操作可能なOkta Organizationが存在している。  
- TerraformもしくはOpenTofuが使用できる。
- npmコマンドが使用できる

### 動作確認方法
詳細は[こちらの記事](https://zenn.dev/maronn/articles/practice-okta-swa-app)に記載しています。  
上記記事の簡略版を以下に記載します。
- Oktaにて、OpenTofu(Terraform)用のAPI Serviceアプリケーションを作成する
    - 作成後はクライアントIDを控えておく
- アプリケーションのクライアント認証方式を、クライアントシークレットから公開鍵/暗号鍵方式に変更し、鍵を生成する
- 生成した鍵をPEM形式でコピーし、opentofuディレクトリ直下にファイルを作成し、コピーした秘密鍵を貼り付ける
    - この時秘密鍵を示すIDもOkta側の画面にKIDとして表示されているので、その値も控えておく
- opentofuディレクトリ配下の`terraform.tfvars.example`を`terraform.tfvars`に変更し、上記OktaアプリのOrganization名、ドメイン、クライアントID、秘密鍵のID、秘密鍵のファイルパスを記載する
- opentofuディレクトリに移動し `tofu init` → `tofu apply`でOkta側にアプリケーションを作成する(`tofu`部分は`terraform`に置き換えてもよい)
- [Okta Browser Plugin](https://help.okta.com/eu/ja-jp/content/topics/end-user/plugin-download_install.htm)をブラウザに設定する
- login-app配下に移動し、`npm i`実行後、`npm run dev`でアプリを起動する
- `http://localhost:5173/login`にアクセスする