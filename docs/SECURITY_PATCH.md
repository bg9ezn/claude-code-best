# Claude-Code-Best 安全清理文档

> 版本: 1.0.0  
> 日期: 2026-04-18  
> 分支: refactor/security-patch

---

## 一、修复背景与原因

### 1.1 问题发现

Claude-Code-Best (CCB) 是 Anthropic 官方 Claude Code 的逆向还原项目。在代码审计过程中，我们发现项目保留了完整的遥测和数据上报系统，存在以下安全隐患：

#### 数据泄露风险

| 数据类型 | 收集内容 | 发送目标 |
|---------|---------|---------|
| 用户标识 | 用户ID、设备ID、会话ID、组织UUID、账户UUID | api.anthropic.com |
| 个人信息 | 邮箱地址、订阅类型 | api.anthropic.com |
| 使用数据 | 操作事件、工具使用、API调用、模型选择 | api.anthropic.com |
| 环境信息 | 操作系统、版本号、WSL版本、IP地址 | api.anthropic.com |
| 性能指标 | 响应时间、token使用量、错误率 | api.anthropic.com |

#### 硬编码密钥

```typescript
// src/constants/keys.ts 中硬编码的 SDK 密钥
'sdk-zAZezfDKGoZuXXKe'  // 外部用户
'sdk-xRVcrliHIlrg4og4'  // Ant 内部
'sdk-yZQvlplybuXjYh6L'  // 开发环境
```

#### 无法完全禁用

即使设置了 `DISABLE_TELEMETRY=1`，以下数据流仍会发送：
- GrowthBook 功能开关请求
- Grove 通知服务
- OAuth 认证流程中的元数据
- 本地持久化的失败事件会自动重试

### 1.2 安全影响评估

| 风险等级 | 影响范围 | 具体问题 |
|---------|---------|---------|
| 🔴 高 | 隐私泄露 | 用户邮箱、组织ID等 PII 数据被收集 |
| 🔴 高 | 密钥泄露 | 硬编码的 SDK 密钥可被滥用 |
| 🟡 中 | 数据持久化 | 失败事件在本地保存并自动重试 |
| 🟡 中 | 无法完全禁用 | 部分遥测无法通过环境变量禁用 |
| 🟢 低 | 第三方服务 | Datadog/Sentry 可通过不配置禁用 |

---

## 二、修复目的

### 2.1 核心目标

1. **消除数据泄露**：完全移除向 Anthropic 官方服务器的数据上报
2. **保护用户隐私**：防止 PII 数据被收集和传输
3. **移除硬编码密钥**：消除潜在的安全风险
4. **保持功能完整**：不影响正常使用和核心功能

### 2.2 预期效果

- ✅ 所有遥测数据不再发送
- ✅ 用户隐私得到保护
- ✅ 硬编码密钥被移除
- ✅ 代码可正常编译和运行
- ✅ 可配合 Claude-Code-Router 使用国产模型

---

## 三、修复方式与方法

### 3.1 修复策略

采用**源头切断**策略，在数据流的汇聚点进行拦截，而非逐个修改调用点：

```
原数据流:
用户操作 → logEvent → sink → Datadog/1P/BigQuery → api.anthropic.com

修复后:
用户操作 → logEvent → return (空操作)
```

### 3.2 修改清单

共修改 **18 个文件**，删除 **869 行**代码，新增 **75 行**代码：

#### 核心遥测模块 (8项)

| 文件 | 修改内容 | 说明 |
|------|---------|------|
| `src/services/analytics/index.ts` | `logEvent`/`logEventAsync` 直接 return | 覆盖 250+ 调用点 |
| `src/services/analytics/sink.ts` | `initializeAnalyticsSink`/`initializeAnalyticsGates` 直接 return | 双重保险 |
| `src/services/analytics/firstPartyEventLogger.ts` | 三个日志函数直接 return | 1P 事件通道 |
| `src/services/analytics/firstPartyEventLoggingExporter.ts` | `export` 直接返回成功 | HTTP 请求层 |
| `src/services/analytics/datadog.ts` | 初始化返回 false，跟踪函数直接 return | Datadog 通道 |
| `src/services/analytics/growthbook.ts` | `initializeGrowthBook` 返回 null | 功能开关 |
| `src/utils/sentry.ts` | `initSentry` 直接 return | 错误追踪 |
| `src/constants/keys.ts` | 移除硬编码密钥 | 密钥安全 |

