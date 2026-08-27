#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gc_ 前缀化 goldenCube-app 本地存储 key（与 tetris-mini 数据隔离）。

只处理运行时 JS（utils/ js/ openDataContext/ game.js），跳过 cloudfunctions / tools / assets。
两类替换：
  1) 整串精确 key：'coins' -> 'gc_coins'（带闭合引号锚定）
  2) 前缀型 key：'setting_  ->  'gc_setting_（只锚定开引号，字面量后面还有内容，如 'setting_bgm'）
脚本幂等：已 gc_ 前缀的 key 不会被二次替换（'gc_coins' 中 'coins' 前是下划线而非引号）。
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'cloudfunctions', 'tools', 'node_modules', '.git', 'assets'}

# 整串精确 key（不带引号）
BARE_KEYS = [
    'pending_challenges',
    'replay_last',
    'unlockedAchievements',
    'lastNewAchievements',
    'profile_auth_skipped',
    'user_profile',
    'dailyCoinsEarned',
    'dailyLoginClaimed',
    'dailyAdCoinsEarned',
    'ownedItems',
    'gameCount',
    'stat_total_coins',
    'coins',
    'rank_score',
]

# 前缀型 key（字面量后面还有内容）
PREFIX_KEYS = [
    'setting_',
    'equipped_',
    'stat_',
    'bestScore_',
    'rank_cache_',
    'rank_score_',
]


def js_files():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        rel = os.path.relpath(dirpath, ROOT)
        parts = set(rel.split(os.sep))
        if parts & SKIP_DIRS:
            dirnames[:] = []
            continue
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if fn.endswith('.js'):
                yield os.path.join(dirpath, fn)


def build_pairs():
    pairs = []
    for key in BARE_KEYS:
        pairs.append(("'%s'" % key, "'gc_%s'" % key))
        pairs.append(('"%s"' % key, '"gc_%s"' % key))
    for prefix in PREFIX_KEYS:
        pairs.append(("'%s" % prefix, "'gc_%s" % prefix))
        pairs.append(('"%s' % prefix, '"gc_%s' % prefix))
    return pairs


def main():
    pairs = build_pairs()
    changed = []
    for path in sorted(js_files()):
        with open(path, encoding='utf-8') as f:
            text = f.read()
        orig = text
        for old, new in pairs:
            text = text.replace(old, new)
        if text != orig:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(text)
            changed.append(os.path.relpath(path, ROOT))

    print('CHANGED FILES (%d):' % len(changed))
    for p in changed:
        print('  ', p)

    # 自检：本地存储字面量是否还有未前缀化的
    storage_re = re.compile(r"(?:get|set)StorageSync\(\s*(['\"])([^'\"]+)\1")
    leftovers = []
    for path in js_files():
        with open(path, encoding='utf-8') as f:
            for ln, line in enumerate(f, 1):
                for m in storage_re.finditer(line):
                    key = m.group(2)
                    if not key.startswith('gc_'):
                        leftovers.append('%s:%d %r' % (os.path.relpath(path, ROOT), ln, key))
    print('REMAINING UNPREFIXED STORAGE LITERALS (%d):' % len(leftovers))
    for l in leftovers:
        print('  ', l)
    if leftovers:
        print('FAIL: still unprefixed storage literals')
        sys.exit(2)

    print('OK: all quoted local-storage keys now start with gc_')


if __name__ == '__main__':
    main()
