# EventBridge → SQS → Lambda 構成仕様

## アーキテクチャ概要
```
EventBridge
    ↓
SQS (メインキュー)
    ↓
Lambda → 外部API
    ↓ (3回失敗後)
SQS (DLQ) → 手動再処理
```

## 要件

- 外部APIレイテンシ: 3秒
- リトライ: 最大3回（3回失敗でDLQへ）
- 失敗時: DLQで手動再処理
- 順序性: 不要
- 想定イベント数: 約20件/日（検証用途）

## コンポーネント設定仕様

### SQS メインキュー

| 項目 | 値 | 備考 |
|------|-----|------|
| visibility_timeout_seconds | 90 | Lambda timeout × 6 |
| message_retention_seconds | 345600 | 4日 |
| receive_wait_time_seconds | 20 | ロングポーリング |
| redrive_policy.maxReceiveCount | 3 | DLQ移動までのリトライ回数 |

### SQS DLQ

| 項目 | 値 | 備考 |
|------|-----|------|
| visibility_timeout_seconds | 90 | 再処理時も同じLambda使用想定 |
| message_retention_seconds | 1209600 | 14日（手動対応の猶予） |

### Lambda

| 項目 | 値 | 備考 |
|------|-----|------|
| timeout | 15 | 外部API 3秒 + 余裕 |
| memory_size | 128 | API呼び出しのみなので最小構成 |
| reserved_concurrent_executions | 5 | 検証段階なので絞る |

### Lambda SQSトリガー (event_source_mapping)

| 項目 | 値 | 備考 |
|------|-----|------|
| batch_size | 1 | 1件ずつ処理 |
| enabled | true | - |

### EventBridge → SQS

| 項目 | 値 | 備考 |
|------|-----|------|
| target | SQSメインキュー | DLQではなくメインキューへ |

## リトライ動作

1. Lambda処理失敗 → 例外をthrow
2. SQSが90秒後に再配信
3. 3回失敗後、DLQへ移動
4. DLQのメッセージは手動で再処理（AWS Console or CLI）

## 監視

- CloudWatch Alarm: DLQの `ApproximateNumberOfMessagesVisible > 0` で通知

## Lambda実装方針

- 成功時: 正常終了（メッセージ自動削除）
- 失敗時: 例外をthrow（SQSが再配信）
- 外部API呼び出しのtimeoutは10秒に設定

## Terraform実装時の注意

- SQS → DLQ の redrive_policy 設定を忘れない
- Lambda実行ロールに SQS の ReceiveMessage, DeleteMessage, GetQueueAttributes 権限付与
- EventBridge → SQS の権限（SQSキューポリシー）を設定