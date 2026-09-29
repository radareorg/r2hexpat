# imhexpat - ImHex pattern language for radare2 (r2js)
#
# Build:   make
# Test:    make test     (unit test with mock r2 + r2 golden tests + upstream suite)
# Usage:   r2 -q -i hexpat.r2.js -c 'hexpat demo/test.hexpat' /bin/ls

# BUNDLER=esbuild uses node_modules (npm ci) instead of r2frida-compile
BUNDLER ?= r2frida-compile
OUT     = hexpat.r2.js
SRCS    = $(wildcard lib/*.ts)
ifeq ($(BUNDLER),esbuild)
BUNDLE  = npx esbuild --bundle --format=iife --target=es2020 --log-level=warning --outfile=$@
TSC     = npx tsc
else
BUNDLE  = r2frida-compile -S -B iife -o $@
TSC     = tsc
endif

all: $(OUT)

$(OUT): $(SRCS)
	$(BUNDLE) lib/index.ts

tests/unit.js: tests/unit.ts $(SRCS)
	$(BUNDLE) tests/unit.ts

check:
	$(TSC) -p .

test: test-unit test-r2 test-upstream

test-upstream: $(OUT)
	python3 tests/run_upstream.py

test-unit: tests/unit.js
	node tests/unit.js

test-r2: $(OUT)
	@echo "Running r2 integration tests..."
	@for f in tests/*.hexpat; do \
		echo "Testing $$f..."; \
		r2 -q -i $(OUT) -c "hexpat $$f" tests/sample.bin > tests/r2_out.txt; \
		if [ -f "$$f.golden" ]; then \
			diff -u "$$f.golden" tests/r2_out.txt || exit 1; \
		fi \
	done
	@rm -f tests/r2_out.txt
	@echo "All r2 tests passed!"

clean:
	rm -f $(OUT) tests/unit.js tests/r2_out.txt

.PHONY: all check test test-unit test-r2 test-upstream clean
