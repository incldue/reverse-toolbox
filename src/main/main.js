const { app, BrowserWindow, dialog, ipcMain, shell, Menu } = require('electron');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const TOOLS_FILE = path.join(DATA_DIR, 'tools.json');
const USER_STATE_FILE = path.join(DATA_DIR, 'user-state.json');
const KNOWLEDGE_DIR = path.join(DATA_DIR, 'knowledge');
const KNOWLEDGE_MANIFEST = path.join(KNOWLEDGE_DIR, 'manifest.json');
const IMPORTED_DIR = path.join(KNOWLEDGE_DIR, 'imported');
const IMPORTS_MANIFEST = path.join(IMPORTED_DIR, 'imports.json');

let mainWindow;
let pathExecutableIndex = null;
let pathExecutableIndexAt = 0;
let ensureDataFilesPromise = null;
const directPathCache = new Map();
const pathLookupCache = new Map();
const PATH_INDEX_TTL_MS = 30000;

function createWindow() {
  const glassWindowOptions = process.platform === 'win32'
    ? {
        backgroundColor: '#00000000',
        backgroundMaterial: 'acrylic'
      }
    : process.platform === 'darwin'
      ? {
          backgroundColor: '#00000000',
          transparent: true,
          vibrancy: 'under-window',
          visualEffectState: 'active'
        }
      : {
          backgroundColor: '#0b1020'
        };

  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 660,
    show: false,
    paintWhenInitiallyHidden: true,
    frame: false,
    thickFrame: true,
    autoHideMenuBar: true,
    title: 'CTF Reverse Toolbox',
    ...glassWindowOptions,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      v8CacheOptions: 'bypassHeatCheckAndEagerCompile'
    }
  });

  mainWindow.setMenu(null);
  mainWindow.setMenuBarVisibility(false);
  if (process.platform === 'win32' && typeof mainWindow.setBackgroundMaterial === 'function') {
    try {
      mainWindow.setBackgroundMaterial('acrylic');
    } catch {
      // Older Windows builds simply fall back to the CSS glass layers.
    }
  }
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(path.join(ROOT_DIR, 'src', 'renderer', 'index.html'));
}

