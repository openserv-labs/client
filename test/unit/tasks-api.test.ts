import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert";
import { TasksAPI } from "../../src/tasks-api";

// Mock PlatformClient
function createMockClient() {
  return {
    get: mock.fn(),
    post: mock.fn(),
    put: mock.fn(),
    delete: mock.fn(),
    rawClient: { defaults: { headers: { common: {} } } },
    authenticate: mock.fn(),
  };
}

describe("TasksAPI", () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let tasksApi: TasksAPI;

  beforeEach(() => {
    mockClient = createMockClient();
    tasksApi = new TasksAPI(mockClient as any);
  });

  describe("create", () => {
    it("should create a task with required fields", async () => {
      const createdTask = {
        id: 1,
        description: "Process data",
        body: "Process data",
        status: "to-do",
      };

      mockClient.post.mock.mockImplementation(() => Promise.resolve({ id: 1 }));
      mockClient.get.mock.mockImplementation(() =>
        Promise.resolve(createdTask),
      );

      const result = await tasksApi.create({
        workflowId: 123,
        agentId: 456,
        description: "Process data",
      });

      assert.deepStrictEqual(result, createdTask);

      // Verify POST call
      const postCall = mockClient.post.mock.calls[0].arguments;
      assert.strictEqual(postCall[0], "/workspaces/123/task");
      assert.strictEqual(postCall[1].description, "Process data");
      assert.strictEqual(postCall[1].body, "Process data"); // Defaults to description
      assert.strictEqual(postCall[1].assignee, 456);
      assert.strictEqual(postCall[1].input, "");
      assert.deepStrictEqual(postCall[1].dependencies, []);
    });

    it("should create a task with all options", async () => {
      const createdTask = {
        id: 1,
        description: "Process data",
        body: "Detailed instructions",
        input: "Input data",
      };

      mockClient.post.mock.mockImplementation(() => Promise.resolve({ id: 1 }));
      mockClient.get.mock.mockImplementation(() =>
        Promise.resolve(createdTask),
      );

      await tasksApi.create({
        workflowId: 123,
        agentId: "456", // String ID should be converted
        description: "Process data",
        body: "Detailed instructions",
        input: "Input data",
        dependencies: [100, 200],
      });

      const postCall = mockClient.post.mock.calls[0].arguments;
      assert.strictEqual(postCall[1].body, "Detailed instructions");
      assert.strictEqual(postCall[1].input, "Input data");
      assert.strictEqual(postCall[1].assignee, 456); // Converted to number
      assert.deepStrictEqual(postCall[1].dependencies, [100, 200]);
    });

    it("should include outputOptions in task creation", async () => {
      mockClient.post.mock.mockImplementation(() => Promise.resolve({ id: 1 }));
      mockClient.get.mock.mockImplementation(() => Promise.resolve({ id: 1 }));

      await tasksApi.create({
        workflowId: 123,
        agentId: 456,
        description: "Test task",
      });

      const postCall = mockClient.post.mock.calls[0].arguments;
      assert.deepStrictEqual(postCall[1].outputOptions, {
        default: {
          name: "Task Output",
          type: "text",
          instructions: "Complete the task and provide output",
        },
      });
    });
  });

  describe("get", () => {
    it("should get a task by ID", async () => {
      const task = { id: 1, description: "Test task" };

      mockClient.get.mock.mockImplementation(() => Promise.resolve(task));

      const result = await tasksApi.get({ workflowId: 123, id: 1 });

      assert.deepStrictEqual(result, task);
      assert.deepStrictEqual(mockClient.get.mock.calls[0].arguments, [
        "/workspaces/123/tasks/1",
      ]);
    });

    it("should accept string IDs", async () => {
      mockClient.get.mock.mockImplementation(() => Promise.resolve({ id: 1 }));

      await tasksApi.get({ workflowId: "123", id: "456" });

      assert.deepStrictEqual(mockClient.get.mock.calls[0].arguments, [
        "/workspaces/123/tasks/456",
      ]);
    });
  });

  describe("list", () => {
    it("should list tasks in a workflow", async () => {
      const tasks = [
        { id: 1, description: "Task 1" },
        { id: 2, description: "Task 2" },
      ];

      mockClient.get.mock.mockImplementation(() => Promise.resolve(tasks));

      const result = await tasksApi.list({ workflowId: 123 });

      assert.deepStrictEqual(result, tasks);
      assert.deepStrictEqual(mockClient.get.mock.calls[0].arguments, [
        "/workspaces/123/tasks",
      ]);
    });
  });

  describe("update", () => {
    it("should update a task", async () => {
      const updatedTask = {
        id: 1,
        description: "Updated description",
        status: "in-progress",
      };

      mockClient.put.mock.mockImplementation(() =>
        Promise.resolve({ success: true }),
      );
      mockClient.get.mock.mockImplementation(() =>
        Promise.resolve(updatedTask),
      );

      const result = await tasksApi.update({
        workflowId: 123,
        id: 1,
        description: "Updated description",
        status: "in-progress",
      });

      assert.deepStrictEqual(result, updatedTask);

      // Verify PUT call
      const putCall = mockClient.put.mock.calls[0].arguments;
      assert.strictEqual(putCall[0], "/workspaces/123/tasks/1");
      assert.deepStrictEqual(putCall[1], {
        description: "Updated description",
        status: "in-progress",
      });
    });

    it("should only send provided fields", async () => {
      mockClient.put.mock.mockImplementation(() =>
        Promise.resolve({ success: true }),
      );
      mockClient.get.mock.mockImplementation(() => Promise.resolve({ id: 1 }));

      await tasksApi.update({
        workflowId: 123,
        id: 1,
        body: "New body only",
      });

      const putCall = mockClient.put.mock.calls[0].arguments;
      assert.deepStrictEqual(putCall[1], { body: "New body only" });
    });
  });

  describe("delete", () => {
    it("should delete a task", async () => {
      mockClient.delete.mock.mockImplementation(() =>
        Promise.resolve({ success: true }),
      );

      await tasksApi.delete({ workflowId: 123, id: 1 });

      assert.deepStrictEqual(mockClient.delete.mock.calls[0].arguments, [
        "/workspaces/123/tasks/1",
      ]);
    });
  });
});
