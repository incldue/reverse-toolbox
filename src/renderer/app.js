const state = {
  activeView: 'tools',
  activeCategory: 'all',
  search: '',
  targetFile: '',
  catalog: { categories: [], tools: [], userState: { favorites: [], recent: [] } },
  manifest: null,
  docCache: new Map(),
  selectedDoc: null,
  selectedDocPayload: null,
  editMode: false,
  settingsDirty: false,
  docListSeq: 0
};

const els = {};

document.addEventListener('DOMContentLoaded', boot);

async function boot() {
  cacheElements();
  bindEvents();
  renderViewChrome();
  renderTargetFile();
  setStatus('正在加载工具目录...');
  await nextFrame();
  await loadTools();
  renderAll();
  setStatus('Ready');
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function cacheElements() {
  for (const id of [
    'viewTitle',
    'viewSubtitle',
    'globalSearch',
    'categoryChips',
    'refreshToolsBtn',
    'toolGrid',
    'toolTotal',
    'toolReady',
    'toolMissing',
    'targetFile',
    'pickTargetBtn',
    'clearTargetBtn',
    'statusLine',
    'knowledgeSearch',
    'newDocBtn',
    'importDocBtn',
    'docList',
    'readerMeta',
    'readerTitle',
    'readerToc',
    'readerBody',
    'editorArea',
    'editDocBtn',
    'saveDocBtn',
    'cancelEditBtn',
    'openDocFileBtn',
    'deleteDocBtn',
    'settingsList',
    'scanPathsBtn',
    'addCustomToolBtn',
    'customToolName',
    'customToolPath',
    'customToolType',
    'customToolAcceptsTarget',
    'customToolArgs',
    'browseCustomToolBtn',
    'addCustomToolFromFormBtn',
    'saveSettingsBtn',
    'openDataFolderBtn'
  ]) {
    els[id] = document.getElementById(id);
  }
}

function bindEvents() {
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.addEventListener('click', () => switchView(button.dataset.view));
  });

  els.globalSearch.addEventListener('input', () => {
    state.search = els.globalSearch.value.trim().toLowerCase();
    if (state.activeView === 'tools') renderTools();
    if (state.activeView === 'knowledge') renderDocList();
  });

  els.refreshToolsBtn.addEventListener('click', async () => {
    await loadTools();
    renderAll();
    setStatus('工具状态已刷新');
  });

  els.pickTargetBtn.addEventListener('click', async () => {
    const file = await window.toolbox.selectTargetFile();
    if (!file) return;
    state.targetFile = file;
    renderTargetFile();
    setStatus('已选择样本');
  });

  els.clearTargetBtn.addEventListener('click', () => {
    state.targetFile = '';
    renderTargetFile();
    setStatus('已清空样本');
  });

  els.knowledgeSearch.addEventListener('input', () => renderDocList());
  els.newDocBtn.addEventListener('click', createKnowledgeDoc);
  els.importDocBtn.addEventListener('click', importKnowledgeDoc);
  els.editDocBtn.addEventListener('click', startEditDoc);
  els.saveDocBtn.addEventListener('click', saveEditedDoc);
  els.cancelEditBtn.addEventListener('click', cancelEditDoc);
  els.openDocFileBtn.addEventListener('click', openSelectedDocFile);
  els.deleteDocBtn.addEventListener('click', deleteSelectedDoc);

  els.scanPathsBtn.addEventListener('click', scanToolPaths);
  els.addCustomToolBtn.addEventListener('click', focusCustomToolForm);
  els.browseCustomToolBtn.addEventListener('click', browseCustomToolPath);
  els.addCustomToolFromFormBtn.addEventListener('click', addCustomToolFromForm);
  els.saveSettingsBtn.addEventListener('click', saveSettings);
  els.openDataFolderBtn.addEventListener('click', () => window.toolbox.openDataFolder());

  document.querySelector('.window-dot.minimize')?.addEventListener('click', () => window.toolbox.minimizeWindow());
  document.querySelector('.window-dot.close')?.addEventListener('click', () => window.toolbox.closeWindow());

  document.addEventListener('click', handleDocumentClick);
}

async function loadTools() {
  setStatus('正在加载工具目录...');
  state.catalog = await window.toolbox.getTools();
}

function renderAll() {
  renderViewChrome();
  renderTargetFile();
  renderCategories();
  renderTools();
  if (state.activeView === 'settings') renderSettings();
}

