# 类 T3 Code 平台的沙盒隔离与多用户并发架构

## 1. 整体架构

采用 **控制平面（Control Plane）+ 沙盒执行环境（Sandbox）+ 任务调度器（Scheduler）+ 持久化存储** 的架构，实现多用户、多项目、多 Agent 的远程并发运行。

## 2. 沙盒隔离

- **隔离粒度**：每个用户的每个项目运行在独立 Sandbox 中。
- **隔离技术**：
  - Docker：资源开销低，适合初期开发和可信环境。
  - Firecracker microVM：安全隔离更强，适合公网多租户 SaaS。
- **隔离范围**：文件系统、进程、网络、环境变量、API Key、CPU 和内存。
- **多 Agent 协作**：同一项目允许多个 Agent 并行运行，通过 Git Worktree 隔离代码修改；如需安全隔离，则使用独立 Sandbox。

## 3. 多用户并发

- **任务队列**：使用 Redis 管理 Agent 任务，支持排队、重试和状态追踪。
- **资源调度**：使用 Kubernetes 管理 Sandbox 的创建、销毁、资源分配和扩缩容。
- **并发控制**：限制每个用户的最大并发任务数，以及 CPU、内存和存储配额。
- **公平调度**：采用用户级配额与公平队列，避免单个用户占用全部资源。
- **状态管理**：通过 PostgreSQL 保存用户、项目、任务和会话信息，通过 WebSocket 推送实时执行状态。

## 4. 资源优化

- **按需启动**：只有执行任务时才启动 Sandbox。
- **空闲休眠**：长时间无任务时自动停止运行环境。
- **持久化存储**：项目文件和会话状态独立保存，避免 Sandbox 释放后数据丢失。
- **环境复用**：同一项目的多个任务可复用 Sandbox，减少启动开销。
- **自动扩缩容**：根据活跃任务数量动态调整计算资源。

## 5. 推荐技术栈

| 模块 | 推荐技术 |
|---|---|
| 前端 | React / Electron |
| 后端 | Node.js / TypeScript |
| 身份认证 | OAuth / JWT |
| 数据库 | PostgreSQL |
| 任务队列 | Redis + BullMQ |
| 沙盒隔离 | Docker / Firecracker |
| 集群调度 | Kubernetes |
| 持久化存储 | Persistent Volume / S3 |
| 实时通信 | WebSocket |
| 多 Agent 协作 | Git Worktree |

## 6. 实施路线

**第一阶段：MVP**

使用 Docker + Redis + PostgreSQL，实现基础的项目隔离、Agent 执行和多用户并发控制。

**第二阶段：规模化**

引入 Kubernetes，实现多节点资源调度、资源配额、自动扩缩容和故障恢复。

**第三阶段：生产级多租户**

引入 Firecracker microVM 或托管沙盒平台，完善安全隔离、网络策略、密钥管理、沙盒休眠与恢复机制。

## 7. 核心设计原则

**一个用户可以拥有多个项目，一个项目对应一个独立 Sandbox，一个 Sandbox 可以运行多个 Agent；所有 Sandbox 由统一调度器管理，实现安全隔离、资源共享和弹性并发。**