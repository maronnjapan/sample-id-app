package fetch

import (
	"context"

	"sample-id-app/policy-parity-verification/internal/oktaclient"
)

func Run(ctx context.Context, orgURL, policyID, outDir string) error {
	client, err := oktaclient.New(orgURL)
	if err != nil {
		return err
	}
	return client.FetchPolicy(ctx, policyID, outDir)
}
