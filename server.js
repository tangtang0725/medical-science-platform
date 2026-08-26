const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const os = require('os');
// Data directory: defaults to user home (local dev), but can be overridden via
// DATA_DIR env var to point at a cloud persistent volume (e.g. /data on Railway/Fly).
const DATA_DIR = process.env.DATA_DIR || path.join(os.homedir(), '.medsci-platform', 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const API_KEY = process.env.CONTENT_API_KEY || 'medsci-2026';

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ============ Data Helpers (versioned file approach) ============
// Since overwriting existing files may fail with EPERM on some systems,
// we write each version to a new file and read the latest one.

function getDataFiles(prefix) {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs.readdirSync(DATA_DIR)
    .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
    .map(f => ({ name: f, path: path.join(DATA_DIR, f), mtime: fs.statSync(path.join(DATA_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
}

function readArticles() {
  const files = getDataFiles('articles-');
  if (files.length === 0) return [];
  try { return JSON.parse(fs.readFileSync(files[0].path, 'utf-8')); } catch { return []; }
}

function writeArticles(articles) {
  // Always write to a new file (avoids EPERM on overwrite)
  const filename = `articles-${Date.now()}.json`;
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(articles, null, 2), 'utf-8');
  // Clean up old files (keep latest 5)
  const files = getDataFiles('articles-');
  if (files.length > 5) {
    files.slice(5).forEach(f => {
      try { fs.unlinkSync(f.path); } catch {}
    });
  }
}
function readSettings() {
  const files = getDataFiles('settings-');
  const defaults = {
    wechat: { appId: '', appSecret: '' },
    reviewerName: '审核专家',
    ai: { apiKey: '', apiUrl: 'https://api.deepseek.com/v1/chat/completions', model: 'deepseek-chat' }
  };
  if (files.length === 0) return defaults;
  try {
    const s = JSON.parse(fs.readFileSync(files[0].path, 'utf-8'));
    return { ...defaults, ...s, ai: { ...defaults.ai, ...(s.ai || {}) } };
  } catch { return defaults; }
}
function writeSettings(settings) {
  const filename = `settings-${Date.now()}.json`;
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(settings, null, 2), 'utf-8');
  const files = getDataFiles('settings-');
  if (files.length > 3) {
    files.slice(3).forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
  }
}
function generateId() {
  return Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
}

// ============ AI Revision ============
function callAI(prompt, settings) {
  const ai = settings.ai || {};
  const apiKey = ai.apiKey;
  const apiUrl = ai.apiUrl || 'https://api.deepseek.com/v1/chat/completions';
  const model = ai.model || 'deepseek-chat';

  if (!apiKey) {
    return Promise.reject(new Error('未配置 AI API 密钥，请在设置中配置'));
  }

  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: '你是一个专业的医学科普文案编辑。你会根据审核员的意见修改科普文章，确保内容科学准确、通俗易懂。返回纯 JSON，不要包含 markdown 代码块标记。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 4096,
  });

  return new Promise((resolve, reject) => {
    const urlObj = new URL(apiUrl);
    const transport = urlObj.protocol === 'https:' ? https : http;
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          let errMsg = `AI API 返回 ${res.statusCode}`;
          try { const j = JSON.parse(data); errMsg += ': ' + (j.error?.message || j.message || data.substring(0, 200)); } catch {}
          return reject(new Error(errMsg));
        }
        try {
          const json = JSON.parse(data);
          if (json.choices && json.choices[0] && json.choices[0].message) {
            resolve(json.choices[0].message.content);
          } else {
            reject(new Error('AI 返回格式异常'));
          }
        } catch (e) {
          reject(new Error('AI 响应解析失败: ' + data.substring(0, 200)));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('AI 请求超时（60秒）')); });
    req.write(body);
    req.end();
  });
}

