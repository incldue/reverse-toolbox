# Linux ELF 与 native pwn/rev 交叉点

## ELF 加载路径

典型执行流：

```text
_start -> __libc_start_main -> main -> exit handlers
```

初始化函数可能在 `main` 前运行：

- `.init`
- `.init_array`
- C++ 全局对象构造函数

## GOT / PLT

- PLT 是延迟绑定跳板。
- GOT 保存真实函数地址。
- 动态链接首次调用时由解析器填 GOT。

逆向时通过 PLT 名称快速定位库函数调用；调试时可在 `strcmp@plt`、`read@plt` 等位置下断。

## 常见保护

| 保护 | 影响 |
| --- | --- |
| NX | 栈不可执行 |
| Canary | 栈溢出检测 |
| PIE | 主程序基址随机 |
| RELRO | GOT 可写性变化 |
| Fortify | 部分危险函数替换为检查版本 |

逆向题里这些保护更多影响调试地址计算和 patch 方式。

## gdb 地址计算

PIE 开启后，静态地址需要加运行时基址：

```text
runtime_address = module_base + static_offset
```

用 `info proc mappings`、`vmmap` 或插件获取基址。

## Linux 常见输入点

- `read`
- `fgets`
- `scanf`
- `getline`
- `argv`
- 环境变量 `getenv`
- 文件读取 `open/read/mmap`

## 常见比较点

- `strcmp`
- `strncmp`
- `memcmp`
- `CRYPTO_memcmp`
- 自写循环比较
- 哈希后比较常量

## 动态链接相关技巧

- `ltrace` 可观察库函数调用。
- `strace` 可观察系统调用。
- `LD_PRELOAD` 可替换部分库函数做日志。
- 对 CTF 样本，优先用最小 hook 记录参数，不要改动过多行为。

## 静态链接样本

静态链接会把 libc 代码一起放进程序，函数数量暴涨。处理方法：

- 用 FLIRT / sigdb / Ghidra Function ID 识别库函数。
- 从字符串和系统调用往回找业务逻辑。
- 看 main 周围调用图，不要陷入 libc 实现细节。
