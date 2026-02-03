import type { PlatformClient } from "./client";
import type { Task, IdResponse } from "./types";

/**
 * API for managing tasks within workflows.
 *
 * @example
 * ```typescript
 * const client = new PlatformClient({ apiKey: 'your-key' });
 *
 * // Create a task
 * const task = await client.tasks.create({
 *   workflowId: 123,
 *   agentId: 456,
 *   description: 'Process the data',
 *   body: 'Additional details'
 * });
 *
 * // Create a task with dependencies
 * const task2 = await client.tasks.create({
 *   workflowId: 123,
 *   agentId: 456,
 *   description: 'Follow-up task',
 *   dependencies: [task.id]
 * });
 * ```
 */
export class TasksAPI {
  constructor(private client: PlatformClient) {}

  /**
   * Create a new task in a workflow.
   * @param params - Parameters object
   * @param params.workflowId - The workflow ID to create the task in
   * @param params.agentId - The agent ID to assign the task to
   * @param params.description - Short description of the task
   * @param params.body - Detailed task body (defaults to description)
   * @param params.input - Input data for the task
   * @param params.dependencies - Array of task IDs this task depends on
   * @returns The created task
   */
  async create(params: {
    workflowId: number | string;
    agentId: number | string;
    description: string;
    body?: string;
    input?: string;
    dependencies?: (number | string)[];
  }): Promise<Task> {
    const { workflowId, agentId, description, body, input, dependencies } =
      params;

    const data = await this.client.post<IdResponse>(
      `/workspaces/${workflowId}/task`,
      {
        assignee: typeof agentId === "string" ? parseInt(agentId) : agentId,
        description: description,
        body: body || description,
        input: input || "",
        outputOptions: {
          default: {
            name: "Task Output",
            type: "text",
            instructions: "Complete the task and provide output",
          },
        },
        dependencies: dependencies || [],
      },
    );

    return this.get({ workflowId, id: data.id });
  }

  /**
   * Get a task by ID.
   * @param params - Parameters object
   * @param params.workflowId - The workflow ID
   * @param params.id - The task ID
   * @returns The task
   */
  async get(params: {
    workflowId: number | string;
    id: number | string;
  }): Promise<Task> {
    return this.client.get<Task>(
      `/workspaces/${params.workflowId}/tasks/${params.id}`,
    );
  }

  /**
   * List all tasks in a workflow.
   * @param params - Parameters object
   * @param params.workflowId - The workflow ID
   * @returns Array of tasks
   */
  async list(params: { workflowId: number | string }): Promise<Task[]> {
    return this.client.get<Task[]>(`/workspaces/${params.workflowId}/tasks`);
  }

  /**
   * Update an existing task.
   * @param params - Parameters object
   * @param params.workflowId - The workflow ID
   * @param params.id - The task ID to update
   * @param params.description - New description (optional)
   * @param params.body - New body (optional)
   * @param params.input - New input (optional)
   * @param params.status - New status (optional)
   * @param params.assigneeAgentId - New assignee agent ID (optional)
   * @param params.dependencies - New dependencies (optional)
   * @returns The updated task
   */
  async update(params: {
    workflowId: number | string;
    id: number | string;
    description?: string;
    body?: string;
    input?: string;
    status?: string;
    assigneeAgentId?: number;
    dependencies?: number[];
  }): Promise<Task> {
    const { workflowId, id, ...data } = params;
    await this.client.put(`/workspaces/${workflowId}/tasks/${id}`, data);
    // PUT returns success message for user auth, fetch the updated task
    return this.get({ workflowId, id });
  }

  /**
   * Delete a task.
   * @param params - Parameters object
   * @param params.workflowId - The workflow ID
   * @param params.id - The task ID to delete
   */
  async delete(params: {
    workflowId: number | string;
    id: number | string;
  }): Promise<void> {
    await this.client.delete(
      `/workspaces/${params.workflowId}/tasks/${params.id}`,
    );
  }
}
