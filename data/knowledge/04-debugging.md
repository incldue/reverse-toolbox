# x64dbg / GDB 动态调试工作流

## 动态分析目标

动态调试用于验证静态假设，不是替代静态分析。每次运行前明确要观察什么值、在哪个地址断下、预期状态是什么。

## x64dbg 常用断点

| 目标 | 断点 |
| --- | --- |
| 程序入口 | EntryPoint / system breakpoint 后转 EP |
| 字符串比较 | `strcmp`、`strncmp`、`memcmp`、`lstrcmpA/W` |
| 输入读取 | `ReadFile`、`fgets`、`scanf`、`GetDlgItemTextA/W` |
| 内存权限修改 | `VirtualProtect`、`VirtualAlloc` |
| 加载 DLL | `LoadLibraryA/W`、`GetProcAddress` |
| 反调试 | `IsDebuggerPresent`、`CheckRemoteDebuggerPresent`、`NtQueryInformationProcess` |

## x64dbg 观察点

- Dump 窗口看 buffer 和解密数据。
- Watch 记录关键表达式，如 `[rsp+28]`、`rcx`、`poi(rsp+20)`。
- Memory map 看新分配可执行页和壳解密区域。
- Trace 只在小范围使用，避免日志过大。

## GDB 常用命令

```gdb
start
b *main
b *0x401234
r
ni
si
x/32gx $rsp
x/s $rdi
p/x $rax
info registers
vmmap
```

如果有 PIE，先用 `info proc mappings` 或插件获取基址，再用 `base + offset` 下断点。

## 断点策略

1. **API 断点**：快速定位输入、比较、解密、内存分配。
2. **条件断点**：只在长度、参数或地址匹配时停下。
3. **硬件断点**：追踪某个 buffer 被谁写入。
4. **内存断点**：对 OEP、解密后代码或关键表很有效。
5. **返回断点**：在函数返回处看返回值和输出 buffer。

## 调试验证样例

```text
1. 在 strcmp/memcmp 下断。
2. 输入固定测试值：AAAA...
3. 停下后记录两个参数地址。
4. Dump 两边 buffer。
5. 回溯调用栈找到比较前的变换函数。
6. 在变换函数入口和出口各下断。
7. 写脚本复现输入到输出的变化。
```

## 反调试处理思路

- 先识别，不急着 patch。
- 判断检查结果是否真的影响关键路径。
- 优先 patch 返回值或条件分支，不大面积修改代码。
- Patch 后记录原字节和新字节。

常见检查：

```text
PEB BeingDebugged
NtGlobalFlag
IsDebuggerPresent
CheckRemoteDebuggerPresent
NtQueryInformationProcess
OutputDebugString
Hardware breakpoint registers
Timing check: RDTSC / GetTickCount / QueryPerformanceCounter
```

## 结束标准

动态分析结束时应该拿到至少一个关键运行时证据：明文密钥、解密字符串、比较用密文、变换前后 buffer、OEP 或成功分支地址。
