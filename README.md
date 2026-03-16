# statichtml-review-check

納品静的HTMLの受け入れレビュー自動チェックツール。
以下の4点を自動検証します。

- HTML Living Standard バリデーション（vnu）
- アクセシビリティチェック（WCAG 2.2 Level A / axe-core）
- リソース欠落チェック（404）
- JSコンソールエラーチェック（Playwright）

---

## 動作環境

| ツール | 必要バージョン | 確認コマンド |
|--------|---------------|--------------|
| Node.js | v18以上 | `node -v` |
| Java | 11以上（推奨：21） | `java -version` |

### macOSでのJavaインストール方法（Homebrew）
```bash
brew install openjdk@21
sudo ln -sfn $(brew --prefix openjdk@21)/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-21.jdk
```

---

## セットアップ
```bash
npm install
npx playwright install chromium
```

---

## 使い方

### 1. public/ を空にする

前回のチェック内容が残らないよう、必ずクリアしてから使用してください。
```bash
rm -rf public/*
```

### 2. 納品HTMLを配置する

`public/` フォルダに納品物を丸ごとコピーします。
サーバールート相対パス（`/assets/css/style.css` など）はそのまま動作します。

### 3. チェックを実行する
```bash
./run.sh
```

### 4. レポートを確認・共有する

チェック完了後、`reports/` にタイムスタンプ付きのMarkdownファイルが生成されます。
このファイルをパートナーへのフィードバックとして共有してください。
```
reports/
└── report-2024-01-15T10-30-00.md
```

---

## ディレクトリ構成
```
review-check/
├── check.js          # チェックスクリプト本体
├── run.sh            # 実行スクリプト
├── package.json
├── README.md
├── public/           # 納品HTMLをここに配置（Git管理外）
│   ├── index.html
│   ├── assets/
│   │   ├── css/
│   │   ├── js/
│   │   └── images/
│   └── ...
└── reports/          # チェックレポート出力先（Git管理外）
    └── report-YYYY-MM-DDTHH-MM-SS.md
```

---

## チェック結果の見方

- ✅ 問題なし
- ❌ 問題あり（内容・該当箇所・行番号を表示）

すべてパスした場合は終了コード `0`、問題があった場合は `1` を返します。

---

## 保守・メンテナンス

### パッケージの更新

以下のパッケージは定期的に更新してください（目安：半年〜1年に1回）。

| パッケージ | 理由 |
|-----------|------|
| `vnu-jar` | HTML Living Standardは継続的に更新される |
| `@axe-core/playwright` | WCAGのルール・解釈が更新される |
| `playwright` | Chromiumのバージョンに追従が必要 |

更新コマンド：
```bash
npm update
npx playwright install chromium
```

更新後は必ずサンプルHTMLで動作確認をしてください。

### axe ルール変更への対応

`@axe-core/playwright` のアップデートにより、以前はパスしていたHTMLが
エラーになる場合があります。これはaxe側のルール追加・変更によるもので、
スクリプトのバグではありません。

更新時はリリースノートを確認してください：
https://github.com/dequelabs/axe-core/releases
