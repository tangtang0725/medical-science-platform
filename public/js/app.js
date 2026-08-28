// ============ State ============
let currentView = 'listView';
let currentTab = 'pending';
let currentArticle = null;
let currentCopyTab = 'wechat';
let navigationStack = [];

// ============ Categories ============
// 所有内容分类；enabled 标记是否参与每日自动生成（心理学暂不自动生成，用户仍可手动定制或编辑已有文章）
const CATEGORIES = [
  { key: '骨科', slug: 'orthopedics', enabled: true },
  { key: '普外科', slug: 'generalsurgery', enabled: true },
  { key: '电工科普', slug: 'electrician', enabled: true },
  { key: '心理学', slug: 'psychology', enabled: false },
];

function catSlug(cat) {
  const m = CATEGORIES.find(c => c.key === cat);
  return m ? m.slug : 'default';
}

// ============ API ============
const API = {
  async get(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error((await res.json()).error || '请求失败');
    return res.json();
  },
  async post(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json()).error || '请求失败');
    return res.json();
  },
  async put(path, body) {
    const res = await fetch(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json()).error || '请求失败');
    return res.json();
  },
};

// ============ Markdown Renderer ============
function renderMarkdown(text) {
  if (!text) return '';
  let html = text;
  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*?<\/li>(\n|$))+/g, '<ul>$&</ul>');
  // Paragraphs
  html = html.split('\n\n').map(p => {
    p = p.trim();
    if (!p) return '';
    if (p.startsWith('<h') || p.startsWith('<ul')) return p;
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
  return html;
}

// ============ Date Format ============
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
  if (diff < 604800) return Math.floor(diff / 86400) + '天前';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

// ============ View Navigation ============
function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
  currentView = viewId;

  const backBtn = document.getElementById('backBtn');
  const pageTitle = document.getElementById('pageTitle');

  if (viewId === 'listView') {
    backBtn.style.visibility = 'hidden';
    pageTitle.textContent = '医学科普审核';
  } else {
    backBtn.style.visibility = 'visible';
    if (viewId === 'detailView') pageTitle.textContent = '文章详情';
    else if (viewId === 'publishView') pageTitle.textContent = '发布';
    else if (viewId === 'editView') pageTitle.textContent = '编辑文章';
  }
}

function goBack() {
  if (currentView === 'editView' || currentView === 'publishView') {
    if (currentArticle) {
      showDetail(currentArticle.id);
    } else {
      showView('listView');
      loadArticles();
    }
  } else {
    showView('listView');
    loadArticles();
  }
}

// ============ Tabs ============
function switchTab(status) {
  currentTab = status;
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.status === status);
  });
  loadArticles();
}

