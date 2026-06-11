"""pytest フィクスチャ。

既定では golden/*.example.json（コミット済みのサンプル）を読む。
実運用では環境変数で実 snapshot を差し込む:
    OLD_SNAPSHOT=golden/policy_old.json NEW_SNAPSHOT=golden/policy_new.json pytest
"""
from __future__ import annotations

import os
import pathlib

import pytest

from lib.okta_client import policy_from_json

ROOT = pathlib.Path(__file__).resolve().parent.parent


def _load(env_key: str, default_name: str):
    path = ROOT / os.environ.get(env_key, f"golden/{default_name}")
    return policy_from_json(path.read_text(encoding="utf-8"))


@pytest.fixture
def old_policy():
    return _load("OLD_SNAPSHOT", "policy_old.example.json")


@pytest.fixture
def new_policy():
    return _load("NEW_SNAPSHOT", "policy_new.example.json")