// ============ Formatters ============
function formatForXiaohongshu(article) {
  let content = article.content || '';
  content = content.replace(/^#{1,6}\s+/gm, '');
  content = content.replace(/\*\*(.+?)\*\*/g, '$1');
  content = content.replace(/\[(.+?)\]\(.+?\)/g, '$1');
  const paragraphs = content.split('\n').filter(p => p.trim());
  let xhs = `${article.title}\n\n`;
  const emojis = ['💡', '📌', '🔍', '✅', '⚠️', '💪', '🧠', '❤️'];
  paragraphs.forEach((p, i) => {
    if (i < 8) xhs += `${emojis[i % emojis.length]} ${p.trim()}\n\n`;
  });
  if (paragraphs.length > 8) xhs += `... (完整内容请看公众号)\n\n`;
  if (article.tags && article.tags.length > 0) {
    xhs += article.tags.map(t => `#${t}#`).join(' ') + '\n';
  }
  xhs += `#医学科普# #${article.category}# #健康知识#\n`;
  return xhs;
}

function formatForWechat(article) {
  let content = article.content || '';
  content = content.replace(/^### (.+)$/gm, '<h3 style="color:#1a73e8;border-left:4px solid #1a73e8;padding-left:12px;margin:24px 0 12px;">$1</h3>');
  content = content.replace(/^## (.+)$/gm, '<h2 style="color:#1a73e8;margin:28px 0 14px;font-size:20px;">$1</h2>');
  content = content.replace(/^# (.+)$/gm, '<h1 style="color:#1a73e8;margin:28px 0 14px;font-size:24px;">$1</h1>');
  content = content.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#333;">$1</strong>');
  content = content.replace(/^- (.+)$/gm, '<li style="margin:6px 0;color:#555;">$1</li>');
  content = content.replace(/(<li[^>]*>.*?<\/li>\n?)+/g, (match) => `<ul style="padding-left:20px;margin:12px 0;">${match}</ul>`);
  content = content.split('\n\n').map(p => {
    if (p.trim() && !p.includes('<h') && !p.includes('<ul') && !p.includes('<li')) {
      return `<p style="line-height:1.8;color:#555;font-size:15px;margin:12px 0;">${p.trim()}</p>`;
    }
    return p;
  }).join('\n');
  return `<div style="max-width:677px;margin:0 auto;padding:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;">
  <p style="text-align:center;color:#999;font-size:12px;margin-bottom:20px;">${article.category} | 医学科普</p>
  ${content}
  <div style="margin-top:30px;padding:16px;background:#f0f6ff;border-radius:8px;">
    <p style="font-size:13px;color:#666;margin:0;">📌 <strong>温馨提示</strong>：本文仅供科普参考，不能替代专业医疗建议。如有不适，请及时就医。</p>
  </div>
  <p style="text-align:center;color:#999;font-size:12px;margin-top:20px;">— END —</p>
</div>`.trim();
}

// ============ HTTP Helpers ============
function sendJSON(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  });
  res.end(body);
}

function sendFile(res, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }
  const data = fs.readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(data);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 10 * 1024 * 1024) { reject(new Error('Body too large')); req.destroy(); } });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

