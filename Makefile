# r2hexpat - ImHex pattern language library + radare2 (r2js) plugin
#
# Build:   make
# Test:    make test     (unit + upstream conformance under node, r2 golden tests)
# Usage:   r2 -q -i hexpat.r2.js -c 'hexpat demo/test.hexpat' /bin/ls

# BUNDLER=esbuild uses node_modules (npm ci) instead of r2frida-compile
BUNDLER ?= r2frida-compile
OUT     = hexpat.r2.js
LIB     = $(wildcard lib/*.ts)
ifeq ($(BUNDLER),esbuild)
BUNDLE  = npx esbuild --bundle --format=iife --target=es2020 --log-level=warning --outfile=$@
TSC     = npx tsc
else
BUNDLE  = r2frida-compile -S -B iife -o $@
TSC     = tsc
endif

all: $(OUT)

$(OUT): r2/plugin.ts r2/r2.d.ts $(LIB)
	$(BUNDLE) r2/plugin.ts

tests/unit.js: tests/unit.ts $(LIB)
	$(BUNDLE) tests/unit.ts

tests/testlib.js: tests/testlib.ts tests/upstream_hooks.ts $(LIB)
	$(BUNDLE) tests/testlib.ts

tests/upstream.r2.js: tests/upstream_r2.ts tests/upstream_hooks.ts $(LIB)
	$(BUNDLE) tests/upstream_r2.ts

check:
	$(TSC) -p .

test: test-unit test-upstream test-r2 test-upstream-r2

test-unit: tests/unit.js
	node tests/unit.js

test-upstream: tests/testlib.js
	node tests/upstream.mjs $(ARGS)

test-r2: $(OUT)
	@sh tests/run_r2.sh

# the upstream suite again, inside radare2's QuickJS (single r2 process)
test-upstream-r2: tests/upstream.r2.js
	@cd tests/upstream && R2_NOPLUGINS=1 R2_COLOR=0 r2 -q -i ../upstream.r2.js test_data.bin > ../r2_out.txt 2>&1; cat ../r2_out.txt; ! grep -q -e '^FAIL' -e internal: ../r2_out.txt

# the ImHex-Patterns corpus: make test-corpus CORPUS=path/to/ImHex-Patterns [ARGS=-v]
test-corpus: tests/testlib.js
	@test -n "$(CORPUS)" || (echo 'usage: make test-corpus CORPUS=path/to/ImHex-Patterns' && false)
	node tests/corpus.mjs $(ARGS) $(CORPUS)

clean:
	rm -f $(OUT) tests/*.js tests/r2_out.txt

.PHONY: all check test test-unit test-upstream test-r2 test-upstream-r2 test-corpus clean
