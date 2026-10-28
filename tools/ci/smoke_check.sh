#!/bin/sh
# 从分发入口把产物拉回来验一遍（CI smoke 步骤用）。
# 独立成脚本的原因：yml 的 commands 里出现 ": " 形态会被 YAML 当 map 解析，
# 校验断言里带 JSON 片段（"manifest_version": 3）必然踩这个坑。
set -eu

BASE="${1:-http://172.17.0.1:8088}"
DIR="/res/zeroomega"
# 用独立临时目录：同一个 runner 上并发跑 smoke 时不至于互相覆盖同名文件
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

apk add --no-cache curl unzip >/dev/null 2>&1 || true

echo "== 下载分发包 =="
curl -fsS --noproxy '*' -o "$TMP/c.zip" "$BASE$DIR/chromium-release.zip"
curl -fsS --noproxy '*' -o "$TMP/f.zip" "$BASE$DIR/firefox-release.zip"
test -s "$TMP/c.zip"
test -s "$TMP/f.zip"

echo "== 校验 sha256 与分发区记录一致 =="
curl -fsS --noproxy '*' -o "$TMP/c.sha" "$BASE$DIR/chromium-release.zip.sha256"
EXPECT=$(cut -d' ' -f1 < "$TMP/c.sha")
ACTUAL=$(sha256sum "$TMP/c.zip" | cut -d' ' -f1)
[ "$EXPECT" = "$ACTUAL" ] || { echo "sha256 不一致 expect=$EXPECT actual=$ACTUAL"; exit 1; }

echo "== 校验 zip 内容 =="
mkdir -p "$TMP/zo"
unzip -o -q "$TMP/c.zip" -d "$TMP/zo"
test -f "$TMP/zo/manifest.json"
grep -q '"manifest_version": *3' "$TMP/zo/manifest.json"
grep -q '__MSG_manifest_app_name__' "$TMP/zo/manifest.json"
test -f "$TMP/zo/js/background.js"
test -f "$TMP/zo/options.html"

echo "== 校验版本查询接口 =="
PKG_VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$TMP/zo/manifest.json" | head -1)
test -n "$PKG_VERSION"
curl -fsS --noproxy '*' -o "$TMP/v.json" "$BASE$DIR/version.json"
grep -q "\"version\": \"v$PKG_VERSION\"" "$TMP/v.json"
grep -q "\"url\": \"/res/zeroomega/chromium-release.zip\"" "$TMP/v.json"
curl -fsS --noproxy '*' -o "$TMP/v.txt" "$BASE$DIR/version.txt"
printf 'v%s\n' "$PKG_VERSION" > "$TMP/v.expected"
cmp "$TMP/v.expected" "$TMP/v.txt"
echo "version endpoint OK -> v$PKG_VERSION"

echo "== 校验首页清单已收录 =="
curl -fsS --noproxy '*' "$BASE/res/manifest.json" | grep -q '"id": "zeroomega"'

echo "smoke OK -> chromium $(wc -c < "$TMP/c.zip") bytes / firefox $(wc -c < "$TMP/f.zip") bytes"
