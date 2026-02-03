import type { PlatformClient } from "./client";
import type {
  WorkflowConfig,
  WorkflowData,
  TriggerDefinition,
  TaskDefinition,
  EdgeDefinition,
  Edge,
  IdResponse,
  Task,
} from "./types";
import { Workflow } from "./workflow";

/**
 * API for managing workflows on the OpenServ platform.
 *
 * @example
 * ```typescript
 * const client = new PlatformClient({ apiKey: 'your-key' });
 *
 * // Create a workflow
 * const workflow = await client.workflows.create({
 *   name: 'My Workflow',
 *   goal: 'Process data automatically',
 *   agentIds: [123, 456]
 * });
 *
 * // List all workflows
 * const workflows = await client.workflows.list();
 *
 * // Get a specific workflow
 * const workflow = await client.workflows.get({ id: 789 });
 * ```
 */
export class WorkflowsAPI {
  constructor(private client: PlatformClient) {}

  /**
   * Create a new workflow.
   *
   * Can create an empty workflow or a fully configured one with triggers, tasks, and edges.
   *
   * @param config - Workflow configuration
   * @param config.name - Name of the workflow
   * @param config.goal - Goal/description of what the workflow does
   * @param config.agentIds - Array of agent IDs to include in the workflow
   * @param config.triggers - Optional array of trigger definitions
   * @param config.tasks - Optional array of task definitions
   * @param config.edges - Optional array of edge definitions connecting nodes
   * @returns The created Workflow object
   *
   * @example
   * ```typescript
   * // Simple workflow
   * const workflow = await client.workflows.create({
   *   name: 'Data Pipeline',
   *   goal: 'Process incoming data',
   *   agentIds: [123]
   * });
   *
   * // Workflow with tasks
   * const workflow = await client.workflows.create({
   *   name: 'Data Pipeline',
   *   goal: 'Process incoming data',
   *   agentIds: [123],
   *   tasks: [{ name: 'process', agentId: 123, description: 'Process data' }]
   * });
   * ```
   */
  async create(config: WorkflowConfig): Promise<Workflow> {
    // Convert agentIds to the format expected by the API
    const agents = config.agentIds.map((id) => ({
      id: typeof id === "string" ? parseInt(id) : id,
    }));

    // First create the workspace
    const data = await this.client.post<IdResponse>(
      "/workspaces?isBlank=true",
      {
        name: config.name,
        goal: config.goal,
        agents,
        type: "node-ui",
      },
    );

    const workflowId = data.id;

    // If declarative config provided, sync it
    if (config.triggers || config.tasks || config.edges) {
      await this.syncInternal(workflowId, config);
    }

    // Fetch and return the complete workflow
    return this.get({ id: workflowId });
  }

  /**
   * Get a workflow by ID.
   * @param params - Parameters object
   * @param params.id - The workflow ID
   * @returns The Workflow object with full data including triggers, tasks, and edges
   */
  async get(params: { id: number | string }): Promise<Workflow> {
    const [workspace, tasks] = await Promise.all([
      this.client.get<any>(`/workspaces/${params.id}`),
      this.client
        .get<Task[]>(`/workspaces/${params.id}/tasks`)
        .catch(() => [] as Task[]),
    ]);

    // Extract triggers from workspace response (includes token in attributes.uiState)
    // The separate /triggers endpoint returns integration types, not actual triggers
    const workspaceTriggers = (workspace.triggers || []).map(
      (t: {
        id: string;
        name: string;
        description?: string | null;
        integrationConnection?: { id: string };
        props?: Record<string, unknown>;
        attributes?: { uiState?: { token?: string } };
        is_active?: boolean;
        state?: string;
      }) => ({
        id: t.id,
        name: t.name,
        description: t.description || undefined,
        token: t.attributes?.uiState?.token,
        integrationConnectionId: t.integrationConnection?.id || "",
        props: t.props || {},
        isActive: t.is_active,
        state: t.state,
      }),
    );

    const workflowData: WorkflowData = {
      id: workspace.id,
      name: workspace.name,
      goal: workspace.goal,
      status: workspace.executionState || "draft",
      triggers: workspaceTriggers,
      tasks: tasks || [],
      edges: workspace.workflow?.edges || [],
      agents: workspace.agents || [],
    };

    return new Workflow(workflowData, this.client);
  }

