#!/usr/bin/env python3
"""Okta certification quiz JSON validator.

question-schema.json の規約に従って全問題ファイルを検証する。
外部ライブラリ不要(標準ライブラリのみ)。

Usage: python3 scripts/validate.py
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ALLOWED_URL = re.compile(
    r"^https://(help\.okta\.com|developer\.okta\.com|support\.okta\.com|status\.okta\.com|certification\.okta\.com)/"
)
ID_PATTERN = re.compile(r"^(OCP|OCA)-(MC|WR)-\d{3}$")
CHOICE_ID = re.compile(r"^[A-F]$")
DIFFICULTIES = {"basic", "intermediate", "advanced"}
MC_TYPES = {"single-choice", "multiple-select"}

errors = []
warnings = []
all_ids = {}
stats = {}


def err(f, msg):
    errors.append(f"[{f}] {msg}")


def warn(f, msg):
    warnings.append(f"[{f}] {msg}")


def check_sources(f, q):
    sources = q.get("sources")
    if not isinstance(sources, list) or len(sources) < 1:
        err(f, f"{q.get('id')}: sources は 1 件以上必要")
        return
    for s in sources:
        if not isinstance(s, dict) or "title" not in s or "url" not in s:
            err(f, f"{q.get('id')}: source に title/url が必要")
            continue
        if not ALLOWED_URL.match(s["url"]):
            err(f, f"{q.get('id')}: 許可されていない URL ドメイン: {s['url']}")


def check_base(f, q):
    for field in ("id", "type", "domain", "topic", "difficulty", "question", "tags"):
        if field not in q:
            err(f, f"{q.get('id', '?')}: 必須フィールド欠落: {field}")
    qid = q.get("id", "")
    if not ID_PATTERN.match(qid):
        err(f, f"ID 形式が不正: {qid}")
    if qid in all_ids:
        err(f, f"ID 重複: {qid} (既出: {all_ids[qid]})")
    else:
        all_ids[qid] = f
    if q.get("difficulty") not in DIFFICULTIES:
        err(f, f"{qid}: difficulty が不正: {q.get('difficulty')}")
    if len(q.get("question", "")) < 20:
        err(f, f"{qid}: question が短すぎる")
    if not isinstance(q.get("tags"), list) or len(q.get("tags", [])) < 1:
        err(f, f"{qid}: tags は 1 件以上必要")
    check_sources(f, q)


def check_mc(f, q):
    qid = q.get("id", "?")
    if q.get("type") not in MC_TYPES:
        err(f, f"{qid}: MC の type が不正: {q.get('type')}")
    choices = q.get("choices")
    if not isinstance(choices, list) or not (3 <= len(choices) <= 6):
        err(f, f"{qid}: choices は 3〜6 件必要")
        return
    ids = [c.get("id") for c in choices]
    if len(set(ids)) != len(ids):
        err(f, f"{qid}: choice id が重複")
    for c in choices:
        if not CHOICE_ID.match(c.get("id", "")):
            err(f, f"{qid}: choice id が不正: {c.get('id')}")
        if not c.get("text"):
            err(f, f"{qid}: choice text が空")
    correct = q.get("correctAnswerIds")
    if not isinstance(correct, list) or len(correct) < 1:
        err(f, f"{qid}: correctAnswerIds が必要")
        return
    for cid in correct:
        if cid not in ids:
            err(f, f"{qid}: correctAnswerIds に存在しない選択肢: {cid}")
    if q["type"] == "single-choice" and len(correct) != 1:
        err(f, f"{qid}: single-choice は正解 1 つのみ({len(correct)} 個指定)")
    if q["type"] == "multiple-select" and len(correct) < 2:
        err(f, f"{qid}: multiple-select は正解 2 つ以上")
    if len(q.get("explanation", "")) < 50:
        err(f, f"{qid}: explanation が短すぎる(50 文字以上)")
    # 正解 ID が MC- で始まる ID 規約と一致しているか
    if "-WR-" in qid:
        err(f, f"{qid}: written の ID で MC 問題が定義されている")


def check_written(f, q):
    qid = q.get("id", "?")
    if q.get("type") != "written":
        err(f, f"{qid}: written の type が不正: {q.get('type')}")
    if "-MC-" in qid:
        err(f, f"{qid}: MC の ID で written 問題が定義されている")
    if len(q.get("modelAnswer", "")) < 100:
        err(f, f"{qid}: modelAnswer が短すぎる(100 文字以上)")
    rubric = q.get("rubric")
    if not isinstance(rubric, dict):
        err(f, f"{qid}: rubric が必要")
        return
    for field in ("totalPoints", "passingScore", "criteria", "gradingInstructions"):
        if field not in rubric:
            err(f, f"{qid}: rubric.{field} が必要")
    total = rubric.get("totalPoints", 0)
    passing = rubric.get("passingScore", 0)
    if passing > total:
        err(f, f"{qid}: passingScore ({passing}) > totalPoints ({total})")
    criteria = rubric.get("criteria", [])
    if len(criteria) < 2:
        err(f, f"{qid}: criteria は 2 件以上必要")
    pts = 0
    seen_cids = set()
    for c in criteria:
        for field in ("id", "description", "points", "mustInclude", "scoringGuide"):
            if field not in c:
                err(f, f"{qid}: criterion に {field} が必要 ({c.get('id', '?')})")
        cid = c.get("id", "?")
        if cid in seen_cids:
            err(f, f"{qid}: criterion id 重複: {cid}")
        seen_cids.add(cid)
        if not re.match(r"^C\d+$", cid):
            err(f, f"{qid}: criterion id 形式が不正: {cid}")
        pts += c.get("points", 0)
        if not isinstance(c.get("mustInclude"), list) or len(c.get("mustInclude", [])) < 1:
            err(f, f"{qid}: {cid} の mustInclude は 1 件以上必要")
    if pts != total:
        err(f, f"{qid}: criteria の points 合計 ({pts}) が totalPoints ({total}) と不一致")
    for d in rubric.get("deductions", []):
        if d.get("points", 0) >= 0:
            err(f, f"{qid}: deduction の points は負の値: {d.get('description', '?')[:30]}")


def check_file(path):
    f = path.name
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        err(f, f"JSON パースエラー: {e}")
        return
    meta = data.get("meta")
    questions = data.get("questions")
    if not isinstance(meta, dict) or not isinstance(questions, list):
        err(f, "meta / questions が必要")
        return
    for field in ("fileId", "certification", "certificationId", "examSection", "examSectionJa", "questionType", "language", "generatedAt", "questionCount"):
        if field not in meta:
            err(f, f"meta.{field} が必要")
    if meta.get("fileId") and meta["fileId"] != path.stem:
        err(f, f"meta.fileId ({meta['fileId']}) がファイル名 ({path.stem}) と不一致")
    if meta.get("questionCount") != len(questions):
        err(f, f"meta.questionCount ({meta.get('questionCount')}) と実際の問題数 ({len(questions)}) が不一致")
    cert = meta.get("certificationId", "?")
    expected_prefix = {"professional": "OCP", "administrator": "OCA"}.get(cert)
    for q in questions:
        check_base(f, q)
        qid = q.get("id", "")
        if expected_prefix and not qid.startswith(expected_prefix):
            err(f, f"{qid}: certificationId ({cert}) と ID プレフィックスが不一致")
        if q.get("type") == "written":
            check_written(f, q)
        else:
            check_mc(f, q)
        key = (cert, "written" if q.get("type") == "written" else "mc")
        stats[key] = stats.get(key, 0) + 1


def main():
    files = sorted((ROOT / "professional").glob("*.json")) + sorted((ROOT / "administrator").glob("*.json"))
    if not files:
        print("問題ファイルが見つかりません", file=sys.stderr)
        sys.exit(1)
    for path in files:
        check_file(path)

    print(f"検証対象: {len(files)} ファイル / {len(all_ids)} 問")
    for (cert, kind), n in sorted(stats.items()):
        print(f"  {cert:15s} {kind:8s}: {n} 問")
    if warnings:
        print(f"\n警告 ({len(warnings)}):")
        for w in warnings:
            print(f"  WARN: {w}")
    if errors:
        print(f"\nエラー ({len(errors)}):")
        for e in errors:
            print(f"  ERROR: {e}")
        sys.exit(1)
    print("\nOK: すべての検証に合格しました")


if __name__ == "__main__":
    main()
