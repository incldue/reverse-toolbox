# 二进制格式基础：PE / ELF

## PE 快速结构

PE 是 Windows 可执行文件格式，关键结构如下：

| 结构 | 作用 |
| --- | --- |
| DOS Header | `MZ` 头，`e_lfanew` 指向 NT Header |
| NT Header | `PE\0\0`、机器类型、节数量、Optional Header |
| Optional Header | ImageBase、EntryPoint、Subsystem、DataDirectory |
| Section Table | `.text`、`.rdata`、`.data`、`.rsrc` 等节区 |
| Import Table | DLL 与 API 名称或序号 |
| Export Table | 导出函数，DLL 题常用 |
| Relocation | 镜像基址变化时修正地址 |
| Resource | 图标、字符串、对话框、自定义资源 |

## PE 逆向要点

- `AddressOfEntryPoint` 是入口 RVA，不一定是主逻辑。壳会先进入解壳 stub。
- `.text` 通常是代码，`.rdata` 常有字符串、常量表、RTTI。
- 导入表能快速判断行为：`ReadFile`、`CreateFile`、`Crypt*`、`WinHttp*`、`VirtualProtect`。
- TLS Callback 会在入口点前执行，反调试和初始化常藏在这里。
- 资源段可能藏密钥、加密 blob、第二阶段 payload。

## ELF 快速结构

| 结构 | 作用 |
| --- | --- |
| ELF Header | magic、位数、端序、架构、入口 |
| Program Header | 加载段，运行时更关键 |
| Section Header | 静态分析视图，strip 后仍可缺失 |
| `.text` | 代码 |
| `.rodata` | 只读字符串和常量 |
| `.plt` / `.got` | 动态链接跳转与函数地址表 |
| `.dynamic` | 动态链接元数据 |
| `.init_array` | main 前初始化函数 |

## ELF 逆向要点

- `main` 前还有 `_start`、`__libc_start_main`、init array。
- `strip` 会移除符号，但不会移除运行时逻辑。
- PLT/GOT 是识别库函数和动态劫持的核心。
- PIE 开启后地址会随机化，调试时关注偏移而不是固定 VA。
- 静态链接二进制体积大，库函数识别要借助签名或特征。

## RVA / VA / File Offset

- **VA**：进程虚拟地址。
- **RVA**：相对 ImageBase 的地址，`VA = ImageBase + RVA`。
- **File Offset**：文件中的偏移。

PE 分析时经常需要 RVA 与文件偏移互转：

```text
FileOffset = RVA - Section.VirtualAddress + Section.PointerToRawData
```

前提是 RVA 落在该节的 `VirtualAddress` 到 `VirtualAddress + VirtualSize` 范围内。

## 先看哪些信息

1. 文件格式、架构、位数、端序。
2. 是否压缩壳、是否高熵、导入表是否异常。
3. 入口点附近是否像正常编译器启动代码。
4. 字符串和资源是否出现 flag、key、wrong、correct。
5. 初始化数组、TLS、异常处理表是否有额外逻辑。
