package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/okta/okta-sdk-golang/v6/okta"

	"sample-id-app/policy-parity-verification/internal/audit"
	"sample-id-app/policy-parity-verification/internal/coverage"
	"sample-id-app/policy-parity-verification/internal/diffcmp"
	"sample-id-app/policy-parity-verification/internal/fetch"
	"sample-id-app/policy-parity-verification/internal/jsonio"
	"sample-id-app/policy-parity-verification/internal/normalize"
	"sample-id-app/policy-parity-verification/internal/report"
	"sample-id-app/policy-parity-verification/internal/rules"
	"sample-id-app/policy-parity-verification/internal/tfstate"
)

const version = "0.1.0"

func main() {
	os.Exit(run(os.Args[1:]))
}

func run(args []string) int {
	if len(args) == 0 {
		usage()
		return 2
	}
	switch args[0] {
	case "version":
		fmt.Printf("policyparity %s (okta-sdk-golang %s)\n", version, okta.VERSION)
		return 0
	case "fetch":
		return runFetch(args[1:])
	case "audit":
		return runAudit(args[1:])
	case "normalize":
		return runNormalize(args[1:])
	case "diff":
		return runDiff(args[1:])
	case "state":
		return runState(args[1:])
	case "coverage":
		return runCoverage(args[1:])
	case "report":
		return runReport(args[1:])
	default:
		fmt.Fprintf(os.Stderr, "unknown subcommand: %s\n", args[0])
		usage()
		return 2
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, `usage: policyparity <subcommand> [options]

subcommands:
  fetch      fetch policy.json and rules.json from Okta
  audit      check Okta System Log changes after freeze timestamp
  normalize  apply excludes and normalization rules
  diff       deep compare canonical JSON documents
  state      compare two resources in tofu show -json output
  coverage   compare API fields with provider schema fields
  report     build final Markdown report
  version    print tool and Okta SDK versions`)
}

func runFetch(args []string) int {
	fs := flag.NewFlagSet("fetch", flag.ContinueOnError)
	policyID := fs.String("policy-id", "", "Okta policy ID")
	orgURL := fs.String("org-url", "", "Okta org URL; defaults to OKTA_CLIENT_ORGURL")
	out := fs.String("out", "", "output directory")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if *policyID == "" || *out == "" {
		fmt.Fprintln(os.Stderr, "fetch requires --policy-id and --out")
		return 2
	}
	if err := fetch.Run(context.Background(), *orgURL, *policyID, *out); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 2
	}
	fmt.Fprintf(os.Stderr, "fetched policy %s into %s\n", *policyID, *out)
	return 0
}

func runAudit(args []string) int {
	fs := flag.NewFlagSet("audit", flag.ContinueOnError)
	policyID := fs.String("policy-id", "", "Okta policy ID")
	since := fs.String("since", "", "freeze timestamp in RFC3339")
	orgURL := fs.String("org-url", "", "Okta org URL; defaults to OKTA_CLIENT_ORGURL")
	out := fs.String("out", "", "output JSON file")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if *policyID == "" || *since == "" || *out == "" {
		fmt.Fprintln(os.Stderr, "audit requires --policy-id, --since, and --out")
		return 2
	}
	rep, err := audit.Run(context.Background(), *orgURL, *policyID, *since, *out)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 2
	}
	fmt.Fprintf(os.Stderr, "audit events for policy %s: %d\n", *policyID, rep.EventCount)
	if rep.Changed {
		return 1
	}
	return 0
}

func runNormalize(args []string) int {
	fs := flag.NewFlagSet("normalize", flag.ContinueOnError)
	in := fs.String("in", "", "raw JSON file or fetch output directory")
	rulesPath := fs.String("rules", "", "normalize-rules.yaml")
	excludePath := fs.String("exclude", "", "exclude-paths.yaml")
	defaultsPath := fs.String("defaults", "", "known-defaults.yaml")
	out := fs.String("out", "", "output canonical JSON")
	logPath := fs.String("log", "", "output normalize log JSON")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if *in == "" || *rulesPath == "" || *excludePath == "" || *out == "" {
		fmt.Fprintln(os.Stderr, "normalize requires --in, --rules, --exclude, and --out")
		return 2
	}
	doc, err := jsonio.LoadPolicyInput(*in)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 2
	}
	nr, err := rules.LoadNormalize(*rulesPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 2
	}
	ex, err := rules.LoadExclude(*excludePath)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 2
	}
	defaults, err := rules.LoadDefaults(*defaultsPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 2
	}
	normalized, log, err := normalize.Normalize(doc, nr, ex, defaults)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 2
	}
	if err := jsonio.WriteJSON(*out, normalized); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 2
	}
	if *logPath == "" {
		*logPath = strings.TrimSuffix(*out, filepath.Ext(*out)) + ".normalize_log.json"
	}
	if err := jsonio.WriteJSON(*logPath, log); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 2
	}
	fmt.Fprintf(os.Stderr, "normalized %s to %s\n", *in, *out)
	return 0
}

