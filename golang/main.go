// Okta System Log取得（Private Key JWT認証）
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/okta/okta-sdk-golang/v5/okta"
)

func buildClient() (*okta.APIClient, error) {
	scopes := []string{"okta.logs.read"}

	opts := []okta.ConfigSetter{
		okta.WithOrgUrl(os.Getenv("OKTA_ORG_URL")),
		okta.WithAuthorizationMode("PrivateKey"),
		okta.WithClientId(os.Getenv("OKTA_CLIENT_ID")),
		okta.WithScopes(scopes),
		okta.WithPrivateKey(os.Getenv("OKTA_PRIVATE_KEY")),
	}

	// kid が設定されていれば付与（複数JWK登録時に必要）
	if kid := os.Getenv("OKTA_PRIVATE_KEY_ID"); kid != "" {
		opts = append(opts, okta.WithPrivateKeyId(kid))
	}

	config, err := okta.NewConfiguration(opts...)
	if err != nil {
		return nil, fmt.Errorf("configuration error: %w", err)
	}

	return okta.NewAPIClient(config), nil
}

func fetchLogs(ctx context.Context, client *okta.APIClient, since time.Time, limit int32) error {
	req := client.SystemLogAPI.ListLogEvents(ctx).
		Limit(limit).
		SortOrder("DESCENDING")

	if !since.IsZero() {
		req = req.Since(since)
	}

	events, resp, err := req.Execute()
	if err != nil {
		return fmt.Errorf("failed to list log events: %w", err)
	}
	defer resp.Body.Close()

	for _, event := range events {
		actorName := "N/A"
		if event.Actor != nil && event.Actor.DisplayName != nil {
			actorName = *event.Actor.DisplayName
		}
		outcome := "N/A"
		if event.Outcome != nil && event.Outcome.Result != nil {
			outcome = string(*event.Outcome.Result)
		}
		fmt.Printf("[%v] %v - actor=%s, outcome=%s\n",
			event.Published, event.EventType, actorName, outcome)
	}

	fmt.Printf("\n取得件数: %d\n", len(events))
	return nil
}

func main() {
	client, err := buildClient()
	if err != nil {
		log.Fatalf("クライアント作成エラー: %v", err)
	}

	ctx := context.Background()
	if err := fetchLogs(ctx, client, time.Time{}, 20); err != nil {
		log.Fatalf("ログ取得エラー: %v", err)
	}
}
