# GitHub Actions cross-job シークレット受け渡し調査結果

## 調査日: 2026-04-24

## 結論

`::add-mask::` + `GITHUB_OUTPUT` の組み合わせは、値の渡し方として機能するが**セキュリティ機構ではない**。
ログに平文露出するリスクがあるため、AES 暗号化して job output に渡すアプローチを採用。

## 主な発見

### `::add-mask::` と GITHUB_OUTPUT の順序
- 順序に関わらず GITHUB_OUTPUT に書いた値は cross-job で元の値（平文）が渡る
- `::add-mask::` はそのジョブのログ出力のみに適用される機能
- クロスジョブの secret 受け渡しのセキュリティ機構としては機能しない

### GitHub 公式推奨
- OIDC + 外部 secret store（AWS Secrets Manager, Vault 等）が最推奨
- 外部サービスなしの制約下では AES 暗号化 + job outputs が次善策

### AES 暗号化アプローチのセキュリティ特性
- セキュリティは TOKEN_ENCRYPTION_KEY の秘匿性に依存
- リポジトリ write 権限を持つ全共同作業者を信頼する前提が必要
- ubuntu-latest に openssl がプリインストール済みのため追加依存なし

### upload-artifact を使う方法
- リポジトリ read 権限があるユーザーなら誰でもダウンロード可能
- 暗号化しても長期保存されるため攻撃面が広い → 採用しない

## 採用した実装

```yaml
# grant_super_admin job (encrypt)
- name: Encrypt access token for secure cross-job transfer
  id: encrypt
  env:
    PLAIN_TOKEN: ${{ steps.grant.outputs.access_token }}  # 同一ジョブ内なので実値が得られる
    ENC_KEY: ${{ secrets.TOKEN_ENCRYPTION_KEY }}
  run: |
    ENCRYPTED=$(printf '%s' "$PLAIN_TOKEN" | openssl enc -aes-256-cbc -a -pbkdf2 -k "$ENC_KEY")
    echo "encrypted_token=$ENCRYPTED" >> "$GITHUB_OUTPUT"

# revoke_super_admin job (decrypt)
- name: Decrypt token and revoke SUPER_ADMIN
  env:
    ENCRYPTED_TOKEN: ${{ needs.grant_super_admin.outputs.encrypted_token }}
    ENC_KEY: ${{ secrets.TOKEN_ENCRYPTION_KEY }}
  run: |
    ACCESS_TOKEN=$(printf '%s' "$ENCRYPTED_TOKEN" | openssl enc -d -aes-256-cbc -a -pbkdf2 -k "$ENC_KEY")
    echo "::add-mask::$ACCESS_TOKEN"
    export ACCESS_TOKEN
    python -u scripts/okta_jit_privilege.py revoke
```

## 必要な GitHub Secret の追加

`TOKEN_ENCRYPTION_KEY` を GitHub Repository Secrets に追加する必要がある。
生成例: `openssl rand -base64 32`