function switchView(view) {
  state.activeView = view;
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });
  document.querySelectorAll('.view').forEach((section) => {
    section.classList.toggle('active', section.id === `${view}View`);
  });
  renderViewChrome();

  if (view === 'tools') {
    renderCategories();
    renderTools();
  }
  if (view === 'knowledge') ensureKnowledgeLoaded();
  if (view === 'settings') renderSettings();
}

function renderViewChrome() {
  const copy = {
    tools: ['工具启动', '快速定位并启动常用 CTF 逆向工具。'],
    knowledge: ['知识库', '导入、编辑并应用内阅读逆向知识文档。'],
    settings: ['路径设置', '配置工具路径、默认参数、自动扫描和自定义工具。']
  }[state.activeView];
  els.viewTitle.textContent = copy[0];
  els.viewSubtitle.textContent = copy[1];
}

function renderTargetFile() {
  els.targetFile.textContent = state.targetFile || '未选择';
  els.targetFile.title = state.targetFile || '';
}

function renderCategories() {
  const categories = [
    { id: 'all', name: '全部' },
    { id: 'favorites', name: '收藏' },
    { id: 'recent', name: '最近使用' },
    ...state.catalog.categories
  ];
  els.categoryChips.innerHTML = categories.map((category) => (
    `<button class="chip ${state.activeCategory === category.id ? 'active' : ''}" data-category="${escapeAttr(category.id)}">${escapeHtml(category.name)}</button>`
  )).join('');
}

function renderTools() {
  const tools = filteredTools();
  const ready = state.catalog.tools.filter((tool) => tool.resolved?.status === 'ready').length;
  const missing = state.catalog.tools.length - ready;

  els.toolTotal.textContent = String(state.catalog.tools.length);
  els.toolReady.textContent = String(ready);
  els.toolMissing.textContent = String(missing);

  if (!tools.length) {
    els.toolGrid.innerHTML = '<div class="empty-state">没有匹配的工具。</div>';
    return;
  }

  els.toolGrid.innerHTML = tools.map((tool) => renderToolCard(tool)).join('');
}

