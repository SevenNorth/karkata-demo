# Karkata Demo 协作约定

## 目标

这是 Karkata 的真实使用演示项目。浏览器运行 Karkata Agent，后端只提供 GitHub 登录、受限 LLM Proxy、会话额度和安全审计；不得把 Agent 主循环迁移到后端来替代 Karkata 的浏览器运行场景。

## 目录边界

- `web/`：浏览器 UI、Karkata Agent、浏览器安全工具和 SSE 客户端。
- `server/`：GitHub OAuth、应用 Session、LLM Proxy、限流、额度和审计。
- `spec/`：方案、接口契约、风险记录和验收标准。
- `shared/`：仅放前后端共享的无密钥类型与安全常量。

## 安全不变量

- Provider API Key 只存在于服务端密钥管理或环境变量，绝不进入浏览器、Cookie、SSE、状态、日志或错误。
- Proxy 只允许固定的上游 origin；禁止客户端传入 `baseURL`、Provider Header、Authorization 或任意 URL。
- 客户端 `model` 只是可选请求元数据；服务端可以忽略、覆盖、映射或拒绝，不能把它当作授权依据。
- 浏览器提交的 `messages`、`tools`、`systemPrompt`、`maxSteps`、`timeoutMs`、`sessionId` 和 `runId` 都是不可信输入，服务端必须重新校验并应用服务端上限。
- GitHub OAuth 必须校验 `state`、严格匹配 `redirect_uri`，并使用可撤销、过期的 HttpOnly、Secure、SameSite Session Cookie。
- LLM Proxy 必须执行用户/IP/全站限流、单用户并发限制、请求体与输出限制，以及请求前额度预占和请求后实际用量结算。
- SSE 客户端断开时必须取消上游请求；取消不声称撤销已经产生的 Provider 费用或外部副作用。
- 浏览器工具只能处理公开、只读、低风险能力；支付、删除、写库、发信和内部 API 操作不得由浏览器 Agent 直接执行。
- 日志只记录 request id、用户 id、状态、耗时、usage 摘要和错误分类；不得记录完整 prompt、响应、Cookie、Authorization、Key 或敏感工具结果。

## 开发流程

- 先阅读 `spec/` 中与任务相关的方案，再修改代码。
- 新增接口、认证、额度、Proxy 或跨端行为时，先更新 spec 和测试，再实现。
- 使用确定性的本地假 Provider、假 GitHub OAuth 和固定时钟测试；默认测试不得调用真实 Provider。
- 每个行为先写失败测试，再实现最小变更；完成后运行前后端测试和安全检查。
- 真实 Provider smoke 只能显式运行，并通过环境变量注入凭据；不得把密钥写入文件或提交。
- 不提交 `.env`、构建产物、coverage、缓存、OAuth token、Provider Key 或完整请求/响应样本。

## 默认产品策略

- 第一版只支持 GitHub 登录用户，不开放匿名真实模型调用。
- 第一版固定一个服务端 Provider 和默认模型；是否接受客户端 `model` 由服务端白名单策略决定。
- 第一版每用户同时最多一个运行，单次运行有固定步骤、时长、输入、输出和费用上限。
- 额度不足、限流、未认证和上游失败都返回脱敏的结构化错误。

