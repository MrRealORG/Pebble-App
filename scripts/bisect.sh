#!/bin/bash
# bisect 25-timeless.js to find the first syntactically-broken prefix
SRC=renderer/js/25-timeless.js
TOTAL=$(wc -l < $SRC)
TAIL="})"
lo=10; hi=$TOTAL
while [ $((hi-lo)) -gt 5 ]; do
  mid=$(( (lo+hi)/2 ))
  head -n $mid $SRC > /tmp/bisect.js
  printf '\n})(window.NX);\n' >> /tmp/bisect.js
  if node --check /tmp/bisect.js >/dev/null 2>&1; then lo=$mid; else hi=$mid; fi
done
echo "valid up to line $lo, broken by line $hi"
sed -n "$((lo-2)),${hi}p" $SRC | head -40
