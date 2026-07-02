package oktaclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/okta/okta-sdk-golang/v6/okta"

	"sample-id-app/policy-parity-verification/internal/jsonio"
)

type Client struct {
	orgURL string
	token  string
	mode   string
	http   *http.Client
}

type FetchMeta struct {
	PolicyID        string            `json:"policy_id"`
	OrgURL          string            `json:"org_url"`
	FetchedAtUTC    string            `json:"fetched_at_utc"`
	SDKVersion      string            `json:"okta_sdk_version"`
	PolicyEndpoint  string            `json:"policy_endpoint"`
	RulesEndpoint   string            `json:"rules_endpoint"`
	RulesPageCount  int               `json:"rules_page_count"`
	ResponseHeaders map[string]string `json:"response_headers"`
}

type AuditReport struct {
	PolicyID     string `json:"policy_id"`
	Since        string `json:"since"`
	QueriedAtUTC string `json:"queried_at_utc"`
	SDKVersion   string `json:"okta_sdk_version"`
	Filter       string `json:"filter"`
	EventCount   int    `json:"event_count"`
	Changed      bool   `json:"changed"`
	Events       []any  `json:"events"`
}

func New(orgURL string) (*Client, error) {
	cfg, err := okta.NewConfiguration()
	if err != nil {
		return nil, err
	}
	if orgURL == "" {
		orgURL = cfg.Okta.Client.OrgUrl
	}
	if orgURL == "" {
		return nil, fmt.Errorf("org URL is required via --org-url or OKTA_CLIENT_ORGURL")
	}
	token := cfg.Okta.Client.Token
	if token == "" {
		token = os.Getenv("OKTA_CLIENT_ACCESS_TOKEN")
	}
	if token == "" {
		return nil, fmt.Errorf("token is required via OKTA_CLIENT_TOKEN or OKTA_CLIENT_ACCESS_TOKEN")
	}
	mode := cfg.Okta.Client.AuthorizationMode
	if mode == "" {
		mode = "SSWS"
	}
	return &Client{
		orgURL: strings.TrimRight(orgURL, "/"),
		token:  token,
		mode:   mode,
		http:   &http.Client{Timeout: 60 * time.Second},
	}, nil
}

func (c *Client) FetchPolicy(ctx context.Context, policyID, outDir string) error {
	policyURL := c.orgURL + "/api/v1/policies/" + url.PathEscape(policyID)
	rulesURL := policyURL + "/rules"
	policyRaw, policyHeader, err := c.get(ctx, policyURL)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return err
	}
	if err := jsonio.WriteFileAtomic(filepath.Join(outDir, "policy.json"), append(bytes.TrimSpace(policyRaw), '\n'), 0o644); err != nil {
		return err
	}
	rulePages, headers, err := c.getAllPages(ctx, rulesURL)
	if err != nil {
		return err
	}
	var rules []any
	pagesDir := filepath.Join(outDir, "rules-pages")
	if err := os.MkdirAll(pagesDir, 0o755); err != nil {
		return err
	}
	for i, raw := range rulePages {
		pagePath := filepath.Join(pagesDir, fmt.Sprintf("page-%03d.json", i+1))
		if err := jsonio.WriteFileAtomic(pagePath, append(bytes.TrimSpace(raw), '\n'), 0o644); err != nil {
			return err
		}
		var page []any
		dec := json.NewDecoder(bytes.NewReader(raw))
		dec.UseNumber()
		if err := dec.Decode(&page); err != nil {
			return fmt.Errorf("decode rules page %d: %w", i+1, err)
		}
		rules = append(rules, page...)
	}
	if err := jsonio.WriteJSON(filepath.Join(outDir, "rules.json"), rules); err != nil {
		return err
	}
	mergedHeaders := flattenHeader(policyHeader)
	for k, v := range flattenHeader(headers) {
		mergedHeaders[k] = v
	}
	meta := FetchMeta{
		PolicyID:        policyID,
		OrgURL:          c.orgURL,
		FetchedAtUTC:    time.Now().UTC().Format(time.RFC3339Nano),
		SDKVersion:      okta.VERSION,
		PolicyEndpoint:  "/api/v1/policies/{policyId}",
		RulesEndpoint:   "/api/v1/policies/{policyId}/rules",
		RulesPageCount:  len(rulePages),
		ResponseHeaders: mergedHeaders,
	}
	return jsonio.WriteJSON(filepath.Join(outDir, "meta.json"), meta)
}