// ============ Load Articles ============
async function loadArticles() {
  const list = document.getElementById('articleList');
  const empty = document.getElementById('emptyState');
  list.innerHTML = '<div class="loading"><div class="spinner"></div>加载中...</div>';
  empty.style.display = 'none';

  try {
    let articles;
    if (currentTab === 'pending') {
      // 「待审核」标签同时展示 pending 与 待AI改稿(needs_revision)，方便审核员统一管理
      const [pending, revising] = await Promise.all([
        API.get('/api/articles?status=pending'),
        API.get('/api/articles?status=needs_revision'),
      ]);
      articles = [...pending, ...revising].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    } else {
      articles = await API.get(`/api/articles?status=${currentTab}`);
    }
    loadStats();

    if (articles.length === 0) {
      list.innerHTML = '';
      empty.style.display = 'block';
      return;
    }

    list.innerHTML = articles.map(a => `
      <div class="article-card cat-${catSlug(a.category)}" onclick="showDetail('${a.id}')">
        <div class="card-header">
          <span class="category-tag ${catSlug(a.category)}">${a.category}</span>
          <span class="status-dot ${a.status}"></span>
        </div>
        <h3>${escapeHtml(a.title)}</h3>
        <p class="summary">${escapeHtml(a.summary)}</p>
        <div class="card-footer">
          <div class="tags">
            ${(a.tags || []).slice(0, 3).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
          </div>
          <span class="date">${formatDate(a.createdAt)}</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<div class="loading">加载失败: ${err.message}</div>`;
  }
}

// ============ Stats ============
async function loadStats() {
  try {
    const stats = await API.get('/api/stats');
    document.getElementById('statsBadge').textContent = stats.pending + (stats.needs_revision || 0);
    document.getElementById('count-pending').textContent = stats.pending;
    document.getElementById('count-approved').textContent = stats.approved;
    document.getElementById('count-published').textContent = stats.published;
    document.getElementById('count-rejected').textContent = stats.rejected;
    const needsEl = document.getElementById('count-needs_revision');
    if (needsEl) needsEl.textContent = stats.needs_revision || 0;
  } catch {}
}

// ============ Show Detail ============
async function showDetail(id) {
  const content = document.getElementById('detailContent');
  content.innerHTML = '<div class="loading"><div class="spinner"></div>加载中...</div>';
  showView('detailView');

  try {
    const article = await API.get(`/api/articles/${id}`);
    currentArticle = article;

    let actionsHtml = '';
    if (article.status === 'pending') {
      actionsHtml = `
        <div class="action-bar">
          <button class="btn btn-danger" onclick="showRejectModal('${article.id}')">拒绝</button>
          <button class="btn btn-outline" onclick="showEdit('${article.id}')">编辑</button>
          <button class="btn btn-success" onclick="approveArticle('${article.id}')">通过审核</button>
        </div>
      `;
    } else if (article.status === 'approved') {
      actionsHtml = `
        <div class="action-bar">
          <button class="btn btn-outline" onclick="showEdit('${article.id}')">编辑</button>
          <button class="btn btn-primary" onclick="showPublish('${article.id}')">发布</button>
        </div>
      `;
    } else if (article.status === 'published') {
      actionsHtml = `
        <div class="action-bar">
          <button class="btn btn-outline" onclick="showPublish('${article.id}')">查看发布内容</button>
        </div>
      `;
    } else if (article.status === 'rejected') {
      actionsHtml = `
        <div class="action-bar">
          <button class="btn btn-outline" onclick="showEdit('${article.id}')">编辑后重新提交</button>
          <button class="btn btn-success" onclick="approveArticle('${article.id}')">通过审核</button>
        </div>
      `;
    } else if (article.status === 'needs_revision') {
      actionsHtml = `
        <div class="action-bar">
          <button class="btn btn-outline" onclick="showEdit('${article.id}')">编辑原文</button>
        </div>
      `;
    }

    let rejectHtml = '';
    if (article.status === 'rejected' && article.rejectReason) {
      rejectHtml = `<div class="reject-reason-box">拒绝原因：${escapeHtml(article.rejectReason)}</div>`;
    }

    // 待 AI 改稿横幅
    let waitingHtml = '';
    if (article.status === 'needs_revision') {
      const isCustom = !!article.customRequest;
      waitingHtml = `
        <div class="ai-waiting-banner">
          <div class="ai-waiting-spinner"><div class="spinner"></div></div>
          <div class="ai-waiting-text">
            <div class="ai-waiting-title">🤖 AI 助手（骨肉相连）正在${isCustom ? '生成定制内容' : '修改文章'}…</div>
            <div class="ai-waiting-sub">${isCustom ? '已收到您的定制主题，正在生成文章，本页会自动刷新' : '已收到您的修改意见，正在生成改稿，本页会自动刷新'}</div>
          </div>
        </div>
        <div class="ai-feedback-box">
          <div class="ai-feedback-label">您的修改意见</div>
          <div class="ai-feedback-text">${escapeHtml(article.revisionFeedback || '')}</div>
        </div>
      `;
    }

    // 修改历史
    let revisionHistoryHtml = '';
    if (article.revisions && article.revisions.length > 0) {
      revisionHistoryHtml = `
        <div class="revision-history">
          <div class="revision-history-title">AI 修改历史（${article.revisions.length}次）</div>
          ${article.revisions.map((r, i) => `
            <div class="revision-item">
              <div class="revision-item-header">
                <span class="revision-badge">第${i + 1}次</span>
                <span class="revision-date">${formatDate(r.revisedAt)}</span>
              </div>
              <div class="revision-feedback-text">${escapeHtml(r.feedback)}</div>
              <details class="revision-old-content">
                <summary>查看修改前内容</summary>
                <div class="revision-old-body">${renderMarkdown(r.oldContent)}</div>
              </details>
            </div>
          `).join('')}
        </div>
      `;
    }

    // 修改意见输入框（pending / rejected / approved 都可提交）
    let revisionSectionHtml = '';
    if (['pending', 'rejected', 'approved'].includes(article.status)) {
      revisionSectionHtml = `
        <div class="revision-section" id="revisionSection">
          <div class="revision-section-header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2L13.09 8.26L20 9L15 14L16.18 21L12 17.77L7.82 21L9 14L4 9L10.91 8.26L12 2Z" stroke="var(--primary)" stroke-width="1.5" stroke-linejoin="round"/></svg>
            <span>AI 智能修改</span>
          </div>
          <p class="revision-desc">输入修改意见，AI 助手会修改文章。已配置外部 AI 密钥则即时改稿；未配置则交由 AI 助手（骨肉相连）后台改稿，稍候自动刷新。</p>
          <textarea id="revisionFeedback" class="revision-input" placeholder="例如：第三段专业术语太多，请简化为普通人能理解的语言；或者：增加一段关于术后康复的注意事项" rows="3"></textarea>
          <button class="btn btn-primary revision-submit-btn" id="revisionSubmitBtn" onclick="submitRevision('${article.id}')">
            提交修改意见
          </button>
        </div>
      `;
    }

    content.innerHTML = `
      <div class="detail-meta">
        <div class="meta-row">
          <span class="category-tag ${catSlug(article.category)}">${article.category}</span>
          <span class="status-badge ${article.status}">${getStatusText(article.status)}</span>
        </div>
        <h2 class="detail-title">${escapeHtml(article.title)}</h2>
        <div class="detail-summary">${escapeHtml(article.summary)}</div>
        <div class="detail-tags">
          ${(article.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
        </div>
        <div class="meta-row" style="margin-top:10px;">
          <span style="font-size:12px;color:var(--gray-3);">创建: ${formatDate(article.createdAt)}</span>
          ${article.approvedAt ? `<span style="font-size:12px;color:var(--gray-3);">审核: ${formatDate(article.approvedAt)}</span>` : ''}
          ${article.publishedAt ? `<span style="font-size:12px;color:var(--gray-3);">发布: ${formatDate(article.publishedAt)}</span>` : ''}
        </div>
        ${rejectHtml}
        ${waitingHtml}
      </div>
      <div class="detail-body">
        ${renderMarkdown(article.content)}
      </div>
      ${revisionHistoryHtml}
      ${revisionSectionHtml}
      ${actionsHtml}
    `;

    // 待改稿状态：每 5 秒自动刷新，直到 AI 改稿完成（状态变回 pending）
    if (article.status === 'needs_revision') {
      if (window._revisionPollTimer) clearInterval(window._revisionPollTimer);
      window._revisionPollTimer = setInterval(async () => {
        try {
          const fresh = await API.get(`/api/articles/${id}`);
          if (fresh.status !== 'needs_revision') {
            clearInterval(window._revisionPollTimer);
            window._revisionPollTimer = null;
            showToast('AI 改稿已完成，已更新内容');
            showDetail(id);
          }
        } catch {}
      }, 5000);
    } else if (window._revisionPollTimer) {
      clearInterval(window._revisionPollTimer);
      window._revisionPollTimer = null;
    }
  } catch (err) {
    content.innerHTML = `<div class="loading">加载失败: ${err.message}</div>`;
  }
}

function getStatusText(status) {
  const map = { pending: '待审核', approved: '已通过', published: '已发布', rejected: '已拒绝', needs_revision: '待AI改稿' };
  return map[status] || status;
}

// ============ Approve ============
async function approveArticle(id) {
  if (!confirm('确认通过审核？通过后可以发布。')) return;
  try {
    await API.post(`/api/articles/${id}/approve`, {});
    showToast('审核通过');
    showDetail(id);
  } catch (err) {
    showToast('操作失败: ' + err.message);
  }
}

// ============ Reject ============
function showRejectModal(id) {
  const modal = document.getElementById('copyModal');
  const modalContent = modal.querySelector('.modal-content');
  modalContent.innerHTML = `
    <div class="modal-header">
      <h3>拒绝原因</h3>
      <button class="close-btn" onclick="closeModal()">&times;</button>
    </div>
    <div class="modal-body">
      <textarea class="reject-modal-input" id="rejectReason" placeholder="请输入拒绝原因（选填）"></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-danger" onclick="rejectArticle('${id}')">确认拒绝</button>
    </div>
  `;
  modal.classList.add('active');
}

async function rejectArticle(id) {
  const reason = document.getElementById('rejectReason')?.value || '';
  try {
    await API.post(`/api/articles/${id}/reject`, { reason });
    closeModal();
    showToast('已拒绝');
    showDetail(id);
  } catch (err) {
    showToast('操作失败: ' + err.message);
  }
}

// ============ AI Revision ============
async function submitRevision(id) {
  const textarea = document.getElementById('revisionFeedback');
  const btn = document.getElementById('revisionSubmitBtn');
  const section = document.getElementById('revisionSection');
  const feedback = textarea?.value.trim();

  if (!feedback) {
    showToast('请输入修改意见');
    textarea?.focus();
    return;
  }

  const originalBtnHtml = btn.innerHTML;
  btn.disabled = true;
  btn.classList.add('loading');
  btn.innerHTML = '<div class="btn-spinner"></div> AI 正在修改...';
  textarea.disabled = true;

  // 在修改意见区域上方显示加载状态
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'revision-loading';
  loadingDiv.innerHTML = `
    <div class="revision-loading-icon">
      <div class="spinner"></div>
    </div>
    <div class="revision-loading-text">
      <div class="revision-loading-title">AI 正在根据您的意见修改文章</div>
      <div class="revision-loading-sub">通常需要 10-30 秒，请稍候...</div>
    </div>
  `;
  section.parentNode.insertBefore(loadingDiv, section);
  section.style.display = 'none';

  try {
    const result = await API.post(`/api/articles/${id}/revise`, { feedback });
    // 外部 AI 模式：res 即为文章对象，直接刷新
    // WorkBuddy 模式：res.status === 'needs_revision'，进入等待刷新
    if (result && result.status === 'needs_revision') {
      showToast('已提交给 AI 助手，正在改稿…');
      showDetail(id); // 显示「待AI改稿」横幅并开始自动刷新
      return;
    }
    showToast('修改完成！请查看更新后的内容');
    showDetail(id);
  } catch (err) {
    showToast('修改失败: ' + err.message);
    loadingDiv.remove();
    section.style.display = '';
    btn.disabled = false;
    btn.classList.remove('loading');
    btn.innerHTML = originalBtnHtml;
    textarea.disabled = false;
  }
}

// ============ Edit ============
function showEdit(id) {
  if (!currentArticle) return;
  const article = currentArticle;
  const content = document.getElementById('editContent');
  content.innerHTML = `
    <div class="edit-form">
      <div class="form-group">
        <label>标题</label>
        <input type="text" id="editTitle" value="${escapeAttr(article.title)}">
      </div>
      <div class="form-group">
        <label>分类</label>
        <select id="editCategory">
          ${CATEGORIES.map(c => `<option value="${c.key}" ${article.category === c.key ? 'selected' : ''}>${c.key}</option>`).join('')}
          ${!CATEGORIES.some(c => c.key === article.category) ? `<option value="${escapeAttr(article.category)}" selected>${escapeHtml(article.category)}</option>` : ''}
        </select>
      </div>
      <div class="form-group">
        <label>摘要</label>
        <textarea id="editSummary">${escapeHtml(article.summary)}</textarea>
      </div>
      <div class="form-group">
        <label>标签（用逗号分隔）</label>
        <input type="text" id="editTags" value="${(article.tags || []).join(', ')}">
      </div>
      <div class="form-group">
        <label>正文内容（支持 Markdown）</label>
        <textarea class="content-area" id="editContentText">${escapeHtml(article.content)}</textarea>
      </div>
      <div class="action-bar">
        <button class="btn btn-secondary" onclick="goBack()">取消</button>
        <button class="btn btn-primary" onclick="saveEdit('${article.id}')">保存</button>
      </div>
    </div>
  `;
  showView('editView');
}

async function saveEdit(id) {
  const title = document.getElementById('editTitle').value.trim();
  const category = document.getElementById('editCategory').value;
  const summary = document.getElementById('editSummary').value.trim();
  const tags = document.getElementById('editTags').value.split(/[,，]/).map(t => t.trim()).filter(Boolean);
  const content = document.getElementById('editContentText').value.trim();

  if (!title || !content) {
    showToast('标题和内容不能为空');
    return;
  }

  try {
    await API.put(`/api/articles/${id}`, { title, category, summary, tags, content });
    showToast('保存成功');
    currentArticle = null;
    showDetail(id);
  } catch (err) {
    showToast('保存失败: ' + err.message);
  }
}

// ============ Publish ============
async function showPublish(id) {
  const content = document.getElementById('publishContent');
  content.innerHTML = '<div class="loading"><div class="spinner"></div>加载中...</div>';
  showView('publishView');

  try {
    if (!currentArticle || currentArticle.id !== id) {
      currentArticle = await API.get(`/api/articles/${id}`);
    }
    const article = currentArticle;

    const isPublished = article.status === 'published';

    content.innerHTML = `
      ${!isPublished ? `
        <div class="publish-section" style="text-align:center;padding:30px 16px;">
          <p style="font-size:15px;color:var(--gray-4);margin-bottom:16px;">确认发布以下文章？</p>
          <h3 style="margin-bottom:16px;">${escapeHtml(article.title)}</h3>
          <button class="btn btn-primary" onclick="publishArticle('${article.id}')" style="max-width:200px;margin:0 auto;">确认发布</button>
        </div>
      ` : `
        <div class="publish-success">
          <div class="success-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><path d="M5 13L9 17L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <h3>已发布</h3>
          <p>发布时间: ${formatDate(article.publishedAt)}</p>
        </div>
      `}

      <div class="publish-section">
        <h3>
          <div class="platform-icon wechat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8.5 4C4.36 4 1 6.69 1 10c0 1.89 1.08 3.56 2.78 4.66L3 17l2.5-1.32c.96.26 1.96.4 3 .4h.27a5.5 5.5 0 01-.27-1.55c0-3.04 2.91-5.5 6.5-5.5.23 0 .45.01.67.03C15.13 6.02 12.16 4 8.5 4zm-2 4.5a1 1 0 110-2 1 1 0 010 2zm5 0a1 1 0 110-2 1 1 0 010 2zM23 14.5c0-2.49-2.46-4.5-5.5-4.5S12 12.01 12 14.5s2.46 4.5 5.5 4.5c.63 0 1.23-.09 1.8-.25L21 20l-.5-1.5c1.5-.83 2.5-2.2 2.5-3.85 0-.05 0-.1-.01-.15H23zm-7.5-1a.75.75 0 110-1.5.75.75 0 010 1.5zm4 0a.75.75 0 110-1.5.75.75 0 010 1.5z"/></svg>
          </div>
          微信公众号
        </h3>
        <p class="desc">
          ${isPublished ? '已发布' : '复制下方排版好的内容，粘贴到微信公众号编辑器中即可发布。'}
          ${!article.wechatAppId ? '<br>⚠️ 尚未配置公众号API，暂使用手动复制方式。配置API后可一键自动发布。' : ''}
        </p>
        <div class="preview-box wechat-preview">${article.wechatHtml || '（暂无公众号格式内容）'}</div>
        <div style="margin-top:10px;">
          <button class="btn btn-outline" onclick="openCopyModal('wechat', '${article.id}')">查看并复制完整内容</button>
        </div>
      </div>

      <div class="publish-section">
        <h3>
          <div class="platform-icon xiaohongshu">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><text x="2" y="18" font-size="16" font-weight="bold" fill="white">小</text></svg>
          </div>
          小红书
        </h3>
        <p class="desc">复制下方内容，打开小红书App发布笔记时粘贴即可。内容已自动添加emoji和话题标签。</p>
        <div class="preview-box">${escapeHtml(article.xiaohongshuContent || '').substring(0, 500)}...</div>
        <div style="margin-top:10px;">
          <button class="btn btn-outline" onclick="openCopyModal('xiaohongshu', '${article.id}')">查看并复制完整内容</button>
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="loading">加载失败: ${err.message}</div>`;
  }
}

async function publishArticle(id) {
  if (!confirm('确认发布？发布后文章状态将变为"已发布"。')) return;
  try {
    await API.post(`/api/articles/${id}/publish`, {});
    showToast('发布成功！');
    showPublish(id);
  } catch (err) {
    showToast('发布失败: ' + err.message);
  }
}

// ============ Copy Modal ============
async function openCopyModal(type, id) {
  currentCopyTab = type;
  const modal = document.getElementById('copyModal');
  const article = currentArticle;

  let wechatContent = article.wechatHtml || '';
  let xhsContent = article.xiaohongshuContent || '';

  modal.querySelector('.modal-content').innerHTML = `
    <div class="modal-header">
      <h3>复制发布内容</h3>
      <button class="close-btn" onclick="closeModal()">&times;</button>
    </div>
    <div class="modal-body">
      <div class="copy-tabs">
        <button class="copy-tab ${type === 'wechat' ? 'active' : ''}" onclick="switchCopyTab('wechat')">公众号格式</button>
        <button class="copy-tab ${type === 'xiaohongshu' ? 'active' : ''}" onclick="switchCopyTab('xiaohongshu')">小红书格式</button>
      </div>
      <div id="copyContent" class="copy-content">${type === 'wechat' ? wechatContent : xhsContent}</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="copyContent()">复制全部</button>
    </div>
  `;
  modal.classList.add('active');
}

function switchCopyTab(type) {
  currentCopyTab = type;
  const article = currentArticle;
  const content = document.getElementById('copyContent');
  if (type === 'wechat') {
    content.innerHTML = article.wechatHtml || '';
  } else {
    content.innerHTML = article.xiaohongshuContent || '';
  }
  document.querySelectorAll('.copy-tab').forEach((t, i) => {
    t.classList.toggle('active', (i === 0 && type === 'wechat') || (i === 1 && type === 'xiaohongshu'));
  });
}

function copyContent() {
  const el = document.getElementById('copyContent');
  const html = el.innerHTML;
  const text = el.innerText;
  // 优先复制富文本(text/html)，公众号编辑器粘贴可保留标题/加粗/列表排版
  if (navigator.clipboard && window.ClipboardItem) {
    try {
      navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' })
        })
      ]).then(() => showToast('已复制（带排版，可直接粘到公众号）'))
        .catch(() => fallbackCopy(text));
      return;
    } catch (e) {
      fallbackCopy(text);
      return;
    }
  }
  fallbackCopy(text);
}

