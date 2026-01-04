terraform {
  required_providers {
    auth0 = {
      source  = "auth0/auth0"
      version = ">= 1.0.0"
    }
  }
}

provider "auth0" {
  domain        = var.auth0_domain
  client_id     = var.auth0_client_id
  client_secret = var.auth0_client_secret
}

resource "auth0_event_stream" "eventbridge_stream" {
  name             = "sample-aws-eventbridge-stream"
  destination_type = "eventbridge" # Required
  subscriptions    = ["user.updated"]

  eventbridge_configuration {
    aws_account_id = var.aws_account_id
    aws_region     = var.aws_region
  }
}

output "eventbridge_stream_id" {
  description = "Auth0 Event Stream ID for EventBridge"
  value       = auth0_event_stream.eventbridge_stream.id
}
