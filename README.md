
## typescript&vitestのセットアップ
1. パッケージのセットアップ
    ```bash
    pnpm init
    ```
2. tsconfig.jsonの作成
    ```bash
    tsc --init
    ```
3. vitestのインストール
    ```bash
    pnpm add -D vitest
    ```
4. package.jsonの編集
    ```json
    "scripts": {
        "test": "vitest run"
    }
    ```
5. vitestの設定ファイル作成(vitest.config.ts)
    ```typescript
    import { defineConfig } from 'vitest/config';

    export default defineConfig({
      test: {
        globals: true,
      },
    });
   
    ```
6. vitestのグローバル設定をtsconfig.jsonに追加
    ```json
    {
      "compilerOptions": {
        "types": ["vitest/globals"]
      }
    }
    ```
後は、サンプルテストを作成し、実行できるかを確認する    