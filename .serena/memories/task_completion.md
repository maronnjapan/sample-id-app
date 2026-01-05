# Task Completion Checklist

## After Terraform Changes
1. Run `terraform fmt` to format code
2. Run `terraform validate` to check syntax
3. Run `terraform plan` to preview changes

## After resource-app Code Changes
1. Run `pnpm run build` to verify build succeeds
2. Test locally with `pnpm run dev`

## Notes
- No automated test suite configured
- No linter configured for TypeScript code
- Terraform tfvars files contain sensitive data (not in git)