function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    showToast('已复制到剪贴板');
  } catch {
    showToast('复制失败，请手动选择复制');
  }
  document.body.removeChild(textarea);
}

function closeModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
}

// ============ Auto Generate（触发式自动生成） ============
function openAutoGenModal() {
  const sel = document.getElementById('autoGenCategory');
  if (sel) {
    const opts = ['<option value="">自动均衡（推荐，选篇数最少的分类）</option>']
      .concat(CATEGORIES.filter(c => c.enabled).map(c => `<option value="${c.key}">${c.key}</option>`));
    sel.innerHTML = opts.join('');
  }
  document.getElementById('autoGenModal').classList.add('active');
}

async function submitAutoGenerate() {
  const category = document.getElementById('autoGenCategory').value;
  const btn = document.getElementById('autoGenSubmitBtn');
  if (btn && btn.disabled) return; // 防重复点击
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="btn-spinner"></div> 生成中…'; }

  showToast('AI 正在选题并生成，约需 10-30 秒…');
  try {
    const res = await API.post('/api/articles/auto-generate', category ? { category } : {});
    if (res && res.id) {
      closeModal();
      showToast('已生成：「' + res.title + '」（' + res.category + '）');
      showView('listView');
      loadArticles();
    } else {
      showToast('生成失败，请重试');
    }
  } catch (err) {
    showToast('生成失败: ' + err.message);
  }
  if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
}

