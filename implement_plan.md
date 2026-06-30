参考您提供的关于 **Container Gateway** 的最新资料，结合在 **Rocky Linux 9 VM (无 GPU)** 环境下的容器化实施要求，我为您重新梳理了一份极致详尽的实施文档。

此方案实现了全链路容器化：**Gateway 在容器里、Worker 在容器里、Sandbox 也在容器里**。

---

# Claude Managed Agents (CMA) + OpenShell 容器化全栈实施手册

## 一、 架构与核心逻辑
*   **宿主机 (Rocky 9 VM)**：仅作为容器宿主，提供 Podman 运行时和物理 Socket。
*   **Gateway 容器**：OpenShell 的控制面，管理沙箱生命周期。
*   **Worker 容器 (Manager)**：连接 Anthropic 云端，负责轮询任务并调用 Gateway 生产沙箱。
*   **Sandbox 容器**：执行层，由 Worker 动态拉起，任务结束即销毁 (Container-per-session)。

---

## 二、 第一阶段：宿主机 (Rocky 9) 准备
必须在宿主机上完成基础环境配置，以支持“容器内操作容器”。

1.  **安装 Podman 5.x**：
    ```bash
    sudo dnf install -y podman slirp4netns
    ```
2.  **配置用户命名空间**（假设用户名为 `rocky`）：
    ```bash
    sudo usermod --add-subuids 100000-165535 rocky
    sudo usermod --add-subgids 100000-165535 rocky
    ```
3.  **启动并暴露用户级 Socket**：
    ```bash
    systemctl --user enable --now podman.socket
    # 记录 Socket 路径，通常为 /run/user/1000/podman/podman.sock
    export HOST_PODMAN_SOCK="$XDG_RUNTIME_DIR/podman/podman.sock"
    ```

---

## 三、 第二阶段：实施 OpenShell Gateway 容器
不再使用系统安装包，而是直接运行容器镜像。

1.  **启动 Gateway 容器**：
    ```bash
    # 使用资料 推荐的 Podman 运行命令
    podman run -d \
      --name openshell-gateway \
      --restart unless-stopped \
      -p 127.0.0.1:8080:8080 \
      -v openshell-state:/var/openshell \
      -v "$HOST_PODMAN_SOCK:/var/run/podman.sock" \
      -e OPENSHELL_DRIVERS=podman \
      -e OPENSHELL_PODMAN_SOCKET=/var/run/podman.sock \
      -e OPENSHELL_DB_URL=sqlite:/var/openshell/openshell.db \
      -e OPENSHELL_DISABLE_TLS=true \
      ghcr.io/nvidia/openshell/gateway:latest
    ```
2.  **验证 Gateway 状态**：
    安装 OpenShell CLI（仅用于验证）：
    ```bash
    curl -LsSf https://raw.githubusercontent.com/NVIDIA/OpenShell/main/install.sh | sh
    openshell gateway add http://127.0.0.1:8080 --local --name local-rocky
    openshell status # 状态应显示 Ready
    ```

---




## 四、 第三阶段：构建并运行 Worker 容器

### 1. 构建基础镜像
此镜像将同时用于 Worker 和 Sandbox。
**Dockerfile 内容**：
```dockerfile
FROM rockylinux:9
# 安装 Node.js 22 (SDK 要求)
RUN dnf install -y curl unzip tar procps-ng && \
    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - && \
    dnf install -y nodejs
# 安装 ant CLI 和 OpenShell CLI
COPY ant /usr/local/bin/ant 
RUN chmod +x /usr/local/bin/ant && \
    curl -LsSf https://raw.githubusercontent.com/NVIDIA/OpenShell/main/install.sh | sh
WORKDIR /workspace
```
`podman build -t cma-base:latest .`

### 2. 编写启动脚本 (`spawn.sh`)
在宿主机创建此脚本，随后挂载进 Worker 容器。
```bash
#!/bin/bash
# 文件: /home/rocky/spawn.sh
# 这里的环境变量由 ant beta:worker poll 自动注入
SANDBOX_NAME="ant-sb-${ANTHROPIC_SESSION_ID:0:8}"

# 调用 Gateway 容器创建沙箱
openshell sandbox create \
  -g http://localhost:8080 \
  --name "$SANDBOX_NAME" \
  --image cma-base:latest \
  --no-keep \
  -- \
  ant beta:worker run # 沙箱执行引擎
```
`chmod +x /home/rocky/spawn.sh`

