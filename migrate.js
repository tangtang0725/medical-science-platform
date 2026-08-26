/**
 * 一次性迁移脚本：把本地 ~/.medsci-platform/data 里的最新文章推送到云端实例。
 * 仅在「首次部署到云之后」运行一次即可，之后文章都存在云上。
 *
 * 用法（在你自己电脑的终端里运行）：
 *   node migrate.js https://你的云地址
 *   node migrate.js https://你的云地址 medsci-2026        # 自定义 API Key
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const target = process.argv[2];
const apiKey = process.argv[3] || 'medsci-2026';
if (!target) {
  console.error('用法: node migrate.js <云地址> [API_KEY]');
  process.exit(1);
}

const homeDir = process.env.USERPROFILE || process.env.HOME;
const DATA_DIR = process.env.DATA_DIR || path.join(homeDir, '.medsci-platform', 'data');

if (!fs.existsSync(DATA_DIR)) {
  console.error('本地数据目录不存在:', DATA_DIR);
  process.exit(1);
}

const files = fs.readdirSync(DATA_DIR)
  .filter(f => f.startsWith('articles-') && f.endsWith('.json'))
  .sort();
if (files.length === 0) {
  console.error('本地没有文章数据可迁移');
  process.exit(1);
}

const latest = files[files.length - 1];
const articles = JSON.parse(fs.readFileSync(path.join(DATA_DIR, latest), 'utf-8'));
console.log(`读取到 ${articles.length} 篇文章（来自 ${latest}），开始推送到 ${target} ...`);

function post(article) {
  return new Promise((resolve, reject) => {
    const payload = {
      title: article.title,
      summary: article.summary || '',
      content: article.content,
      category: article.category || '骨科',
      tags: article.tags || [],
    };
    const body = JSON.stringify(payload);
    const urlObj = new URL(target.replace(/\/$/, '') + '/api/articles');
    const transport = urlObj.protocol === 'https:' ? https : http;
    const req = transport.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  let ok = 0;
  for (const a of articles) {
    try {
      const r = await post(a);
      if (r.status === 201) {
        ok++;
        console.log('  ✓', a.title);
      } else {
        console.log('  ✗', a.title, '->', r.status, r.body.substring(0, 120));
      }
    } catch (e) {
      console.log('  ✗', a.title, '->', e.message);
    }
  }
  console.log(`\n完成：成功推送 ${ok}/${articles.length} 篇。`);
  if (ok > 0) console.log('打开云地址即可看到文章，隧道/本地服务器都可以关了。');
})();
