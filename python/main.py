"""Okta System Log取得スクリプト（Private Key JWT認証）"""

import asyncio
import os

from okta.api.system_log_api import SystemLogApi
from okta.api_client import ApiClient
from okta.configuration import Configuration


def build_config() -> Configuration:
    """環境変数からOktaクライアント設定を構築する。"""
    config = Configuration(
        org_url=os.environ["OKTA_ORG_URL"],
        authorization_mode="PrivateKey",
        client_id=os.environ["OKTA_CLIENT_ID"],
        scopes=["okta.logs.read"],
        private_key=os.environ["OKTA_PRIVATE_KEY"],  # PEMまたはJWK文字列
    )
    # kid が設定されていれば付与（複数JWK登録時に必要）
    kid = os.environ.get("OKTA_PRIVATE_KEY_ID")
    if kid:
        config.private_key_id = kid
    return config


async def fetch_logs(
    since: str | None = None,
    until: str | None = None,
    query: str | None = None,
    limit: int = 100,
) -> list:
    """Oktaシステムログを取得して返す。

    Args:
        since: 開始日時 (ISO 8601)。例: "2025-01-01T00:00:00Z"
        until: 終了日時 (ISO 8601)。
        query: キーワード検索文字列。
        limit: 取得件数上限（デフォルト100、最大1000）。
    """
    config = build_config()
    api_client = ApiClient(configuration=config)
    log_api = SystemLogApi(api_client)

    kwargs: dict = {"limit": limit, "sort_order": "DESCENDING"}
    if since:
        kwargs["since"] = since
    if until:
        kwargs["until"] = until
    if query:
        kwargs["q"] = query

    events = await log_api.list_log_events(**kwargs)
    return events


async def main() -> None:
    events = await fetch_logs(limit=20)
    for event in events:
        print(
            f"[{event.published}] {event.event_type} - "
            f"actor={getattr(event.actor, 'display_name', 'N/A')}, "
            f"outcome={getattr(event.outcome, 'result', 'N/A')}"
        )


if __name__ == "__main__":
    asyncio.run(main())