#### API 服务模块 (5项)

| 文件 | 修改内容 | 说明 |
|------|---------|------|
| `src/services/api/grove.ts` | API 调用直接返回 | 通知服务 |
| `src/services/api/metricsOptOut.ts` | 直接返回禁用状态 | 指标检查 |
| `src/services/api/usage.ts` | 直接返回 null | 用量查询 |
| `src/services/api/bootstrap.ts` | 直接返回 | 引导配置 |
| `src/utils/fastMode.ts` | 直接返回禁用状态 | 快速模式 |

#### 其他模块 (5项)

| 文件 | 修改内容 | 说明 |
|------|---------|------|
| `src/components/Feedback.tsx` | 移除 Anthropic POST | 反馈功能 |
| `src/utils/apiPreconnect.ts` | 移除 HEAD 请求 | 预连接 |
| `src/services/mcp/officialRegistry.ts` | 直接返回 | MCP 注册表 |
| `src/services/policyLimits/index.ts` | 直接返回 | 策略限制 |
| `src/buddy/companionReact.ts` | 移除 fetch 调用 | Buddy react |

### 3.3 修改示例

#### 示例 1: Analytics 事件记录

```typescript
// 修改前
export function logEvent(
  eventName: string,
  metadata: LogEventMetadata,
): void {
  if (sink === null) {
    eventQueue.push({ eventName, metadata, async: false })
    return
  }
  sink.logEvent(eventName, metadata)
}

// 修改后
export function logEvent(
  _eventName: string,
  _metadata: LogEventMetadata,
): void {
  // [SECURITY PATCH] Disabled - all telemetry reporting has been removed
  return
}
```

#### 示例 2: GrowthBook 初始化

```typescript
// 修改前
export const initializeGrowthBook = memoize(
  async (): Promise<GrowthBook | null> => {
    let clientWrapper = getGrowthBookClient()
    if (!clientWrapper) {
      return null
    }
    // ... 连接远程服务器
  },
)

// 修改后
export const initializeGrowthBook = memoize(
  async (): Promise<GrowthBook | null> => {
    // [SECURITY PATCH] Disabled - all telemetry reporting has been removed
    return null
  },
)
```

#### 示例 3: 硬编码密钥移除

```typescript
// 修改前
export function getGrowthBookClientKey(): string {
  const adapterKey = process.env.CLAUDE_GB_ADAPTER_KEY
  if (adapterKey) return adapterKey
  return process.env.USER_TYPE === 'ant'
    ? isEnvTruthy(process.env.ENABLE_GROWTHBOOK_DEV)
      ? 'sdk-yZQvlplybuXjYh6L'
      : 'sdk-xRVcrliHIlrg4og4'
    : 'sdk-zAZezfDKGoZuXXKe'
}

// 修改后
export function getGrowthBookClientKey(): string {
  const adapterKey = process.env.CLAUDE_GB_ADAPTER_KEY
  if (adapterKey) return adapterKey
  // [SECURITY PATCH] Removed hardcoded SDK keys
  return ''
}
```

### 3.4 不修改的部分

以下模块**保持不变**，因为它们是用户主动使用的功能性需求：

| 模块 | 原因 |
|------|------|
| OAuth 认证流程 | 用户主动登录所需 |
| API 请求本身 | 用户正常使用 Claude API 所需 |
| MCP 连接 | 用户主动配置的功能性连接 |
| Bridge/远程控制 | 用户主动使用的功能 |

---

## 四、验证与测试

### 4.1 编译验证

```bash
cd e:\AiClient\claude-code-best
bun install
bun run build
```

结果：✅ 编译成功，无错误

### 4.2 功能验证

