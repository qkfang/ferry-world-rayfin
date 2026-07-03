import { useCallback, useEffect, useState } from 'react';

import type { Todo } from '../../rayfin/data/Todo';
import { ServiceContainer } from '../services/ServiceContainer';

export type TodoWithAction = Todo & {
  buttonTitle?: string;
  buttonUrl?: string;
};

const fabricWorkspaceId = import.meta.env.VITE_FABRIC_WORKSPACE_ID;
const fabricItemId = import.meta.env.VITE_FABRIC_ITEM_ID;
const fabricPortalUrl = import.meta.env.VITE_FABRIC_PORTAL_URL || null;

const isDeployed = !!fabricPortalUrl;

const managementPageUrl =
  fabricWorkspaceId && fabricItemId && fabricPortalUrl
    ? `${new URL(fabricPortalUrl).origin}/groups/${fabricWorkspaceId}/appbackends/${fabricItemId}?experience=fabric-developer`
    : '#';

const MILESTONE_TASKS: {
  title: string;
  completed: boolean | undefined;
  buttonTitle?: string;
  buttonUrl?: string;
}[] = [
  {
    title: 'Create and publish your app',
    completed: isDeployed,
  },
  {
    title: 'Visit your app page in Fabric',
    completed: undefined,
    ...(isDeployed && {
      buttonTitle: 'Open in Fabric',
      buttonUrl: managementPageUrl,
    }),
  },
  { title: 'Edit your app using GitHub Copilot Chat', completed: undefined },
  {
    title: 'Publish your changes. Run npx rayfin up or just ask your agent',
    completed: undefined,
  },
];

interface UseTodosResult {
  todos: TodoWithAction[];
  loading: boolean;
  error: string | null;
  addTodo: (title: string) => Promise<void>;
  toggleTodo: (id: string, isCompleted: boolean) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useTodos(): UseTodosResult {
  const [todos, setTodos] = useState<TodoWithAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const todoService = ServiceContainer.getInstance().todoService;

  const fetchTodos = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await todoService.getTodos();

      // Seed milestone tasks on first load if DB is empty
      if (data.length === 0) {
        for (const milestone of MILESTONE_TASKS) {
          const created = await todoService.createTodo(milestone.title);
          if (milestone.completed) {
            await todoService.updateTodo(created.id, { isCompleted: true });
          }
        }
        const seededData = await todoService.getTodos();
        data.length = 0;
        data.push(...seededData);
      } else {
        // Reconcile milestone completion based on current deploy state
        const milestoneByTitle = new Map(
          MILESTONE_TASKS.map((m) => [m.title, m])
        );
        for (const todo of data) {
          const milestone = milestoneByTitle.get(todo.title);
          if (
            milestone &&
            milestone.completed !== undefined &&
            milestone.completed !== todo.isCompleted
          ) {
            await todoService.updateTodo(todo.id, {
              isCompleted: milestone.completed,
            });
            todo.isCompleted = milestone.completed;
          }
        }
      }

      // Apply button metadata in-memory from milestone config
      const milestoneByTitle = new Map(
        MILESTONE_TASKS.map((m) => [m.title, m])
      );
      const enriched: TodoWithAction[] = data.map((todo) => {
        const milestone = milestoneByTitle.get(todo.title);
        return milestone
          ? {
              ...todo,
              buttonTitle: milestone.buttonTitle,
              buttonUrl: milestone.buttonUrl,
            }
          : todo;
      });
      setTodos(enriched);
    } catch (err) {
      console.error('Failed to fetch todos:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch todos');
    } finally {
      setLoading(false);
    }
  }, [todoService]);

  const addTodo = useCallback(
    async (title: string) => {
      setError(null);
      try {
        const newTodo = await todoService.createTodo(title);
        setTodos((prev) => [...prev, newTodo]);
      } catch (err) {
        console.error('Failed to add todo:', err);
        setError(err instanceof Error ? err.message : 'Failed to add todo');
        throw err;
      }
    },
    [todoService]
  );

  const toggleTodo = useCallback(
    async (id: string, isCompleted: boolean) => {
      setError(null);
      try {
        const updated = await todoService.updateTodo(id, { isCompleted });
        setTodos((prev) =>
          prev.map((todo) => (todo.id === id ? { ...todo, ...updated } : todo))
        );
      } catch (err) {
        console.error('Failed to toggle todo:', err);
        setError(err instanceof Error ? err.message : 'Failed to update todo');
        throw err;
      }
    },
    [todoService]
  );

  const deleteTodo = useCallback(
    async (id: string) => {
      setError(null);
      try {
        await todoService.deleteTodo(id);
        setTodos((prev) => prev.filter((todo) => todo.id !== id));
      } catch (err) {
        console.error('Failed to delete todo:', err);
        setError(err instanceof Error ? err.message : 'Failed to delete todo');
        throw err;
      }
    },
    [todoService]
  );

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  return {
    todos,
    loading,
    error,
    addTodo,
    toggleTodo,
    deleteTodo,
    refresh: fetchTodos,
  };
}
