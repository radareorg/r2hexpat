#!/bin/sh
# r2 integration tests: tests/*.hexpat evaluated by the plugin on tests/sample.bin,
# compared with tests/*.hexpat.golden. Usage: run_r2.sh [-u]  (-u rewrites goldens)
cd "$(dirname "$0")/.." || exit 1
# skip loading user plugins and colors: r2 starts ~3x faster
export R2_NOPLUGINS=1 R2_COLOR=0
fail=0
for f in tests/*.hexpat; do
	out=$(r2 -q -e scr.color=0 -i hexpat.r2.js -c "hexpat $f" tests/sample.bin 2>&1)
	if [ "$1" = "-u" ]; then
		printf '%s\n' "$out" > "$f.golden"; echo "updated $f.golden"; continue
	fi
	if printf '%s\n' "$out" | diff -u "$f.golden" - >/dev/null; then
		echo "PASS $f"
	else
		echo "FAIL $f"; printf '%s\n' "$out" | diff -u "$f.golden" -; fail=1
	fi
done
# command tests: tests/cmd_*.r2 are r2 scripts run with the plugin loaded
for f in tests/cmd_*.r2; do
	out=$(r2 -q -e scr.color=0 -i hexpat.r2.js -i "$f" tests/sample.bin 2>&1)
	if [ "$1" = "-u" ]; then
		printf '%s\n' "$out" > "$f.golden"; echo "updated $f.golden"; continue
	fi
	if printf '%s\n' "$out" | diff -u "$f.golden" - >/dev/null; then
		echo "PASS $f"
	else
		echo "FAIL $f"; printf '%s\n' "$out" | diff -u "$f.golden" -; fail=1
	fi
done
[ $fail = 0 ] && echo "All r2 tests passed!"
exit $fail
