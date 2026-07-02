package verify

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"sample-id-app/policy-parity-verification/internal/coverage"
	"sample-id-app/policy-parity-verification/internal/diffcmp"
	"sample-id-app/policy-parity-verification/internal/jsonio"
	"sample-id-app/policy-parity-verification/internal/jsonpath"
	"sample-id-app/policy-parity-verification/internal/normalize"
	"sample-id-app/policy-parity-verification/internal/rules"
)

func TestVerifierMutations(t *testing.T) {
	nr := loadNormalizeRules(t)
	ex := loadExcludes(t)
	tests := []struct {
		id       string
		mutate   func(t *testing.T, existing, newer any)
		want     string
		wantWarn bool
	}{
		{id: "T01_exact_match", want: "pass"},
		{id: "T02_policy_name_only", want: "pass", mutate: func(t *testing.T, _, newer any) { setPath(t, newer, "$.name", "New Auth Policy") }},
		{id: "T03_policy_id_only", want: "pass", mutate: func(t *testing.T, _, newer any) { setPath(t, newer, "$.id", "rstNew") }},
		{id: "T04_rule_id_only", want: "pass", mutate: func(t *testing.T, _, newer any) { setPath(t, newer, "$.rules[0].id", "rulNew") }},
		{id: "T05_timestamps_only", want: "pass", mutate: func(t *testing.T, _, newer any) {
			setPath(t, newer, "$.created", "2026-02-01T00:00:00.000Z")
			setPath(t, newer, "$.lastUpdated", "2026-02-02T00:00:00.000Z")
			setPath(t, newer, "$.rules[0].created", "2026-02-01T00:00:00.000Z")
			setPath(t, newer, "$.rules[0].lastUpdated", "2026-02-02T00:00:00.000Z")
		}},
		{id: "T06_links_only", want: "pass", mutate: func(t *testing.T, _, newer any) {
			setPath(t, newer, "$._links.self.href", "https://example.okta.com/changed")
			setPath(t, newer, "$.rules[0]._links.self.href", "https://example.okta.com/changed-rule")
		}},
		{id: "T07_app_assignment_only", want: "pass", mutate: func(t *testing.T, _, newer any) {
			setPath(t, newer, "$.conditions.app.include", []any{"0oa_new"})
			setPath(t, newer, "$.rules[0].conditions.app.include", []any{"0oa_new"})
		}},
		{id: "T08_network_condition_change", want: "fail", mutate: func(t *testing.T, _, newer any) {
			setPath(t, newer, "$.rules[0].conditions.network.include[0]", "nzChanged")
		}},
		{id: "T09_access_change", want: "fail", mutate: func(t *testing.T, _, newer any) { setPath(t, newer, "$.rules[0].actions.appSignOn.access", "DENY") }},
		{id: "T10_mfa_change", want: "fail", mutate: func(t *testing.T, _, newer any) {
			setPath(t, newer, "$.rules[0].actions.appSignOn.verificationMethod.factorMode", "1FA")
		}},
		{id: "T11_session_change", want: "fail", mutate: func(t *testing.T, _, newer any) {
			setPath(t, newer, "$.rules[0].actions.signon.session.maxSessionIdleMinutes", json.Number("30"))
		}},
		{id: "T12_rule_priority_value_change", want: "fail", mutate: func(t *testing.T, _, newer any) { setPath(t, newer, "$.rules[0].priority", json.Number("10")) }},
		{id: "T13_rule_evaluation_order_change", want: "fail", mutate: func(t *testing.T, _, newer any) {
			setPath(t, newer, "$.rules[0].priority", json.Number("2"))
			setPath(t, newer, "$.rules[1].priority", json.Number("1"))
		}},
		{id: "T14_rule_count_change", want: "fail", mutate: func(t *testing.T, _, newer any) {
			setPath(t, newer, "$.rules", mustGetPath(t, newer, "$.rules").([]any)[:1])
		}},
		{id: "T15_rule_status_change", want: "fail", mutate: func(t *testing.T, _, newer any) { setPath(t, newer, "$.rules[0].status", "INACTIVE") }},
		{id: "T16_unordered_array_reorder", want: "pass", mutate: func(t *testing.T, _, newer any) {
			setPath(t, newer, "$.rules[0].conditions.people.groups.include", []any{"00gA", "00gB"})
		}},
		{id: "T17_ordered_array_reorder", want: "fail", mutate: func(t *testing.T, _, newer any) {
			constraints := mustGetPath(t, newer, "$.rules[0].actions.appSignOn.verificationMethod.constraints").([]any)
			constraints[0], constraints[1] = constraints[1], constraints[0]
		}},
		{id: "T18a_null_vs_absent", want: "pass", mutate: func(t *testing.T, existing, _ any) { setPath(t, existing, "$.optionalNull", nil) }},
		{id: "T18b_empty_array_vs_absent", want: "fail", mutate: func(t *testing.T, existing, newer any) {
			setPath(t, existing, "$.conditions.people.users.include", []any{})
			deletePath(t, newer, "$.conditions.people.users.include")
		}},
		{id: "T18c_null_significant", want: "fail", mutate: func(t *testing.T, _, newer any) {
			deletePath(t, newer, "$.rules[0].actions.appSignOn.verificationMethod.reauthenticateIn")
		}},
		{id: "T19_unknown_field_added", want: "fail", mutate: func(t *testing.T, _, newer any) { setPath(t, newer, "$.newUnknownField", "must-fail") }},
		{id: "T20_non_excluded_diff", want: "fail", mutate: func(t *testing.T, _, newer any) { setPath(t, newer, "$.xProviderUnknownStable.enabled", false) }},
		{id: "T21_unclassified_array", want: "error", mutate: func(t *testing.T, _, newer any) {
			setPath(t, newer, "$.rules[0].conditions.unclassified.values", []any{"x"})
		}},
		{id: "T22_unused_exclude_warning", want: "pass", wantWarn: true, mutate: func(t *testing.T, _, _ any) {
			ex.Paths = append(ex.Paths, rules.PathReason{Path: "$.doesNotExist", Reason: "fixture warning test"})
		}},
	}
	for _, tc := range tests {
		t.Run(tc.id, func(t *testing.T) {
			existing := baseDoc(t)
			newer := clone(t, existing)
			localEx := ex
			if tc.mutate != nil {
				tc.mutate(t, existing, newer)
			}
			if tc.id == "T22_unused_exclude_warning" {
				localEx.Paths = append(localEx.Paths, rules.PathReason{Path: "$.doesNotExist", Reason: "fixture warning test"})
			}
			en, elog, eerr := normalize.Normalize(existing, nr, localEx, nil)
			nn, nlog, nerr := normalize.Normalize(newer, nr, localEx, nil)
			if tc.want == "error" {
				if !isUnclassified(eerr) && !isUnclassified(nerr) {
					t.Fatalf("expected unclassified array error, got existing=%v new=%v", eerr, nerr)
				}
				return
			}
			if eerr != nil || nerr != nil {
				t.Fatalf("unexpected normalize error: existing=%v new=%v", eerr, nerr)
			}
			result := diffcmp.Compare(en, nn)
			switch tc.want {
			case "pass":
				if !result.Identical {
					t.Fatalf("expected pass, got diffs: %#v", result.Diffs)
				}
			case "fail":
				if result.Identical {
					t.Fatalf("expected fail, got identical")
				}
			default:
				t.Fatalf("unknown expectation %s", tc.want)
			}
			if tc.wantWarn && len(elog.Warnings)+len(nlog.Warnings) == 0 {
				t.Fatalf("expected warning for unused exclude path")
			}
		})
	}
}

