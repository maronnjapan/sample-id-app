RUN_ID ?= $(shell date -u +%Y%m%dT%H%M%SZ)
TF ?= tofu
BIN := bin/policyparity

.PHONY: build test verify verify-fixtures clean

build:
	go build -o $(BIN) ./cmd/policyparity

test:
	go test ./...

verify-fixtures: build test
	@echo "fixture self-tests passed"

verify: build
	@test -n "$(EXISTING_ID)" || (echo "EXISTING_ID is required" >&2; exit 2)
	@test -n "$(NEW_ID)" || (echo "NEW_ID is required" >&2; exit 2)
	@test -n "$(FREEZE_TIMESTAMP)" || (echo "FREEZE_TIMESTAMP is required" >&2; exit 2)
	@test -n "$(EXISTING_ADDR)" || (echo "EXISTING_ADDR is required" >&2; exit 2)
	@test -n "$(NEW_ADDR)" || (echo "NEW_ADDR is required" >&2; exit 2)
	mkdir -p artifacts/$(RUN_ID)/raw artifacts/$(RUN_ID)/normalized artifacts/$(RUN_ID)/diff artifacts/$(RUN_ID)/coverage artifacts/$(RUN_ID)/plan artifacts/$(RUN_ID)/state
	$(BIN) audit --policy-id "$(EXISTING_ID)" --since "$(FREEZE_TIMESTAMP)" --out artifacts/$(RUN_ID)/audit.json
	$(BIN) fetch --policy-id "$(EXISTING_ID)" --out artifacts/$(RUN_ID)/raw/existing
	$(BIN) fetch --policy-id "$(NEW_ID)" --out artifacts/$(RUN_ID)/raw/new
	$(BIN) normalize --in artifacts/$(RUN_ID)/raw/existing --rules config/normalize-rules.yaml --exclude config/exclude-paths.yaml --defaults config/known-defaults.yaml --out artifacts/$(RUN_ID)/normalized/existing.json
	$(BIN) normalize --in artifacts/$(RUN_ID)/raw/new --rules config/normalize-rules.yaml --exclude config/exclude-paths.yaml --defaults config/known-defaults.yaml --out artifacts/$(RUN_ID)/normalized/new.json
	$(BIN) diff artifacts/$(RUN_ID)/normalized/existing.json artifacts/$(RUN_ID)/normalized/new.json --out artifacts/$(RUN_ID)/diff/diff_result.json
	$(TF) providers schema -json > artifacts/$(RUN_ID)/coverage/provider_schema.json
	set +e; $(BIN) coverage --schema artifacts/$(RUN_ID)/coverage/provider_schema.json --api-response artifacts/$(RUN_ID)/raw/existing --resource-types okta_app_signon_policy,okta_app_signon_policy_rule --mapping config/schema-mapping.yaml --exclude config/exclude-paths.yaml --out artifacts/$(RUN_ID)/coverage/gap_report.json; code=$$?; echo $$code > artifacts/$(RUN_ID)/coverage/coverage_exitcode.txt; test $$code -ne 2
	set +e; $(TF) plan -detailed-exitcode -no-color > artifacts/$(RUN_ID)/plan/plan.txt; code=$$?; echo $$code > artifacts/$(RUN_ID)/plan/plan_exitcode.txt; test $$code -eq 0
	$(TF) show -json > artifacts/$(RUN_ID)/state/state.json
	$(BIN) state --state artifacts/$(RUN_ID)/state/state.json --existing-addr "$(EXISTING_ADDR)" --new-addr "$(NEW_ADDR)" --exclude config/exclude-paths.yaml --out artifacts/$(RUN_ID)/state/state_diff.json
	set +e; go test ./... > artifacts/$(RUN_ID)/verifier-test-result.txt 2>&1; code=$$?; test $$code -eq 0
	$(BIN) report --run artifacts/$(RUN_ID) --out artifacts/$(RUN_ID)/report.md

clean:
	rm -rf bin
