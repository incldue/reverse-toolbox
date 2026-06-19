# 逆向解题路线图

## 目标

逆向题的目标不是“看懂所有代码”，而是恢复从输入到判定的最短可信路径。优先证明可复现的关键路径，再扩展理解背景逻辑。

## 标准流程

1. **保留原始样本**：复制到工作目录，记录文件名、大小、哈希。
2. **第一轮识别**：看 magic、架构、位数、编译器、壳、字符串、导入表。
3. **判断运行环境**：Windows / Linux / Android / .NET / Java / 脚本封装。
4. **寻找输入点**：命令行参数、标准输入、窗口输入、文件读取、网络请求、资源段。
5. **寻找判定点**：`strcmp`、`memcmp`、异常分支、输出字符串、加密比较、校验失败信息。
6. **建立数据流**：输入如何被编码、异或、哈希、置换、压缩或进入 VM。
7. **写脚本复现**：用最小脚本复现核心变换，避免只靠调试器临时状态。
8. **验证 flag**：在原程序或题目服务中跑通，记录最终步骤。

## 初始 triage 命令

```text
file sample
strings -a sample
upx -t sample
die sample
checksec --file sample
readelf -hSWrs sample
objdump -d sample
```

Windows 下没有这些命令时，可用 Detect It Easy、PE-bear、010 Editor、IDA、x64dbg 组合替代。

## 关键判断

| 现象 | 优先方向 |
| --- | --- |
| 字符串里直接有 wrong / correct | 交叉引用到判定函数 |
| 导入表极少、熵高 | 先查壳或自解密 |
| 大量位运算和表 | 编码、CRC、哈希或 block cipher |
| 大量 switch / 间接跳转 | VM、状态机或编译器优化 |
| .NET / Java 字节码 | 先反编译到高级语言 |
| Android APK | 先资源、Manifest、Java 层，再 native |

## 工作记录模板

```text
sample:
sha256:
format:
arch:
protections:
input:
decision function:
transform chain:
solver:
verification:
flag:
```

## 常见误区

- 一上来全量读伪代码，容易被无关函数拖慢。
- 只相信反编译器，不回看关键汇编和运行时值。
- 修改多个变量同时验证，失败后无法判断哪个假设错了。
- 找到疑似 flag 但不在原程序中验证。
