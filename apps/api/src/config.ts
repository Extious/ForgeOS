import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required("DATABASE_URL", "postgres://forgeos:forgeos@localhost:5432/forgeos"),
  redisUrl: required("REDIS_URL", "redis://localhost:6379"),
  maxConcurrentTasksPerUser: Number(process.env.MAX_CONCURRENT_TASKS_PER_USER ?? 2)
};
