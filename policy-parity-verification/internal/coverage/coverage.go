package coverage

import (
	"fmt"
	"sort"
	"strings"
	"unicode"

	"sample-id-app/policy-parity-verification/internal/jsonio"
	"sample-id-app/policy-parity-verification/internal/jsonpath"
	"sample-id-app/policy-parity-verification/internal/rules"
)

type Report struct {
	UnmappedAPIFields []FieldGap     `json:"unmapped_api_fields"`
	Suspect           []FieldGap     `json:"suspect"`
	MappedCount       int            `json:"mapped"`
	MappedFields      []MappedField  `json:"mapped_fields"`
	ResourceTypes     []string       `json:"resource_types"`
	IgnoredAPIFields  []IgnoredField `json:"ignored_api_fields"`
}

type FieldGap struct {
	Path        string   `json:"path"`
	CandidateTF []string `json:"candidate_tf,omitempty"`
	Reason      string   `json:"reason"`
}

type MappedField struct {
	API          string `json:"api"`
	ResourceType string `json:"resource_type"`
	TF           string `json:"tf"`
	Source       string `json:"source"`
}

type IgnoredField struct {
	Path   string `json:"path"`
	Reason string `json:"reason"`
}

func Check(schema any, apiResponse any, resourceTypes []string, mapping rules.SchemaMapping, excludes rules.ExcludeFile) (Report, error) {
	schemaPaths := map[string]map[string]struct{}{}
	for _, rt := range resourceTypes {
		paths, err := extractResourceSchemaPaths(schema, rt)
		if err != nil {
			return Report{}, err
		}
		schemaPaths[rt] = paths
	}
	apiPaths := leafPaths(apiResponse)
	sort.Strings(apiPaths)

	ignoreRules := append([]rules.PathReason{}, excludes.CoverageIgnorePaths...)
	ignoreRules = append(ignoreRules, mapping.IgnoreAPIPaths...)
	ignorePatterns, err := compilePathReasons(ignoreRules)
	if err != nil {
		return Report{}, err
	}

	explicit := map[string]rules.SchemaMapEntry{}
	for _, m := range mapping.Mappings {
		explicit[m.API+"|"+m.ResourceType] = m
	}

	var report Report
	report.ResourceTypes = resourceTypes
	for _, apiPath := range apiPaths {
		if rule, ok := matchedPathReason(ignorePatterns, apiPath); ok {
			report.IgnoredAPIFields = append(report.IgnoredAPIFields, IgnoredField{Path: apiPath, Reason: rule.Reason})
			continue
		}
		mapped := false
		var candidates []string
		for _, rt := range resourceTypes {
			if m, ok := explicit[apiPath+"|"+rt]; ok {
				if _, exists := schemaPaths[rt][m.TF]; exists {
					report.MappedFields = append(report.MappedFields, MappedField{API: apiPath, ResourceType: rt, TF: m.TF, Source: "explicit"})
					report.MappedCount++
					mapped = true
					break
				}
				report.Suspect = append(report.Suspect, FieldGap{Path: apiPath, CandidateTF: []string{m.TF}, Reason: "explicit mapping target not found in provider schema"})
				mapped = true
				break
			}
			cand := candidateTFPaths(apiPath, rt)
			candidates = append(candidates, cand...)
			for _, c := range cand {
				if _, exists := schemaPaths[rt][c]; exists {
					report.MappedFields = append(report.MappedFields, MappedField{API: apiPath, ResourceType: rt, TF: c, Source: "heuristic"})
					report.MappedCount++
					mapped = true
					break
				}
			}
			if mapped {
				break
			}
		}
		if !mapped {
			report.UnmappedAPIFields = append(report.UnmappedAPIFields, FieldGap{Path: apiPath, CandidateTF: unique(candidates), Reason: "no provider schema attribute matched API field"})
		}
	}
	sort.Slice(report.MappedFields, func(i, j int) bool { return report.MappedFields[i].API < report.MappedFields[j].API })
	return report, nil
}

func LoadAPIResponse(path string) (any, error) {
	return jsonio.LoadPolicyInput(path)
}

