.DEFAULT_GOAL := help
.PHONY: help dev start build preview test lint check clean

# node_modules is a real file target: only reinstalls when package.json or
# the lockfile actually change, instead of re-running npm on every command.
node_modules: package.json package-lock.json
	@command -v npm >/dev/null 2>&1 || { \
		echo "npm not found. Install Node.js first (e.g. 'brew install node') and re-run."; \
		exit 1; \
	}
	npm install
	@touch node_modules

help: ## Show this help
	@echo "Mosaic Builder — common commands:"
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  make %-10s %s\n", $$1, $$2}'

dev: node_modules ## Start the dev server (opens the browser)
	npm run dev

start: dev ## Alias for 'make dev'

build: node_modules ## Type-check and build the production bundle into dist/
	npm run build

preview: build ## Build, then serve dist/ locally (opens the browser)
	npm run preview

test: node_modules ## Run the unit test suite
	npm run test

lint: node_modules ## Run the linter
	npm run lint

check: node_modules ## Run tests and build — what CI / each milestone should pass
	npm run check

clean: ## Remove node_modules and the production build
	rm -rf node_modules dist
