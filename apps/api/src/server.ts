import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import { WebSocketServer } from "ws";
import { config } from "./config.js";
import { closeDatabase, query } from "./db.js";
import { taskQueue } from "./queue.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (_request, response) => {
  try {
    await query("SELECT 1");
    response.json({ status: "ok", services: { database: "ok", queue: "configured" } });
  } catch (error) {
    console.error("Health check failed", error);
    response.status(503).json({ status: "degraded", services: { database: "unavailable" } });
  }
});

app.get("/api/projects", async (request, response) => {
  const userId = String(request.header("x-user-id") ?? "local-user");
  const result = await query(
    "SELECT id, name, repository_url, created_at FROM projects WHERE user_id = $1 ORDER BY created_at DESC",
    [userId]
  );
  response.json(result.rows);
});

app.post("/api/projects", async (request, response) => {
  const userId = String(request.header("x-user-id") ?? "local-user");
  const { name, repositoryUrl } = request.body as { name?: unknown; repositoryUrl?: unknown };
  if (typeof name !== "string" || name.trim().length === 0) {
    response.status(400).json({ error: "name is required" });
    return;
  }

  const result = await query(
    "INSERT INTO projects (id, user_id, name, repository_url) VALUES ($1, $2, $3, $4) RETURNING id, name, repository_url, created_at",
    [randomUUID(), userId, name.trim(), typeof repositoryUrl === "string" ? repositoryUrl : null]
  );
  response.status(201).json(result.rows[0]);
});

app.post("/api/projects/:projectId/tasks", async (request, response) => {
  const userId = String(request.header("x-user-id") ?? "local-user");
  const projectId = String(request.params.projectId);
  const { prompt } = request.body as { prompt?: unknown };
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    response.status(400).json({ error: "prompt is required" });
    return;
  }

  const project = await query<{ id: string }>(
    "SELECT id FROM projects WHERE id = $1 AND user_id = $2",
    [projectId, userId]
  );
  if (project.rowCount === 0) {
    response.status(404).json({ error: "project not found" });
    return;
  }

  const active = await query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM tasks WHERE user_id = $1 AND status IN ('queued', 'running')",
    [userId]
  );
  if (Number(active.rows[0]?.count ?? 0) >= config.maxConcurrentTasksPerUser) {
    response.status(429).json({ error: "user task concurrency limit reached" });
    return;
  }

  const taskId = randomUUID();
  await query(
    "INSERT INTO tasks (id, project_id, user_id, prompt) VALUES ($1, $2, $3, $4)",
    [taskId, projectId, userId, prompt.trim()]
  );
  await taskQueue.add("run-agent", { taskId, projectId, userId, prompt: prompt.trim() }, { jobId: taskId });
  response.status(202).json({ id: taskId, status: "queued" });
});

app.get("/api/tasks/:taskId", async (request, response) => {
  const userId = String(request.header("x-user-id") ?? "local-user");
  const result = await query(
    "SELECT id, project_id, prompt, status, created_at, updated_at FROM tasks WHERE id = $1 AND user_id = $2",
    [request.params.taskId, userId]
  );
  if (result.rowCount === 0) {
    response.status(404).json({ error: "task not found" });
    return;
  }
  response.json(result.rows[0]);
});

const server = createServer(app);
const webSocketServer = new WebSocketServer({ server, path: "/ws" });
webSocketServer.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "connected" }));
});

server.listen(config.port, () => {
  console.log(`ForgeOS API listening on http://localhost:${config.port}`);
});

async function shutdown(): Promise<void> {
  await closeDatabase();
  await taskQueue.close();
  server.close();
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
