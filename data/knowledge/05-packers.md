# 壳、UPX 与 VMP 分析要点

## 壳的常见特征

- 入口点不在正常 `.text` 开头。
- 导入表很少，只有 `LoadLibrary`、`GetProcAddress`、`VirtualProtect` 等。
- 节名异常或高熵。
- 入口附近大量自修改、解密循环、跳转到新内存。
- 静态字符串很少，运行后才出现明文。

## UPX

UPX 题通常先尝试：

```text
upx -t sample.exe
upx -d sample.exe -o unpacked.exe
```

如果标准解包失败：

- 可能是魔改 UPX。
- 先在入口处看解压 stub。
- 跟到最终跳回 OEP 的位置。
- dump 内存镜像并修复入口点和导入表。

## OEP 判断

OEP 是原程序入口，不是壳入口。常见信号：

- 解密/解压循环结束后长跳转。
- 跳转目标代码风格像正常编译器启动代码。
- 导入表已经解析完成。
- 内存页权限从 RW 改为 RX 后跳入。

## IAT 修复

脱壳后程序常见问题是导入表损坏。修复路径：

1. 调试运行到 OEP。
2. dump 当前进程镜像。
3. 用 Scylla 等工具定位 IAT。
4. 重建导入表。
5. 重新打开 dump，确认导入函数可识别。

## VMP / 虚拟化保护

CTF 中的 VMP 类题不一定要求完整还原 VM。优先寻找捷径：

- 是否只有少量函数被保护。
- 输入输出边界是否在 VM 外。
- 关键比较结果是否能在 VM 退出后观察。
- VM handler 表、opcode 解码、状态寄存器是否明显。
- 是否能通过动态 trace 提取约束，而不是反编译整个 VM。

## VM 分析关注点

| 对象 | 说明 |
| --- | --- |
| bytecode | 虚拟指令流，可能加密或压缩 |
| handler table | opcode 到处理函数的映射 |
| vm context | 虚拟寄存器、栈、IP、标志位 |
| dispatcher | 根据 opcode 分发 handler |
| exit condition | VM 何时返回真实代码 |

## 实战策略

1. 找 VM 入口参数：bytecode 地址、context 地址、输入 buffer。
2. 给 handler 命名：`vm_add`、`vm_xor`、`vm_cmp`。
3. 记录每条 opcode 对 context 的影响。
4. 只还原影响 flag 判定的指令。
5. 必要时写解释器或符号执行脚本。

## 注意

商业工具只应配置本机合法安装路径。CTF 分析时保留原始样本，dump 和 patch 产物单独保存。
