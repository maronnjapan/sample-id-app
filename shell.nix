{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    # Terraform
    terraform

    # AWS CLI v2
    awscli2

    # その他の便利なツール
    jq
    git
  ];

  shellHook = ''
    echo "======================================"
    echo "開発環境にようこそ！"
    echo "======================================"
    echo ""
    echo "利用可能なツール:"
    echo "  - Terraform: $(terraform version | head -n1)"
    echo "  - AWS CLI: $(aws --version | cut -d' ' -f1)"
    echo ""
    echo "セットアップ手順:"
    echo "  1. AWS SSOを設定: aws configure sso"
    echo "  2. SSOログイン: aws sso login --profile <profile-name>"
    echo "  3. Terraform初期化: cd terraform && terraform init"
    echo ""
    echo "詳細は terraform/README.md を参照してください"
    echo "======================================"
  '';
}
