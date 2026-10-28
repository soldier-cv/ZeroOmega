#!/usr/bin/env python3
"""生成 ZeroOmega 的版本查询接口：/res/<id>/version.json + version.txt。

用法：
  write_version_endpoint.py --res /res [--id zeroomega] [--notes-file CHANGELOG.md]

版本号取自分发目录里 chromium-release.zip 内的 manifest.json，**不读 git tag / 仓库
版本，也不接受 --version**：分发出去的包才是唯一真源，任何另记一份版本号的地方都会漂移。

同时保证 /res/<id>/manifest.json 里有一条指向本接口的 link，并复用
refresh_res_manifest.py 刷新 /res/manifest.json 总表。已有字段（version / updated_at /
name / description / links）原样保留，可重复执行。

退出码：0 正常；1 输入缺失或损坏（不写任何文件）；2 文件已写入但 sha256 与目录里
*.sha256 记录不一致（说明包被写坏或误替换），CI 必须按失败处理。
"""
import argparse
import hashlib
import json
import os
import re
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import refresh_res_manifest as res_manifest

CHANNEL = 'custom_main'
SOURCE = 'https://github.com/soldier-cv/ZeroOmega'
ZIPS = ('chromium', 'firefox')
LINK_LABEL = '版本查询接口（version.json，version.txt 供 curl）'
# 与 omega-web/src/popup/js/update.js 的 FALLBACK_COMMAND 完全一致：分发包清单里没有
# command 时两条入口给同一条命令，避免升级方式互相矛盾。
FALLBACK_COMMAND = (
    'iwr http://100.64.0.88:8088/res/zeroomega/chromium-release.zip '
    '-OutFile $env:TEMP\\zo.zip; Expand-Archive $env:TEMP\\zo.zip '
    '-DestinationPath "$env:LOCALAPPDATA\\zeroomega" -Force'
)
# 允许 3.6.4 / 3.6.4-custom 这类形态：后缀是发行渠道信息，不能吃掉。
VERSION_RE = re.compile(r'^v?\d+(?:\.\d+)*(?:[-+][0-9A-Za-z.-]+)?$')


def fail(message):
    print('错误: %s' % message, file=sys.stderr)
    raise SystemExit(1)


def load_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding='utf-8') as fh:
        return json.load(fh)


def read_zip_version(zip_path):
    try:
        with zipfile.ZipFile(zip_path) as zf:
            raw = json.loads(zf.read('manifest.json').decode('utf-8'))['version']
    except (KeyError, ValueError, zipfile.BadZipFile, UnicodeDecodeError) as exc:
        fail('%s 里读不出 manifest.json 的 version: %s' % (zip_path, exc))
    raw = str(raw).strip()
    if raw[:1] in ('v', 'V'):
        raw = raw[1:]
    if not VERSION_RE.match('v' + raw):
        fail('%s 里的 version 形态不认识: %r' % (zip_path, raw))
    return 'v' + raw


def file_sha256(path):
    # 扩展包接近 2MB 且以后只会更大：流式读，不整包进内存。
    digest = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def recorded_sha256(zip_path):
    try:
        with open(zip_path + '.sha256', encoding='utf-8') as fh:
            return fh.read().split()[0].lower()
    except (OSError, IndexError):
        return None


def find_command(frag):
    for link in frag.get('links') or []:
        if isinstance(link, dict) and link.get('command'):
            return link['command']
    return None


def ensure_link(frag, path, label):
    links = frag.setdefault('links', [])
    for link in links:
        if isinstance(link, dict) and link.get('path') == path:
            return
    links.append({'label': label, 'path': path})