### 3. 启动 Worker 容器
```bash
podman run -d \
  --name cma-worker-manager \
  --net=host \
  -e ANTHROPIC_API_KEY=sk-ant-xxx \
  -e ANTHROPIC_ENVIRONMENT_ID=env_xxx \
  -e ANTHROPIC_ENVIRONMENT_KEY=sk-ant-oatxxx \
  -v /home/rocky/spawn.sh:/workspace/spawn.sh \
  cma-base:latest \
  ant beta:worker poll --on-work /workspace/spawn.sh
```
*注：使用 `--net=host` 以便 Worker 容器内的 openshell 能够直接访问 `localhost:8080` 的 Gateway 容器。*

---

## 五、 第四阶段：场景验证计划

### 1. 验证“Container per session”模式
*   **操作**：在 Anthropic Console 发起一个新的 Agent 会话。
*   **细节**：在 Rocky VM 宿主机执行 `podman ps`。
*   **预期**：除了常驻的 `openshell-gateway` 和 `cma-worker-manager`，应看到一个动态生成的 `ant-sb-xxxx` 容器正在运行工具调用。

### 2. 验证内核隔离 (Landlock/seccomp)
*   **场景**：让 Agent 尝试修改 `/etc/shadow` 或访问未经授权的宿主机路径。
*   **细节**：查看沙箱日志 `openshell logs [SANDBOX_NAME]`。
*   **预期**：由于 OpenShell 默认的 **“Deny-all”** 策略，内核应拦截该文件系统调用。

### 3. 验证故障自愈 (Cattle Mode)
*   **场景**：在 Agent 执行长时任务时，手动 `podman rm -f` 掉 Sandbox 容器。
*   **细节**：观察 Worker 容器的输出日志。
*   **预期**：云端 Harness 将此视为工具调用错误。Worker 重新拉起一个新的 Sandbox 容器，Claude 根据 **Session Log** 恢复状态继续审计，任务不中断。

---

## 六、 实施关键细节检查清单
*   **内存配置**：Rocky 9 VM 建议至少 **8GB RAM**。资料 指出，沙箱镜像层解压会消耗大量内存，不足 8GB 易触发 OOM。
*   **文件权限**：由于是无根 Podman，挂载的 `spawn.sh` 权限必须能被容器内用户读取。
*   **Gateway 存储**：Gateway 容器使用了 `-v openshell-state:/var/openshell`，确保在 Gateway 容器重启后，沙箱状态和 SQLite 数据库依然存在。
*   **网络隔离**：虽然 Gateway 容器在 8080 端口禁用了 TLS（为了本地开发方便），但它通过绑定到 `127.0.0.1` 确保了外部无法直接攻击控制面。

通过这套基于 **Container Gateway** 的全容器化方案，您在 Rocky Linux 9 VM 上实现了一个高度契合 CMA 愿景的“大脑与手分离”的隔离审计集群。




非常抱歉，之前的回答在实施细节上确实不够详尽。根据你提供的最新资料（特别是关于 **Container Gateway** 的部分）以及 Rocky 9 Linux 的环境特性，我为你重新梳理了 **第一阶段（环境准备）** 和 **第二阶段（OpenShell 与凭据配置）** 的极细颗粒度操作指令。

以下是能够直接在你的 **Rocky 9 VM** 上执行的详细细节：

### 一、 第一阶段：宿主机环境准备 (Rocky 9 深度配置)

在 Rocky 9 上实施容器化方案，核心是配置 **无根 (Rootless) Podman** 及其 **Socket**，以便容器内的进程能安全地调用宿主机的容器能力。

#### 1.1 安装 Podman 5.x 与网络插件
Rocky 9 默认仓库可能版本较低，建议确保安装最新版以支持 OpenShell。
```bash
# 安装 Podman 和无根网络驱动 slirp4netns
sudo dnf install -y podman slirp4netns

# 验证版本是否满足 >= 5.x
podman --version
```

