package report

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"sample-id-app/policy-parity-verification/internal/coverage"
	"sample-id-app/policy-parity-verification/internal/diffcmp"
	"sample-id-app/policy-parity-verification/internal/jsonio"
	"sample-id-app/policy-parity-verification/internal/oktaclient"
	"sample-id-app/policy-parity-verification/internal/tfstate"
)

type Summary struct {
	OverallPass bool     `json:"overall_pass"`
	Failures    []string `json:"failures"`
	Warnings    []string `json:"warnings"`
}

func Build(runDir, out string) (Summary, error) {
	var s Summary
	var b strings.Builder
	b.WriteString("# 認証ポリシー同一性検証レポート\n\n")
	b.WriteString("## 1. 検証サマリ\n")
	b.WriteString("- 総合判定: PLACEHOLDER\n")
	b.WriteString("- 実行 ID / 比較日時 (UTC): " + filepath.Base(runDir) + " / " + time.Now().UTC().Format(time.RFC3339) + "\n")
	b.WriteString("- 実施者 / レビュアー: TODO\n\n")

	b.WriteString("## 2. 比較対象\n")
	existingPolicy := readPolicySummary(filepath.Join(runDir, "raw", "existing", "policy.json"))
	newPolicy := readPolicySummary(filepath.Join(runDir, "raw", "new", "policy.json"))
	b.WriteString(fmt.Sprintf("- 既存ポリシー: %s / %s / %s\n", existingPolicy.Name, existingPolicy.ID, existingPolicy.Type))
	b.WriteString(fmt.Sprintf("- 新規ポリシー: %s / %s / %s\n", newPolicy.Name, newPolicy.ID, newPolicy.Type))
	b.WriteString("- 両者の意図的差分: ポリシー名のみ\n\n")

	b.WriteString("## 3. 実行環境\n")
	b.WriteString("- Terraform / OpenTofu version: `artifacts/<run_id>/version/tofu-version.txt` を保全すること\n")
	b.WriteString("- provider name / version(lock hash): `.terraform.lock.hcl` または provider lock 情報を保全すること\n")
	b.WriteString("- policyparity バイナリ version / okta-sdk-golang version: `policyparity version` の出力を保全すること\n")
	b.WriteString("- IdP API バージョン / base URL: `raw/*/meta.json` を参照\n")
	b.WriteString("- 使用した検証方式: L0, L1, L2, L3, L4。L5 は任意\n")
	b.WriteString("- 使用した情報源: API endpoints / state / provider schema / 監査ログ\n\n")

	audit := readJSONFile[oktaclient.AuditReport](filepath.Join(runDir, "audit.json"))
	if audit.ok {
		if audit.val.Changed {
			s.Failures = append(s.Failures, "L0 audit detected policy change events")
		}
		b.WriteString("## 4. 前提の成立確認 (L0)\n")
		b.WriteString(fmt.Sprintf("- 凍結宣言時刻: %s\n- 凍結違反イベント: %d 件\n\n", audit.val.Since, audit.val.EventCount))
	} else {
		s.Failures = append(s.Failures, "L0 audit.json missing")
		b.WriteString("## 4. 前提の成立確認 (L0)\n- audit.json: 未取得\n\n")
	}

	b.WriteString("## 5. 比較対象外項目一覧と理由\n")
	b.WriteString("- `config/exclude-paths.yaml` を参照。実ヒット件数は `normalized/*.normalize_log.json` に記録。\n\n")

	b.WriteString("## 6. 適用した正規化ルール\n")
	normalizationLogs := summarizeNormalizeLogs(runDir)
	if normalizationLogs == "" {
		b.WriteString("- normalize log: 未取得\n\n")
	} else {
		b.WriteString(normalizationLogs + "\n")
	}

	diff := readJSONFile[diffcmp.Result](filepath.Join(runDir, "diff", "diff_result.json"))
	b.WriteString("## 7. 比較結果 (L1)\n")
	if diff.ok {
		if !diff.val.Identical {
			s.Failures = append(s.Failures, "L1 API diff has differences")
		}
		b.WriteString(fmt.Sprintf("- 比較したフィールド数: %d\n- 差分: %d 件\n- compared_paths_digest: `%s`\n\n", diff.val.ComparedKeyCount, len(diff.val.Diffs), diff.val.ComparedPathsDigest))
		if len(diff.val.Diffs) > 0 {
			b.WriteString("| path | kind |\n|---|---|\n")
			for _, d := range diff.val.Diffs {
				b.WriteString(fmt.Sprintf("| `%s` | %s |\n", d.Path, d.Kind))
			}
			b.WriteString("\n")
		}
	} else {
		s.Failures = append(s.Failures, "L1 diff_result.json missing")
		b.WriteString("- diff_result.json: 未取得\n\n")
	}

	cov := readJSONFile[coverage.Report](filepath.Join(runDir, "coverage", "gap_report.json"))
	b.WriteString("## 8. provider カバレッジ (L2)\n")
	if cov.ok {
		gaps := len(cov.val.UnmappedAPIFields) + len(cov.val.Suspect)
		if gaps > 0 {
			s.Warnings = append(s.Warnings, "L2 provider coverage gaps require risk-register documentation")
		}
		b.WriteString(fmt.Sprintf("- ギャップ検出: %d 件\n- mapped: %d 件\n\n", gaps, cov.val.MappedCount))
	} else {
		s.Failures = append(s.Failures, "L2 gap_report.json missing")
		b.WriteString("- gap_report.json: 未取得\n\n")
	}

	state := readJSONFile[tfstate.Output](filepath.Join(runDir, "state", "state_diff.json"))
	b.WriteString("## 9. IaC 整合 (L3)\n")
	if state.ok {
		if !state.val.Diff.Identical {
			s.Failures = append(s.Failures, "L3 state diff has differences")
		}
		b.WriteString(fmt.Sprintf("- state 比較: 差分 %d 件\n", len(state.val.Diff.Diffs)))
	} else {
		s.Failures = append(s.Failures, "L3 state_diff.json missing")
		b.WriteString("- state_diff.json: 未取得\n")
	}
	if txt, err := os.ReadFile(filepath.Join(runDir, "plan", "plan_exitcode.txt")); err == nil {
		code := strings.TrimSpace(string(txt))
		if code != "0" {
			s.Failures = append(s.Failures, "L3 tofu plan exit code is not 0")
		}
		b.WriteString("- plan 冪等性 exit code: `" + code + "`\n\n")
	} else {
		s.Failures = append(s.Failures, "L3 plan_exitcode.txt missing")
		b.WriteString("- plan_exitcode.txt: 未取得\n\n")
	}

	b.WriteString("## 10. 検証系の妥当性 (L4)\n")
	if txt, err := os.ReadFile(filepath.Join(runDir, "verifier-test-result.txt")); err == nil {
		b.WriteString("```text\n" + string(txt) + "\n```\n\n")
	} else {
		s.Failures = append(s.Failures, "L4 verifier-test-result.txt missing")
		b.WriteString("- verifier-test-result.txt: 未取得\n\n")
	}

	b.WriteString("## 11. 挙動テスト (L5・任意)\n")
	if txt, err := os.ReadFile(filepath.Join(runDir, "behavior-test-result.txt")); err == nil {
		b.WriteString("```text\n" + string(txt) + "\n```\n\n")
	} else {
		b.WriteString("- 未実施。実施する場合は `behavior-test-result.txt` として保全。\n\n")
	}

	b.WriteString("## 12. 修正履歴\n")
	b.WriteString("- `docs/decision-log.md` を参照。差分分類(a)〜(f)、修正、再 apply、再検証の履歴を記録する。\n\n")

	b.WriteString("## 13. スコープ宣言\n")
	b.WriteString("- アプリ割り当ては比較対象外である。適用範囲の同一性は本レポートの保証外。\n")
	b.WriteString("- 「100% 同一」は、比較基準時刻に IdP API が返す全設定フィールドのうち、明示された許容差分を除くすべてが正規化後に一致する、という限定付き宣言である。\n\n")

	b.WriteString("## 14. 残リスクと低減策\n")
	b.WriteString("- `docs/risk-register.md` を参照。\n\n")
	b.WriteString("## 添付\n")
	b.WriteString("- raw response、normalized JSON、diff_result.json、gap_report.json、state_diff.json、plan 出力、audit.json\n")

	s.OverallPass = len(s.Failures) == 0
	content := strings.Replace(b.String(), "総合判定: PLACEHOLDER", "総合判定: "+passFail(s.OverallPass), 1)
	if len(s.Failures) > 0 {
		content += "\n## 失敗理由\n"
		for _, f := range s.Failures {
			content += "- " + f + "\n"
		}
	}
	if len(s.Warnings) > 0 {
		content += "\n## 警告\n"
		for _, w := range s.Warnings {
			content += "- " + w + "\n"
		}
	}
	if err := jsonio.WriteFileAtomic(out, []byte(content), 0o644); err != nil {
		return s, err
	}
	return s, nil
}