func TestCoverageDetectsProviderGapT24(t *testing.T) {
	api := map[string]any{
		"knownField":          "ok",
		"providerOnlyUnknown": true,
	}
	schema := map[string]any{
		"provider_schemas": map[string]any{
			"registry.terraform.io/example/test": map[string]any{
				"resource_schemas": map[string]any{
					"test_resource": map[string]any{
						"block": map[string]any{
							"attributes": map[string]any{
								"known_field": map[string]any{"type": "string"},
							},
						},
					},
				},
			},
		},
	}
	rep, err := coverage.Check(schema, api, []string{"test_resource"}, rules.SchemaMapping{}, rules.ExcludeFile{})
	if err != nil {
		t.Fatal(err)
	}
	if len(rep.UnmappedAPIFields) != 1 {
		t.Fatalf("expected one unmapped field, got %#v", rep.UnmappedAPIFields)
	}
	if rep.UnmappedAPIFields[0].Path != "$.providerOnlyUnknown" {
		t.Fatalf("unexpected unmapped path: %#v", rep.UnmappedAPIFields)
	}
}

func baseDoc(t *testing.T) any {
	t.Helper()
	policy := readFixture(t, "base_policy.json").(map[string]any)
	rulesDoc := readFixture(t, "base_rules.json")
	policy["rules"] = rulesDoc
	return policy
}

