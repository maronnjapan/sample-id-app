# WSL2でprivate_key_jwt認証のTerraformが失敗する問題

## 症状

WSL2環境でOkta Terraform provider（`private_key_jwt`形式）を実行すると以下のエラーが発生する。

```
"error_description": "The client_assertion token has an expiration too far into the future."
```

同じコードをMacで実行した場合はエラーにならない。

---

## 原因：WSL2の時刻ドリフト

### エラーの意味

`client_assertion` JWTは以下の構造で生成される。

```
exp（有効期限）= WSL2の現在時刻 + expiration_duration
```

OktaはJWT受信時に `exp - Oktaサーバー時刻 > 許容最大値（≒3600秒）` の場合に上記エラーを返す。
WSL2の時刻が実際より進んでいると、Oktaから見た `exp` が制限を超えてしまう。

### WSL2で時刻ズレが発生する仕組み

WSL2はHyper-V上で動作しており、カーネル起動時にWindowsのRTCから時刻を取得する。

```
# dmesgより
rtc_cmos 00:00: setting system clock to 2026-03-31T05:16:10 UTC
hv_utils: TimeSync IC version 4.0
```

**時刻ズレが発生するタイミング：**

1. WindowsがスリープまたはハイバネーションするとWSL2カーネルも一時停止する
2. Windows復帰後、WindowsはNTPで時刻を修正するが、WSL2へのHyper-V経由の時刻同期が遅延または失敗することがある
3. WSL2の時刻が実際より数分〜数十分ズレた状態でTerraformを実行してしまう
4. 生成されたJWTの `exp` がOktaサーバー時刻から見て「未来すぎる」と判定される

### Macで発生しない理由

macOSはNTPによる継続的な時刻同期が安定しており、スリープ復帰後も即座に時刻が修正されるため、時刻ズレが生じない。

---

## 解決策

### 即時対処

Terraform実行前に以下のコマンドでWSL2の時刻をWindowsのRTCに同期する。

```bash
sudo hwclock --hctosys
```

### 恒久対処

#### 方法1：WSL2起動時に自動で時刻同期する

`/etc/wsl.conf` に以下を追記する。

```ini
[boot]
command = "hwclock --hctosys"
```

#### 方法2：ntpdateで外部NTPサーバーと同期する

```bash
sudo apt-get install -y ntpdate
sudo ntpdate pool.ntp.org
```

#### 方法3：chronydを使った継続的な同期

```bash
sudo apt-get install -y chrony
sudo chronyd -q
```

### 時刻ズレの確認方法

```bash
# ntpdateで現在のズレを確認（offset がプラスなら遅れ、マイナスなら進んでいる）
sudo ntpdate -q pool.ntp.org
```

---

## 比較まとめ

| 項目 | Mac | WSL2 |
|------|-----|-------|
| 時刻同期 | macOS NTP（常時安定） | Hyper-V経由（スリープ後に不安定） |
| スリープ復帰後 | 即時NTP同期 | 同期遅延が発生することがある |
| JWT exp計算 | 正確な現在時刻で計算 | ズレた時刻で計算 → Oktaに拒否される |

---

## 確認済み環境

- OS: WSL2（Windows Subsystem for Linux 2）
- カーネル: `5.15.153.1-microsoft-standard-WSL2`
- Terraform provider: `okta/okta ~> 6.3.0`
- 認証方式: `private_key_jwt`
