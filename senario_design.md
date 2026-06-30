针对您希望搭建本地自托管沙箱（Self-hosted sandbox）集群并验证 Claude Managed Agents (CMA) 多智能体协作设计的需求，建议采用 “企业级自动化合规与漏洞审计” 这一长时运行（Long-running）场景。

该场景能深度验证从物理执行层到逻辑编排层的完整链路。以下是基于源代码的详细设计建议：

### 一、 物理运行环境：基于 OpenShell 的安全集群
要搭建自托管集群，物理层的核心是实现“思考在云端，执行在本地”。

   基础驱动选择：
       起步阶段（单个节点）：在开发笔记本上使用 Podman 驱动 运行 OpenShell。它支持无根（rootless）容器，并利用 Linux 内核的 Landlock 和 SELinux 提供隔离。
       集群阶段：部署到 Red Hat OpenShift 上，利用 OpenShift 驱动 将沙箱作为 Kubernetes Pod 运行。
   安全加固（关键验证点）：
       OpenShell 运行时：必须通过 OpenShell 封装执行环境。它提供内核级防御，包括 seccomp 系统调用过滤、网络命名空间隔离和 L7 HTTP 检查。
       凭据隔离：验证本地 Vault 是否能成功通过 OpenShell 代理向外发请求注入凭据，而沙箱内的代码无法触及这些密钥。

### 二、 逻辑架构设计：多智能体协作模型
设计一个 “1 Session  N Agents  N Threads” 的逻辑结构：

   协调员智能体 (Coordinator)：负责整体审计任务的拆解与委派，运行在主线程。
   安全扫描智能体 (Security Agent)：专注于代码漏洞扫描，拥有私有的 Bash 工具和特定的权限策略。
   文档合规智能体 (Compliance Agent)：利用 File operations 工具读取本地敏感文档并与合规标准比对。
   网络探测智能体 (Network Agent)：尝试访问本地 VPC 内部服务，验证其在不可公开路由网络下的执行能力。

### 三、 验证场景：长时运行的“全自动代码库合规检查”
此场景通常需要数分钟甚至数小时，涉及多次工具调用，是验证 CMA 优势的绝佳案例。

#### 1. 执行编排流程验证
1.  初始化：本地 Environment Worker 启动，通过轮询（Poll）机制连接 Anthropic 云端。
2.  并行执行 (Parallelization)：协调员智能体同时唤起安全和合规子智能体。验证系统是否能处理多达 25 个并发会话线程 且共享同一个本地文件系统。
3.  状态持久化：在审计中途人工干预（Interrupt）或由于网络波动导致 Harness 崩溃。验证新启动的 Harness 是否能通过 `wake(sessionId)` 从云端的 Session Log 中完美找回记忆并继续审计。

#### 2. “候补化”故障恢复验证 (Cattle vs. Pets)
   操作：在智能体执行大规模文件处理时，手动强制关闭 Podman 容器或 Pod。
   预期：云端 Harness 应捕获该工具调用错误，并自动调用 `provision({resources})` 重新拉起一个新的物理沙箱环境恢复工作，而任务上下文不会丢失。

#### 3. 安全防御边界验证
   模拟注入：通过系统提示词模拟一个“被恶意注入”的任务，尝试读取系统 `etcshadow` 文件或向外部非法 IP 发送数据。
   验证：利用 OpenShell 的 “默认拒绝一切 (Deny-all)” 策略和 Landlock 限制，观察其是否能准确拦截非法 syscall 和网络出口。

### 四、 总结：设计的核心价值
通过该场景，您可以验证：
   数据主权：所有被审计的代码和文档是否始终留在您的本地基础设施内，只有脱敏后的推理结果返回云端。
   解耦性能：观察在“多大脑（Many brains）”模式下，通过延迟拉起沙箱，首个 Token 的响应延迟（TTFT）是否如预期般大幅下降。
   架构弹性：系统是否能从物理环境（沙箱）或逻辑环境（Harness）的失效中自动平滑恢复。