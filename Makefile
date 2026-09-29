# imhexpat - ImHex pattern language for radare2 (r2js)
#
# Build:   make
# Test:    make test     (unit test with mock r2 + r2 golden tests + upstream suite)
# Usage:   r2 -q -i hexpat.r2.js -c 'hexpat demo/test.hexpat' /bin/ls

BUNDLE  = r2frida-compile
OUT     = hexpat.r2.js
SRCS    = $(wildcard lib/*.ts)

all: $(OUT)

$(OUT): $(SRCS)
	$(BUNDLE) -S -B iife -o $(OUT) lib/index.ts

tests/unit.js: tests/unit.ts $(SRCS)
	$(BUNDLE) -S -B iife -o $@ tests/unit.ts

check:
	tsc -p .

test: test-unit test-r2

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

.PHONY: all check test test-unit test-r2 clean
