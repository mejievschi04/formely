#!/bin/bash
# Diagnostic rapid: de ce formely.org poate ajunge la alt site (ex. volta-academy)
set -euo pipefail

echo "=== sites-enabled ==="
ls -la /etc/nginx/sites-enabled/ 2>/dev/null || ls -la /etc/nginx/conf.d/ 2>/dev/null || true

echo ""
echo "=== server_name care menționează formely / volta / default_server ==="
grep -RIn --include='*.conf' -E 'server_name|default_server|listen .*443' /etc/nginx/sites-enabled /etc/nginx/sites-available /etc/nginx/conf.d 2>/dev/null | head -80 || true

echo ""
echo "=== ce server răspunde pe Host formely.org :80 / :443 ==="
curl -sS -o /dev/null -w "http  formely.org  -> %{http_code}  redirect:%{redirect_url}\n" -H "Host: formely.org" http://127.0.0.1/ || true
curl -skS -o /dev/null -w "https formely.org -> %{http_code}  redirect:%{redirect_url}\n" -H "Host: formely.org" https://127.0.0.1/ || true

echo ""
echo "=== upstream Formely localhost ==="
for p in 14322 18080 13001 15181; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" "http://127.0.0.1:${p}/" 2>/dev/null || echo "down")
  echo "127.0.0.1:${p} -> ${code}"
done
