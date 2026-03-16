const { chromium } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

// ---- 設定 ----
const PUBLIC_DIR = path.resolve(__dirname, 'public');
const PORT = 3000;
const VNU_JAR = path.resolve(__dirname, 'node_modules/vnu-jar/build/dist/vnu.jar');
const REPORT_DIR = path.resolve(__dirname, 'reports');

// ---- 結果集計 ----
let hasError = false;
const reportLines = [];

function log(msg) {
  console.log(msg);
  reportLines.push(msg);
}
function error(msg) {
  console.error(msg);
  reportLines.push(msg);
  hasError = true;
}

// ---- レポート出力 ----
function writeReport() {
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR);
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filePath = path.join(REPORT_DIR, `report-${timestamp}.md`);

  const header = [
    '# レビューチェック レポート',
    `- 実施日時：${now.toLocaleString('ja-JP')}`,
    `- 対象ディレクトリ：public/`,
    '',
    '---',
    '',
  ].join('\n');

  fs.writeFileSync(filePath, header + reportLines.join('\n'), 'utf8');
  console.log(`\n📄 レポートを出力しました: reports/report-${timestamp}.md`);
}

// ---- HTMLファイル収集 ----
function collectHtmlFiles(dir, base = dir) {
  let files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(collectHtmlFiles(full, base));
    } else if (entry.name.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

// ---- 簡易HTTPサーバー ----
function startServer() {
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ico': 'image/x-icon',
  };

  const server = http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0];
    if (urlPath.endsWith('/')) urlPath += 'index.html';
    const filePath = path.join(PUBLIC_DIR, urlPath);
    const ext = path.extname(filePath);

    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(PORT);
  return server;
}

// ---- vnu HTMLバリデーション ----
function runVnu(htmlFiles) {
  log('\n========================================');
  log('【1】HTML バリデーション（vnu）');
  log('========================================');

  const fileList = htmlFiles.join(' ');
  try {
    const result = execSync(
      `java -jar "${VNU_JAR}" --errors-only --format json ${fileList} 2>&1`,
      { encoding: 'utf8' }
    );
    // エラーなしの場合は空が返る
    log('✅ HTMLバリデーション：エラーなし');
  } catch (e) {
    // vnuはエラー時に stderr に JSON を出力して exit code 1 を返す
    try {
      const raw = e.stderr || e.stdout || e.output?.filter(Boolean).join('') || '{}';
      const json = JSON.parse(raw);
      const messages = json.messages || [];
      if (messages.length === 0) {
        log('✅ HTMLバリデーション：エラーなし');
      } else {
        messages.forEach(m => {
          error(`❌ [vnu] ${m.type.toUpperCase()}: ${m.message}`);
          error(`   ファイル: ${m.url}`);
          error(`   行: ${m.lastLine} / 列: ${m.lastColumn}`);
        });
      }
    } catch {
      error('❌ vnuの実行結果のパースに失敗しました');
      error(e.message);
    }
  }
}

// ---- Playwright: a11y + JSエラー ----
async function runPlaywright(htmlFiles) {
  const browser = await chromium.launch();

  for (const file of htmlFiles) {
    const relativePath = path.relative(PUBLIC_DIR, file);
    const urlPath = '/' + relativePath.replace(/\\/g, '/');
    const url = `http://localhost:${PORT}${urlPath}`;

    log(`\n----------------------------------------`);
    log(`📄 ${relativePath}`);
    log(`----------------------------------------`);

    const context = await browser.newContext();
    const page = await context.newPage();

    // JSエラー収集
    const jsErrors = [];
    const resourceErrors = [];
    page.on('response', response => {
      if (response.status() === 404) {
        resourceErrors.push(response.url());
      }
    });
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('404') && !text.toLowerCase().includes('failed to load resource')) {
          jsErrors.push(text);
        }
      }
    });
    page.on('pageerror', err => jsErrors.push(err.message));

    await page.goto(url, { waitUntil: 'networkidle' });

    // --- a11yチェック ---
    log('\n【2】アクセシビリティチェック（axe / WCAG 2.2 Level A）');
    try {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag21a', 'wcag22a'])
        .analyze();

      if (results.violations.length === 0) {
        log('✅ a11y：違反なし');
      } else {
        results.violations.forEach(v => {
          error(`❌ [axe] ${v.id}: ${v.description}`);
          error(`   影響度: ${v.impact} / 基準: ${v.tags.join(', ')}`);
          v.nodes.forEach(n => {
            error(`   該当箇所: ${n.html.slice(0, 120)}`);
          });
        });
      }
    } catch (e) {
      error(`❌ axe実行エラー: ${e.message}`);
    }

    // --- リソース404チェック ---
    log('\n【3】リソース欠落チェック（404）');
    if (resourceErrors.length === 0) {
      log('✅ リソース欠落：なし');
    } else {
      resourceErrors.forEach(e => error(`❌ [404] ${e}`));
    }

    // --- JSエラーチェック ---
    log('\n【4】JSコンソールエラーチェック');
    if (jsErrors.length === 0) {
      log('✅ JSエラー：なし');
    } else {
      jsErrors.forEach(e => error(`❌ [JS] ${e}`));
    }

    await context.close();
  }

  await browser.close();
}

// ---- メイン ----
(async () => {
  const htmlFiles = collectHtmlFiles(PUBLIC_DIR);

  if (htmlFiles.length === 0) {
    console.error('❌ public/ にHTMLファイルが見つかりません');
    process.exit(1);
  }

  log(`\n対象ファイル数: ${htmlFiles.length}`);
  htmlFiles.forEach(f => log(`  - ${path.relative(PUBLIC_DIR, f)}`));

  // vnu
  runVnu(htmlFiles);

  // サーバー起動
  const server = startServer();

  // Playwright
  await runPlaywright(htmlFiles);

  // サーバー終了
  server.close();

  // 終了コード
  log('\n========================================');
  if (hasError) {
    error('⚠️  チェック完了：問題が検出されました');
  } else {
    log('🎉 チェック完了：すべてのチェックをパスしました');
  }

  writeReport();
  process.exit(hasError ? 1 : 0);
})();