def main():
    ap = argparse.ArgumentParser(
        description='生成 /res/<id>/version.json 与 version.txt（版本取自分发出去的包）')
    ap.add_argument('--res', required=True, help='/res 挂载点')
    ap.add_argument('--id', default='zeroomega', help='分发包目录名（默认 zeroomega）')
    ap.add_argument('--notes-file', default=None,
                    help='可选：发布说明文件，原子复制为 /res/<id>/CHANGELOG.md')
    a = ap.parse_args()

    pkg_dir = os.path.join(a.res, a.id)
    if not os.path.isdir(pkg_dir):
        fail('分发包目录不存在: %s' % pkg_dir)

    zips = dict((name, os.path.join(pkg_dir, '%s-release.zip' % name)) for name in ZIPS)
    missing = [p for p in zips.values() if not os.path.isfile(p)]
    if missing:
        fail('缺少分发包，不生成版本接口（避免写出空版本）: %s' % ', '.join(missing))

    # 先把所有输入读完并校验，再落盘：包缺失时磁盘上不会留下半成品。
    notes = None
    if a.notes_file:
        try:
            with open(a.notes_file, encoding='utf-8') as fh:
                notes = fh.read()
        except OSError as exc:
            fail('读不了 --notes-file %s: %s' % (a.notes_file, exc))

    version = read_zip_version(zips['chromium'])
    now = res_manifest._now().strftime('%Y-%m-%d %H:%M')

    version_path = os.path.join(pkg_dir, 'version.json')
    previous = {}
    if os.path.exists(version_path):
        try:
            previous = load_json(version_path, {})
        except ValueError as exc:
            # 旧文件坏了不该阻塞发版：当成没有历史，直接覆盖。
            print('警告: 现有 version.json 解析失败，按无历史处理: %s' % exc, file=sys.stderr)
    same_version = previous.get('version') == version
    # updated_at 是「该版本首次可见时间」：同版本重跑沿用旧值，换版本才刷新。
    updated_at = previous.get('updated_at') if same_version and previous.get('updated_at') else now

    frag_path = os.path.join(pkg_dir, 'manifest.json')
    try:
        frag = load_json(frag_path, {})
    except ValueError as exc:
        fail('现有 %s 解析失败，拒绝覆盖: %s' % (frag_path, exc))
    frag.setdefault('id', a.id)

    warnings = []
    problems = []
    command = find_command(frag)
    if not command:
        command = FALLBACK_COMMAND
        warnings.append('分发包清单里没有带 command 的 link，update.command 用 popup 的同一条兜底命令')

    downloads = {}
    for name in ZIPS:
        path = zips[name]
        actual = file_sha256(path)
        expected = recorded_sha256(path)
        if expected is None:
            warnings.append('%s.sha256 缺失或为空，未做一致性校验' % os.path.basename(path))
        elif expected != actual:
            problems.append('sha256 不一致 %s: 记录 %s / 实算 %s'
                            % (os.path.basename(path), expected, actual))
        downloads[name] = {
            'url': '/res/%s/%s' % (a.id, os.path.basename(path)),
            'sha256': actual,
        }

    if notes is not None:
        res_manifest.atomic_write(os.path.join(pkg_dir, 'CHANGELOG.md'), notes)

    res_manifest.atomic_dump({
        'package': a.id,
        'version': version,
        'built_at': now,
        'updated_at': updated_at,
        'channel': CHANNEL,
        'source': SOURCE,
        'release_notes': '/res/%s/CHANGELOG.md' % a.id,
        'downloads': downloads,
        'update': {
            'command': command,
            'guide': '/res/%s/INSTALL.md' % a.id,
        },
    }, version_path)
    res_manifest.atomic_write(os.path.join(pkg_dir, 'version.txt'), version + '\n')

    ensure_link(frag, '/res/%s/version.json' % a.id, LINK_LABEL)
    res_manifest.atomic_dump(frag, frag_path)
    print('refreshed: %s' % res_manifest.refresh_index(a.res))

    print('version: %s（来自 %s）' % (version, os.path.basename(zips['chromium'])))
    for name in ZIPS:
        print('%s: %s' % (name, downloads[name]['sha256']))
    for warning in warnings:
        print('警告: %s' % warning, file=sys.stderr)
    for problem in problems:
        print('错误: %s' % problem, file=sys.stderr)
    if problems:
        print('sha256 校验失败：文件已按实算值写入，但 CI 应按失败处理', file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