// ============ Route Handler ============
async function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    });
    res.end();
    return;
  }

  // ---- API Routes ----
  if (pathname.startsWith('/api/')) {
    // API key check for POST /api/articles
    if (method === 'POST' && pathname === '/api/articles') {
      const apiKey = req.headers['x-api-key'];
      if (apiKey !== API_KEY) {
        return sendJSON(res, 401, { error: 'Unauthorized: invalid API key' });
      }
    }

    // GET /api/articles?status=pending&category=骨科
    if (method === 'GET' && pathname === '/api/articles') {
      const status = url.searchParams.get('status');
      const category = url.searchParams.get('category');
      let articles = readArticles();
      if (status) articles = articles.filter(a => a.status === status);
      if (category) articles = articles.filter(a => a.category === category);
      const summary = articles.map(a => ({
        id: a.id, title: a.title, summary: a.summary, category: a.category,
        tags: a.tags, status: a.status, createdAt: a.createdAt, updatedAt: a.updatedAt,
        approvedAt: a.approvedAt, publishedAt: a.publishedAt, rejectReason: a.rejectReason,
      }));
      return sendJSON(res, 200, summary);
    }

    // GET /api/articles/:id
    const detailMatch = pathname.match(/^\/api\/articles\/([^\/]+)$/);
    if (method === 'GET' && detailMatch) {
      const articles = readArticles();
      const article = articles.find(a => a.id === detailMatch[1]);
      if (!article) return sendJSON(res, 404, { error: '文章不存在' });
      return sendJSON(res, 200, article);
    }

    // POST /api/articles
    if (method === 'POST' && pathname === '/api/articles') {
      try {
        const body = await parseBody(req);
        const { title, summary, content, category, tags } = body;
        if (!title || !content) return sendJSON(res, 400, { error: '标题和内容不能为空' });
        const articles = readArticles();
        const article = {
          id: generateId(), title, summary: summary || '', content,
          category: category || '骨科', tags: tags || [], status: 'pending',
          xiaohongshuContent: formatForXiaohongshu({ title, content, tags, category }),
          wechatHtml: formatForWechat({ title, content, category }),
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          approvedAt: null, publishedAt: null, rejectReason: null,
        };
        articles.unshift(article);
        writeArticles(articles);
        console.log(`[NEW] ${article.title} (${article.category})`);
        return sendJSON(res, 201, article);
      } catch (e) { return sendJSON(res, 400, { error: e.message }); }
    }

    // PUT /api/articles/:id
    if (method === 'PUT' && detailMatch) {
      try {
        const body = await parseBody(req);
        const articles = readArticles();
        const index = articles.findIndex(a => a.id === detailMatch[1]);
        if (index === -1) return sendJSON(res, 404, { error: '文章不存在' });
        ['title', 'summary', 'content', 'category', 'tags'].forEach(f => {
          if (body[f] !== undefined) articles[index][f] = body[f];
        });
        if (body.content || body.title || body.tags) {
          articles[index].xiaohongshuContent = formatForXiaohongshu(articles[index]);
          articles[index].wechatHtml = formatForWechat(articles[index]);
        }
        articles[index].updatedAt = new Date().toISOString();
        writeArticles(articles);
        return sendJSON(res, 200, articles[index]);
      } catch (e) { return sendJSON(res, 400, { error: e.message }); }
    }

    // POST /api/articles/:id/approve
    const approveMatch = pathname.match(/^\/api\/articles\/([^\/]+)\/approve$/);
    if (method === 'POST' && approveMatch) {
      const articles = readArticles();
      const article = articles.find(a => a.id === approveMatch[1]);
      if (!article) return sendJSON(res, 404, { error: '文章不存在' });
      article.status = 'approved';
      article.approvedAt = new Date().toISOString();
      article.updatedAt = new Date().toISOString();
      article.rejectReason = null;
      writeArticles(articles);
      console.log(`[APPROVED] ${article.title}`);
      return sendJSON(res, 200, article);
    }

    // POST /api/articles/:id/reject
    const rejectMatch = pathname.match(/^\/api\/articles\/([^\/]+)\/reject$/);
    if (method === 'POST' && rejectMatch) {
      try {
        const body = await parseBody(req);
        const articles = readArticles();
        const article = articles.find(a => a.id === rejectMatch[1]);
        if (!article) return sendJSON(res, 404, { error: '文章不存在' });
        article.status = 'rejected';
        article.rejectReason = body.reason || '未提供原因';
        article.updatedAt = new Date().toISOString();
        writeArticles(articles);
        console.log(`[REJECTED] ${article.title}`);
        return sendJSON(res, 200, article);
      } catch (e) { return sendJSON(res, 400, { error: e.message }); }
    }

    // POST /api/articles/:id/revise  — AI 根据审核员意见修改文章
    const reviseMatch = pathname.match(/^\/api\/articles\/([^\/]+)\/revise$/);
    if (method === 'POST' && reviseMatch) {
      try {
        const body = await parseBody(req);
        const feedback = (body.feedback || '').trim();
        if (!feedback) return sendJSON(res, 400, { error: '修改意见不能为空' });

        const articles = readArticles();
        const article = articles.find(a => a.id === reviseMatch[1]);
        if (!article) return sendJSON(res, 404, { error: '文章不存在' });

        const settings = readSettings();

        // 模式选择：配置了外部 AI API Key → 直接调用外部 AI；否则转交 WorkBuddy（AI 助手）异步改稿
        if (settings.ai && settings.ai.apiKey) {
          const prompt = `请根据审核员的修改意见，修改以下医学科普文章。

## 原文信息
标题：${article.title}
分类：${article.category}
摘要：${article.summary}

## 原文正文
${article.content}

## 审核员修改意见
${feedback}

## 修改要求
1. 严格按审核员意见修改，不要自行发挥未提及的部分
2. 保持医学科普的准确性和通俗性
3. 保持 Markdown 格式（## 标题，**加粗**，- 列表）
4. 保持原有结构（引入→科学解释→实用建议→温馨提示），除非审核员要求调整
5. 文末保留免责声明：*本文仅供科普参考，不能替代专业医疗建议。如有不适，请及时就医。*

## 返回格式（纯 JSON，不要 markdown 代码块）
{"title":"修改后的标题","summary":"修改后的摘要","content":"修改后的正文"}`;

          console.log(`[REVISE] 开始AI修改: ${article.title}, 意见: ${feedback.substring(0, 50)}...`);
          const aiResponse = await callAI(prompt, settings);

          // 解析 AI 返回的 JSON
          let revised;
          try {
            // 去掉可能的 markdown 代码块标记
            let cleaned = aiResponse.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              revised = JSON.parse(jsonMatch[0]);
            } else {
              throw new Error('未找到 JSON');
            }
          } catch {
            // JSON 解析失败，将整段回复作为 content
            revised = { title: article.title, summary: article.summary, content: aiResponse };
          }

          // 保存修改历史
          if (!article.revisions) article.revisions = [];
          article.revisions.push({
            feedback,
            revisedAt: new Date().toISOString(),
            oldTitle: article.title,
            oldSummary: article.summary,
            oldContent: article.content,
          });

          // 更新文章
          article.title = revised.title || article.title;
          article.summary = revised.summary || article.summary;
          article.content = revised.content || article.content;
          article.xiaohongshuContent = formatForXiaohongshu(article);
          article.wechatHtml = formatForWechat(article);
          article.updatedAt = new Date().toISOString();
          article.status = 'pending';
          article.rejectReason = null;
          article.revisionFeedback = null;

          writeArticles(articles);
          console.log(`[REVISED] 修改完成: ${article.title}`);
          return sendJSON(res, 200, article);
        } else {
          // WorkBuddy 模式：标记「待 AI 改稿」，等待 AI 助手（WorkBuddy 自动化）接管并回写
          if (!article.revisions) article.revisions = [];
          article.status = 'needs_revision';
          article.revisionFeedback = feedback;
          article.updatedAt = new Date().toISOString();
          writeArticles(articles);
          console.log(`[REVISE] 已转交WorkBuddy待改稿: ${article.title}, 意见: ${feedback.substring(0, 50)}...`);
          return sendJSON(res, 200, {
            status: 'needs_revision',
            message: '已提交给 AI 助手（骨肉相连）修改，稍候自动刷新即可看到修改结果',
            article,
          });
        }
      } catch (e) {
        console.error('[REVISE] 错误:', e.message);
        return sendJSON(res, 500, { error: e.message });
      }
    }

    // POST /api/articles/:id/apply-revision  — WorkBuddy（AI 助手）回写改稿结果
    const applyRevMatch = pathname.match(/^\/api\/articles\/([^\/]+)\/apply-revision$/);
    if (method === 'POST' && applyRevMatch) {
      const apiKey = req.headers['x-api-key'];
      if (apiKey !== API_KEY) return sendJSON(res, 401, { error: 'Unauthorized: invalid API key' });
      try {
        const body = await parseBody(req);
        const { title, summary, content, tags } = body;
        if (!content) return sendJSON(res, 400, { error: '修改后内容不能为空' });
        const articles = readArticles();
        const index = articles.findIndex(a => a.id === applyRevMatch[1]);
        if (index === -1) return sendJSON(res, 404, { error: '文章不存在' });
        const article = articles[index];
        const feedback = article.revisionFeedback || '';
        if (!article.revisions) article.revisions = [];
        article.revisions.push({
          feedback,
          revisedAt: new Date().toISOString(),
          oldTitle: article.title,
          oldSummary: article.summary,
          oldContent: article.content,
          byAgent: true,
        });
        article.title = title || article.title;
        article.summary = summary || article.summary;
        if (tags) article.tags = tags;
        article.content = content;
        article.xiaohongshuContent = formatForXiaohongshu(article);
        article.wechatHtml = formatForWechat(article);
        article.updatedAt = new Date().toISOString();
        article.status = 'pending';
        article.rejectReason = null;
        article.revisionFeedback = null;
        writeArticles(articles);
        console.log(`[APPLY-REVISION] WorkBuddy改稿已应用: ${article.title}`);
        return sendJSON(res, 200, article);
      } catch (e) { return sendJSON(res, 400, { error: e.message }); }
    }

    // POST /api/articles/:id/publish
    const publishMatch = pathname.match(/^\/api\/articles\/([^\/]+)\/publish$/);
    if (method === 'POST' && publishMatch) {
      const articles = readArticles();
      const article = articles.find(a => a.id === publishMatch[1]);
      if (!article) return sendJSON(res, 404, { error: '文章不存在' });
      if (article.status !== 'approved') return sendJSON(res, 400, { error: '只有已通过审核的文章才能发布' });
      article.status = 'published';
      article.publishedAt = new Date().toISOString();
      article.updatedAt = new Date().toISOString();
      article.publishResult = { wechat: 'manual', xiaohongshu: 'manual' };
      writeArticles(articles);
      console.log(`[PUBLISHED] ${article.title}`);
      return sendJSON(res, 200, { article, publishResult: article.publishResult });
    }

    // GET /api/articles/:id/xiaohongshu
    const xhsMatch = pathname.match(/^\/api\/articles\/([^\/]+)\/xiaohongshu$/);
    if (method === 'GET' && xhsMatch) {
      const articles = readArticles();
      const article = articles.find(a => a.id === xhsMatch[1]);
      if (!article) return sendJSON(res, 404, { error: '文章不存在' });
      return sendJSON(res, 200, { content: article.xiaohongshuContent || formatForXiaohongshu(article) });
    }

    // GET /api/articles/:id/wechat
    const wxMatch = pathname.match(/^\/api\/articles\/([^\/]+)\/wechat$/);
    if (method === 'GET' && wxMatch) {
      const articles = readArticles();
      const article = articles.find(a => a.id === wxMatch[1]);
      if (!article) return sendJSON(res, 404, { error: '文章不存在' });
      return sendJSON(res, 200, { html: article.wechatHtml || formatForWechat(article) });
    }

    // GET /api/stats
    if (method === 'GET' && pathname === '/api/stats') {
      const articles = readArticles();
      return sendJSON(res, 200, {
        total: articles.length,
        pending: articles.filter(a => a.status === 'pending').length,
        approved: articles.filter(a => a.status === 'approved').length,
        published: articles.filter(a => a.status === 'published').length,
        rejected: articles.filter(a => a.status === 'rejected').length,
        needs_revision: articles.filter(a => a.status === 'needs_revision').length,
      });
    }

    // GET/PUT /api/settings
    if (pathname === '/api/settings') {
      if (method === 'GET') return sendJSON(res, 200, readSettings());
      if (method === 'PUT') {
        try {
          const body = await parseBody(req);
          const settings = readSettings();
          const updated = { ...settings, ...body };
          writeSettings(updated);
          return sendJSON(res, 200, updated);
        } catch (e) { return sendJSON(res, 400, { error: e.message }); }
      }
    }

    return sendJSON(res, 404, { error: 'API not found' });
  }

  // ---- Static Files ----
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  filePath = path.resolve(filePath);

  // Security: ensure file is within PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return sendFile(res, filePath, mimeTypes[ext] || 'application/octet-stream');
  }

  // SPA fallback: serve index.html
  return sendFile(res, path.join(PUBLIC_DIR, 'index.html'), 'text/html; charset=utf-8');
}

// ============ Start Server ============
const server = http.createServer((req, res) => {
  handleRequest(req, res).catch(err => {
    console.error('Server error:', err);
    if (!res.headersSent) {
      sendJSON(res, 500, { error: 'Internal server error' });
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n========================================`);
  console.log(`  医学科普审核发布平台已启动`);
  console.log(`  本地访问: http://localhost:${PORT}`);
  console.log(`  手机访问: http://[你的IP地址]:${PORT}`);
  console.log(`  API Key:  ${API_KEY}`);
  console.log(`========================================\n`);
});
