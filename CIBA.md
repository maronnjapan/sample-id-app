CIBAについてのメモ

- Okta User Verify API
    - CIBAと似ているが独自仕様
    - binding_messageはできない
        - passcodeを使えば一応、識別はできる？
    - user_code的なCIBAを開始するために必要な値を求める機能は独自で必要となる。
    - auth_req_idのようなトランザクション的な機能はある
    - ユーザー識別からプッシュだけに限定すればCIBAと似ている。

## CIBA登場人物
- auth_req_id:一連のCIBAであることを示すトランザクションID
- Authentication Device(AD):実際に承認するデバイス
- Consumption Device (CD):CIBAを開始するためのデバイス
- biding_message:承認するユーザーがなんの承認かを確認するメッセージ
- user_code:CDがCIBAを開始するために入力するコード。CIBA専用の静的パスワードのイメージ。これがないとOPは正当なCIBA開始のリクエストとみなさない。
