# サンプルリソース: S3バケット
# 実際のリソースに置き換えてください

resource "aws_s3_bucket" "example" {
  bucket = "${var.project_name}-example-bucket-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name        = "${var.project_name}-example"
    Environment = "dev"
    ManagedBy   = "Terraform"
  }
}

resource "aws_s3_bucket_versioning" "example" {
  bucket = aws_s3_bucket.example.id

  versioning_configuration {
    status = "Enabled"
  }
}

# 現在のAWSアカウント情報を取得
data "aws_caller_identity" "current" {}

# 出力
output "account_id" {
  description = "AWS Account ID"
  value       = data.aws_caller_identity.current.account_id
}

output "caller_arn" {
  description = "ARN of the AWS identity making the request"
  value       = data.aws_caller_identity.current.arn
}

output "s3_bucket_name" {
  description = "Name of the created S3 bucket"
  value       = aws_s3_bucket.example.id
}