function renderToolCard(tool) {
  const category = categoryName(tool.category);
  const ready = tool.resolved?.status === 'ready';
  const statusText = ready ? 'Ready' : 'Missing';
  const pathText = ready ? tool.resolved.path : '未发现路径，请在设置中配置或自动扫描';
  const tags = (tool.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
  const targetButton = tool.acceptsTarget
    ? `<button class="ghost-button" ${ready ? '' : 'disabled'} data-action="launch-target" data-id="${escapeAttr(tool.id)}">带样本启动</button>`
    : '';
  const recentText = tool.recentAt ? `最近：${formatTime(tool.recentAt)}` : '';

  return `
    <article class="tool-card">
      <div class="tool-card-head">
        <div>
          <h3 class="tool-title">${escapeHtml(tool.name)}</h3>
          <div class="tool-category">${escapeHtml(category)} / ${escapeHtml(tool.type || 'gui')}</div>
        </div>
        <span class="pill ${ready ? 'ready' : 'missing'}">${statusText}</span>
      </div>
      <p class="tool-desc">${escapeHtml(tool.description || '')}</p>
      <div class="tag-row">${tags}</div>
      <div class="path-line" title="${escapeAttr(pathText)}">${escapeHtml(pathText)}</div>
      <div class="recent-line">${escapeHtml(recentText)}</div>
      <div class="actions">
        <button class="primary-button" ${ready ? '' : 'disabled'} data-action="launch" data-id="${escapeAttr(tool.id)}">启动</button>
        ${targetButton}
        <button class="secondary-button" data-action="toggle-favorite" data-id="${escapeAttr(tool.id)}">${tool.favorite ? '已收藏' : '收藏'}</button>
        <button class="secondary-button" data-action="configure" data-id="${escapeAttr(tool.id)}">配置</button>
      </div>
    </article>
  `;
}

function filteredTools() {
  let tools = state.catalog.tools.filter((tool) => {
    if (state.activeCategory === 'favorites' && !tool.favorite) return false;
    if (state.activeCategory === 'recent' && !tool.recentAt) return false;
    if (!['all', 'favorites', 'recent'].includes(state.activeCategory) && tool.category !== state.activeCategory) return false;
    if (!state.search) return true;
    const haystack = [
      tool.name,
      tool.description,
      tool.category,
      tool.type,
      ...(tool.tags || [])
    ].join(' ').toLowerCase();
    return haystack.includes(state.search);
  });

  if (state.activeCategory === 'recent') {
    tools = tools.sort((a, b) => String(b.recentAt).localeCompare(String(a.recentAt)));
  }
  return tools;
}

function renderSettings() {
  const rows = state.catalog.tools.map((tool) => {
    const ready = tool.resolved?.status === 'ready';
    return `
      <div class="settings-row" data-settings-row="${escapeAttr(tool.id)}">
        <div class="settings-name">
          <strong>${escapeHtml(tool.name)}</strong>
          <span>${escapeHtml(categoryName(tool.category))} / ${ready ? '已发现' : '待配置'}</span>
        </div>
        <div class="settings-inputs">
          <input data-field="configuredPath" data-id="${escapeAttr(tool.id)}" value="${escapeAttr(tool.configuredPath || '')}" placeholder="可执行文件路径，如 C:\\Tools\\x64dbg\\release\\x64\\x64dbg.exe">
          <input data-field="args" data-id="${escapeAttr(tool.id)}" value="${escapeAttr((tool.args || []).join(' '))}" placeholder="默认参数，支持 {file}">
        </div>
        <div class="settings-row-actions">
          <button class="mini-button" data-action="browse" data-id="${escapeAttr(tool.id)}">浏览</button>
          <button class="mini-button" data-action="reveal" data-id="${escapeAttr(tool.id)}" ${ready ? '' : 'disabled'}>定位</button>
          <button class="mini-button" data-action="toggle-favorite" data-id="${escapeAttr(tool.id)}">${tool.favorite ? '取消收藏' : '收藏'}</button>
          <button class="mini-button" data-action="launch" data-id="${escapeAttr(tool.id)}" ${ready ? '' : 'disabled'}>启动</button>
        </div>
      </div>
    `;
  }).join('');
  els.settingsList.innerHTML = rows;

  els.settingsList.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', () => {
      const tool = findTool(input.dataset.id);
      if (!tool) return;
      if (input.dataset.field === 'args') {
        tool.args = splitArgs(input.value);
      } else {
        tool[input.dataset.field] = input.value.trim();
      }
      state.settingsDirty = true;
      setStatus('配置有未保存改动');
    });
  });
}

async function ensureKnowledgeLoaded() {
  if (!state.manifest) {
    setStatus('正在加载知识库...');
    state.manifest = await window.toolbox.getKnowledgeManifest();
    await renderDocList();
    if (state.manifest.docs?.length && !state.selectedDoc) await openDoc(state.manifest.docs[0].id);
    setStatus('知识库已加载');
  } else {
    renderDocList();
  }
}

async function refreshKnowledgeManifest() {
  state.manifest = await window.toolbox.getKnowledgeManifest();
  await renderDocList();
}

async function renderDocList() {
  if (!state.manifest) return;
  const seq = state.docListSeq + 1;
  state.docListSeq = seq;
  const query = (els.knowledgeSearch.value || state.search || '').trim().toLowerCase();
  let docs = state.manifest.docs || [];

  if (query) {
    const matched = [];
    for (const doc of docs) {
      const haystack = [doc.title, doc.category, doc.summary, ...(doc.tags || [])].join(' ').toLowerCase();
      if (haystack.includes(query)) {
        matched.push(doc);
        continue;
      }
      const payload = await getDocPayload(doc);
      if (seq !== state.docListSeq) return;
      if ((payload.content || '').toLowerCase().includes(query)) matched.push(doc);
    }
    docs = matched;
  }

  if (!docs.length) {
    els.docList.innerHTML = '<div class="empty-state">没有匹配的文档。</div>';
    return;
  }

  let currentGroup = '';
  const html = [];
  for (const doc of docs) {
    if (doc.category !== currentGroup) {
      currentGroup = doc.category;
      html.push(`<div class="doc-group">${escapeHtml(currentGroup)}</div>`);
    }
    const badgeText = doc.imported ? (doc.format || '').toUpperCase() : '';
    const badge = badgeText ? `<span class="doc-badge">${escapeHtml(badgeText)}</span>` : '';
    html.push(`
      <button class="doc-item ${state.selectedDoc === doc.id ? 'active' : ''}" data-action="open-doc" data-id="${escapeAttr(doc.id)}">
        <span>${escapeHtml(doc.title)}</span>${badge}
      </button>
    `);
  }
  els.docList.innerHTML = html.join('');
}

