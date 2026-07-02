package tfstate

import (
	"fmt"
	"sort"

	"sample-id-app/policy-parity-verification/internal/diffcmp"
	"sample-id-app/policy-parity-verification/internal/jsonio"
	"sample-id-app/policy-parity-verification/internal/jsonpath"
	"sample-id-app/policy-parity-verification/internal/rules"
)

type Output struct {
	ExistingAddress string         `json:"existing_address"`
	NewAddress      string         `json:"new_address"`
	Diff            diffcmp.Result `json:"diff"`
	RemovedPaths    []string       `json:"removed_paths"`
}

func CompareState(state any, existingAddr, newAddr string, ex rules.ExcludeFile) (Output, error) {
	existing, err := findResourceValues(state, existingAddr)
	if err != nil {
		return Output{}, err
	}
	newer, err := findResourceValues(state, newAddr)
	if err != nil {
		return Output{}, err
	}
	existingClone, err := jsonio.Clone(existing)
	if err != nil {
		return Output{}, err
	}
	newClone, err := jsonio.Clone(newer)
	if err != nil {
		return Output{}, err
	}
	paths := defaultStateExcludePaths()
	for _, p := range ex.StatePaths {
		paths = append(paths, p.Path)
	}
	var removed []string
	for _, p := range paths {
		var err error
		existingClone, removed, err = removePath(existingClone, p, removed)
		if err != nil {
			return Output{}, err
		}
		newClone, removed, err = removePath(newClone, p, removed)
		if err != nil {
			return Output{}, err
		}
	}
	sort.Strings(removed)
	return Output{
		ExistingAddress: existingAddr,
		NewAddress:      newAddr,
		Diff:            diffcmp.Compare(existingClone, newClone),
		RemovedPaths:    unique(removed),
	}, nil
}

func findResourceValues(state any, addr string) (any, error) {
	obj, ok := state.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("state root must be object")
	}
	values, ok := obj["values"].(map[string]any)
	if !ok {
		return nil, fmt.Errorf("state has no values object")
	}
	root, ok := values["root_module"].(map[string]any)
	if !ok {
		return nil, fmt.Errorf("state has no values.root_module object")
	}
	if v, ok := findInModule(root, addr); ok {
		return v, nil
	}
	return nil, fmt.Errorf("resource address not found in state: %s", addr)
}

func findInModule(mod map[string]any, addr string) (any, bool) {
	if resources, ok := mod["resources"].([]any); ok {
		for _, r := range resources {
			ro, ok := r.(map[string]any)
			if !ok {
				continue
			}
			if ro["address"] == addr {
				if vals, ok := ro["values"]; ok {
					return vals, true
				}
			}
		}
	}
	if children, ok := mod["child_modules"].([]any); ok {
		for _, c := range children {
			co, ok := c.(map[string]any)
			if !ok {
				continue
			}
			if vals, ok := findInModule(co, addr); ok {
				return vals, true
			}
		}
	}
	return nil, false
}

func defaultStateExcludePaths() []string {
	return []string{
		"$.id",
		"$.name",
		"$.created",
		"$.last_updated",
		"$.lastUpdated",
		"$._links",
		"$.timeouts",
	}
}

func removePath(v any, pattern string, removed []string) (any, []string, error) {
	p, err := jsonpath.Compile(pattern)
	if err != nil {
		return v, removed, err
	}
	var hits []string
	v = removeMatching(v, "$", p, &hits)
	removed = append(removed, hits...)
	return v, removed, nil
}

func removeMatching(v any, path string, pattern jsonpath.Pattern, removed *[]string) any {
	switch x := v.(type) {
	case map[string]any:
		for _, k := range sortedKeys(x) {
			child := jsonpath.JoinKey(path, k)
			if jsonpath.Match(pattern, child) {
				delete(x, k)
				*removed = append(*removed, child)
				continue
			}
			x[k] = removeMatching(x[k], child, pattern, removed)
		}
	case []any:
		for i := range x {
			x[i] = removeMatching(x[i], jsonpath.JoinIndex(path, i), pattern, removed)
		}
	}
	return v
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
	out := []string{in[0]}
	for _, s := range in[1:] {
		if s != out[len(out)-1] {
			out = append(out, s)
		}
	}
	return out
}