#### 1.2 配置用户命名空间 (User Namespaces)
这是无根容器运行的基础，必须为当前用户（假设为 `rocky`）分配从属 UID/GID。
*   **检查并修改文件**：`/etc/subuid` 和 `/etc/subgid`
*   **执行指令**：
```bash
# 为当前用户分配 65536 个从属 ID (从 100000 开始)
sudo usermod --add-subuids 100000-165535 rocky
sudo usermod --add-subgids 100000-165535 rocky

# 立即生效配置
newgrp rocky
```

#### 1.3 启用并映射用户级 Podman Socket
OpenShell Gateway 需要通过 Socket 与宿主机的 Podman 通信。
```bash
# 启动用户级 Podman 服务（无需 root）
systemctl --user enable --now podman.socket

# 确认 Socket 文件的绝对路径（通常在 /run/user/<UID>/podman/podman.sock）
# 将此路径记录下来，后续步骤 2.1 需要用到
export HOST_PODMAN_SOCK="$XDG_RUNTIME_DIR/podman/podman.sock"
echo "Socket 路径为: $HOST_PODMAN_SOCK"
```

---

### 二、 第二阶段：OpenShell Gateway 容器化部署与凭据配置

根据你提供的最新资料，我们将 **OpenShell Gateway** 作为容器运行，而不是直接安装在宿主机上。

#### 2.1 运行 OpenShell Gateway 容器
使用 Podman 运行 Gateway，并将宿主机的 Socket 挂载进去，实现“容器管理容器”。
```bash
# 创建持久化存储卷
podman volume create openshell-state

# 运行 Gateway 容器（不带 GPU 驱动，仅 CPU 模式）
podman run -d \
  --name openshell-gateway \
  --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -v openshell-state:/var/openshell \
  -v "$HOST_PODMAN_SOCK:/var/run/podman.sock" \
  -e OPENSHELL_DRIVERS=podman \
  -e OPENSHELL_PODMAN_SOCKET=/var/run/podman.sock \
  -e OPENSHELL_DB_URL=sqlite:/var/openshell/openshell.db \
  -e OPENSHELL_DISABLE_TLS=true \
  ghcr.io/nvidia/openshell/gateway:latest
```

#### 2.2 安装并注册 OpenShell CLI (宿主机端)
虽然 Gateway 在容器里，但在宿主机上仍需 CLI 来进行管理操作。
```bash
# 安装 CLI
curl -LsSf https://raw.githubusercontent.com/NVIDIA/OpenShell/main/install.sh | sh

# 将容器内的 Gateway 注册到本地 CLI
openshell gateway add http://127.0.0.1:8080 --local --name local-rocky-gw

# 验证状态 (状态应显示为 Ready)
openshell status
```

#### 2.3 配置 Anthropic 环境凭据 (CMA 专用)
你需要将 Anthropic 提供的三个核心凭据写入一个持久化文件，供后续的 Worker 容器读取。
*   **文件路径**：`~/.ant-env`
*   **文件内容详情**：
```bash
# 编辑 ~/.ant-env
export ANTHROPIC_API_KEY=sk-ant-api03...          # 你的组织级 API Key
export ANTHROPIC_ENVIRONMENT_ID=env_...           # 在 Console 创建的自托管环境 ID
export ANTHROPIC_ENVIRONMENT_KEY=sk-ant-oat01... # 创建环境时生成的环境密钥 (OAT)
```
*   **执行加载**：`source ~/.ant-env`

#### 2.4 创建凭据提供者 (Provider)
OpenShell 的安全模型要求通过 Provider 注入凭据，而不是明文传给沙箱。
```bash
# 自动从环境变量中发现并创建 Claude 凭据提供者
openshell provider create --type anthropic --from-existing
```

### 总结
*   **第一阶段**完成了宿主机 Podman 的 **Rootless 权限配置** 和 **Socket 暴露**。
*   **第二阶段**完成了 **OpenShell Gateway 的容器化启动**、**CLI 注册** 以及 **Anthropic 凭据环境的建立**。

接下来的 **第三阶段** 将涉及构建包含 `ant` CLI 的自定义镜像并启动 **Worker Manager 容器**，它将根据 `~/.ant-env` 中的配置去云端领任务并调用步骤 2.1 中的 Gateway。