// ============ Custom Content ============
function openCustomModal() {
  const sel = document.getElementById('customCategory');
  if (sel) {
    sel.innerHTML = CATEGORIES.map(c => `<option value="${c.key}">${c.key}</option>`).join('');
  }
  document.getElementById('customTopic').value = '';
  document.getElementById('customRequirements').value = '';
  document.getElementById('customRequester').value = '';
  document.getElementById('customModal').classList.add('active');
}

async function submitCustomContent() {
  const topic = document.getElementById('customTopic').value.trim();
  const requirements = document.getElementById('customRequirements').value.trim();
  const category = document.getElementById('customCategory').value;
  const requestedBy = document.getElementById('customRequester').value.trim();
  const btn = document.getElementById('customSubmitBtn');

  if (!topic) {
    showToast('请先填写主题');
    document.getElementById('customTopic').focus();
    return;
  }

  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<div class="btn-spinner"></div> 提交中...';

  try {
    const res = await API.post('/api/articles/custom', { topic, requirements, category, requestedBy });
    closeModal();
    if (res && res.status === 'needs_revision') {
      showToast('已提交，AI 助手正在生成…请稍候刷新');
    } else if (res && res.id) {
      showToast('已生成：「' + res.title + '」');
    } else {
      showToast('已提交');
    }
    showView('listView');
    loadArticles();
  } catch (err) {
    showToast('提交失败: ' + err.message);
  }
  btn.disabled = false;
  btn.innerHTML = originalHtml;
}

