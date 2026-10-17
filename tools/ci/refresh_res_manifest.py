#!/usr/bin/env python3
"""刷新 static-deploy 的 /res 分发区清单（CI 用）。

用法：
  refresh_res_manifest.py --res /res --id zeroomega --version v3.5.2-custom [--description "..."]

行为：
  1. 更新 /res/<id>/manifest.json 的 version / updated_at（保留 links 等既有字段）
  2. 扫描 /res/*/manifest.json 汇总写入 /res/manifest.json（static-deploy 首页读这个）

原子写：临时文件 + os.replace，避免首页读到半截 JSON。
"""
import argparse
import datetime
import glob
import json
import os
import tempfile


def atomic_dump(obj, path):
    d = os.path.dirname(path) or '.'
    fd, tmp = tempfile.mkstemp(dir=d, prefix='.manifest-', suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as fh:
            json.dump(obj, fh, ensure_ascii=False, indent=2)
            fh.write('\n')
        # mkstemp 默认 0600，/res 是给 nginx 直发的：不放开读权限会整块 403
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)
    except Exception:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--res', required=True, help='/res 挂载点')
    ap.add_argument('--id', required=True, help='分发包目录名')
    ap.add_argument('--version', required=True)
    ap.add_argument('--description', default=None)
    a = ap.parse_args()

    frag_path = os.path.join(a.res, a.id, 'manifest.json')
    frag = {}
    if os.path.exists(frag_path):
        with open(frag_path, encoding='utf-8') as fh:
            frag = json.load(fh)
    frag.setdefault('id', a.id)
    frag.setdefault('name', a.id)
    frag.setdefault('links', [])
    frag['version'] = a.version
    frag['updated_at'] = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
    if a.description:
        frag['description'] = a.description
    atomic_dump(frag, frag_path)

    resources = []
    for f in sorted(glob.glob(os.path.join(a.res, '*', 'manifest.json'))):
        try:
            with open(f, encoding='utf-8') as fh:
                resources.append(json.load(fh))
        except Exception as exc:  # 单个包损坏不影响其余
            print('skip %s: %s' % (f, exc))
    atomic_dump({
        'generated_at': datetime.datetime.now().strftime('%Y-%m-%d %H:%M'),
        'resources': resources,
    }, os.path.join(a.res, 'manifest.json'))
    print('refreshed: %s' % [r.get('id') for r in resources])


if __name__ == '__main__':
    main()