type policySummary struct {
	ID   string
	Name string
	Type string
}

func readPolicySummary(path string) policySummary {
	v, err := jsonio.ReadJSON(path)
	if err != nil {
		return policySummary{ID: "未取得", Name: "未取得", Type: "未取得"}
	}
	obj, ok := v.(map[string]any)
	if !ok {
		return policySummary{ID: "不正形式", Name: "不正形式", Type: "不正形式"}
	}
	return policySummary{
		ID:   stringField(obj, "id"),
		Name: stringField(obj, "name"),
		Type: stringField(obj, "type"),
	}
}

func stringField(obj map[string]any, key string) string {
	if s, ok := obj[key].(string); ok && s != "" {
		return s
	}
	return "未取得"
}

func summarizeNormalizeLogs(runDir string) string {
	paths, err := filepath.Glob(filepath.Join(runDir, "normalized", "*.normalize_log.json"))
	if err != nil || len(paths) == 0 {
		return ""
	}
	var b strings.Builder
	for _, p := range paths {
		v, err := jsonio.ReadJSON(p)
		if err != nil {
			continue
		}
		obj, ok := v.(map[string]any)
		if !ok {
			continue
		}
		b.WriteString(fmt.Sprintf("- `%s`: excluded=%d, dropped_null=%d, unordered_sorted=%d, priority_sorted=%d, warnings=%d\n",
			filepath.Base(p),
			lenArray(obj["excluded_path_hits"]),
			lenArray(obj["dropped_null_paths"]),
			lenArray(obj["unordered_sorted_paths"]),
			lenArray(obj["priority_sorted_array_paths"]),
			lenArray(obj["warnings"]),
		))
	}
	if b.Len() == 0 {
		return ""
	}
	return b.String()
}

func lenArray(v any) int {
	if a, ok := v.([]any); ok {
		return len(a)
	}
	return 0
}

type typedRead[T any] struct {
	val T
	ok  bool
}

func readJSONFile[T any](path string) typedRead[T] {
	v, err := jsonio.ReadJSON(path)
	if err != nil {
		return typedRead[T]{}
	}
	var out T
	b, err := jsonio.MarshalForReport(v)
	if err != nil {
		return typedRead[T]{}
	}
	if err := jsonio.UnmarshalForReport(b, &out); err != nil {
		return typedRead[T]{}
	}
	return typedRead[T]{val: out, ok: true}
}

func passFail(ok bool) string {
	if ok {
		return "PASS"
	}
	return "FAIL"
}
