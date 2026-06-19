const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toolbox', {
  getTools: () => ipcRenderer.invoke('catalog:getTools'),
  saveTools: (tools) => ipcRenderer.invoke('catalog:saveTools', tools),
  scanToolPaths: () => ipcRenderer.invoke('tool:scanPaths'),
  toggleFavorite: (toolId) => ipcRenderer.invoke('tool:toggleFavorite', toolId),
  launchTool: (toolId, targetFile = '') => ipcRenderer.invoke('tool:launch', { toolId, targetFile }),
  selectToolPath: () => ipcRenderer.invoke('tool:selectPath'),
  selectTargetFile: () => ipcRenderer.invoke('tool:selectTargetFile'),
  revealPath: (file) => ipcRenderer.invoke('tool:revealPath', file),
  getKnowledgeManifest: () => ipcRenderer.invoke('knowledge:getManifest'),
  readKnowledge: (idOrFile) => ipcRenderer.invoke('knowledge:read', idOrFile),
  saveMarkdown: (id, content) => ipcRenderer.invoke('knowledge:saveMarkdown', { id, content }),
  createMarkdown: (title) => ipcRenderer.invoke('knowledge:createMarkdown', title),
  importKnowledgeDocument: () => ipcRenderer.invoke('knowledge:importDocument'),
  deleteImportedDocument: (id) => ipcRenderer.invoke('knowledge:deleteImported', id),
  openKnowledgeOriginal: (id) => ipcRenderer.invoke('knowledge:openOriginal', id),
  openDataFolder: () => ipcRenderer.invoke('app:openDataFolder'),
  minimizeWindow: () => ipcRenderer.invoke('app:minimizeWindow'),
  closeWindow: () => ipcRenderer.invoke('app:closeWindow'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url)
});
