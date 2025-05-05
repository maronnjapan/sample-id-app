## このプロジェクトについて
このプロジェクトは[Device Bound Session Credentials](https://w3c.github.io/webappsec-dbsc/)の挙動をローカルで試すためのプロジェクトです。

## 検証環境
以下設定を行った後にて動作することを確認しています。
- Chromeのバージョン：135.0.7049.115
- [chrome://flags/#enable-standard-device-bound-session-credentials](chrome://flags/#enable-standard-device-bound-session-credentials)が「Enable Without Origin Trial Token」となっている
- [chrome://flags/#enable-standard-device-bound-sesssion-refresh-quota](chrome://flags/#enable-standard-device-bound-sesssion-refresh-quota)がDisabledとなっている

以下のような設定です。
![設定のキャプチャ](./public/2025-04-28_11h06_30.png)

## 動かし方
1. `npm install`を実行
2. `npm run dev`でアプリを起動
3. [http://localhost:3000](http://localhost:3000)にアクセス
4. 以下のフローを行うための処理が実行されヘッダー情報などが、画面に出力されます。
![セッションの開始](./public/2025-05-05_12h31_36.png)
5. `Cookie Expired`というログが画面に出力されたら、「Fetch Data」をクリックします。
6. すると、以下のリフレッシュするフローが実行され、リフレッシュを行った結果が画面に出力されます。
![セッションの更新](./public/2025-05-05_12h33_37.png)