  /**
   * List all workflows owned by the authenticated user.
   * @returns Array of Workflow objects
   */
  async list(): Promise<Workflow[]> {
    const workspaces = await this.client.get<any[]>("/workspaces");
    const workflows: Workflow[] = [];

    for (const ws of workspaces) {
      workflows.push(await this.get({ id: ws.id }));
    }

    return workflows;
  }

  /**
   * Update workflow metadata.
   * @param params - Parameters object
   * @param params.id - The workflow ID to update
   * @param params.name - New name (optional)
   * @param params.goal - New goal (optional)
   * @returns The updated Workflow object
   */
  async update(params: {
    id: number | string;
    name?: string;
    goal?: string;
  }): Promise<Workflow> {
    const { id, name, goal } = params;
    // Get current workflow to preserve required fields
    const current = await this.get({ id });
    await this.client.put(`/workspaces/${id}`, {
      name: name ?? current.name,
      goal: goal ?? current.goal,
    });
    return this.get({ id });
  }

  /**
   * Delete a workflow.
   * @param params - Parameters object
   * @param params.id - The workflow ID to delete
   */
  async delete(params: { id: number | string }): Promise<void> {
    await this.client.delete(`/workspaces/${params.id}`);
  }

  /**
   * Set a workflow to running state.
   *
   * This activates the workflow so it can process triggers and execute tasks.
   *
   * @param params - Parameters object
   * @param params.id - The workflow ID
   */
  async setRunning(params: { id: number | string }): Promise<void> {
    await this.client.put(`/workspaces/${params.id}/execution-state`, {
      executionState: "running",
    });
  }

  /**
   * Connect edges in the workflow graph.
   * @param params - Parameters object
   * @param params.id - The workflow ID
   * @param params.edges - Array of edges to add
   */
  async connect(params: { id: number | string; edges: Edge[] }): Promise<void> {
    // Get current workflow to merge edges
    const currentWorkflow = await this.client.get<any>(
      `/workspaces/${params.id}`,
    );

    const nodes = currentWorkflow.workflow?.nodes || [];
    const newEdges = params.edges.map((edge) => ({
      source: this.resolveNodeId(edge.from),
      target: this.resolveNodeId(edge.to),
    }));

    await this.client.put(`/workspaces/${params.id}/workflow`, {
      workflow: {
        nodes,
        edges: [...(currentWorkflow.workflow?.edges || []), ...newEdges],
      },
    });
  }

  /**
   * Sync workflow with declarative configuration.
   *
   * This allows updating triggers, tasks, and edges in a single call.
   * Note: For creating triggers, prefer using the triggers API directly
   * as the sync endpoint has known limitations.
   *
   * @param params - Parameters object
   * @param params.id - The workflow ID
   * @param params.triggers - Array of trigger definitions (optional)
   * @param params.tasks - Array of task definitions (optional)
   * @param params.edges - Array of edge definitions (optional)
   */
  async sync(params: {
    id: number | string;
    triggers?: TriggerDefinition[];
    tasks?: TaskDefinition[];
    edges?: EdgeDefinition[];
  }): Promise<void> {
    await this.syncInternal(params.id, {
      name: "",
      goal: "",
      agentIds: [],
      triggers: params.triggers,
      tasks: params.tasks,
      edges: params.edges,
    });
  }

