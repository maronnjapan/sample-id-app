package jsonpath

import (
	"fmt"
	"strconv"
	"strings"
)

type TokenKind int

const (
	Key TokenKind = iota
	Index
	Wildcard
)

type Token struct {
	Kind  TokenKind
	Key   string
	Index int
}

type Pattern struct {
	Raw    string
	Tokens []Token
}

func Compile(raw string) (Pattern, error) {
	toks, err := Parse(raw)
	if err != nil {
		return Pattern{}, err
	}
	return Pattern{Raw: raw, Tokens: toks}, nil
}

func CompileMany(paths []string) ([]Pattern, error) {
	out := make([]Pattern, 0, len(paths))
	for _, p := range paths {
		cp, err := Compile(p)
		if err != nil {
			return nil, err
		}
		out = append(out, cp)
	}
	return out, nil
}

func Parse(path string) ([]Token, error) {
	if path == "" || path[0] != '$' {
		return nil, fmt.Errorf("JSONPath must start with $: %q", path)
	}
	if strings.Contains(path, "..") {
		return nil, fmt.Errorf("recursive JSONPath is forbidden: %q", path)
	}
	var toks []Token
	i := 1
	for i < len(path) {
		switch path[i] {
		case '.':
			i++
			start := i
			for i < len(path) && path[i] != '.' && path[i] != '[' {
				i++
			}
			if start == i {
				return nil, fmt.Errorf("empty key in JSONPath: %q", path)
			}
			toks = append(toks, Token{Kind: Key, Key: path[start:i]})
		case '[':
			end := strings.IndexByte(path[i:], ']')
			if end < 0 {
				return nil, fmt.Errorf("unterminated array selector in JSONPath: %q", path)
			}
			body := path[i+1 : i+end]
			if body == "*" {
				toks = append(toks, Token{Kind: Wildcard})
			} else {
				n, err := strconv.Atoi(body)
				if err != nil || n < 0 {
					return nil, fmt.Errorf("array selector must be non-negative index or *: %q", path)
				}
				toks = append(toks, Token{Kind: Index, Index: n})
			}
			i += end + 1
		default:
			return nil, fmt.Errorf("unexpected character %q in JSONPath %q", path[i], path)
		}
	}
	return toks, nil
}

func Match(pattern Pattern, actual string) bool {
	actualTokens, err := Parse(actual)
	if err != nil {
		return false
	}
	if len(pattern.Tokens) != len(actualTokens) {
		return false
	}
	for i, p := range pattern.Tokens {
		a := actualTokens[i]
		switch p.Kind {
		case Key:
			if a.Kind != Key || a.Key != p.Key {
				return false
			}
		case Index:
			if a.Kind != Index || a.Index != p.Index {
				return false
			}
		case Wildcard:
			if a.Kind != Index {
				return false
			}
		}
	}
	return true
}

func MatchAny(patterns []Pattern, actual string) bool {
	for _, p := range patterns {
		if Match(p, actual) {
			return true
		}
	}
	return false
}

func CanonicalizeArrays(path string) string {
	toks, err := Parse(path)
	if err != nil {
		return path
	}
	var b strings.Builder
	b.WriteByte('$')
	for _, t := range toks {
		switch t.Kind {
		case Key:
			b.WriteByte('.')
			b.WriteString(t.Key)
		case Index, Wildcard:
			b.WriteString("[*]")
		}
	}
	return b.String()
}

func JoinKey(parent, key string) string {
	if parent == "" {
		parent = "$"
	}
	return parent + "." + key
}

func JoinIndex(parent string, idx int) string {
	if parent == "" {
		parent = "$"
	}
	return parent + "[" + strconv.Itoa(idx) + "]"
}

func IsExactPath(path string) bool {
	toks, err := Parse(path)
	if err != nil {
		return false
	}
	for _, t := range toks {
		if t.Kind != Key {
			return false
		}
	}
	return true
}
