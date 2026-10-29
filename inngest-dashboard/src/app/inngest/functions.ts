import { inngest } from "./client";

export const simpleGreeter = inngest.createFunction(
  {
    id: "simple-greeter",
    name: "Simple Greeter",
    triggers: [{ event: "greet/user" }],
  },
  async ({ event, step }: { event: { data?: { name?: string } }; step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> } }) => {
    // Step 1: Durable greeting step with auto-retry
    const greeting = await step.run("say-hello", async () => {
      const name = event.data?.name ?? "World";
      return {
        message: `Hello, ${name}! Welcome to Inngest for AI Agents.`,
        timestamp: new Date().toISOString(),
        model: "gpt-4o",
        tokens: 42,
      };
    });

    // Step 2: A second durable step (e.g., post-processing)
    const result = await step.run("process-response", async () => {
      return {
        status: "completed",
        data: greeting,
        retries: 0,
        duration_ms: Math.floor(Math.random() * 300) + 50,
      };
    });

    return result;
  }
);