func readFixture(t *testing.T, name string) any {
	t.Helper()
	v, err := jsonio.ReadJSON(filepath.Join("testdata", "fixtures", name))
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func loadNormalizeRules(t *testing.T) rules.NormalizeRules {
	t.Helper()
	nr, err := rules.LoadNormalize(filepath.Join("..", "..", "config", "normalize-rules.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	return nr
}

func loadExcludes(t *testing.T) rules.ExcludeFile {
	t.Helper()
	ex, err := rules.LoadExclude(filepath.Join("..", "..", "config", "exclude-paths.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	return ex
}

func clone(t *testing.T, v any) any {
	t.Helper()
	out, err := jsonio.Clone(v)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func mustGetPath(t *testing.T, doc any, path string) any {
	t.Helper()
	parent, key, err := parentForPath(doc, path, false)
	if err != nil {
		t.Fatal(err)
	}
	switch p := parent.(type) {
	case map[string]any:
		return p[key.(string)]
	case []any:
		return p[key.(int)]
	default:
		t.Fatalf("unsupported parent for %s", path)
	}
	return nil
}

func setPath(t *testing.T, doc any, path string, value any) {
	t.Helper()
	parent, key, err := parentForPath(doc, path, true)
	if err != nil {
		t.Fatal(err)
	}
	switch p := parent.(type) {
	case map[string]any:
		p[key.(string)] = value
	case []any:
		p[key.(int)] = value
	default:
		t.Fatalf("unsupported parent for %s", path)
	}
}

func deletePath(t *testing.T, doc any, path string) {
	t.Helper()
	parent, key, err := parentForPath(doc, path, false)
	if err != nil {
		t.Fatal(err)
	}
	switch p := parent.(type) {
	case map[string]any:
		delete(p, key.(string))
	case []any:
		idx := key.(int)
		p = append(p[:idx], p[idx+1:]...)
	default:
		t.Fatalf("unsupported parent for %s", path)
	}
}

func parentForPath(doc any, path string, create bool) (any, any, error) {
	toks, err := jsonpath.Parse(path)
	if err != nil {
		return nil, nil, err
	}
	cur := doc
	for i, tok := range toks[:len(toks)-1] {
		nextTok := toks[i+1]
		switch tok.Kind {
		case jsonpath.Key:
			obj, ok := cur.(map[string]any)
			if !ok {
				return nil, nil, errors.New("expected object")
			}
			next, ok := obj[tok.Key]
			if !ok && create {
				if nextTok.Kind == jsonpath.Key {
					next = map[string]any{}
				} else {
					next = []any{}
				}
				obj[tok.Key] = next
			}
			cur = next
		case jsonpath.Index:
			arr, ok := cur.([]any)
			if !ok {
				return nil, nil, errors.New("expected array")
			}
			if tok.Index >= len(arr) {
				return nil, nil, errors.New("array index out of range")
			}
			cur = arr[tok.Index]
		default:
			return nil, nil, errors.New("wildcard not supported in test path mutation")
		}
	}
	last := toks[len(toks)-1]
	switch last.Kind {
	case jsonpath.Key:
		return cur, last.Key, nil
	case jsonpath.Index:
		return cur, last.Index, nil
	default:
		return nil, nil, errors.New("wildcard not supported as terminal mutation path")
	}
}

func isUnclassified(err error) bool {
	var target *normalize.UnclassifiedArrayPathError
	return errors.As(err, &target)
}

func TestMain(m *testing.M) {
	os.Exit(m.Run())
}
