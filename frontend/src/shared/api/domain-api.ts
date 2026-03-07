import { http } from "@/shared/api/http";
import type {
  Company,
  Project,
  Schedule,
  ScopedUserRole,
  Task,
  TaskSection,
  TaskSectionPermission,
  User
} from "@/shared/types/domain";

export function getUsers(token: string, companyId?: number): Promise<User[]> {
  const suffix = companyId ? `?company_id=${companyId}` : "";
  return http<User[]>(`/users${suffix}`, undefined, token);
}

export function getGlobalAdmins(token: string): Promise<User[]> {
  return http<User[]>("/users/global-admins", undefined, token);
}

export function getCompanies(token: string): Promise<Company[]> {
  return http<Company[]>('/companies', undefined, token);
}

export function getCompany(token: string, companyId: number): Promise<Company> {
  return http<Company>(`/companies/${companyId}`, undefined, token);
}

export function getCompanyUsersWithRoles(
  token: string,
  companyId: number
): Promise<Array<{ id: number; email: string; full_name: string; role: string }>> {
  return http(`/companies/${companyId}/users`, undefined, token);
}

export function getProjects(token: string, companyId: number): Promise<Project[]> {
  return http<Project[]>(`/projects?company_id=${companyId}`, undefined, token);
}

export function getProject(token: string, projectId: number): Promise<Project> {
  return http<Project>(`/projects/${projectId}`, undefined, token);
}

export function getProjectUsers(token: string, projectId: number): Promise<Array<{ id: number; email: string; full_name: string; role: string }>> {
  return http(`/projects/${projectId}/users`, undefined, token);
}

export function getTasksByProject(token: string, projectId: number): Promise<Task[]> {
  return http(`/tasks/project/${projectId}`, undefined, token);
}

export function getTask(token: string, taskId: number): Promise<Task> {
  return http(`/tasks/${taskId}`, undefined, token);
}

export function createTask(
  token: string,
  payload: { project_id: number; title: string; description?: string | null; value?: Array<Record<string, string>> | null }
): Promise<Task> {
  return http('/tasks', { method: 'POST', body: JSON.stringify(payload) }, token);
}

export function updateTaskValue(
  token: string,
  taskId: number,
  payload: { value: Array<Record<string, string>> | null }
): Promise<Task> {
  return http(`/tasks/${taskId}/value`, { method: "PATCH", body: JSON.stringify(payload) }, token);
}

export function getTaskSections(token: string, taskId: number): Promise<TaskSection[]> {
  return http(`/tasks/${taskId}/sections`, undefined, token);
}

export function createTaskSection(
  token: string,
  taskId: number,
  payload: {
    key: string;
    title: string;
    content?: Record<string, unknown> | null;
    position?: number;
    planned_end_at?: string | null;
  }
): Promise<TaskSection> {
  return http(`/tasks/${taskId}/sections`, { method: "POST", body: JSON.stringify(payload) }, token);
}

export function updateTaskSection(
  token: string,
  taskId: number,
  sectionId: number,
  payload: { key?: string; title?: string; content?: Record<string, unknown> | null; position?: number }
): Promise<TaskSection> {
  return http(`/tasks/${taskId}/sections/${sectionId}`, { method: "PATCH", body: JSON.stringify(payload) }, token);
}

export function updateTaskSectionStatus(
  token: string,
  taskId: number,
  sectionId: number,
  status: "new" | "in_progress" | "finished"
): Promise<TaskSection> {
  return http(
    `/tasks/${taskId}/sections/${sectionId}/status`,
    { method: "PATCH", body: JSON.stringify({ status }) },
    token
  );
}

export function deleteTaskSection(token: string, taskId: number, sectionId: number): Promise<void> {
  return http(`/tasks/${taskId}/sections/${sectionId}`, { method: "DELETE" }, token);
}

export function getTaskSectionPermissions(
  token: string,
  taskId: number,
  sectionId: number
): Promise<TaskSectionPermission[]> {
  return http(`/tasks/${taskId}/sections/${sectionId}/permissions`, undefined, token);
}

