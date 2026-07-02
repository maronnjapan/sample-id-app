package rules

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

type PathReason struct {
	Path   string `yaml:"path" json:"path"`
	Reason string `yaml:"reason" json:"reason"`
}

type ExcludeFile struct {
	Paths               []PathReason `yaml:"paths" json:"paths"`
	StatePaths          []PathReason `yaml:"state_paths" json:"state_paths"`
	CoverageIgnorePaths []PathReason `yaml:"coverage_ignore_paths" json:"coverage_ignore_paths"`
}

type DefaultValue struct {
	Path      string `yaml:"path" json:"path"`
	Value     any    `yaml:"value" json:"value"`
	ReasonURL string `yaml:"reason_url" json:"reason_url"`
}

type NormalizeRules struct {
	OrderedArrayPaths            []string       `yaml:"ordered_array_paths" json:"ordered_array_paths"`
	UnorderedArrayPaths          []string       `yaml:"unordered_array_paths" json:"unordered_array_paths"`
	PrioritySortArrayPaths       []string       `yaml:"priority_sort_array_paths" json:"priority_sort_array_paths"`
	NullSignificantPaths         []string       `yaml:"null_significant_paths" json:"null_significant_paths"`
	EmptyArrayEqualsAbsentPaths  []string       `yaml:"empty_array_equals_absent_paths" json:"empty_array_equals_absent_paths"`
	EmptyStringEqualsAbsentPaths []string       `yaml:"empty_string_equals_absent_paths" json:"empty_string_equals_absent_paths"`
	CaseInsensitivePaths         []string       `yaml:"case_insensitive_paths" json:"case_insensitive_paths"`
	Defaults                     []DefaultValue `yaml:"defaults" json:"defaults"`
	RequiredComparedPathPatterns []PathReason   `yaml:"required_compared_path_patterns" json:"required_compared_path_patterns"`
}

type SchemaMapping struct {
	Mappings       []SchemaMapEntry `yaml:"mappings" json:"mappings"`
	IgnoreAPIPaths []PathReason     `yaml:"ignore_api_paths" json:"ignore_api_paths"`
}

type SchemaMapEntry struct {
	API          string `yaml:"api" json:"api"`
	ResourceType string `yaml:"resource_type" json:"resource_type"`
	TF           string `yaml:"tf" json:"tf"`
	Reason       string `yaml:"reason" json:"reason"`
}

func LoadExclude(path string) (ExcludeFile, error) {
	var out ExcludeFile
	if path == "" {
		return out, nil
	}
	if err := readYAML(path, &out); err != nil {
		return out, err
	}
	return out, validatePathReasons("exclude", out.Paths)
}

func LoadNormalize(path string) (NormalizeRules, error) {
	var out NormalizeRules
	if err := readYAML(path, &out); err != nil {
		return out, err
	}
	return out, nil
}

func LoadDefaults(path string) ([]DefaultValue, error) {
	if path == "" {
		return nil, nil
	}
	var out struct {
		Defaults []DefaultValue `yaml:"defaults"`
	}
	if err := readYAML(path, &out); err != nil {
		return nil, err
	}
	return out.Defaults, nil
}

func LoadSchemaMapping(path string) (SchemaMapping, error) {
	var out SchemaMapping
	if path == "" {
		return out, nil
	}
	if err := readYAML(path, &out); err != nil {
		return out, err
	}
	return out, nil
}

func readYAML(path string, out any) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if err := yaml.Unmarshal(b, out); err != nil {
		return fmt.Errorf("decode %s: %w", path, err)
	}
	return nil
}

func validatePathReasons(kind string, paths []PathReason) error {
	for _, p := range paths {
		if p.Path == "" {
			return fmt.Errorf("%s path entry has empty path", kind)
		}
		if p.Reason == "" {
			return fmt.Errorf("%s path %s has empty reason", kind, p.Path)
		}
	}
	return nil
}
