package normalize

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"sample-id-app/policy-parity-verification/internal/jsonio"
	"sample-id-app/policy-parity-verification/internal/jsonpath"
	"sample-id-app/policy-parity-verification/internal/rules"
)

type Log struct {
	ExcludedPathHits         []PathHit `json:"excluded_path_hits"`
	UnusedExcludeDefinitions []string  `json:"unused_exclude_definitions"`
	DroppedNullPaths         []string  `json:"dropped_null_paths"`
	RemovedEmptyArrayPaths   []string  `json:"removed_empty_array_paths"`
	RemovedEmptyStringPaths  []string  `json:"removed_empty_string_paths"`
	CaseNormalizedPaths      []string  `json:"case_normalized_paths"`
	DefaultedPaths           []string  `json:"defaulted_paths"`
	PrioritySortedArrayPaths []string  `json:"priority_sorted_array_paths"`
	UnorderedSortedPaths     []string  `json:"unordered_sorted_paths"`
	OrderedArrayPathsSeen    []string  `json:"ordered_array_paths_seen"`
	Warnings                 []string  `json:"warnings"`
}

type PathHit struct {
	Definition string `json:"definition"`
	Path       string `json:"path"`
	Reason     string `json:"reason,omitempty"`
}

type UnclassifiedArrayPathError struct {
	Paths []string
}

func (e *UnclassifiedArrayPathError) Error() string {
	return "unclassified array paths: " + strings.Join(e.Paths, ", ")
}

