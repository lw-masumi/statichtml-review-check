#!/bin/bash

# review-check 実行スクリプト
cd "$(dirname "$0")"

echo "🔍 チェックを開始します..."
node check.js

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "✅ すべてのチェックをパスしました"
else
  echo ""
  echo "⚠️  問題が検出されました。上記のログを確認してください"
fi

exit $EXIT_CODE