func (c *Client) AuditPolicy(ctx context.Context, policyID, since, out string) (AuditReport, error) {
	if _, err := time.Parse(time.RFC3339, since); err != nil {
		return AuditReport{}, fmt.Errorf("--since must be RFC3339 UTC timestamp: %w", err)
	}
	filter := fmt.Sprintf(`target.id eq "%s"`, policyID)
	u, err := url.Parse(c.orgURL + "/api/v1/logs")
	if err != nil {
		return AuditReport{}, err
	}
	q := u.Query()
	q.Set("since", since)
	q.Set("filter", filter)
	q.Set("limit", "1000")
	u.RawQuery = q.Encode()
	pages, _, err := c.getAllPages(ctx, u.String())
	if err != nil {
		return AuditReport{}, err
	}
	var events []any
	for i, raw := range pages {
		var page []any
		dec := json.NewDecoder(bytes.NewReader(raw))
		dec.UseNumber()
		if err := dec.Decode(&page); err != nil {
			return AuditReport{}, fmt.Errorf("decode audit page %d: %w", i+1, err)
		}
		events = append(events, page...)
	}
	report := AuditReport{
		PolicyID:     policyID,
		Since:        since,
		QueriedAtUTC: time.Now().UTC().Format(time.RFC3339Nano),
		SDKVersion:   okta.VERSION,
		Filter:       filter,
		EventCount:   len(events),
		Changed:      len(events) > 0,
		Events:       events,
	}
	if out != "" {
		if err := jsonio.WriteJSON(out, report); err != nil {
			return AuditReport{}, err
		}
	}
	return report, nil
}

func (c *Client) getAllPages(ctx context.Context, firstURL string) ([][]byte, http.Header, error) {
	var pages [][]byte
	var lastHeader http.Header
	nextURL := firstURL
	for nextURL != "" {
		raw, header, err := c.get(ctx, nextURL)
		if err != nil {
			return nil, nil, err
		}
		pages = append(pages, raw)
		lastHeader = header
		nextURL = nextLink(header)
	}
	return pages, lastHeader, nil
}

func (c *Client) get(ctx context.Context, url string) ([]byte, http.Header, error) {
	var lastErr error
	for attempt := 0; attempt < 5; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return nil, nil, err
		}
		req.Header.Set("Accept", "application/json")
		req.Header.Set("User-Agent", "policyparity okta-sdk-golang/"+okta.VERSION)
		req.Header.Set("Authorization", c.authorizationHeader())
		resp, err := c.http.Do(req)
		if err != nil {
			return nil, nil, err
		}
		raw, readErr := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		if readErr != nil {
			return nil, nil, readErr
		}
		if resp.StatusCode == http.StatusTooManyRequests {
			wait := retryAfter(resp.Header)
			if wait == 0 {
				wait = time.Duration(1+attempt) * time.Second
			}
			timer := time.NewTimer(wait)
			select {
			case <-ctx.Done():
				timer.Stop()
				return nil, nil, ctx.Err()
			case <-timer.C:
			}
			lastErr = fmt.Errorf("429 from Okta")
			continue
		}
		if resp.StatusCode >= 300 {
			body := strings.TrimSpace(string(raw))
			if len(body) > 500 {
				body = body[:500] + "..."
			}
			return nil, nil, fmt.Errorf("GET %s failed: %s: %s", redactQuery(url), resp.Status, body)
		}
		return raw, resp.Header, nil
	}
	return nil, nil, lastErr
}

func (c *Client) authorizationHeader() string {
	mode := strings.TrimSpace(c.mode)
	if strings.EqualFold(mode, "Bearer") || strings.EqualFold(mode, "OAuth2") {
		return "Bearer " + c.token
	}
	if mode == "" {
		mode = "SSWS"
	}
	return mode + " " + c.token
}

func retryAfter(h http.Header) time.Duration {
	v := h.Get("Retry-After")
	if v == "" {
		return 0
	}
	if n, err := time.ParseDuration(v + "s"); err == nil {
		return n
	}
	return 0
}

func nextLink(h http.Header) string {
	for _, header := range h.Values("Link") {
		for _, part := range strings.Split(header, ",") {
			sections := strings.Split(part, ";")
			if len(sections) < 2 {
				continue
			}
			rawURL := strings.Trim(strings.TrimSpace(sections[0]), "<>")
			for _, section := range sections[1:] {
				if strings.TrimSpace(section) == `rel="next"` {
					return rawURL
				}
			}
		}
	}
	return ""
}

func flattenHeader(h http.Header) map[string]string {
	out := map[string]string{}
	for k, vals := range h {
		lk := strings.ToLower(k)
		if lk == "authorization" || lk == "cookie" || lk == "set-cookie" {
			continue
		}
		out[k] = strings.Join(vals, ", ")
	}
	return out
}

func redactQuery(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	u.RawQuery = ""
	return u.String()
}
