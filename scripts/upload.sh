#!/usr/bin/env bash
# Try several anonymous file hosts, verify each returned link, print a report.
set -u
F=/home/user/NexaDesk-complete.zip
SIZE=$(stat -c%s "$F")
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
echo "file: $F ($SIZE bytes)"
echo

verify() { # verify URL [expect_size]
  local url="$1"
  local code len
  code=$(curl -s -o /dev/null -w "%{http_code}" -L --max-time 60 -A "$UA" -r 0-0 "$url" 2>/dev/null)
  if [ "$code" = "200" ] || [ "$code" = "206" ]; then echo "OK"; else echo "BAD($code)"; fi
}

echo "──────────────────────────────────────────────"
echo "1) catbox.moe (permanent)"
R=$(curl -s --max-time 300 -A "$UA" -F "reqtype=fileupload" -F "fileToUpload=@$F" https://catbox.moe/user/api.php 2>&1)
echo "   response: $R"
case "$R" in http*) echo "   link: $R"; echo "   verify: $(verify "$R")";; esac
echo

echo "──────────────────────────────────────────────"
echo "2) litterbox.catbox.moe (72h temp)"
R=$(curl -s --max-time 300 -A "$UA" -F "reqtype=fileupload" -F "time=72h" -F "fileToUpload=@$F" https://litterbox.catbox.moe/resources/internals/api.php 2>&1)
echo "   response: $R"
case "$R" in http*) echo "   link: $R"; echo "   verify: $(verify "$R")";; esac
echo

echo "──────────────────────────────────────────────"
echo "3) filebin.net (no auth)"
BIN="nexadesk$(date +%s)"
R=$(curl -s --max-time 300 -A "$UA" -X POST -H "Content-Type: application/zip" --data-binary @"$F" "https://filebin.net/$BIN/NexaDesk-complete.zip" 2>&1 | head -c 400)
echo "   response: ${R:0:200}"
URL="https://filebin.net/$BIN/NexaDesk-complete.zip"
echo "   link: $URL"
echo "   verify: $(verify "$URL")"
echo

echo "──────────────────────────────────────────────"
echo "4) gofile.io (guest account via API)"
ACC=$(curl -s --max-time 60 -X POST https://api.gofile.io/accounts 2>&1)
echo "   account: ${ACC:0:160}"
TOKEN=$(echo "$ACC" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])" 2>/dev/null)
if [ -n "${TOKEN:-}" ]; then
  SRV=$(curl -s --max-time 60 https://api.gofile.io/servers | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['data']['servers'][0]['name'])" 2>/dev/null)
  echo "   server: $SRV"
  UP=$(curl -s --max-time 300 -X POST "https://$SRV.gofile.io/contents/uploadfile" -H "Authorization: Bearer $TOKEN" -F "file=@$F" 2>&1)
  echo "   upload: ${UP:0:220}"
  PAGE=$(echo "$UP" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['page'])" 2>/dev/null)
  DL=$(echo "$UP"  | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['downloadPage'])" 2>/dev/null)
  echo "   page: $PAGE"
  echo "   downloadPage: $DL"
  [ -n "$DL" ] && echo "   verify(downloadPage): $(verify "$DL")"
fi
echo

echo "──────────────────────────────────────────────"
echo "5) uguu.se (~24-48h)"
R=$(curl -s --max-time 300 -A "$UA" -F "files[]=@$F" https://uguu.se/upload.php 2>&1)
echo "   response: ${R:0:220}"
U=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin)['files'][0]['url'])" 2>/dev/null)
[ -n "$U" ] && { echo "   link: $U"; echo "   verify: $(verify "$U")"; }
echo

echo "──────────────────────────────────────────────"
echo "6) temp.sh"
R=$(curl -s --max-time 300 -A "$UA" --upload-file "$F" "https://temp.sh/NexaDesk-complete.zip" 2>&1)
echo "   response: ${R:0:200}"
case "$R" in http*) echo "   link: $R"; echo "   verify: $(verify "$R")";; esac
echo

echo "──────────────────────────────────────────────"
echo "7) transfer.sh"
R=$(curl -s --max-time 300 -A "$UA" --upload-file "$F" "https://transfer.sh/NexaDesk-complete.zip" 2>&1)
echo "   response: ${R:0:200}"
case "$R" in http*) echo "   link: $R"; echo "   verify: $(verify "$R")";; esac
echo

echo "──────────────────────────────────────────────"
echo "8) oshi.at"
R=$(curl -s --max-time 300 -A "$UA" -T "$F" "https://oshi.at/NexaDesk-complete.zip" 2>&1 | head -3)
echo "   response: ${R:0:200}"
U=$(echo "$R" | head -1)
case "$U" in http*) echo "   link: $U"; echo "   verify: $(verify "$U")";; esac
echo
echo "done"