func Normalize(doc any, nr rules.NormalizeRules, ex rules.ExcludeFile, extraDefaults []rules.DefaultValue) (any, Log, error) {
	var log Log
	cloned, err := jsonio.Clone(doc)
	if err != nil {
		return nil, log, err
	}
	excludePatterns, err := compilePathReasons(ex.Paths)
	if err != nil {
		return nil, log, err
	}
	hits := make(map[string]int)
	cloned = dropExcluded(cloned, "$", excludePatterns, hits, &log)
	for _, p := range excludePatterns {
		if hits[p.Rule.Path] == 0 {
			log.UnusedExcludeDefinitions = append(log.UnusedExcludeDefinitions, p.Rule.Path)
			log.Warnings = append(log.Warnings, "exclude path did not match input: "+p.Rule.Path)
		}
	}

	nullSignificant, err := jsonpath.CompileMany(nr.NullSignificantPaths)
	if err != nil {
		return nil, log, err
	}
	cloned = dropNulls(cloned, "$", nullSignificant, &log)

	emptyArrays, err := jsonpath.CompileMany(nr.EmptyArrayEqualsAbsentPaths)
	if err != nil {
		return nil, log, err
	}
	cloned = removeEmptyArrays(cloned, "$", emptyArrays, &log)

	emptyStrings, err := jsonpath.CompileMany(nr.EmptyStringEqualsAbsentPaths)
	if err != nil {
		return nil, log, err
	}
	cloned = removeEmptyStrings(cloned, "$", emptyStrings, &log)

	caseInsensitive, err := jsonpath.CompileMany(nr.CaseInsensitivePaths)
	if err != nil {
		return nil, log, err
	}
	normalizeCase(cloned, "$", caseInsensitive, &log)

	defaults := append([]rules.DefaultValue{}, nr.Defaults...)
	defaults = append(defaults, extraDefaults...)
	if err := applyDefaults(cloned, defaults, &log); err != nil {
		return nil, log, err
	}

	if err := sortAndClassifyArrays(cloned, nr, &log); err != nil {
		return nil, log, err
	}

	sort.Strings(log.DroppedNullPaths)
	sort.Strings(log.RemovedEmptyArrayPaths)
	sort.Strings(log.RemovedEmptyStringPaths)
	sort.Strings(log.CaseNormalizedPaths)
	sort.Strings(log.DefaultedPaths)
	sort.Strings(log.PrioritySortedArrayPaths)
	sort.Strings(log.UnorderedSortedPaths)
	sort.Strings(log.OrderedArrayPathsSeen)
	return cloned, log, nil
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

func dropExcluded(v any, path string, patterns []compiledPathReason, hits map[string]int, log *Log) any {
	switch x := v.(type) {
	case map[string]any:
		keys := sortedKeys(x)
		for _, k := range keys {
			childPath := jsonpath.JoinKey(path, k)
			if rule, ok := matchedPathReason(patterns, childPath); ok {
				delete(x, k)
				hits[rule.Path]++
				log.ExcludedPathHits = append(log.ExcludedPathHits, PathHit{Definition: rule.Path, Path: childPath, Reason: rule.Reason})
				continue
			}
			x[k] = dropExcluded(x[k], childPath, patterns, hits, log)
		}
		return x
	case []any:
		out := x[:0]
		for i, elem := range x {
			childPath := jsonpath.JoinIndex(path, i)
			if rule, ok := matchedPathReason(patterns, childPath); ok {
				hits[rule.Path]++
				log.ExcludedPathHits = append(log.ExcludedPathHits, PathHit{Definition: rule.Path, Path: childPath, Reason: rule.Reason})
				continue
			}
			out = append(out, dropExcluded(elem, childPath, patterns, hits, log))
		}
		return out
	default:
		return v
	}
}

func matchedPathReason(patterns []compiledPathReason, actual string) (rules.PathReason, bool) {
	for _, p := range patterns {
		if jsonpath.Match(p.Pattern, actual) {
			return p.Rule, true
		}
	}
	return rules.PathReason{}, false
}

func dropNulls(v any, path string, nullSignificant []jsonpath.Pattern, log *Log) any {
	switch x := v.(type) {
	case map[string]any:
		for _, k := range sortedKeys(x) {
			childPath := jsonpath.JoinKey(path, k)
			if x[k] == nil && !jsonpath.MatchAny(nullSignificant, childPath) {
				delete(x, k)
				log.DroppedNullPaths = append(log.DroppedNullPaths, childPath)
				continue
			}
			x[k] = dropNulls(x[k], childPath, nullSignificant, log)
		}
	case []any:
		for i := range x {
			x[i] = dropNulls(x[i], jsonpath.JoinIndex(path, i), nullSignificant, log)
		}
	}
	return v
}

func removeEmptyArrays(v any, path string, patterns []jsonpath.Pattern, log *Log) any {
	switch x := v.(type) {
	case map[string]any:
		for _, k := range sortedKeys(x) {
			childPath := jsonpath.JoinKey(path, k)
			if arr, ok := x[k].([]any); ok && len(arr) == 0 && jsonpath.MatchAny(patterns, childPath) {
				delete(x, k)
				log.RemovedEmptyArrayPaths = append(log.RemovedEmptyArrayPaths, childPath)
				continue
			}
			x[k] = removeEmptyArrays(x[k], childPath, patterns, log)
		}
	case []any:
		for i := range x {
			x[i] = removeEmptyArrays(x[i], jsonpath.JoinIndex(path, i), patterns, log)
		}
	}
	return v
}

func removeEmptyStrings(v any, path string, patterns []jsonpath.Pattern, log *Log) any {
	switch x := v.(type) {
	case map[string]any:
		for _, k := range sortedKeys(x) {
			childPath := jsonpath.JoinKey(path, k)
			if s, ok := x[k].(string); ok && s == "" && jsonpath.MatchAny(patterns, childPath) {
				delete(x, k)
				log.RemovedEmptyStringPaths = append(log.RemovedEmptyStringPaths, childPath)
				continue
			}
			x[k] = removeEmptyStrings(x[k], childPath, patterns, log)
		}
	case []any:
		for i := range x {
			x[i] = removeEmptyStrings(x[i], jsonpath.JoinIndex(path, i), patterns, log)
		}
	}
	return v
}

func normalizeCase(v any, path string, patterns []jsonpath.Pattern, log *Log) {
	switch x := v.(type) {
	case map[string]any:
		for _, k := range sortedKeys(x) {
			normalizeCase(x[k], jsonpath.JoinKey(path, k), patterns, log)
		}
	case []any:
		for i := range x {
			normalizeCase(x[i], jsonpath.JoinIndex(path, i), patterns, log)
		}
	case string:
		if jsonpath.MatchAny(patterns, path) {
			// Strings are immutable through interface values; caller mutates at parent levels.
		}
	}
	normalizeCaseAtParent(v, path, patterns, log)
}

func normalizeCaseAtParent(v any, path string, patterns []jsonpath.Pattern, log *Log) {
	switch x := v.(type) {
	case map[string]any:
		for _, k := range sortedKeys(x) {
			childPath := jsonpath.JoinKey(path, k)
			if s, ok := x[k].(string); ok && jsonpath.MatchAny(patterns, childPath) {
				lower := strings.ToLower(s)
				if lower != s {
					x[k] = lower
					log.CaseNormalizedPaths = append(log.CaseNormalizedPaths, childPath)
				}
			}
		}
	case []any:
		for i := range x {
			childPath := jsonpath.JoinIndex(path, i)
			if s, ok := x[i].(string); ok && jsonpath.MatchAny(patterns, childPath) {
				lower := strings.ToLower(s)
				if lower != s {
					x[i] = lower
					log.CaseNormalizedPaths = append(log.CaseNormalizedPaths, childPath)
				}
			}
		}
	}
}

func applyDefaults(doc any, defaults []rules.DefaultValue, log *Log) error {
	for _, d := range defaults {
		if d.Path == "" {
			return fmt.Errorf("default entry has empty path")
		}
		if !jsonpath.IsExactPath(d.Path) {
			return fmt.Errorf("default path must be an exact object path without arrays: %s", d.Path)
		}
		toks, err := jsonpath.Parse(d.Path)
		if err != nil {
			return err
		}
		obj, ok := doc.(map[string]any)
		if !ok {
			return fmt.Errorf("default path %s requires root object", d.Path)
		}
		for i, tok := range toks {
			if tok.Kind != jsonpath.Key {
				return fmt.Errorf("default path must contain keys only: %s", d.Path)
			}
			if i == len(toks)-1 {
				if _, exists := obj[tok.Key]; !exists {
					obj[tok.Key] = yamlToJSONCompatible(d.Value)
					log.DefaultedPaths = append(log.DefaultedPaths, d.Path)
				}
				break
			}
			next, exists := obj[tok.Key]
			if !exists {
				next = map[string]any{}
				obj[tok.Key] = next
			}
			child, ok := next.(map[string]any)
			if !ok {
				return fmt.Errorf("default path %s crosses non-object at %s", d.Path, tok.Key)
			}
			obj = child
		}
	}
	return nil
}

func sortAndClassifyArrays(doc any, nr rules.NormalizeRules, log *Log) error {
	ordered, err := jsonpath.CompileMany(nr.OrderedArrayPaths)
	if err != nil {
		return err
	}
	unordered, err := jsonpath.CompileMany(nr.UnorderedArrayPaths)
	if err != nil {
		return err
	}
	priority, err := jsonpath.CompileMany(nr.PrioritySortArrayPaths)
	if err != nil {
		return err
	}

	var unclassified []string
	var walk func(v any, path string)
	walk = func(v any, path string) {
		switch x := v.(type) {
		case map[string]any:
			for _, k := range sortedKeys(x) {
				walk(x[k], jsonpath.JoinKey(path, k))
			}
		case []any:
			canonical := jsonpath.CanonicalizeArrays(path)
			switch {
			case jsonpath.MatchAny(priority, path):
				sortByPriority(x)
				log.PrioritySortedArrayPaths = append(log.PrioritySortedArrayPaths, canonical)
			case jsonpath.MatchAny(unordered, path):
				sort.SliceStable(x, func(i, j int) bool {
					return canonicalJSON(x[i]) < canonicalJSON(x[j])
				})
				log.UnorderedSortedPaths = append(log.UnorderedSortedPaths, canonical)
			case jsonpath.MatchAny(ordered, path):
				log.OrderedArrayPathsSeen = append(log.OrderedArrayPathsSeen, canonical)
			default:
				unclassified = append(unclassified, canonical)
			}
			for i := range x {
				walk(x[i], jsonpath.JoinIndex(path, i))
			}
		}
	}
	walk(doc, "$")
	if len(unclassified) > 0 {
		sort.Strings(unclassified)
		unclassified = uniqueStrings(unclassified)
		return &UnclassifiedArrayPathError{Paths: unclassified}
	}
	return nil
}

func sortByPriority(arr []any) {
	sort.SliceStable(arr, func(i, j int) bool {
		pi, iok := priorityValue(arr[i])
		pj, jok := priorityValue(arr[j])
		if iok && jok && pi != pj {
			return pi < pj
		}
		if iok != jok {
			return iok
		}
		return canonicalJSON(arr[i]) < canonicalJSON(arr[j])
	})
}

func priorityValue(v any) (float64, bool) {
	obj, ok := v.(map[string]any)
	if !ok {
		return 0, false
	}
	switch p := obj["priority"].(type) {
	case json.Number:
		f, err := p.Float64()
		return f, err == nil
	case float64:
		return p, true
	case int:
		return float64(p), true
	default:
		return 0, false
	}
}

func canonicalJSON(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return fmt.Sprintf("%#v", v)
	}
	var compact bytes.Buffer
	if err := json.Compact(&compact, b); err != nil {
		return string(b)
	}
	return compact.String()
}

func sortedKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func uniqueStrings(in []string) []string {
	if len(in) == 0 {
		return nil
	}
	out := []string{in[0]}
	for _, s := range in[1:] {
		if s != out[len(out)-1] {
			out = append(out, s)
		}
	}
	return out
}

func yamlToJSONCompatible(v any) any {
	switch x := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(x))
		for k, v := range x {
			out[k] = yamlToJSONCompatible(v)
		}
		return out
	case map[any]any:
		out := make(map[string]any, len(x))
		for k, v := range x {
			out[fmt.Sprint(k)] = yamlToJSONCompatible(v)
		}
		return out
	case []any:
		for i := range x {
			x[i] = yamlToJSONCompatible(x[i])
		}
		return x
	default:
		return v
	}
}
