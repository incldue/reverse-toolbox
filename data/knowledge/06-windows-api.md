# Windows API 与反调试常见模式

## 输入输出 API

| 场景 | 常见 API |
| --- | --- |
| 控制台输入 | `ReadFile`、`ReadConsoleA/W`、`scanf`、`fgets` |
| GUI 输入 | `GetDlgItemTextA/W`、`GetWindowTextA/W` |
| 文件读取 | `CreateFileA/W`、`ReadFile`、`GetFileSize` |
| 输出 | `printf`、`puts`、`MessageBoxA/W`、`WriteFile` |

遇到 GUI CrackMe，先从窗口过程、按钮回调和 `GetDlgItemText` 交叉引用开始。

## 动态加载

常见组合：

```text
LoadLibraryA/W
GetProcAddress
VirtualAlloc
VirtualProtect
CreateThread
```

这可能是壳、插件加载、payload 解密或 API 哈希解析。关键是记录解析出的真实函数名和调用点。

## TLS Callback

TLS Callback 会在入口点前执行。常见用途：

- 反调试。
- 解密全局字符串。
- 初始化校验表。
- 修改入口路径。

在 PE 工具中检查 TLS Directory，或在 IDA 的 entry/tls 相关视图中定位。

## SEH / VEH

异常处理可能用于：

- 反调试检测。
- 控制流混淆。
- 故意触发异常后跳到真实逻辑。
- 解密逻辑的一部分。

关注 `SetUnhandledExceptionFilter`、`AddVectoredExceptionHandler`、`RaiseException`、`int 3`、非法内存访问。

## 反调试 API

| API / 字段 | 含义 |
| --- | --- |
| `IsDebuggerPresent` | 检查 PEB BeingDebugged |
| `CheckRemoteDebuggerPresent` | 检查目标进程调试状态 |
| `NtQueryInformationProcess` | 可查询 DebugPort、DebugObject 等 |
| `OutputDebugString` | 可用于调试器差异检测 |
| `GetTickCount` / `QueryPerformanceCounter` | 时间差检测 |
| `GetThreadContext` | 检查硬件断点寄存器 |

## Patch 原则

- 只 patch 决定性分支或返回值。
- 记录原始字节。
- 保持 patch 可复现。
- Patch 后重新从干净启动验证。

## 常见 API 哈希

样本可能不保存 API 名称，而是保存 hash。识别点：

- 枚举 PEB 模块链。
- 遍历 Export Table。
- 对函数名做 `ror`、`rol`、`crc`、`add/xor`。
- 比较常量 hash 后调用解析出的地址。

处理方式：dump hash 常量和算法，写脚本枚举 DLL 导出名反查。