export function assignTaskSectionPermission(
  token: string,
  taskId: number,
  sectionId: number,
  userId: number,
  payload: { role: "section_viewer" | "section_editor" | "section_manager" }
): Promise<TaskSectionPermission> {
  return http(`/tasks/${taskId}/sections/${sectionId}/permissions/${userId}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  }, token);
}

export function clearTaskSectionPermission(token: string, taskId: number, sectionId: number, userId: number): Promise<void> {
  return http(`/tasks/${taskId}/sections/${sectionId}/permissions/${userId}`, { method: "DELETE" }, token);
}

export function deleteTask(token: string, taskId: number): Promise<void> {
  return http(`/tasks/${taskId}`, { method: 'DELETE' }, token);
}

export function getTaskUsers(token: string, taskId: number): Promise<ScopedUserRole[]> {
  return http(`/tasks/${taskId}/users`, undefined, token);
}

export function assignTaskUserRole(
  token: string,
  taskId: number,
  payload: { user_id: number; role: "task_viewer" | "task_member" | "task_manager" }
): Promise<ScopedUserRole> {
  return http(`/tasks/${taskId}/assign-role`, { method: "POST", body: JSON.stringify(payload) }, token);
}

export function clearTaskUserRoles(token: string, taskId: number, userId: number): Promise<void> {
  return http(`/tasks/${taskId}/assign-role/${userId}`, { method: "DELETE" }, token);
}

export function getScheduleByProject(token: string, projectId: number): Promise<Schedule[]> {
  return http(`/schedules/project/${projectId}`, undefined, token);
}

export function getSchedule(token: string, scheduleId: number): Promise<Schedule> {
  return http(`/schedules/${scheduleId}`, undefined, token);
}

export function recalculateTaskSchedule(token: string, taskId: number): Promise<Schedule> {
  return http(`/tasks/${taskId}/schedule/recalculate`, { method: "POST" }, token);
}

export function createSchedule(
  token: string,
  payload: { project_id: number; title: string; description?: string | null }
): Promise<Schedule> {
  return http('/schedules', { method: 'POST', body: JSON.stringify(payload) }, token);
}

export function deleteSchedule(token: string, scheduleId: number): Promise<void> {
  return http(`/schedules/${scheduleId}`, { method: 'DELETE' }, token);
}

export function getScheduleUsers(token: string, scheduleId: number): Promise<ScopedUserRole[]> {
  return http(`/schedules/${scheduleId}/users`, undefined, token);
}

export function assignScheduleUserRole(
  token: string,
  scheduleId: number,
  payload: { user_id: number; role: "schedule_viewer" | "schedule_member" | "schedule_manager" }
): Promise<ScopedUserRole> {
  return http(`/schedules/${scheduleId}/assign-role`, { method: "POST", body: JSON.stringify(payload) }, token);
}

export function clearScheduleUserRoles(token: string, scheduleId: number, userId: number): Promise<void> {
  return http(`/schedules/${scheduleId}/assign-role/${userId}`, { method: "DELETE" }, token);
}

export function getProjectAdmins(
  token: string,
  companyId: number
): Promise<Array<{ project_id: number; admins: Array<{ id: number; email: string; full_name: string }> }>> {
  return http(`/projects/admins?company_id=${companyId}`, undefined, token);
}

export function createProject(token: string, payload: { company_id: number; name: string }): Promise<Project> {
  return http<Project>('/projects', { method: 'POST', body: JSON.stringify(payload) }, token);
}

export function deleteProject(token: string, projectId: number): Promise<void> {
  return http(`/projects/${projectId}`, { method: "DELETE" }, token);
}

export function createCompanyUser(
  token: string,
  payload: {
    company_id: number;
    email: string;
    full_name: string;
    password: string;
    role?: "company_viewer" | "company_member" | "company_admin";
  }
): Promise<User> {
  return http<User>('/users', { method: 'POST', body: JSON.stringify(payload) }, token);
}

export function removeCompanyUser(token: string, userId: number, companyId: number): Promise<void> {
  return http(`/users/${userId}/companies/${companyId}`, { method: "DELETE" }, token);
}

export function updateCompanyUserRole(
  token: string,
  userId: number,
  companyId: number,
  role: "company_viewer" | "company_member" | "company_admin"
): Promise<void> {
  return http(`/users/${userId}/companies/${companyId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role })
  }, token);
}

export function assignProjectAdmin(token: string, projectId: number, userId: number): Promise<unknown> {
  return http(`/projects/${projectId}/assign-admin`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId })
  }, token);
}

export function clearProjectAdmin(token: string, projectId: number, userId: number): Promise<void> {
  return http(`/projects/${projectId}/assign-admin/${userId}`, { method: "DELETE" }, token);
}

export function assignProjectUserRole(
  token: string,
  projectId: number,
  payload: { user_id: number; role: "project_viewer" | "project_member" | "project_manager" }
): Promise<ScopedUserRole> {
  return http(`/projects/${projectId}/assign-role`, { method: "POST", body: JSON.stringify(payload) }, token);
}

export function clearProjectUserRoles(token: string, projectId: number, userId: number): Promise<void> {
  return http(`/projects/${projectId}/assign-role/${userId}`, { method: "DELETE" }, token);
}