  private async syncInternal(
    workflowId: number | string,
    config: Partial<WorkflowConfig>,
  ): Promise<void> {
    // Build the sync payload
    const syncPayload: any = {};

    // Get current workflow state for ID mapping
    const currentTriggers = await this.client
      .get<any[]>(`/workspaces/${workflowId}/triggers`)
      .catch(() => [] as any[]);
    const currentTasks = await this.client
      .get<any[]>(`/workspaces/${workflowId}/tasks`)
      .catch(() => [] as any[]);

    // Map names to IDs for existing resources
    const triggerNameToId = new Map<string, string>();
    const taskNameToId = new Map<string, number>();

    for (const t of currentTriggers || []) {
      triggerNameToId.set(t.name || t.description, t.id);
    }
    for (const t of currentTasks || []) {
      taskNameToId.set(t.name || t.description, t.id);
    }

    // Build triggers array with IDs - need to resolve integration connection IDs
    if (config.triggers) {
      const triggersWithConnections = await Promise.all(
        config.triggers.map(async (t) => {
          // Get the actual integration connection ID (UUID)
          let integrationConnectionId = t.integrationConnectionId;
          if (!integrationConnectionId && t.type) {
            const identifier = this.getIntegrationIdentifier(t.type);
            integrationConnectionId =
              await this.client.integrations.getOrCreateConnection(identifier);
          }

          return {
            id: t.id || triggerNameToId.get(t.name) || `new-${t.name}`,
            name: t.name,
            description: t.name,
            integrationConnectionId: integrationConnectionId || "",
            trigger_name: this.getTriggerName(t.type),
            props: t.props || {},
            attributes: {},
          };
        }),
      );
      syncPayload.triggers = triggersWithConnections;
    }

    // Build tasks array with IDs
    if (config.tasks) {
      syncPayload.tasks = config.tasks.map((t) => {
        const existingId = t.id || taskNameToId.get(t.name);
        return {
          id: existingId || 0, // 0 means create new
          description: t.description,
          body: t.body || t.description,
          input: t.input || "",
          assigneeAgentId:
            typeof t.agentId === "string" ? parseInt(t.agentId) : t.agentId,
          status: "to-do",
          metadata: null,
          attributes: { name: t.name },
          outputOptions: {
            default: {
              name: "Task Output",
              type: "text",
              instructions: "Complete the task and provide output",
            },
          },
        };
      });
    }

    // Build workflow graph (nodes + edges)
    if (config.edges || config.triggers || config.tasks) {
      const nodes: any[] = [];
      const edges: any[] = [];

      // Add trigger nodes
      if (config.triggers) {
        for (const t of config.triggers) {
          const triggerId =
            t.id || triggerNameToId.get(t.name) || `new-${t.name}`;
          nodes.push({
            id: `trigger-${t.name}`,
            type: "trigger",
            triggerId,
            position: { x: 0, y: 0 },
            inputPorts: [],
            outputPorts: [{ id: "output", name: "Output" }],
          });
        }
      }

      // Add task nodes
      if (config.tasks) {
        for (const t of config.tasks) {
          const taskId = t.id || taskNameToId.get(t.name) || 0;
          nodes.push({
            id: `task-${t.name}`,
            type: "task",
            taskId,
            position: { x: 200, y: 0 },
            inputPorts: [{ id: "input", name: "Input" }],
            outputPorts: [{ id: "output", name: "Output" }],
          });
        }
      }

      // Add edges
      if (config.edges) {
        config.edges.forEach((e, i) => {
          const sourceNode = this.resolveEdgeRef(e.from);
          const targetNode = this.resolveEdgeRef(e.to);
          edges.push({
            id: `edge-${i}`,
            source: sourceNode,
            target: targetNode,
            sourcePort: "output",
            targetPort: "input",
          });
        });
      } else if (
        config.triggers &&
        config.tasks &&
        config.triggers.length > 0 &&
        config.tasks.length > 0
      ) {
        // Auto-generate edges connecting triggers to the first task
        const firstTask = config.tasks[0];
        if (firstTask) {
          const firstTaskName = firstTask.name;
          config.triggers.forEach((trigger, i) => {
            edges.push({
              id: `edge-auto-${i}`,
              source: `trigger-${trigger.name}`,
              target: `task-${firstTaskName}`,
              sourcePort: "output",
              targetPort: "input",
            });
          });
        }
      }

      syncPayload.workflow = { nodes, edges };
    }

    // Call the sync endpoint
    await this.client.put(`/workspaces/${workflowId}/sync`, syncPayload);
  }

  private getIntegrationIdentifier(type?: string): string {
    if (!type) return "manual-trigger";
    const mapping: Record<string, string> = {
      x402: "x402-trigger",
      webhook: "webhook-trigger",
      cron: "cron-trigger",
      manual: "manual-trigger",
    };
    return mapping[type] || "manual-trigger";
  }

  private getTriggerName(type?: string): string {
    if (!type) return "on_request";
    const mapping: Record<string, string> = {
      x402: "on_payment",
      webhook: "on_request",
      cron: "periodically",
      manual: "on_event",
    };
    return mapping[type] || "on_request";
  }

  private resolveEdgeRef(ref: string): string {
    // Convert 'trigger:name' or 'task:name' to node ID
    const [type, name] = ref.split(":");
    return `${type}-${name}`;
  }

  private resolveNodeId(
    ref: { type: string; id: string | number } | string,
  ): string {
    if (typeof ref === "string") {
      return this.resolveEdgeRef(ref);
    }
    return `${ref.type}-${ref.id}`;
  }
}