async function openDoc(docId) {
  const doc = findDoc(docId);
  if (!doc) return;
  state.selectedDoc = docId;
  state.editMode = false;
  renderDocList();
  setStatus(`正在打开：${doc.title}`);
  const payload = await getDocPayload(doc);
  state.selectedDocPayload = payload;
  renderDocContent(doc, payload);
  setStatus(`已打开：${doc.title}`);
}

async function getDocPayload(doc) {
  let payload = state.docCache.get(doc.id);
  if (!payload) {
    payload = await window.toolbox.readKnowledge(doc.id);
    state.docCache.set(doc.id, payload);
  }
  return payload;
}

function renderDocContent(doc, payload) {
  els.readerMeta.textContent = `${doc.category} / ${(doc.tags || []).join(', ')}`;
  els.readerTitle.textContent = doc.title;
  els.readerBody.classList.remove('empty-reader', 'hidden');
  els.editorArea.classList.add('hidden');
  els.editDocBtn.classList.toggle('hidden', !payload.editable);
  els.saveDocBtn.classList.add('hidden');
  els.cancelEditBtn.classList.add('hidden');
  els.openDocFileBtn.classList.remove('hidden');
  els.deleteDocBtn.classList.toggle('hidden', !doc.imported);

  if (payload.kind === 'markdown') {
    els.readerBody.innerHTML = renderMarkdown(payload.content);
    renderToc(payload.content);
  } else if (payload.kind === 'pdf') {
    els.readerBody.innerHTML = `<iframe class="doc-frame" src="${escapeAttr(payload.fileUrl)}"></iframe>`;
    els.readerToc.innerHTML = '';
  } else if (payload.kind === 'html') {
    els.readerBody.innerHTML = `<iframe class="doc-frame" sandbox srcdoc="${escapeAttr(wrapHtml(payload.content))}"></iframe>`;
    els.readerToc.innerHTML = '';
  } else {
    els.readerBody.innerHTML = `<pre>${escapeHtml(payload.content || '')}</pre>`;
    els.readerToc.innerHTML = '';
  }
  els.readerBody.scrollTop = 0;
}

