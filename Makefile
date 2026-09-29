# imhexpat - ImHex pattern language for radare2 (r2js)
#
# Build:   make
# Test:    make test     (standalone node test with mock r2)
# Usage:   r2 -q -i hexpat.r2.js -c 'hexpat demo/test.hexpat' /bin/ls

BUNDLE  = r2frida-compile
OUT     = hexpat.r2.js
ENTRY   = index.ts

all: $(OUT)

$(OUT): $(ENTRY) parser.ts lexer.ts ast.ts evaluator.ts interpreter.ts r2pipe.ts hexpat.d.ts
	$(BUNDLE) -B iife -o $(OUT) $(ENTRY)

test: test_parser.js
	node test_parser.js

test-r2: $(OUT)
	@echo "Running r2 integration tests..."
	@for f in tests/*.hexpat; do \
		echo "Testing $$f..."; \
		r2 -q -i $(OUT) -c "hexpat $$f" tests/sample.bin > r2_out.txt; \
		if [ -f "$$f.golden" ]; then \
			diff -u "$$f.golden" r2_out.txt || exit 1; \
		fi \
	done
	@echo "All r2 tests passed!"

test_parser.js: test_parser.ts $(ENTRY) parser.ts lexer.ts ast.ts evaluator.ts interpreter.ts r2pipe.ts
	$(BUNDLE) -B iife -o $@ test_parser.ts

clean:
	rm -f $(OUT) test_parser.js r2_out.txt dbg_out.txt

.PHONY: all test clean
