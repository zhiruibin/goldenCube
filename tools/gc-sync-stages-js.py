#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 data/stages-v1.json 生成 data/stages-v1.js（微信端不支持 require .json）。

用法：
    python3 tools/gc-sync-stages-js.py

数据唯一来源是 data/stages-v1.json；生成的 .js 为模块副本，请勿手改。
修改关卡数据请编辑 stages-v1.json，然后重新运行本脚本。
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
JSON_PATH = ROOT / "data" / "stages-v1.json"
JS_PATH = ROOT / "data" / "stages-v1.js"

data = json.loads(JSON_PATH.read_text(encoding="utf-8"))

header = (
    "/**\n"
    " * data/stages-v1.js - 关卡配置模块副本\n"
    " * 微信小程序运行时把 require('.json') 解析为 '<name>.json.js' 模块并报 not defined，\n"
    " * 因此由 data/stages-v1.json 生成此 JS 模块供 require 使用（数据保持单一来源）。\n"
    " * 由 tools/gc-sync-stages-js.py 自动生成，请勿手改；修改请编辑 stages-v1.json 后重新生成。\n"
    " */\n"
    "'use strict';\n\n"
)

content = header + "module.exports = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n"
JS_PATH.write_text(content, encoding="utf-8")
print("OK: generated", JS_PATH)