// ============ Settings ============
async function showSettings() {
  const modal = document.getElementById('copyModal');
  const modalContent = modal.querySelector('.modal-content');
  let settings = {};
  try {
    settings = await API.get('/api/settings');
  } catch {
    showToast('加载设置失败');
    return;
  }

  const ai = settings.ai || {};
  const wx = settings.wechat || {};

  modalContent.innerHTML = `
    <div class="modal-header">
      <h3>平台设置</h3>
      <button class="close-btn" onclick="closeModal()">&times;</button>
    </div>
    <div class="modal-body">
      <div class="settings-section-title">AI 修改功能配置</div>
      <div class="settings-form-group">
        <label>API 地址</label>
        <input type="text" id="setAiApiUrl" value="${escapeAttr(ai.apiUrl || 'https://api.deepseek.com/v1/chat/completions')}" placeholder="https://api.deepseek.com/v1/chat/completions">
        <div class="hint">支持 OpenAI 兼容格式（DeepSeek、通义千问、OpenAI 等）</div>
      </div>
      <div class="settings-form-group">
        <label>API Key</label>
        <input type="password" id="setAiApiKey" value="${escapeAttr(ai.apiKey || '')}" placeholder="sk-...">
        <div class="hint">在 AI 平台注册后获取的 API 密钥</div>
      </div>
      <div class="settings-form-group">
        <label>模型名称</label>
        <input type="text" id="setAiModel" value="${escapeAttr(ai.model || 'deepseek-chat')}" placeholder="deepseek-chat">
        <div class="hint">如 deepseek-chat、qwen-plus、gpt-4o-mini 等</div>
      </div>

      <div class="settings-section-title">微信公众号配置（可选）</div>
      <div class="settings-form-group">
        <label>AppID</label>
        <input type="text" id="setWxAppId" value="${escapeAttr(wx.appId || '')}" placeholder="公众号 AppID">
      </div>
      <div class="settings-form-group">
        <label>AppSecret</label>
        <input type="password" id="setWxAppSecret" value="${escapeAttr(wx.appSecret || '')}" placeholder="公众号 AppSecret">
        <div class="hint">认证公众号可在微信公众平台获取，配置后可一键自动发布</div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" onclick="saveSettings()">保存设置</button>
    </div>
  `;
  modal.classList.add('active');
}

async function saveSettings() {
  const settings = {
    ai: {
      apiUrl: document.getElementById('setAiApiUrl').value.trim(),
      apiKey: document.getElementById('setAiApiKey').value.trim(),
      model: document.getElementById('setAiModel').value.trim(),
    },
    wechat: {
      appId: document.getElementById('setWxAppId').value.trim(),
      appSecret: document.getElementById('setWxAppSecret').value.trim(),
    },
  };

  try {
    await API.put('/api/settings', settings);
    closeModal();
    showToast('设置已保存');
  } catch (err) {
    showToast('保存失败: ' + err.message);
  }
}

// ============ Toast ============
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ============ Escape Helpers ============
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ============ Init ============
window.addEventListener('DOMContentLoaded', () => {
  loadArticles();
  loadStats();
});

// Handle browser back button
window.addEventListener('popstate', () => {
  if (currentView !== 'listView') {
    goBack();
  }
});
