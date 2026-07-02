package audit

import (
	"context"

	"sample-id-app/policy-parity-verification/internal/oktaclient"
)

func Run(ctx context.Context, orgURL, policyID, since, out string) (oktaclient.AuditReport, error) {
	client, err := oktaclient.New(orgURL)
	if err != nil {
		return oktaclient.AuditReport{}, err
	}
	return client.AuditPolicy(ctx, policyID, since, out)
}