| 测试项 | 结果 |
|-------|------|
| 应用启动 | ✅ 正常 |
| CLI 命令 | ✅ 正常 |
| API 调用 | ✅ 正常 |
| MCP 连接 | ✅ 正常 |
| OAuth 登录 | ✅ 正常 |

### 4.3 安全验证

使用网络抓包工具验证：

```bash
# 启动应用后检查网络连接
netstat -ano | findstr "anthropic"
```

结果：✅ 无非预期的 Anthropic 服务器连接

---

## 五、未来展望

### 5.1 短期计划

#### 5.1.1 配合 Claude-Code-Router 使用国产模型

```powershell
# 启动 CCR
ccr start

# 配置环境变量
$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:3456"
$env:ANTHROPIC_AUTH_TOKEN = "your-ccr-password"

# 启动 CCB
bun run dev
```

#### 5.1.2 CCR 配置示例

```json
{
  "Providers": [
    {
      "name": "zhipu",
      "api_base_url": "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      "api_key": "your-zhipu-api-key",
      "models": ["glm-4-plus", "glm-4-flash"],
      "transformer": {
        "use": [["maxtoken", { "max_tokens": 65536 }], "enhancetool"]
      }
    }
  ],
  "Router": {
    "default": "zhipu,glm-4-plus",
    "background": "zhipu,glm-4-flash"
  }
}
```

### 5.2 中期计划

#### 5.2.1 增强隐私控制

- 添加全局遥测开关，真正禁用所有数据上报
- 提供详细的隐私政策说明
- 在首次运行时明确告知用户数据收集情况

#### 5.2.2 代码审计

- 对修改后的代码进行安全审计
- 检查是否有遗漏的数据上报点
- 验证所有修改的安全性

### 5.3 长期计划

#### 5.3.1 本地化功能

- 减少对远程功能开关的依赖
- 实现本地化的配置管理
- 提供离线模式支持

#### 5.3.2 社区贡献

- 将安全修补贡献回上游项目
- 建立安全审计流程
- 定期更新安全补丁

#### 5.3.3 文档完善

- 提供详细的安全配置指南
- 编写开发者安全最佳实践
- 建立安全漏洞报告机制

---

## 六、附录

### 6.1 修改文件完整列表

```
src/buddy/companionReact.ts
src/components/Feedback.tsx
src/constants/keys.ts
src/services/analytics/datadog.ts
src/services/analytics/firstPartyEventLogger.ts
src/services/analytics/firstPartyEventLoggingExporter.ts
src/services/analytics/growthbook.ts
src/services/analytics/index.ts
src/services/analytics/sink.ts
src/services/api/bootstrap.ts
src/services/api/grove.ts
src/services/api/metricsOptOut.ts
src/services/api/usage.ts
src/services/mcp/officialRegistry.ts
src/services/policyLimits/index.ts
src/utils/apiPreconnect.ts
src/utils/fastMode.ts
src/utils/sentry.ts
```

### 6.2 Git 提交信息

```
security: disable all telemetry and data reporting

- Disabled analytics event logging (logEvent, logEventAsync)
- Disabled analytics sink initialization
- Disabled 1P event logger and exporter
- Disabled Datadog tracking
- Disabled GrowthBook remote communication
- Disabled Sentry error reporting
- Disabled Grove notification service
- Disabled metrics opt-out check
- Disabled Feedback data submission
- Disabled API preconnect
- Disabled fast mode remote check
- Disabled bootstrap remote config
- Disabled MCP official registry prefetch
- Disabled policy limits remote fetch
- Disabled buddy react API
- Removed hardcoded GrowthBook SDK keys

All changes are marked with [SECURITY PATCH] comments.
```

### 6.3 参考资料

- [Claude-Code-Router 项目](https://github.com/musistudio/claude-code-router)
- [Anthropic API 文档](https://docs.anthropic.com/)
- [OWASP 安全最佳实践](https://owasp.org/)

---

## 七、致谢

感谢所有参与安全审计和代码审查的贡献者。

---

*本文档由 Claude-Code-Best 安全团队维护*
