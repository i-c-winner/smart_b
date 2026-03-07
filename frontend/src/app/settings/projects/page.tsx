"use client";

import {
  Alert,
  Button,
  CircularProgress,
  Container,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  assignTaskSectionPermission,
  createTask,
  createTaskSection,
  deleteTask,
  deleteTaskSection,
  getCompanies,
  getProjectUsers,
  getProjects,
  getScheduleByProject,
  getTaskSectionPermissions,
  getTaskSections,
  getTasksByProject,
  getUsers,
  clearTaskSectionPermission
} from "@/shared/api/domain-api";
import { useAuth } from "@/shared/lib/auth/auth-context";
import type {
  Company,
  Project,
  Schedule,
  Task,
  TaskSection,
  TaskSectionPermission,
  User
} from "@/shared/types/domain";

type ProjectUser = { id: number; full_name: string; email: string; role: string };

function toIsoFromLocalDateTime(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function ProjectSettingsPage() {
  const router = useRouter();
  const { token, currentUser, loading } = useAuth();

  const [company, setCompany] = useState<Company | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  const [projectUsers, setProjectUsers] = useState<ProjectUser[]>([]);
  const [companyUsers, setCompanyUsers] = useState<User[]>([]);

  const [projectTasks, setProjectTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");

  const [taskSections, setTaskSections] = useState<TaskSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
  const [newSectionKey, setNewSectionKey] = useState("");
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [newSectionPlannedEnd, setNewSectionPlannedEnd] = useState("");

  const [schedulesBySection, setSchedulesBySection] = useState<Record<number, Schedule>>({});

  const [sectionPermissions, setSectionPermissions] = useState<TaskSectionPermission[]>([]);
  const [selectedSectionUserId, setSelectedSectionUserId] = useState("");

  const [dataLoading, setDataLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const selectedTask = useMemo(
    () => projectTasks.find((task) => task.id === selectedTaskId) ?? null,
    [projectTasks, selectedTaskId]
  );

  const selectedSection = useMemo(
    () => taskSections.find((section) => section.id === selectedSectionId) ?? null,
    [taskSections, selectedSectionId]
  );

  useEffect(() => {
    if (!loading && !token) {
      router.replace("/login");
    }
  }, [loading, token, router]);

  useEffect(() => {
    if (!token) return;
    let active = true;

    const load = async () => {
      setDataLoading(true);
      setError(null);
      try {
        const companies = await getCompanies(token);
        const firstCompany = companies[0] ?? null;
        if (!active) return;
        setCompany(firstCompany);

        if (!firstCompany) {
          setProjects([]);
          setSelectedProjectId(null);
          setProjectUsers([]);
          setCompanyUsers([]);
          return;
        }

        const [projectList, users] = await Promise.all([
          getProjects(token, firstCompany.id),
          getUsers(token, firstCompany.id)
        ]);

        const projectUsersLists = await Promise.all(
          projectList.map(async (project) => ({
            project,
            users: await getProjectUsers(token, project.id).catch(() => [] as ProjectUser[])
          }))
        );

        const filteredProjects = projectUsersLists
          .filter((entry) =>
            entry.users.some((user) => user.id === currentUser?.id && user.role === "project_manager")
          )
          .map((entry) => entry.project);

        if (!active) return;
        setProjects(filteredProjects);
        setCompanyUsers(users);
        setSelectedProjectId((prev) => prev ?? (filteredProjects[0]?.id ?? null));
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Cannot load projects settings");
      } finally {
        if (active) setDataLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [token, currentUser]);

  const loadProjectDetails = async (projectId: number) => {
    if (!token) return;

    const [users, tasks, schedules] = await Promise.all([
      getProjectUsers(token, projectId),
      getTasksByProject(token, projectId),
      getScheduleByProject(token, projectId)
    ]);

    setProjectUsers(Array.isArray(users) ? users : []);

    const normalizedTasks = Array.isArray(tasks) ? tasks : [];
    setProjectTasks(normalizedTasks);
    setSelectedTaskId((prev) => {
      if (prev && normalizedTasks.some((task) => task.id === prev)) return prev;
      return normalizedTasks[0]?.id ?? null;
    });

    const scheduleMap: Record<number, Schedule> = {};
    (Array.isArray(schedules) ? schedules : []).forEach((schedule) => {
      if (schedule.section_id) {
        scheduleMap[schedule.section_id] = schedule;
      }
    });
    setSchedulesBySection(scheduleMap);
  };

  useEffect(() => {
    if (!token || !selectedProjectId) {
      setProjectUsers([]);
      setProjectTasks([]);
      setSelectedTaskId(null);
      setTaskSections([]);
      setSelectedSectionId(null);
      setSectionPermissions([]);
      setSchedulesBySection({});
      return;
    }
    let active = true;

    const run = async () => {
      try {
        const [users, tasks, schedules] = await Promise.all([
          getProjectUsers(token, selectedProjectId),
          getTasksByProject(token, selectedProjectId),
          getScheduleByProject(token, selectedProjectId)
        ]);
        if (!active) return;

        setProjectUsers(Array.isArray(users) ? users : []);

        const normalizedTasks = Array.isArray(tasks) ? tasks : [];
        setProjectTasks(normalizedTasks);
        setSelectedTaskId((prev) => {
          if (prev && normalizedTasks.some((task) => task.id === prev)) return prev;
          return normalizedTasks[0]?.id ?? null;
        });

        const scheduleMap: Record<number, Schedule> = {};
        (Array.isArray(schedules) ? schedules : []).forEach((schedule) => {
          if (schedule.section_id) {
            scheduleMap[schedule.section_id] = schedule;
          }
        });
        setSchedulesBySection(scheduleMap);
      } catch (err) {
        if (!active) return;
        setProjectUsers([]);
        setProjectTasks([]);
        setSelectedTaskId(null);
        setTaskSections([]);
        setSelectedSectionId(null);
        setSectionPermissions([]);
        setSchedulesBySection({});
        setError(err instanceof Error ? err.message : "Cannot load project details");
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [token, selectedProjectId]);

  useEffect(() => {
    if (!token || !selectedTaskId) {
      setTaskSections([]);
      setSelectedSectionId(null);
      setSectionPermissions([]);
      return;
    }
    let active = true;

    const run = async () => {
      try {
        const sections = await getTaskSections(token, selectedTaskId);
        if (!active) return;
        const normalizedSections = Array.isArray(sections) ? sections : [];
        setTaskSections(normalizedSections);
        setSelectedSectionId((prev) => {
          if (prev && normalizedSections.some((section) => section.id === prev)) return prev;
          return normalizedSections[0]?.id ?? null;
        });
      } catch (err) {
        if (!active) return;
        setTaskSections([]);
        setSelectedSectionId(null);
        setSectionPermissions([]);
        setError(err instanceof Error ? err.message : "Cannot load task sections");
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [token, selectedTaskId]);

  useEffect(() => {
    if (!token || !selectedTaskId || !selectedSectionId) {
      setSectionPermissions([]);
      return;
    }
    let active = true;

    const run = async () => {
      try {
        const perms = await getTaskSectionPermissions(token, selectedTaskId, selectedSectionId);
        if (!active) return;
        const normalizedPerms = Array.isArray(perms) ? perms : [];
        setSectionPermissions(normalizedPerms);
      } catch (err) {
        if (!active) return;
        setSectionPermissions([]);
        setError(err instanceof Error ? err.message : "Cannot load section roles");
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [token, selectedTaskId, selectedSectionId]);

  useEffect(() => {
    setSelectedSectionUserId("");
  }, [selectedSectionId]);

  const onCreateTask = async () => {
    if (!token || !selectedProjectId || !newTaskTitle.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createTask(token, {
        project_id: selectedProjectId,
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim() || null
      });
      setNewTaskTitle("");
      setNewTaskDescription("");
      await loadProjectDetails(selectedProjectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot create task");
    } finally {
      setSaving(false);
    }
  };

  const onDeleteTask = async (taskId: number) => {
    if (!token || !selectedProjectId) return;
    setSaving(true);
    setError(null);
    try {
      await deleteTask(token, taskId);
      await loadProjectDetails(selectedProjectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot delete task");
    } finally {
      setSaving(false);
    }
  };

  const onCreateSection = async () => {
    if (!token || !selectedTaskId || !newSectionKey.trim() || !newSectionTitle.trim()) return;

    setSaving(true);
    setError(null);
    try {
      await createTaskSection(token, selectedTaskId, {
        key: newSectionKey.trim(),
        title: newSectionTitle.trim(),
        content: null,
        position: taskSections.length,
        planned_end_at: toIsoFromLocalDateTime(newSectionPlannedEnd)
      });
      setNewSectionKey("");
      setNewSectionTitle("");
      setNewSectionPlannedEnd("");

      const sections = await getTaskSections(token, selectedTaskId);
      const normalizedSections = Array.isArray(sections) ? sections : [];
      setTaskSections(normalizedSections);
      setSelectedSectionId((prev) => prev ?? (normalizedSections[0]?.id ?? null));

      if (selectedProjectId) {
        const schedules = await getScheduleByProject(token, selectedProjectId);
        const scheduleMap: Record<number, Schedule> = {};
        (Array.isArray(schedules) ? schedules : []).forEach((schedule) => {
          if (schedule.section_id) scheduleMap[schedule.section_id] = schedule;
        });
        setSchedulesBySection(scheduleMap);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot create section");
    } finally {
      setSaving(false);
    }
  };

  const onDeleteSection = async (sectionId: number) => {
    if (!token || !selectedTaskId || !selectedProjectId) return;
    setSaving(true);
    setError(null);
    try {
      await deleteTaskSection(token, selectedTaskId, sectionId);
      const [sections, schedules] = await Promise.all([
        getTaskSections(token, selectedTaskId),
        getScheduleByProject(token, selectedProjectId)
      ]);
      const normalizedSections = Array.isArray(sections) ? sections : [];
      setTaskSections(normalizedSections);
      setSelectedSectionId((prev) => {
        if (prev && normalizedSections.some((section) => section.id === prev)) return prev;
        return normalizedSections[0]?.id ?? null;
      });

      const scheduleMap: Record<number, Schedule> = {};
      (Array.isArray(schedules) ? schedules : []).forEach((schedule) => {
        if (schedule.section_id) scheduleMap[schedule.section_id] = schedule;
      });
      setSchedulesBySection(scheduleMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot delete section");
    } finally {
      setSaving(false);
    }
  };

  const onAddSectionRole = async () => {
    if (!token || !selectedTaskId || !selectedSectionId || !selectedSectionUserId) return;

    setSaving(true);
    setError(null);
    try {
      await assignTaskSectionPermission(
        token,
        selectedTaskId,
        selectedSectionId,
        Number(selectedSectionUserId),
        { role: "section_editor" }
      );
      const perms = await getTaskSectionPermissions(token, selectedTaskId, selectedSectionId);
      const normalizedPerms = Array.isArray(perms) ? perms : [];
      setSectionPermissions(normalizedPerms);
      setSelectedSectionUserId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot assign section role");
    } finally {
      setSaving(false);
    }
  };

  const onDeleteSectionRole = async (userId: number) => {
    if (!token || !selectedTaskId || !selectedSectionId) return;

    setSaving(true);
    setError(null);
    try {
      await clearTaskSectionPermission(token, selectedTaskId, selectedSectionId, userId);
      const perms = await getTaskSectionPermissions(token, selectedTaskId, selectedSectionId);
      const normalizedPerms = Array.isArray(perms) ? perms : [];
      setSectionPermissions(normalizedPerms);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot delete section role");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h4">Settings project</Typography>

        {(loading || dataLoading) && (
          <Stack direction="row" spacing={1.5} alignItems="center">
            <CircularProgress size={20} />
            <Typography>Loading...</Typography>
          </Stack>
        )}

        {error && <Alert severity="error">{error}</Alert>}

        {!loading && !dataLoading && !company && (
          <Alert severity="warning">No available company context.</Alert>
        )}

        {!loading && !dataLoading && company && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              Company: {company.name}
            </Typography>

            {projects.length ? (
              <>
                <Tabs
                  value={selectedProjectId}
                  onChange={(_, value: number) => setSelectedProjectId(value)}
                  variant="scrollable"
                  scrollButtons="auto"
                  sx={{ mb: 1 }}
                >
                  {projects.map((project) => (
                    <Tab key={project.id} label={project.name} value={project.id} />
                  ))}
                </Tabs>

                <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: "info.50", borderLeft: "4px solid", borderLeftColor: "info.main" }}>
                  <Typography variant="subtitle1" sx={{ mb: 1 }}>
                    Project: {selectedProject?.name ?? "-"}
                  </Typography>

                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>User</TableCell>
                        <TableCell>Email</TableCell>
                        <TableCell>Role</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {projectUsers.length ? (
                        projectUsers.map((user) => (
                          <TableRow key={`${user.id}-${user.role}`}>
                            <TableCell>{user.full_name}</TableCell>
                            <TableCell>{user.email}</TableCell>
                            <TableCell>{user.role}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={3}>No users in selected project context.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </Paper>

                <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: "success.50", borderLeft: "4px solid", borderLeftColor: "success.main" }}>
                  <Typography variant="subtitle1" sx={{ mb: 1 }}>
                    Tasks
                  </Typography>

                  <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ mb: 1.5 }}>
                    <TextField
                      fullWidth
                      label="Task title"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                    />
                    <TextField
                      fullWidth
                      label="Task description"
                      value={newTaskDescription}
                      onChange={(e) => setNewTaskDescription(e.target.value)}
                    />
                    <Button
                      variant="contained"
                      onClick={onCreateTask}
                      disabled={!newTaskTitle.trim() || saving || !selectedProjectId}
                    >
                      Add task
                    </Button>
                  </Stack>

                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>ID</TableCell>
                        <TableCell>Title</TableCell>
                        <TableCell>Description</TableCell>
                        <TableCell align="right">Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {projectTasks.length ? (
                        projectTasks.map((task) => (
                          <TableRow key={task.id}>
                            <TableCell>{task.id}</TableCell>
                            <TableCell>{task.title}</TableCell>
                            <TableCell>{task.description ?? "-"}</TableCell>
                            <TableCell align="right">
                              <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                disabled={saving}
                                onClick={() => onDeleteTask(task.id)}
                              >
                                Delete task
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4}>No tasks in selected project.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </Paper>

                {projectTasks.length ? (
                  <>
                    <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: "warning.50", borderLeft: "4px solid", borderLeftColor: "warning.main" }}>
                      <Tabs
                        value={selectedTaskId}
                        onChange={(_, value: number) => setSelectedTaskId(value)}
                        variant="scrollable"
                        scrollButtons="auto"
                        sx={{ mb: 1 }}
                      >
                        {projectTasks.map((task) => (
                          <Tab key={task.id} label={task.title} value={task.id} />
                        ))}
                      </Tabs>

                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Sections for task: {selectedTask?.title ?? "-"}
                      </Typography>

                      <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ mb: 1.5 }}>
                        <TextField
                          fullWidth
                          label="Section key"
                          value={newSectionKey}
                          onChange={(e) => setNewSectionKey(e.target.value)}
                        />
                        <TextField
                          fullWidth
                          label="Section title"
                          value={newSectionTitle}
                          onChange={(e) => setNewSectionTitle(e.target.value)}
                        />
                        <TextField
                          fullWidth
                          type="datetime-local"
                          label="Planned end"
                          InputLabelProps={{ shrink: true }}
                          value={newSectionPlannedEnd}
                          onChange={(e) => setNewSectionPlannedEnd(e.target.value)}
                        />
                        <Button
                          variant="contained"
                          onClick={onCreateSection}
                          disabled={!selectedTaskId || !newSectionKey.trim() || !newSectionTitle.trim() || saving}
                        >
                          Add section
                        </Button>
                      </Stack>

                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>ID</TableCell>
                            <TableCell>Key</TableCell>
                            <TableCell>Title</TableCell>
                            <TableCell>Planned end</TableCell>
                            <TableCell align="right">Action</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {taskSections.length ? (
                            taskSections.map((section) => {
                              const schedule = schedulesBySection[section.id];
                              return (
                                <TableRow
                                  key={section.id}
                                  hover
                                  selected={section.id === selectedSectionId}
                                  onClick={() => setSelectedSectionId(section.id)}
                                  sx={{ cursor: "pointer" }}
                                >
                                  <TableCell>{section.id}</TableCell>
                                  <TableCell>{section.key}</TableCell>
                                  <TableCell>{section.title}</TableCell>
                                  <TableCell>{formatDateTime(schedule?.planned_end_at ?? null)}</TableCell>
                                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      color="error"
                                      disabled={saving}
                                      onClick={() => onDeleteSection(section.id)}
                                    >
                                      Delete section
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          ) : (
                            <TableRow>
                              <TableCell colSpan={5}>No sections in selected task.</TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </Paper>

                    {selectedSection && (
                      <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "secondary.50", borderLeft: "4px solid", borderLeftColor: "secondary.main" }}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                          Section roles: {selectedSection.title}
                        </Typography>

                        <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ mb: 1.5 }}>
                          <FormControl fullWidth>
                            <InputLabel>User</InputLabel>
                            <Select
                              value={selectedSectionUserId}
                              label="User"
                              onChange={(e) => setSelectedSectionUserId(String(e.target.value))}
                            >
                              <MenuItem value="">Select user</MenuItem>
                              {companyUsers.map((user) => (
                                <MenuItem key={user.id} value={String(user.id)}>
                                  {user.full_name} ({user.email})
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>

                          <Button
                            variant="contained"
                            onClick={onAddSectionRole}
                            disabled={!selectedSectionUserId || saving}
                          >
                            Save role
                          </Button>
                        </Stack>

                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>User</TableCell>
                              <TableCell>Email</TableCell>
                              <TableCell>Role</TableCell>
                              <TableCell align="right">Action</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {sectionPermissions.length ? (
                              sectionPermissions.map((permission) => (
                                <TableRow key={permission.id}>
                                  <TableCell>{permission.full_name}</TableCell>
                                  <TableCell>{permission.email}</TableCell>
                                  <TableCell>
                                    section_editor
                                  </TableCell>
                                  <TableCell align="right">
                                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                                      <Button
                                        size="small"
                                        variant="outlined"
                                        color="error"
                                        disabled={saving}
                                        onClick={() => onDeleteSectionRole(permission.user_id)}
                                      >
                                        Remove
                                      </Button>
                                    </Stack>
                                  </TableCell>
                                </TableRow>
                              ))
                            ) : (
                              <TableRow>
                                <TableCell colSpan={4}>No roles in selected section.</TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </Paper>
                    )}
                  </>
                ) : (
                  <Typography color="text.secondary">No tasks in selected project.</Typography>
                )}
              </>
            ) : (
              <Typography color="text.secondary">No projects where you are project_manager.</Typography>
            )}
          </Paper>
        )}
      </Stack>
    </Container>
  );
}
