# ============================================
# Data Sources
# ============================================
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ============================================
# SQS DLQ
# ============================================
resource "aws_sqs_queue" "dlq" {
  name                       = "${var.project_name}-dlq"
  visibility_timeout_seconds = 90      # 再処理時も同じLambda使用想定
  message_retention_seconds  = 1209600 # 14日（手動対応の猶予）

  tags = {
    Name    = "${var.project_name}-dlq"
    Project = var.project_name
  }
}

# ============================================
# SQS メインキュー
# ============================================
resource "aws_sqs_queue" "main" {
  name                       = "${var.project_name}-queue"
  visibility_timeout_seconds = 90     # Lambda timeout × 6
  message_retention_seconds  = 345600 # 4日
  receive_wait_time_seconds  = 20     # ロングポーリング

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3 # DLQ移動までのリトライ回数
  })

  tags = {
    Name    = "${var.project_name}-queue"
    Project = var.project_name
  }
}

# SQSキューポリシー（EventBridgeからの送信を許可）
resource "aws_sqs_queue_policy" "main" {
  queue_url = aws_sqs_queue.main.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowEventBridgeSendMessage"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.main.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_cloudwatch_event_rule.main.arn
          }
        }
      }
    ]
  })
}

# ============================================
# Lambda IAM Role
# ============================================
resource "aws_iam_role" "lambda" {
  name = "${var.project_name}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name    = "${var.project_name}-lambda-role"
    Project = var.project_name
  }
}

# Lambda基本実行ポリシー（CloudWatch Logs）
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Lambda SQSポリシー
resource "aws_iam_role_policy" "lambda_sqs" {
  name = "${var.project_name}-lambda-sqs-policy"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.main.arn
      }
    ]
  })
}

# ============================================
# Lambda Function
# ============================================
data "archive_file" "lambda" {
  type        = "zip"
  output_path = "${path.module}/lambda.zip"

  source {
    content  = <<-EOF
      const client = require('https');
      const { URL } = require('url');

      const TIMEOUT_MS = 10000;

      const postToUrl = (url, data) => {
        return new Promise((resolve, reject) => {
          const parsedUrl = new URL(url);
          const postData = JSON.stringify(data);

          const req = client.request({
            hostname: parsedUrl.hostname,
            port: 443,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData)
            },
            timeout: TIMEOUT_MS
          }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve({ statusCode: res.statusCode, body });
              } else {
                reject(new Error('HTTP ' + res.statusCode + ': ' + body));
              }
            });
          });

          req.on('error', reject);
          req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
          });
          req.write(postData);
          req.end();
        });
      };

      exports.handler = async (event) => {
        console.log('Received event:', JSON.stringify(event, null, 2));

        const urls = process.env.EXTERNAL_API_URLS
          ? process.env.EXTERNAL_API_URLS.split(',').filter(u => u.trim())
          : [];

        if (urls.length === 0) {
          console.warn('No external API URLs configured');
        }

        for (const record of event.Records) {
          const body = JSON.parse(record.body);
          console.log('Processing message:', JSON.stringify(body, null, 2));

          // EventBridge経由のAuth0イベントからuser_idとblockedを抽出
          const detail = body.detail || {};
          const data = detail.data?.object || {};
          const payload = {
            user_id: data.user_id,
            blocked: data.blocked
          };
          console.log('Extracted payload:', JSON.stringify(payload, null, 2));

          const results = await Promise.allSettled(
            urls.map(url => postToUrl(url.trim(), payload))
          );

          const failures = results.filter(r => r.status === 'rejected');
          if (failures.length > 0) {
            console.error('Failed requests:', failures.map(f => f.reason.message));
            throw new Error(failures.length + '/' + urls.length + ' requests failed');
          }

          console.log('Message processed successfully');
        }

        return { statusCode: 200, body: 'OK' };
      };
    EOF
    filename = "index.js"
  }
}

resource "aws_lambda_function" "main" {
  function_name = "${var.project_name}-handler"
  role          = aws_iam_role.lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"

  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256

  timeout     = 15  # 外部API 3秒 + 余裕
  memory_size = 128 # API呼び出しのみなので最小構成
  # reserved_concurrent_executions = 5  # アカウントの同時実行数制限のため無効化

  environment {
    variables = {
      EXTERNAL_API_URLS = join(",", var.external_api_urls)
    }
  }

  tags = {
    Name    = "${var.project_name}-handler"
    Project = var.project_name
  }
}

# ============================================
# Lambda SQS Trigger (Event Source Mapping)
# ============================================
resource "aws_lambda_event_source_mapping" "sqs" {
  event_source_arn = aws_sqs_queue.main.arn
  function_name    = aws_lambda_function.main.arn
  batch_size       = 1 # 1件ずつ処理
  enabled          = true

  depends_on = [aws_iam_role_policy.lambda_sqs]
}

# ============================================
# EventBridge Bus
# ============================================
# update-eventbus.shを実行することで自動で設定されます。
data "aws_cloudwatch_event_bus" "example" {
  name = "aws.partner/auth0.com/~/auth0.events"
}

# ============================================
# EventBridge Rule
# ============================================
resource "aws_cloudwatch_event_rule" "main" {
  name           = "${var.project_name}-rule"
  description    = "Event rule for ${var.project_name}"
  event_bus_name = data.aws_cloudwatch_event_bus.example.name

  # イベントパターン（必要に応じてカスタマイズ）
  event_pattern = jsonencode({
    source = [{
      "prefix" : "aws.partner/auth0.com/"
      }, {
      "anything-but" : {
        "prefix" : "aws."
      }
    }]
  })

  tags = {
    Name    = "${var.project_name}-rule"
    Project = var.project_name
  }
}

# EventBridge Target（SQSメインキューへ送信）
resource "aws_cloudwatch_event_target" "sqs" {
  rule           = aws_cloudwatch_event_rule.main.name
  target_id      = "SendToSQS"
  arn            = aws_sqs_queue.main.arn
  event_bus_name = data.aws_cloudwatch_event_bus.example.name
}

# ============================================
# CloudWatch Alarm (DLQ監視)
# ============================================
resource "aws_cloudwatch_metric_alarm" "dlq" {
  alarm_name          = "${var.project_name}-dlq-alarm"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "DLQにメッセージが存在する場合にアラート"
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.dlq.name
  }


  tags = {
    Name    = "${var.project_name}-dlq-alarm"
    Project = var.project_name
  }
}
