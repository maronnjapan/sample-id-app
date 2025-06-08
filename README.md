## このプロジェクトについて
このプロジェクトは[Device Bound Session Credentials](https://w3c.github.io/webappsec-dbsc/)の挙動をローカルで試すためのプロジェクトです。

## 検証環境
以下設定を行った後にて動作することを確認しています。
- Chromeのバージョン：135.0.7049.115
- [chrome://flags/#enable-standard-device-bound-session-credentials](chrome://flags/#enable-standard-device-bound-session-credentials)が「Enable Without Origin Trial Token」となっている
- [chrome://flags/#enable-standard-device-bound-sesssion-refresh-quota](chrome://flags/#enable-standard-device-bound-sesssion-refresh-quota)がDisabledとなっている

以下のような設定です。
![設定のキャプチャ](./public/2025-04-28_11h06_30.png)

## 必要な環境
- docker
  - DBを動かすために用意しています。
- Node.js
  - Next.jsを動かすために必要です。
  - バージョンはNext.jsとPrismaが動けば何でもいいかなと思います。(v20.11.1で動作することは確認しています。)

## 動かし方
1. `docker compose up -d`でDBコンテナを起動します。
2. .env.exampleをコピーし、.envファイルに名前を変更します。
3. `npm run prisma:push`を実行し、DBの準備を行います。
4. `npm install`を実行
5. `npm run dev`でアプリを起動
6. [http://localhost:3000](http://localhost:3000)にアクセス

## 画面の動きについて
1. アプリが起動できたら以下のフローを行うための処理が実行されヘッダー情報などが、画面に出力されます。
![セッションの開始](./public/2025-05-05_12h31_36.png)  
[Device Bound Session Credentials explainer](https://github.com/w3c/webappsec-dbsc/blob/main/reg_and_refresh.svg)より引用
2. `Cookie Expired`というログが画面に出力されたら、「Fetch Data」をクリックします。
3. すると、以下のリフレッシュするフローが実行され、リフレッシュを行った結果が画面に出力されます。
![セッションの更新](./public/2025-05-05_12h33_37.png)  
[Device Bound Session Credentials explainer](https://github.com/w3c/webappsec-dbsc/blob/main/reg_and_refresh.svg)より引用

## 参考資料
[こちらのブログ](https://zenn.dev/maronn/articles/program-dbsc-app)にて、DBSCに関わるエンドポイントの説明を記載しておりますので、参考にしていただけますと幸いです。
