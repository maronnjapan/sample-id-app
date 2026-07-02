package diffcmp

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"reflect"
	"sort"

	"sample-id-app/policy-parity-verification/internal/jsonpath"
)

type Result struct {
	Identical           bool     `json:"identical"`
	Diffs               []Diff   `json:"diffs"`
	ComparedKeyCount    int      `json:"compared_key_count"`
	ComparedPathsDigest string   `json:"compared_paths_digest"`
	ComparedPaths       []string `json:"compared_paths"`
}

type Diff struct {
	Path          string `json:"path"`
	Kind          string `json:"kind"`
	ExistingValue any    `json:"existing_value,omitempty"`
	NewValue      any    `json:"new_value,omitempty"`
}

func Compare(existing, newer any) Result {
	var diffs []Diff
	pathSet := map[string]struct{}{}
	compare(existing, newer, "$", &diffs, pathSet)
	if diffs == nil {
		diffs = []Diff{}
	}
	paths := make([]string, 0, len(pathSet))
	for p := range pathSet {
		paths = append(paths, p)
	}
	sort.Strings(paths)
	digest := sha256.Sum256([]byte(joinPaths(paths)))
	return Result{
		Identical:           len(diffs) == 0,
		Diffs:               diffs,
		ComparedKeyCount:    len(paths),
		ComparedPathsDigest: hex.EncodeToString(digest[:]),
		ComparedPaths:       paths,
	}
}

func compare(a, b any, path string, diffs *[]Diff, compared map[string]struct{}) {
	switch av := a.(type) {
	case map[string]any:
		bv, ok := b.(map[string]any)
		if !ok {
			*diffs = append(*diffs, Diff{Path: path, Kind: "changed", ExistingValue: a, NewValue: b})
			compared[path] = struct{}{}
			return
		}
		keys := unionKeys(av, bv)
		for _, k := range keys {
			child := jsonpath.JoinKey(path, k)
			aVal, aOK := av[k]
			bVal, bOK := bv[k]
			switch {
			case !aOK:
				*diffs = append(*diffs, Diff{Path: child, Kind: "added", NewValue: bVal})
				markLeaves(bVal, child, compared)
			case !bOK:
				*diffs = append(*diffs, Diff{Path: child, Kind: "removed", ExistingValue: aVal})
				markLeaves(aVal, child, compared)
			default:
				compare(aVal, bVal, child, diffs, compared)
			}
		}
	case []any:
		bv, ok := b.([]any)
		if !ok {
			*diffs = append(*diffs, Diff{Path: path, Kind: "changed", ExistingValue: a, NewValue: b})
			compared[path] = struct{}{}
			return
		}
		maxLen := len(av)
		if len(bv) > maxLen {
			maxLen = len(bv)
		}
		for i := 0; i < maxLen; i++ {
			child := jsonpath.JoinIndex(path, i)
			switch {
			case i >= len(av):
				*diffs = append(*diffs, Diff{Path: child, Kind: "added", NewValue: bv[i]})
				markLeaves(bv[i], child, compared)
			case i >= len(bv):
				*diffs = append(*diffs, Diff{Path: child, Kind: "removed", ExistingValue: av[i]})
				markLeaves(av[i], child, compared)
			default:
				compare(av[i], bv[i], child, diffs, compared)
			}
		}
	default:
		compared[path] = struct{}{}
		if !scalarEqual(a, b) {
			*diffs = append(*diffs, Diff{Path: path, Kind: "changed", ExistingValue: a, NewValue: b})
		}
	}
}

func scalarEqual(a, b any) bool {
	if reflect.TypeOf(a) != reflect.TypeOf(b) {
		return false
	}
	switch av := a.(type) {
	case json.Number:
		return av.String() == b.(json.Number).String()
	default:
		return reflect.DeepEqual(a, b)
	}
}

func markLeaves(v any, path string, compared map[string]struct{}) {
	switch x := v.(type) {
	case map[string]any:
		if len(x) == 0 {
			compared[path] = struct{}{}
			return
		}
		for _, k := range sortedKeys(x) {
			markLeaves(x[k], jsonpath.JoinKey(path, k), compared)
		}
	case []any:
		if len(x) == 0 {
			compared[path] = struct{}{}
			return
		}
		for i := range x {
			markLeaves(x[i], jsonpath.JoinIndex(path, i), compared)
		}
	default:
		compared[path] = struct{}{}
	}
}

func unionKeys(a, b map[string]any) []string {
	seen := map[string]struct{}{}
	for k := range a {
		seen[k] = struct{}{}
	}
	for k := range b {
		seen[k] = struct{}{}
	}
	keys := make([]string, 0, len(seen))
	for k := range seen {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func sortedKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func joinPaths(paths []string) string {
	out := ""
	for _, p := range paths {
		out += p + "\n"
	}
	return out
}

func Summary(r Result) string {
	if r.Identical {
		return fmt.Sprintf("identical: compared %d paths", r.ComparedKeyCount)
	}
	return fmt.Sprintf("different: %d diffs across %d compared paths", len(r.Diffs), r.ComparedKeyCount)
}