function wrapHtml(html) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Segoe UI,Microsoft YaHei,sans-serif;line-height:1.7;color:#e5e7eb;background:#151923;padding:22px;}
    a{color:#8fd7ff;} img{max-width:100%;height:auto;} pre{white-space:pre-wrap;}
    table{border-collapse:collapse;} td,th{border:1px solid rgba(255,255,255,.14);padding:6px 8px;}
  </style></head><body>${html}</body></html>`;
}

function renderToc(markdown) {
  const headings = [...markdown.matchAll(/^#{2,3}\s+(.+)$/gm)].slice(0, 8);
  els.readerToc.innerHTML = headings.map((match) => {
    const text = match[1].trim();
    return `<a href="#${escapeAttr(slug(text))}">${escapeHtml(text)}</a>`;
  }).join('');
}

function startEditDoc() {
  const doc = findDoc(state.selectedDoc);
  const payload = state.selectedDocPayload;
  if (!doc || !payload?.editable) return;
  state.editMode = true;
  els.readerBody.classList.add('hidden');
  els.editorArea.classList.remove('hidden');
  els.editorArea.value = payload.content || '';
  els.editDocBtn.classList.add('hidden');
  els.saveDocBtn.classList.remove('hidden');
  els.cancelEditBtn.classList.remove('hidden');
  setStatus('已进入编辑模式');
}

async function saveEditedDoc() {
  if (!state.selectedDoc) return;
  await window.toolbox.saveMarkdown(state.selectedDoc, els.editorArea.value);
  state.docCache.delete(state.selectedDoc);
  await refreshKnowledgeManifest();
  await openDoc(state.selectedDoc);
  setStatus('文档已保存');
}

function cancelEditDoc() {
  const doc = findDoc(state.selectedDoc);
  if (doc && state.selectedDocPayload) renderDocContent(doc, state.selectedDocPayload);
  state.editMode = false;
  setStatus('已取消编辑');
}

async function createKnowledgeDoc() {
  const title = window.prompt('新建 Markdown 文档标题：', '逆向笔记');
  if (!title) return;
  const doc = await window.toolbox.createMarkdown(title);
  state.docCache.clear();
  await refreshKnowledgeManifest();
  await openDoc(doc.id);
  setStatus('已新建知识库文档');
}

async function importKnowledgeDoc() {
  const doc = await window.toolbox.importKnowledgeDocument();
  if (!doc) return;
  state.docCache.clear();
  await refreshKnowledgeManifest();
  await openDoc(doc.id);
  setStatus(`已导入：${doc.title}`);
}

async function openSelectedDocFile() {
  if (!state.selectedDoc) return;
  await window.toolbox.openKnowledgeOriginal(state.selectedDoc);
}

async function deleteSelectedDoc() {
  const doc = findDoc(state.selectedDoc);
  if (!doc || !doc.imported) return;
  if (!window.confirm(`确认删除导入文档「${doc.title}」？`)) return;
  await window.toolbox.deleteImportedDocument(doc.id);
  state.docCache.delete(doc.id);
  state.selectedDoc = null;
  state.selectedDocPayload = null;
  await refreshKnowledgeManifest();
  if (state.manifest.docs.length) {
    await openDoc(state.manifest.docs[0].id);
  } else {
    els.readerTitle.textContent = '选择一篇文档';
    els.readerBody.innerHTML = '从左侧选择文档，或使用顶部搜索定位知识点。';
    els.readerBody.classList.add('empty-reader');
  }
  setStatus('导入文档已删除');
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let inCode = false;
  let codeLines = [];
  let listType = '';
  let table = [];

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = '';
    }
  };
  const flushTable = () => {
    if (!table.length) return;
    html.push('<table>');
    for (let i = 0; i < table.length; i += 1) {
      const cells = table[i].split('|').map((cell) => cell.trim()).filter(Boolean);
      if (i === 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
      const tag = i === 0 ? 'th' : 'td';
      html.push(`<tr>${cells.map((cell) => `<${tag}>${inline(cell)}</${tag}>`).join('')}</tr>`);
    }
    html.push('</table>');
    table = [];
  };

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        closeList();
        flushTable();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (/^\s*$/.test(line)) {
      closeList();
      flushTable();
      continue;
    }

    if (line.includes('|') && /^\s*\|?.+\|.+/.test(line)) {
      closeList();
      table.push(line);
      continue;
    }

    flushTable();

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      const text = heading[2].trim();
      html.push(`<h${level} id="${escapeAttr(slug(text))}">${inline(text)}</h${level}>`);
      continue;
    }

    if (/^>\s+/.test(line)) {
      closeList();
      html.push(`<blockquote>${inline(line.replace(/^>\s+/, ''))}</blockquote>`);
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        html.push('<ul>');
      }
      html.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }

    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (ordered) {
      if (listType !== 'ol') {
        closeList();
        listType = 'ol';
        html.push('<ol>');
      }
      html.push(`<li>${inline(ordered[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${inline(line)}</p>`);
  }

  closeList();
  flushTable();
  return html.join('\n');
}

function inline(text) {
  return escapeHtml(text)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

async function saveSettings() {
  setStatus('正在保存配置...');
  state.catalog = await window.toolbox.saveTools(state.catalog.tools);
  state.settingsDirty = false;
  renderAll();
  setStatus('配置已保存');
}

async function scanToolPaths() {
  setStatus('正在自动扫描常见工具路径，可能需要几十秒...');
  state.catalog = await window.toolbox.scanToolPaths();
  renderAll();
  const count = state.catalog.scanReport?.applied?.length || 0;
  setStatus(`自动扫描完成，应用 ${count} 个路径`);
}

function focusCustomToolForm() {
  switchView('settings');
  els.customToolName.focus();
  setStatus('请在自定义工具表单中填写工具信息');
}

async function browseCustomToolPath() {
  const file = await window.toolbox.selectToolPath();
  if (!file) return;
  els.customToolPath.value = file;
  if (!els.customToolName.value.trim()) {
    els.customToolName.value = guessToolName(file);
  }
  setStatus('已选择自定义工具路径');
}

async function addCustomToolFromForm() {
  const name = els.customToolName.value.trim();
  const file = els.customToolPath.value.trim();
  const type = els.customToolType.value === 'cli' ? 'cli' : 'gui';
  const acceptsTarget = els.customToolAcceptsTarget.checked;
  const args = splitArgs(els.customToolArgs.value.trim());

  if (!name) {
    setStatus('请填写自定义工具名称');
    els.customToolName.focus();
    return;
  }
  if (!file) {
    setStatus('请先选择自定义工具路径');
    els.customToolPath.focus();
    return;
  }

  if (!state.catalog.categories.some((category) => category.id === 'custom')) {
    state.catalog.categories.push({ id: 'custom', name: '自定义工具' });
  }
  state.catalog.tools.push({
    id: `custom-${Date.now()}`,
    name,
    category: 'custom',
    type,
    configuredPath: file,
    executable: file.split(/[\\/]/).pop() || '',
    candidates: [],
    acceptsTarget,
    args: args.length ? args : (acceptsTarget ? ['{file}'] : []),
    description: '用户导入的自定义逆向工具。',
    tags: ['Custom']
  });
  await saveSettings();
  clearCustomToolForm();
  state.activeCategory = 'custom';
  renderCategories();
  renderTools();
  setStatus(`已导入自定义工具：${name}`);
}

function clearCustomToolForm() {
  els.customToolName.value = '';
  els.customToolPath.value = '';
  els.customToolType.value = 'gui';
  els.customToolAcceptsTarget.checked = true;
  els.customToolArgs.value = '';
}

function guessToolName(file) {
  return file.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'Custom Tool';
}

async function handleDocumentClick(event) {
  const link = event.target.closest('a[href]');
  if (link) {
    const href = link.getAttribute('href') || '';
    if (href.startsWith('#')) {
      event.preventDefault();
      document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (/^https?:\/\//i.test(href)) {
      event.preventDefault();
      await window.toolbox.openExternal(href);
      return;
    }
  }

  const target = event.target.closest('[data-action], [data-category]');
  if (!target) return;

  if (target.dataset.category) {
    state.activeCategory = target.dataset.category;
    renderCategories();
    renderTools();
    return;
  }

  const action = target.dataset.action;
  const id = target.dataset.id;
  if (action === 'launch') {
    await launchTool(id, false);
  } else if (action === 'launch-target') {
    await launchTool(id, true);
  } else if (action === 'toggle-favorite') {
    state.catalog = await window.toolbox.toggleFavorite(id);
    renderAll();
    setStatus('收藏状态已更新');
  } else if (action === 'configure') {
    switchView('settings');
    const row = document.querySelector(`[data-settings-row="${cssEscape(id)}"]`);
    row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row?.querySelector('input')?.focus();
  } else if (action === 'browse') {
    await browseTool(id);
  } else if (action === 'reveal') {
    const tool = findTool(id);
    if (tool?.resolved?.path) await window.toolbox.revealPath(tool.resolved.path);
  } else if (action === 'open-doc') {
    await openDoc(id);
  } else if (action === 'open-external') {
    await window.toolbox.openExternal(target.dataset.url);
  }
}

async function launchTool(id, withTarget) {
  const tool = findTool(id);
  if (!tool) return;
  let target = '';
  if (withTarget && tool.acceptsTarget) {
    target = state.targetFile;
    if (!target) {
      target = await window.toolbox.selectTargetFile();
      if (!target) return;
      state.targetFile = target;
      renderTargetFile();
    }
  }
  const result = await window.toolbox.launchTool(id, target);
  setStatus(result.message || (result.ok ? '已启动' : '启动失败'));
  if (result.ok) {
    await loadTools();
    renderAll();
  }
}

async function browseTool(id) {
  const file = await window.toolbox.selectToolPath();
  if (!file) return;
  const tool = findTool(id);
  if (!tool) return;
  tool.configuredPath = file;
  state.settingsDirty = true;
  renderSettings();
  setStatus('已选择路径，请记得保存配置');
}

function findTool(id) {
  return state.catalog.tools.find((tool) => tool.id === id);
}

function findDoc(id) {
  return state.manifest?.docs?.find((doc) => doc.id === id);
}

function categoryName(id) {
  return state.catalog.categories.find((category) => category.id === id)?.name || id || '未分类';
}

function splitArgs(value) {
  const matches = String(value || '').match(/"[^"]*"|'[^']*'|\S+/g) || [];
  return matches.map((item) => item.replace(/^["']|["']$/g, ''));
}

function formatTime(value) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function setStatus(message) {
  els.statusLine.textContent = message;
  els.statusLine.title = message;
}

function slug(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replace(/"/g, '\\"');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}
