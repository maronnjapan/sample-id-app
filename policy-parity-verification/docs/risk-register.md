# Risk Register

| ID | リスク | 影響 | 低減策 | 状態 |
|---|---|---|---|---|
| R1 | TF state に存在しない項目がある | state 比較の盲点 | L1(API 直比較)を主判定にする | 初期登録 |
| R2 | provider で表現できない設定項目がある | TF が将来のドリフトを検知できない | L2 で列挙し、API スナップショット比較で監視 | 初期登録 |
| R3 | API には出るが provider で管理できない項目 | R2 と同様 | provider issue 起票や API 直接設定の補完を検討 | 初期登録 |
| R4 | 管理画面限定表示項目が API と対応不明 | L1 の盲点 | 初回に UI と API response の対応を棚卸しする | 初期登録 |
| R5 | API default と TF default の差異 | 誤差分または plan ノイズ | TF コードに明示値を書く。文書化 default のみ注入可 | 初期登録 |
| R6 | null / empty / omitted の差異 | 誤 PASS / 誤 FAIL | 宣言的ルールと T18 系テストで担保 | 初期登録 |
| R7 | rule priority の扱いミス | 評価順差分の見逃し | priority sort 後も priority 値を比較。T12/T13 で担保 | 初期登録 |
| R8 | rule evaluation order の扱いミス | 評価順差分の見逃し | 同上 | 初期登録 |
| R9 | 意味のある配列順序をソートで消す | 重大差分の見逃し | 全配列 path 分類を強制。未分類は exit 2 | 初期登録 |
| R10 | 除外項目の広げすぎ | 本来差分の見逃し | 除外理由必須、ヒット 0 警告、decision-log 承認 | 初期登録 |
| R11 | アプリ割り当て対象外の誤解 | ポリシー本体同一性と適用範囲同一性の混同 | report のスコープ宣言に明記 | 初期登録 |
| R12 | provider version 変更 | 再現性喪失 | lock file と report に version を記録 | 初期登録 |
| R13 | API version 変更 | 誤 FAIL / 比較不能 | fetch meta に SDK/API 関連情報を記録 | 初期登録 |
| R14 | 検証後の手動変更 | 同一宣言の陳腐化 | System Log 監査を定期実行 | 初期登録 |
| R15 | 設定値同一でも挙動が完全同一とは限らない | 理論上の残リスク | 代表パスの L5 スモークで補強 | 初期登録 |
| R16 | 取得タイミング差 | 過渡的不一致 | 近接時刻取得。FAIL 時は再取得で再現性確認 | 初期登録 |
| R17 | SDK 型付き構造体経由のフィールド欠落 | unknown field 差分の見逃し | fetch は raw body を保存し、fixture に未知フィールドを常設 | 初期登録 |
| R18 | SDK version 更新 | transport 挙動変化 | go.mod で v6.1.6 固定。更新時は再検証 | 初期登録 |
