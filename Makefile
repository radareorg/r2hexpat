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

check:
	$(TSC) -p .

test: test-unit test-r2 test-upstream

test-unit: tests/unit.js
	node tests/unit.js

test-upstream: $(OUT)
	python3 tests/run_upstream.py

test-r2: $(OUT)
	@sh tests/run_r2.sh

clean:
	rm -f $(OUT) tests/*.js tests/r2_out.txt

.PHONY: all check test test-unit test-upstream test-r2 clean
