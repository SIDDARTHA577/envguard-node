import { express } from '../mini-express.js';
import { taskService } from '../services/task-service.js';
import type { ApiResponse, Task, TaskStatus } from '../../shared/types.js';

export const taskRouter = express.Router();

// GET /api/tasks (list with optional status filter)
taskRouter.get('/', (req, res, next) => {
  try {
    const status = req.query.status as TaskStatus | undefined;
    const tasks = taskService.getAll(status);
    const response: ApiResponse<Task[]> = {
      success: true,
      data: tasks,
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

// GET /api/tasks/:id (detail)
taskRouter.get('/:id', (req, res, next) => {
  try {
    const task = taskService.getById(req.params.id);
    const response: ApiResponse<Task> = {
      success: true,
      data: task,
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

// POST /api/tasks (create)
taskRouter.post('/', (req, res, next) => {
  try {
    const { title, description, priority } = req.body || {};
    const task = taskService.create({ title, description, priority });
    const response: ApiResponse<Task> = {
      success: true,
      data: task,
    };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/tasks/:id (update)
taskRouter.patch('/:id', (req, res, next) => {
  try {
    const { title, description, status, priority } = req.body || {};
    const updated = taskService.update(req.params.id, { title, description, status, priority });
    const response: ApiResponse<Task> = {
      success: true,
      data: updated,
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/tasks/:id (remove)
taskRouter.delete('/:id', (req, res, next) => {
  try {
    taskService.delete(req.params.id);
    const response: ApiResponse<{ id: string }> = {
      success: true,
      data: { id: req.params.id },
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});
