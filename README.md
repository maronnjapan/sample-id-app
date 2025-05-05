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
4. 
