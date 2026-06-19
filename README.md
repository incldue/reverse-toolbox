# Reverse Toolbox

一款面向 Windows 的 CTF 逆向工程桌面工具箱。它集中管理常用逆向工具路径，支持样本参数传递、本地知识库阅读、Markdown 笔记编辑和导入文档预览。

![Platform](https://img.shields.io/badge/platform-Windows-0078D4?logo=windows)
![Electron](https://img.shields.io/badge/Electron-42-47848F?logo=electron)
![License](https://img.shields.io/badge/license-MIT-green)

## 功能特性

- 🚀 快速启动常用逆向工具：IDA、Ghidra、x64dbg、010 Editor、DIE、JADX 等

- 🎯 支持选择样本文件，并将样本路径作为参数传给工具，一次打开多个工具

- ⭐ 收藏 / 最近使用 / 分类筛选 / 全局搜索

- 🔎 自动扫描常见安装目录 (感觉没啥用)，也支持手动配置工具路径

- 🧩 支持导入其他逆向工具

- 📚 内置本地逆向知识库，支持 Markdown 阅读

- 📝 支持新建和编辑本地 Markdown 笔记

- 📄 支持导入 .pdf、.md、.docx、.mhtml/.mht等文件格式的文档

  

> 本项目只管理本机已有工具的路径，不内置 IDA Pro、010 Editor、VMProtect 等商业软件或第三方逆向工具二进制文件。

## 环境要求

- Windows 10 / Windows 11
- Node.js 20+
- npm

可以下载[release](https://github.com/incldue/reverse-toolbox/releases/tag/reverse-toolbox)进行安装，也可以通过以下的本地运行自行安装。

## 本地运行

```powershell
git clone https://github.com/incldue/reverse-toolbox.git
cd reverse-toolbox

$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm.cmd install
npm.cmd start
```

也可以双击：

```text
启动工具箱.cmd
```

## 项目结构

```text
├─ src/
│  ├─ main/
│  │  ├─ main.js          # Electron 主进程、IPC、工具启动、知识库读写
│  │  └─ preload.js       
│  └─ renderer/
│     ├─ index.html       # UI
│     ├─ app.js          
│     └─ styles.css    
├─ data/
│  ├─ tools.json          
│  └─ knowledge/          # 内置本地知识库           
├─ package.json
├─ package-lock.json
└─ 启动工具箱.cmd
```

## License

MIT License. See [LICENSE](LICENSE) for details.