if (process.argv.includes('--smoke-test')) {
  app.whenReady().then(runSmokeTest);
} else {
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

async function runSmokeTest() {
  await ensureDataFiles();
  const catalog = await loadTools();
  const manifest = await loadKnowledgeManifest();
  console.log(`smoke ok: tools=${catalog.tools.length}, docs=${manifest.docs.length}`);
  app.quit();
}

async function ensureDataFiles() {
  if (!ensureDataFilesPromise) {
    ensureDataFilesPromise = (async () => {
      await fsp.mkdir(DATA_DIR, { recursive: true });
      await fsp.mkdir(IMPORTED_DIR, { recursive: true });
      await ensureJson(USER_STATE_FILE, { favorites: [], recent: [] });
      await ensureJson(IMPORTS_MANIFEST, { docs: [] });
    })();
  }

  try {
    await ensureDataFilesPromise;
  } catch (error) {
    ensureDataFilesPromise = null;
    throw error;
  }
}

async function ensureJson(file, fallback) {
  try {
    await fsp.access(file, fs.constants.F_OK);
  } catch {
    await fsp.writeFile(file, `${JSON.stringify(fallback, null, 2)}\n`, 'utf8');
  }
}

async function readJson(file) {
  const raw = await fsp.readFile(file, 'utf8');
  return JSON.parse(raw);
}

async function readJsonDefault(file, fallback) {
  try {
    return await readJson(file);
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  await fsp.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function expandPath(input) {
  if (!input || typeof input !== 'string') return '';

  let output = input.replace(/%([^%]+)%/g, (_, key) => process.env[key] || `%${key}%`);
  output = output.replace(/\$\{([^}]+)\}/g, (_, key) => process.env[key] || `\${${key}}`);
  if (output === '~' || output.startsWith(`~${path.sep}`) || output.startsWith('~/')) {
    output = path.join(os.homedir(), output.slice(2));
  }
  return path.normalize(output);
}

function isFileOrShortcut(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function isDirectory(file) {
  try {
    return fs.statSync(file).isDirectory();
  } catch {
    return false;
  }
}

function pathEntries() {
  return (process.env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean)
    .map(expandPath);
}

function pathExtensions() {
  if (process.platform !== 'win32') return [''];
  const values = (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM')
    .split(';')
    .filter(Boolean);
  return [...new Set(values.flatMap((ext) => [ext.toLowerCase(), ext.toUpperCase()]))];
}

function buildPathExecutableIndex() {
  const index = new Map();
  for (const entry of pathEntries()) {
    let items;
    try {
      items = fs.readdirSync(entry, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const item of items) {
      if (!item.isFile() && !item.isSymbolicLink()) continue;
      const lower = item.name.toLowerCase();
      if (!index.has(lower)) index.set(lower, path.join(entry, item.name));
    }
  }
  return index;
}

function getPathExecutableIndex() {
  if (!pathExecutableIndex || Date.now() - pathExecutableIndexAt > PATH_INDEX_TTL_MS) {
    pathExecutableIndex = buildPathExecutableIndex();
    pathExecutableIndexAt = Date.now();
    pathLookupCache.clear();
  }
  return pathExecutableIndex;
}

function findOnPath(command) {
  if (!command) return null;
  if (command.includes(path.sep) || command.includes('/') || command.includes('\\')) {
    const expanded = expandPath(command);
    if (directPathCache.has(expanded)) return directPathCache.get(expanded);
    if (isFileOrShortcut(expanded)) {
      directPathCache.set(expanded, expanded);
      return expanded;
    }
    return null;
  }

  const cacheKey = command.toLowerCase();
  if (pathLookupCache.has(cacheKey)) return pathLookupCache.get(cacheKey);

  const executableIndex = getPathExecutableIndex();

  const pathext = pathExtensions();
  const hasExt = Boolean(path.extname(command));
  const names = hasExt
    ? [command]
    : pathext.map((ext) => `${command}${ext}`);

  for (const name of names) {
    const candidate = executableIndex.get(name.toLowerCase());
    if (candidate) {
      pathLookupCache.set(cacheKey, candidate);
      return candidate;
    }
  }

  return null;
}

function resolveTool(tool) {
  const probes = [];
  if (tool.configuredPath) probes.push(tool.configuredPath);
  if (tool.executable) probes.push(tool.executable);
  if (Array.isArray(tool.candidates)) probes.push(...tool.candidates);

  const seen = new Set();
  for (const probe of probes) {
    if (!probe || seen.has(probe)) continue;
    seen.add(probe);
    const expanded = expandPath(probe);
    const found = findOnPath(expanded) || findOnPath(probe);
    if (found) {
      return {
        status: 'ready',
        path: found,
        source: tool.configuredPath === probe ? 'configured' : 'auto'
      };
    }
    if (isDirectory(expanded)) {
      return {
        status: 'ready',
        path: expanded,
        source: tool.configuredPath === probe ? 'configured' : 'auto',
        directory: true
      };
    }
  }

  return { status: 'missing', path: '', source: '', directory: false };
}

function sanitizeTool(tool) {
  const copy = { ...tool };
  for (const key of ['resolved', 'status', 'resolvedPath', 'missingReason', 'favorite', 'recentAt']) {
    delete copy[key];
  }
  return copy;
}

function quoteArg(value) {
  const text = String(value || '');
  if (!text) return '""';
  if (/[\s"&|<>^]/.test(text)) return `"${text.replace(/"/g, '\\"')}"`;
  return text;
}

function buildArgs(tool, targetFile) {
  const args = Array.isArray(tool.args) ? [...tool.args] : [];
  if (targetFile && tool.acceptsTarget && !args.some((arg) => String(arg).includes('{file}'))) {
    args.push('{file}');
  }
  return args
    .map((arg) => String(arg).replace(/\{file\}/g, targetFile || ''))
    .filter((arg) => arg.length > 0);
}

async function loadUserState() {
  await ensureDataFiles();
  const state = await readJsonDefault(USER_STATE_FILE, { favorites: [], recent: [] });
  return {
    favorites: Array.isArray(state.favorites) ? state.favorites : [],
    recent: Array.isArray(state.recent) ? state.recent : []
  };
}

async function saveUserState(state) {
  const next = {
    favorites: [...new Set(state.favorites || [])],
    recent: (state.recent || []).slice(0, 30)
  };
  await writeJson(USER_STATE_FILE, next);
  return next;
}

async function recordRecent(tool) {
  const state = await loadUserState();
  const item = {
    toolId: tool.id,
    name: tool.name,
    path: tool.resolved?.path || tool.configuredPath || '',
    launchedAt: new Date().toISOString()
  };
  state.recent = [item, ...state.recent.filter((entry) => entry.toolId !== tool.id)].slice(0, 30);
  await saveUserState(state);
}

async function loadTools() {
  await ensureDataFiles();
  const catalog = await readJson(TOOLS_FILE);
  const userState = await loadUserState();
  const recentMap = new Map(userState.recent.map((entry) => [entry.toolId, entry.launchedAt]));
  const favoriteSet = new Set(userState.favorites);
  const tools = (catalog.tools || []).map((tool) => ({
    ...tool,
    resolved: resolveTool(tool),
    favorite: favoriteSet.has(tool.id),
    recentAt: recentMap.get(tool.id) || ''
  }));
  return { ...catalog, tools, userState };
}

async function saveTools(tools) {
  if (!Array.isArray(tools)) throw new Error('Invalid tools payload.');
  const catalog = await readJson(TOOLS_FILE);
  const next = {
    ...catalog,
    tools: tools.map(sanitizeTool)
  };
  await writeJson(TOOLS_FILE, next);
  return loadTools();
}

function executableNamesForTool(tool) {
  const values = [tool.executable, ...(tool.candidates || [])].filter(Boolean);
  return [...new Set(values.map((item) => path.basename(expandPath(item)).toLowerCase()).filter(Boolean))];
}

function commonScanRoots() {
  const roots = [
    path.join(os.homedir(), 'Desktop'),
    path.join(os.homedir(), 'Downloads'),
    'C:\\Tools',
    'C:\\Reverse',
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs') : ''
  ];
  return [...new Set(roots.filter(Boolean).map(expandPath).filter(isDirectory))];
}

function shouldSkipScanDir(name) {
  return [
    'node_modules',
    '$recycle.bin',
    'windows',
    'winsxs',
    'system32',
    'syswow64',
    'microsoft',
    'packages',
    'temp',
    'tmp'
  ].includes(name.toLowerCase());
}

async function scanForTargets(targetNames, roots) {
  const found = new Map();
  const started = Date.now();
  const maxMs = 25000;
  const maxDepth = 5;

  for (const root of roots) {
    const queue = [{ dir: root, depth: 0 }];
    while (queue.length) {
      if (Date.now() - started > maxMs) return found;
      const { dir, depth } = queue.shift();
      let entries;
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (depth < maxDepth && !shouldSkipScanDir(entry.name)) {
            queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
          }
          continue;
        }
        if (!entry.isFile()) continue;
        const lower = entry.name.toLowerCase();
        if (targetNames.has(lower) && !found.has(lower)) {
          found.set(lower, path.join(dir, entry.name));
        }
      }
    }
  }

  return found;
}

async function scanAndApplyToolPaths() {
  const catalog = await readJson(TOOLS_FILE);
  const tools = catalog.tools || [];
  const targetNames = new Set();
  const toolNames = new Map();

  for (const tool of tools) {
    for (const name of executableNamesForTool(tool)) {
      targetNames.add(name);
      if (!toolNames.has(name)) toolNames.set(name, []);
      toolNames.get(name).push(tool.id);
    }
  }

  const found = await scanForTargets(targetNames, commonScanRoots());
  const applied = [];

  for (const tool of tools) {
    const resolved = resolveTool(tool);
    if (resolved.status === 'ready') continue;

    for (const name of executableNamesForTool(tool)) {
      const candidate = found.get(name) || findOnPath(name);
      if (candidate) {
        tool.configuredPath = candidate;
        applied.push({ toolId: tool.id, name: tool.name, path: candidate });
        break;
      }
    }
  }

  if (applied.length) {
    await writeJson(TOOLS_FILE, { ...catalog, tools });
  }

  const next = await loadTools();
  return { ...next, scanReport: { applied, roots: commonScanRoots() } };
}

function safeId(text) {
  const base = String(text || 'item')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || `item-${Date.now()}`;
}

async function uniqueImportFile(baseName, ext) {
  await fsp.mkdir(IMPORTED_DIR, { recursive: true });
  let index = 0;
  while (true) {
    const suffix = index === 0 ? '' : `-${index}`;
    const name = `${baseName}${suffix}${ext}`;
    const abs = path.join(IMPORTED_DIR, name);
    try {
      await fsp.access(abs, fs.constants.F_OK);
      index += 1;
    } catch {
      return { name, abs };
    }
  }
}

function ensureKnowledgeRelative(relativeFile) {
  const target = path.resolve(KNOWLEDGE_DIR, relativeFile || '');
  const rel = path.relative(KNOWLEDGE_DIR, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Invalid knowledge path.');
  }
  return target;
}

async function loadKnowledgeManifest() {
  await ensureDataFiles();
  const base = await readJson(KNOWLEDGE_MANIFEST);
  const imports = await readJsonDefault(IMPORTS_MANIFEST, { docs: [] });
  const builtInDocs = (base.docs || []).map((doc) => ({
    ...doc,
    format: doc.format || 'md',
    imported: false,
    editable: true
  }));
  const importedDocs = (imports.docs || []).map((doc) => ({
    ...doc,
    imported: true,
    editable: doc.format === 'md'
  }));
  return { ...base, docs: [...builtInDocs, ...importedDocs] };
}

async function findKnowledgeDoc(idOrFile) {
  const manifest = await loadKnowledgeManifest();
  return manifest.docs.find((doc) => doc.id === idOrFile || doc.file === idOrFile);
}

async function readKnowledgeDocument(idOrFile) {
  const doc = await findKnowledgeDoc(idOrFile);
  if (!doc) throw new Error(`Knowledge doc not found: ${idOrFile}`);

  const target = ensureKnowledgeRelative(doc.file);
  const ext = path.extname(target).toLowerCase();

  if (ext === '.md' || ext === '.markdown') {
    return {
      kind: 'markdown',
      content: await fsp.readFile(target, 'utf8'),
      editable: true,
      fileUrl: pathToFileURL(target).href
    };
  }

  if (ext === '.pdf') {
    return {
      kind: 'pdf',
      content: '',
      editable: false,
      fileUrl: pathToFileURL(target).href
    };
  }

  if (ext === '.docx') {
    return {
      kind: 'html',
      content: await convertDocxToHtml(target),
      editable: false,
      fileUrl: pathToFileURL(target).href
    };
  }

  if (ext === '.mhtml' || ext === '.mht') {
    return {
      kind: 'html',
      content: await convertMhtmlToHtml(target),
      editable: false,
      fileUrl: pathToFileURL(target).href
    };
  }

  return {
    kind: 'text',
    content: await fsp.readFile(target, 'utf8'),
    editable: false,
    fileUrl: pathToFileURL(target).href
  };
}

async function convertDocxToHtml(file) {
  const mammoth = require('mammoth');
  const result = await mammoth.convertToHtml({ path: file });
  const warnings = result.messages?.length
    ? `<aside class="import-warning">${escapeHtml(result.messages.map((item) => item.message).join('\n'))}</aside>`
    : '';
  return `${warnings}<div class="imported-docx">${result.value}</div>`;
}

async function convertMhtmlToHtml(file) {
  const raw = await fsp.readFile(file, 'utf8');
  const boundary = raw.match(/boundary="?([^"\r\n;]+)"?/i)?.[1];
  if (!boundary) {
    return `<pre>${escapeHtml(raw)}</pre>`;
  }

  const parts = raw.split(`--${boundary}`);
  for (const part of parts) {
    if (!/Content-Type:\s*text\/html/i.test(part)) continue;
    const split = part.search(/\r?\n\r?\n/);
    if (split === -1) continue;
    const header = part.slice(0, split);
    let body = part.slice(split).replace(/^\r?\n\r?\n/, '');
    if (/Content-Transfer-Encoding:\s*base64/i.test(header)) {
      body = Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
    } else if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(header)) {
      body = decodeQuotedPrintable(body);
    }
    return body;
  }

  return `<pre>${escapeHtml(raw.slice(0, 200000))}</pre>`;
}

function decodeQuotedPrintable(input) {
  return input
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function addImportedDoc(filePath, titleOverride = '') {
  const ext = path.extname(filePath).toLowerCase();
  const format = ext.replace('.', '') || 'md';
  const title = titleOverride || path.basename(filePath, ext);
  const id = `import-${Date.now()}-${safeId(title)}`;
  const target = await uniqueImportFile(`${Date.now()}-${safeId(title)}`, ext);
  await fsp.copyFile(filePath, target.abs);

  const imports = await readJsonDefault(IMPORTS_MANIFEST, { docs: [] });
  const doc = {
    id,
    title,
    category: '本地导入',
    file: path.posix.join('imported', target.name),
    summary: `导入自 ${filePath}`,
    tags: [format.toUpperCase()],
    format,
    imported: true,
    sourcePath: filePath,
    importedAt: new Date().toISOString()
  };
  imports.docs = [...(imports.docs || []), doc];
  await writeJson(IMPORTS_MANIFEST, imports);
  return doc;
}

async function createMarkdownDoc(title) {
  const safeTitle = String(title || '新建文档').trim() || '新建文档';
  const id = `note-${Date.now()}-${safeId(safeTitle)}`;
  const target = await uniqueImportFile(`${Date.now()}-${safeId(safeTitle)}`, '.md');
  await fsp.writeFile(target.abs, `# ${safeTitle}\n\n在这里编写知识库内容。\n`, 'utf8');

  const imports = await readJsonDefault(IMPORTS_MANIFEST, { docs: [] });
  const doc = {
    id,
    title: safeTitle,
    category: '本地编辑',
    file: path.posix.join('imported', target.name),
    summary: '应用内新建 Markdown 文档',
    tags: ['MD', 'Note'],
    format: 'md',
    imported: true,
    sourcePath: '',
    importedAt: new Date().toISOString()
  };
  imports.docs = [...(imports.docs || []), doc];
  await writeJson(IMPORTS_MANIFEST, imports);
  return doc;
}

async function deleteImportedDoc(id) {
  const imports = await readJsonDefault(IMPORTS_MANIFEST, { docs: [] });
  const doc = (imports.docs || []).find((item) => item.id === id);
  if (!doc) return false;
  const target = ensureKnowledgeRelative(doc.file);
  imports.docs = imports.docs.filter((item) => item.id !== id);
  await writeJson(IMPORTS_MANIFEST, imports);
  if (target.startsWith(IMPORTED_DIR) && isFileOrShortcut(target)) {
    await fsp.unlink(target);
  }
  return true;
}

ipcMain.handle('catalog:getTools', async () => loadTools());
ipcMain.handle('catalog:saveTools', async (_event, tools) => saveTools(tools));
ipcMain.handle('tool:scanPaths', async () => scanAndApplyToolPaths());

ipcMain.handle('tool:toggleFavorite', async (_event, toolId) => {
  const state = await loadUserState();
  if (state.favorites.includes(toolId)) {
    state.favorites = state.favorites.filter((id) => id !== toolId);
  } else {
    state.favorites.push(toolId);
  }
  await saveUserState(state);
  return loadTools();
});

ipcMain.handle('tool:launch', async (_event, payload) => {
  const { toolId, targetFile } = payload || {};
  const catalog = await loadTools();
  const tool = catalog.tools.find((item) => item.id === toolId);
  if (!tool) throw new Error(`Tool not found: ${toolId}`);
  if (!tool.resolved || tool.resolved.status !== 'ready') {
    return { ok: false, message: '工具路径未配置或未发现。' };
  }

  const launchPath = tool.resolved.path;
  if (tool.resolved.directory || isDirectory(launchPath)) {
    await shell.openPath(launchPath);
    await recordRecent(tool);
    return { ok: true, message: `已打开目录：${launchPath}` };
  }

  const args = buildArgs(tool, targetFile);
  const cwd = tool.cwd ? expandPath(tool.cwd) : path.dirname(launchPath);
  const ext = path.extname(launchPath).toLowerCase();

  if (tool.launchMode === 'open' || ext === '.lnk' || ext === '.url') {
    const err = await shell.openPath(launchPath);
    if (err) return { ok: false, message: err };
    await recordRecent(tool);
    return { ok: true, message: `已打开：${tool.name}` };
  }

  if (ext === '.bat' || ext === '.cmd') {
    const child = childProcess.spawn('cmd.exe', ['/c', 'start', '', launchPath, ...args], {
      cwd,
      detached: true,
      windowsHide: false,
      stdio: 'ignore'
    });
    child.unref();
    await recordRecent(tool);
    return { ok: true, message: `已启动脚本：${tool.name}` };
  }

  if (ext === '.jar') {
    const child = childProcess.spawn('javaw.exe', ['-jar', launchPath, ...args], {
      cwd,
      detached: true,
      windowsHide: false,
      stdio: 'ignore'
    });
    child.unref();
    await recordRecent(tool);
    return { ok: true, message: `已启动 Jar：${tool.name}` };
  }

  if (tool.type === 'cli') {
    const commandLine = [quoteArg(launchPath), ...args.map(quoteArg)].join(' ');
    const child = childProcess.spawn('cmd.exe', ['/c', 'start', '', 'cmd.exe', '/k', commandLine], {
      cwd,
      detached: true,
      windowsHide: false,
      stdio: 'ignore'
    });
    child.unref();
    await recordRecent(tool);
    return { ok: true, message: `已打开控制台：${tool.name}` };
  }

  const child = childProcess.spawn(launchPath, args, {
    cwd,
    detached: true,
    windowsHide: false,
    stdio: 'ignore'
  });
  child.unref();
  await recordRecent(tool);
  return { ok: true, message: `已启动：${tool.name}` };
});

ipcMain.handle('tool:selectPath', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择工具可执行文件',
    properties: ['openFile'],
    filters: [
      { name: 'Executable', extensions: ['exe', 'cmd', 'bat', 'jar', 'lnk'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return '';
  return result.filePaths[0];
});

ipcMain.handle('tool:selectTargetFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择待分析样本',
    properties: ['openFile'],
    filters: [
      { name: 'Reverse Targets', extensions: ['exe', 'dll', 'sys', 'bin', 'so', 'elf', 'apk', 'jar', 'class', 'dex', 'dat'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return '';
  return result.filePaths[0];
});

ipcMain.handle('tool:revealPath', async (_event, file) => {
  const expanded = expandPath(file);
  if (isFileOrShortcut(expanded)) {
    shell.showItemInFolder(expanded);
    return true;
  }
  if (isDirectory(expanded)) {
    await shell.openPath(expanded);
    return true;
  }
  return false;
});

ipcMain.handle('knowledge:getManifest', async () => loadKnowledgeManifest());
ipcMain.handle('knowledge:read', async (_event, idOrFile) => readKnowledgeDocument(idOrFile));

ipcMain.handle('knowledge:saveMarkdown', async (_event, payload) => {
  const { id, content } = payload || {};
  const doc = await findKnowledgeDoc(id);
  if (!doc) throw new Error(`Knowledge doc not found: ${id}`);
  if (doc.format && doc.format !== 'md') throw new Error('Only Markdown documents can be edited.');
  const target = ensureKnowledgeRelative(doc.file);
  await fsp.writeFile(target, String(content ?? ''), 'utf8');
  return true;
});

ipcMain.handle('knowledge:createMarkdown', async (_event, title) => createMarkdownDoc(title));

ipcMain.handle('knowledge:importDocument', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入知识库本地文档',
    properties: ['openFile'],
    filters: [
      { name: 'Knowledge Documents', extensions: ['pdf', 'md', 'markdown', 'docx', 'mhtml', 'mht'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePaths.length) return null;
  return addImportedDoc(result.filePaths[0]);
});

ipcMain.handle('knowledge:deleteImported', async (_event, id) => deleteImportedDoc(id));

ipcMain.handle('knowledge:openOriginal', async (_event, id) => {
  const doc = await findKnowledgeDoc(id);
  if (!doc) return false;
  const target = ensureKnowledgeRelative(doc.file);
  await shell.openPath(target);
  return true;
});

ipcMain.handle('app:openDataFolder', async () => {
  await shell.openPath(DATA_DIR);
  return true;
});

ipcMain.handle('app:minimizeWindow', async () => {
  if (mainWindow) mainWindow.minimize();
  return true;
});

ipcMain.handle('app:closeWindow', async () => {
  if (mainWindow) mainWindow.close();
  return true;
});

ipcMain.handle('app:openExternal', async (_event, url) => {
  if (!/^https?:\/\//i.test(url)) throw new Error('Only http(s) URLs are allowed.');
  await shell.openExternal(url);
  return true;
});
