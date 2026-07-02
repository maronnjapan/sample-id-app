package jsonio

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

func ReadJSON(path string) (any, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	dec := json.NewDecoder(bytes.NewReader(b))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return nil, fmt.Errorf("decode %s: %w", path, err)
	}
	return v, nil
}

func ReadRaw(path string) ([]byte, error) {
	return os.ReadFile(path)
}

func WriteJSON(path string, v any) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	b = append(b, '\n')
	return WriteFileAtomic(path, b, 0o644)
}

func WriteRawJSON(path string, raw []byte) error {
	var v any
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	if err := dec.Decode(&v); err != nil {
		return fmt.Errorf("raw JSON for %s is invalid: %w", path, err)
	}
	return WriteJSON(path, v)
}

func WriteFileAtomic(path string, b []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, "."+filepath.Base(path)+".tmp-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if _, err := tmp.Write(b); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Chmod(perm); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, path)
}

func LoadPolicyInput(path string) (any, error) {
	st, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if !st.IsDir() {
		return ReadJSON(path)
	}
	policyPath := filepath.Join(path, "policy.json")
	rulesPath := filepath.Join(path, "rules.json")
	policy, err := ReadJSON(policyPath)
	if err != nil {
		return nil, err
	}
	obj, ok := policy.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("%s must contain a JSON object", policyPath)
	}
	rules, err := ReadJSON(rulesPath)
	if err != nil {
		return nil, err
	}
	if _, ok := rules.([]any); !ok {
		return nil, fmt.Errorf("%s must contain a JSON array", rulesPath)
	}
	obj["rules"] = rules
	return obj, nil
}

func Clone(v any) (any, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	dec := json.NewDecoder(bytes.NewReader(b))
	dec.UseNumber()
	var out any
	if err := dec.Decode(&out); err != nil {
		return nil, err
	}
	return out, nil
}

func MarshalForReport(v any) ([]byte, error) {
	return json.Marshal(v)
}

func UnmarshalForReport(b []byte, out any) error {
	return json.Unmarshal(b, out)
}