func runDiff(args []string) int {
	pos, out, err := parseOutFlag(args)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 2
	}
	if len(pos) != 2 || out == "" {
		fmt.Fprintln(os.Stderr, "diff requires <existing.json> <new.json> --out")
		return 2
	}
	existing, err := jsonio.ReadJSON(pos[0])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 2
	}
	newer, err := jsonio.ReadJSON(pos[1])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 2
	}
	result := diffcmp.Compare(existing, newer)
	if err := jsonio.WriteJSON(out, result); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 2
	}
	fmt.Fprintln(os.Stderr, diffcmp.Summary(result))
	if !result.Identical {
		return 1
	}
	return 0
}

func parseOutFlag(args []string) ([]string, string, error) {
	var pos []string
	var out string
	for i := 0; i < len(args); i++ {
		arg := args[i]
		switch {
		case arg == "--out" || arg == "-out":
			if i+1 >= len(args) {
				return nil, "", fmt.Errorf("%s requires a value", arg)
			}
			out = args[i+1]
			i++
		case strings.HasPrefix(arg, "--out="):
			out = strings.TrimPrefix(arg, "--out=")
		case strings.HasPrefix(arg, "-out="):
			out = strings.TrimPrefix(arg, "-out=")
		default:
			pos = append(pos, arg)
		}
	}
	return pos, out, nil
}

func runState(args []string) int {
	fs := flag.NewFlagSet("state", flag.ContinueOnError)
	statePath := fs.String("state", "", "tofu show -json output")
	existingAddr := fs.String("existing-addr", "", "existing resource address")
	newAddr := fs.String("new-addr", "", "new resource address")
	excludePath := fs.String("exclude", "", "exclude-paths.yaml")
	out := fs.String("out", "", "output state diff JSON")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if *statePath == "" || *existingAddr == "" || *newAddr == "" || *out == "" {
		fmt.Fprintln(os.Stderr, "state requires --state, --existing-addr, --new-addr, and --out")
		return 2
	}
	stateDoc, err := jsonio.ReadJSON(*statePath)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 2
	}
	var ex rules.ExcludeFile
	if *excludePath != "" {
		ex, err = rules.LoadExclude(*excludePath)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 2
		}
	}
	result, err := tfstate.CompareState(stateDoc, *existingAddr, *newAddr, ex)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 2
	}
	if err := jsonio.WriteJSON(*out, result); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 2
	}
	fmt.Fprintln(os.Stderr, diffcmp.Summary(result.Diff))
	if !result.Diff.Identical {
		return 1
	}
	return 0
}

func runCoverage(args []string) int {
	fs := flag.NewFlagSet("coverage", flag.ContinueOnError)
	schemaPath := fs.String("schema", "", "tofu providers schema -json output")
	apiPath := fs.String("api-response", "", "raw API response file or fetch output directory")
	resourceTypes := fs.String("resource-types", "", "comma separated provider resource types")
	mappingPath := fs.String("mapping", "", "schema-mapping.yaml")
	excludePath := fs.String("exclude", "", "exclude-paths.yaml")
	out := fs.String("out", "", "output gap report JSON")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if *schemaPath == "" || *apiPath == "" || *resourceTypes == "" || *out == "" {
		fmt.Fprintln(os.Stderr, "coverage requires --schema, --api-response, --resource-types, and --out")
		return 2
	}
	schemaDoc, err := jsonio.ReadJSON(*schemaPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 2
	}
	apiDoc, err := coverage.LoadAPIResponse(*apiPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 2
	}
	mapping, err := rules.LoadSchemaMapping(*mappingPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 2
	}
	var ex rules.ExcludeFile
	if *excludePath != "" {
		ex, err = rules.LoadExclude(*excludePath)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 2
		}
	}
	report, err := coverage.Check(schemaDoc, apiDoc, splitCSV(*resourceTypes), mapping, ex)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 2
	}
	if err := jsonio.WriteJSON(*out, report); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 2
	}
	gaps := len(report.UnmappedAPIFields) + len(report.Suspect)
	fmt.Fprintf(os.Stderr, "coverage mapped=%d gaps=%d ignored=%d\n", report.MappedCount, gaps, len(report.IgnoredAPIFields))
	if gaps > 0 {
		return 1
	}
	return 0
}

func runReport(args []string) int {
	fs := flag.NewFlagSet("report", flag.ContinueOnError)
	runDir := fs.String("run", "", "artifacts run directory")
	out := fs.String("out", "", "output report.md")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if *runDir == "" || *out == "" {
		fmt.Fprintln(os.Stderr, "report requires --run and --out")
		return 2
	}
	summary, err := report.Build(*runDir, *out)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 2
	}
	fmt.Fprintf(os.Stderr, "report written to %s; pass=%v failures=%d warnings=%d\n", *out, summary.OverallPass, len(summary.Failures), len(summary.Warnings))
	if !summary.OverallPass {
		return 1
	}
	return 0
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
