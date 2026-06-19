# 汇编与调用约定速查

## x86 常见寄存器

| 寄存器 | 常见用途 |
| --- | --- |
| EAX | 返回值、累加器 |
| EBX | 通用寄存器 |
| ECX | 计数器、thiscall 的 this |
| EDX | 参数、乘除法高位 |
| ESI / EDI | 源/目标指针 |
| EBP | 栈帧基址 |
| ESP | 栈顶 |
| EIP | 指令指针 |

## x64 常见寄存器

| 寄存器 | 常见用途 |
| --- | --- |
| RAX | 返回值 |
| RCX/RDX/R8/R9 | Windows x64 前四个整数/指针参数 |
| RDI/RSI/RDX/RCX/R8/R9 | SysV x64 前六个整数/指针参数 |
| RSP | 栈顶，调用前通常 16 字节对齐 |
| RBP | 可选栈帧基址 |
| RIP | 指令指针，x64 常用 RIP-relative 寻址 |

## 调用约定

| 平台 | 参数传递 | 返回值 | 调用者清理 |
| --- | --- | --- | --- |
| x86 cdecl | 栈，从右到左 | EAX | 是 |
| x86 stdcall | 栈，从右到左 | EAX | 否 |
| x86 thiscall | ECX=this，其余多在栈 | EAX | 视编译器 |
| Windows x64 | RCX, RDX, R8, R9，然后栈 | RAX | 是 |
| SysV x64 | RDI, RSI, RDX, RCX, R8, R9，然后栈 | RAX | 是 |

Windows x64 调用者会预留 32 字节 shadow space。看到 `sub rsp, 20h` 或更大空间很常见。

## 常见指令含义

| 指令 | 含义 |
| --- | --- |
| `mov dst, src` | 复制 |
| `lea dst, [expr]` | 取地址或做简单算术 |
| `xor eax, eax` | 清零 EAX |
| `test reg, reg` | 判断是否为 0 |
| `cmp a, b` | 比较 a 与 b |
| `call target` | 调用函数 |
| `ret` | 返回 |
| `jz/jnz` | 等于/不等于跳转 |
| `ja/jb` | 无符号大于/小于 |
| `jg/jl` | 有符号大于/小于 |
| `rol/ror` | 循环移位，常见于 hash/加密 |
| `xchg` | 交换 |

## 标志位

- ZF：结果为 0。
- CF：无符号进位/借位。
- SF：符号位。
- OF：有符号溢出。

判断跳转时先看 `cmp/test` 操作数，再看有符号还是无符号跳转。

## 栈帧模式

典型 x86：

```asm
push ebp
mov ebp, esp
sub esp, 40h
...
leave
ret
```

典型 x64：

```asm
push rbp
mov rbp, rsp
sub rsp, 80h
...
add rsp, 80h
pop rbp
ret
```

优化编译可能省略帧指针，因此不要只靠 `rbp` 判断局部变量。

## 逆向时优先关注

- 函数参数来自哪里。
- 返回值在哪里被比较。
- 关键 buffer 的长度和边界。
- 循环中每轮如何更新索引、状态和表。
- 分支失败时输出什么信息。
