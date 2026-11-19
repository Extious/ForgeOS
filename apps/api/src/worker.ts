import { Worker } from "bullmq";
import { config } from "./config.js";
import { closeDatabase, query } from "./db.js";

const worker = new Worker(
  "agent-tasks",
  async (job) => {
    const { taskId } = job.data as { taskId: string };
    await query("UPDATE tasks SET status = 'running', updated_at = NOW() WHERE id = $1", [taskId]);

    try {
      // This is the integration point for a Docker/Firecracker sandbox runner.
      await query("UPDATE tasks SET status = 'completed', updated_at = NOW() WHERE id = $1", [taskId]);
    } catch (error) {
      await query("UPDATE tasks SET status = 'failed', updated_at = NOW() WHERE id = $1", [taskId]);
      throw error;
    }
  },
  { connection: { url: config.redisUrl }, concurrency: 4 }
);

worker.on("completed", (job) => console.log(`Task ${job.id} completed`));
worker.on("failed", (job, error) => console.error(`Task ${job?.id ?? "unknown"} failed`, error));

async function shutdown(): Promise<void> {
  await worker.close();
  await closeDatabase();
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
