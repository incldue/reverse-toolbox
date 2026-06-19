# .NET / Java / Android 逆向

## .NET

优先工具：dnSpyEx、ILSpy、de4dot、Detect It Easy。

关注点：

- `Main` 入口和事件回调。
- `System.String`、`Encoding.UTF8`、`Convert.FromBase64String`。
- 资源文件中的加密 blob。
- 反射：`Assembly.Load`、`GetMethod`、`Invoke`。
- 混淆后的无意义类名和控制流。

IL 比 C# 反编译结果更接近事实。遇到反编译异常时看 IL。

## Java

优先工具：JADX、JD-GUI、CFR、javap。

关注点：

- `main`、GUI listener、网络/文件入口。
- `String.getBytes` 的字符集。
- `MessageDigest`、`Cipher`、`SecretKeySpec`。
- 反射、动态 ClassLoader。

## Android APK

基础流程：

1. 查看 `AndroidManifest.xml`：入口 Activity、权限、service、receiver。
2. 用 JADX 看 Java/Kotlin 层。
3. 搜索 `flag`、`native`、`System.loadLibrary`、`check`。
4. 用 apktool 看资源和 smali。
5. 如果有 `.so`，切到 IDA/Ghidra 分析 native。
6. 运行时用 Frida/日志验证关键参数。

## JNI

Java 到 native 的路径：

```java
System.loadLibrary("native-lib");
native boolean check(String input);
```

native 中可能出现：

```c
Java_package_Class_check(JNIEnv *env, jobject thiz, jstring input)
```

也可能通过 `RegisterNatives` 动态注册。遇到找不到导出函数时，搜索 `RegisterNatives` 和方法名字符串。

## smali 速读

| smali | 含义 |
| --- | --- |
| `invoke-static` | 调用静态方法 |
| `invoke-virtual` | 调用实例方法 |
| `move-result` | 取返回值 |
| `const-string` | 字符串常量 |
| `if-eqz` | 为 0 跳转 |
| `iget/iput` | 实例字段读写 |

## Frida 观察点

适合 hook：

- Java 层 check 函数。
- `String.equals`、`MessageDigest.digest`。
- native 导出函数。
- `RegisterNatives` 注册表。
- 加密 API 参数。

原则：先记录输入输出，再决定是否 patch 返回值。
