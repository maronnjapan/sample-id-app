# Development Commands

## Initial Setup
```bash
mise run setup    # Install tools and configure Auth0/AWS providers
```

## Auth0 Terraform
```bash
cd auth0
terraform init
terraform plan
terraform apply
```

## AWS Terraform
```bash
cd aws
terraform init
terraform plan
terraform apply
bash update-eventbus.sh  # Link Auth0 event source to EventBridge
```

## Cloudflare Workers App (resource-app)
```bash
cd resource-app
pnpm install              # Install dependencies
pnpm run dev              # Development server
pnpm run build            # Build for production
pnpm run deploy           # Build and deploy to Cloudflare Workers
pnpm run drizzle:generate # Generate Drizzle migrations
pnpm run drizzle:migrate  # Apply migrations to local D1
pnpm run drizzle:studio   # Open Drizzle Studio
pnpm run generate-types   # Generate Wrangler types
bash setup-deploy.sh      # Full setup and deploy
```

## Tool Versions (managed by mise)
- Terraform: 1.14.3
- AWS CLI: 2.27.41
- Wrangler: 4.54.0
- Auth0 CLI: latest