func extractResourceSchemaPaths(schema any, resourceType string) (map[string]struct{}, error) {
	root, ok := schema.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("schema root must be object")
	}
	providerSchemas, ok := root["provider_schemas"].(map[string]any)
	if !ok {
		return nil, fmt.Errorf("schema has no provider_schemas")
	}
	out := map[string]struct{}{}
	for _, provider := range providerSchemas {
		po, ok := provider.(map[string]any)
		if !ok {
			continue
		}
		resourceSchemas, ok := po["resource_schemas"].(map[string]any)
		if !ok {
			continue
		}
		rs, ok := resourceSchemas[resourceType].(map[string]any)
		if !ok {
			continue
		}
		block, ok := rs["block"].(map[string]any)
		if !ok {
			continue
		}
		walkBlock(block, "", out)
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("resource type %s not found or has no schema paths", resourceType)
	}
	return out, nil
}

func walkBlock(block map[string]any, prefix string, out map[string]struct{}) {
	if attrs, ok := block["attributes"].(map[string]any); ok {
		for name := range attrs {
			out[joinTF(prefix, name)] = struct{}{}
		}
	}
	if blockTypes, ok := block["block_types"].(map[string]any); ok {
		for name, child := range blockTypes {
			co, ok := child.(map[string]any)
			if !ok {
				continue
			}
			cb, ok := co["block"].(map[string]any)
			if !ok {
				continue
			}
			walkBlock(cb, joinTF(prefix, name), out)
		}
	}
}

func joinTF(prefix, name string) string {
	if prefix == "" {
		return name
	}
	return prefix + "." + name
}

func leafPaths(v any) []string {
	var out []string
	var walk func(any, string)
	walk = func(x any, path string) {
		switch tv := x.(type) {
		case map[string]any:
			if len(tv) == 0 {
				out = append(out, jsonpath.CanonicalizeArrays(path))
				return
			}
			for _, k := range sortedKeys(tv) {
				walk(tv[k], jsonpath.JoinKey(path, k))
			}
		case []any:
			if len(tv) == 0 {
				out = append(out, jsonpath.CanonicalizeArrays(path))
				return
			}
			for i := range tv {
				walk(tv[i], jsonpath.JoinIndex(path, i))
			}
		default:
			out = append(out, jsonpath.CanonicalizeArrays(path))
		}
	}
	walk(v, "$")
	sort.Strings(out)
	return unique(out)
}

func candidateTFPaths(apiPath, resourceType string) []string {
	trimmed := strings.TrimPrefix(apiPath, "$.")
	trimmed = strings.ReplaceAll(trimmed, "[*]", "")
	parts := strings.Split(trimmed, ".")
	for i := range parts {
		parts[i] = camelToSnake(parts[i])
	}
	candidates := []string{strings.Join(parts, ".")}
	if len(parts) > 1 && parts[0] == "rules" {
		candidates = append(candidates, strings.Join(parts[1:], "."))
	}
	if strings.Contains(resourceType, "rule") && len(parts) > 1 && parts[0] == "rules" {
		candidates = append([]string{strings.Join(parts[1:], ".")}, candidates...)
	}
	return unique(candidates)
}

func camelToSnake(s string) string {
	var out []rune
	for i, r := range s {
		if unicode.IsUpper(r) {
			if i > 0 {
				out = append(out, '_')
			}
			out = append(out, unicode.ToLower(r))
		} else {
			out = append(out, r)
		}
	}
	return string(out)
}

type compiledPathReason struct {
	Rule    rules.PathReason
	Pattern jsonpath.Pattern
}

func compilePathReasons(in []rules.PathReason) ([]compiledPathReason, error) {
	out := make([]compiledPathReason, 0, len(in))
	for _, r := range in {
		p, err := jsonpath.Compile(r.Path)
		if err != nil {
			return nil, err
		}
		out = append(out, compiledPathReason{Rule: r, Pattern: p})
	}
	return out, nil
}

func matchedPathReason(patterns []compiledPathReason, actual string) (rules.PathReason, bool) {
	for _, p := range patterns {
		if jsonpath.Match(p.Pattern, actual) {
			return p.Rule, true
		}
	}
	return rules.PathReason{}, false
}

func sortedKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func unique(in []string) []string {
	if len(in) == 0 {
		return nil
	}
	sort.Strings(in)
	out := []string{in[0]}
	for _, s := range in[1:] {
		if s != out[len(out)-1] {
			out = append(out, s)
		}
	}
	return out
}
