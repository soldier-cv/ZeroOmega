#!/bin/sh
# 从分发入口把产物拉回来验一遍（CI smoke 步骤用）。
# 独立成脚本的原因：yml 的 commands 里出现 ": " 形态会被 YAML 当 map 解析，
# 校验断言里带 JSON 片段（"manifest_version": 3）必然踩这个坑。
set -eu

BASE="${1:-http://172.17.0.1:8088}"
DIR="/res/zeroomega"

apk add --no-cache curl unzip >/dev/null 2>&1 || true

echo "== 下载分发包 =="
curl -fsS --noproxy '*' -o /tmp/c.zip "$BASE$DIR/chromium-release.zip"
curl -fsS --noproxy '*' -o /tmp/f.zip "$BASE$DIR/firefox-release.zip"
test -s /tmp/c.zip
test -s /tmp/f.zip

echo "== 校验 sha256 与分发区记录一致 =="
curl -fsS --noproxy '*' -o /tmp/c.sha "$BASE$DIR/chromium-release.zip.sha256"
EXPECT=$(cut -d' ' -f1 < /tmp/c.sha)
ACTUAL=$(sha256sum /tmp/c.zip | cut -d' ' -f1)
[ "$EXPECT" = "$ACTUAL" ] || { echo "sha256 不一致 expect=$EXPECT actual=$ACTUAL"; exit 1; }

echo "== 校验 zip 内容 =="
rm -rf /tmp/zo && mkdir -p /tmp/zo
unzip -o -q /tmp/c.zip -d /tmp/zo
test -f /tmp/zo/manifest.json
grep -q '"manifest_version": *3' /tmp/zo/manifest.json
grep -q '__MSG_manifest_app_name__' /tmp/zo/manifest.json
test -f /tmp/zo/js/background.js
test -f /tmp/zo/options.html

echo "== 校验首页清单已收录 =="
curl -fsS --noproxy '*' "$BASE/res/manifest.json" | grep -q '"id": "zeroomega"'

echo "smoke OK -> chromium $(wc -c < /tmp/c.zip) bytes / firefox $(wc -c < /tmp/f.zip) bytes"
