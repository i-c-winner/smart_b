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
  TextField,
  Tabs,
  Typography
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  assignProjectUserRole,
  assignTaskUserRole,
  clearProjectUserRoles,
  clearTaskUserRoles,
  createCompanyUser,
  createProject,
  createTaskSection,
  deleteProject,
  deleteTaskSection,
  getCompanies,
  getCompanyUsersWithRoles,
  getProjectUsers,
  getProjects,
  getTaskSections,
  getTasksByProject,
  getTaskUsers,
  removeCompanyUser,
  updateCompanyUserRole,
  getUsers,
  updateTaskSection
} from "@/shared/api/domain-api";
import { useAuth } from "@/shared/lib/auth/auth-context";
import type { Company, Project, ScopedUserRole, Task, TaskSection, User } from "@/shared/types/domain";

type ProjectUser = { id: number; full_name: string; email: string; role: string };

export default function SettingsPage() {
  const router = useRouter();
  const { token, loading } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [companyUsers, setCompanyUsers] = useState<User[]>([]);
  const [companyUsersWithRoles, setCompanyUsersWithRoles] = useState<ProjectUser[]>([]);
  const [companyRoleDrafts, setCompanyRoleDrafts] = useState<Record<number, "company_viewer" | "company_member" | "company_admin">>({});
  const [newProjectName, setNewProjectName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserFullName, setNewUserFullName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<"company_viewer" | "company_member">(
    "company_member"
  );
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedProjectUserId, setSelectedProjectUserId] = useState<string>("");
  const [selectedProjectRole, setSelectedProjectRole] = useState<"project_viewer" | "project_member" | "project_manager">(
    "project_member"
  );
  const [projectUsers, setProjectUsers] = useState<ProjectUser[]>([]);
  const [projectTasks, setProjectTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [taskUsers, setTaskUsers] = useState<ScopedUserRole[]>([]);
  const [taskSections, setTaskSections] = useState<TaskSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
  const [newSectionKey, setNewSectionKey] = useState("");
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [sectionEditKey, setSectionEditKey] = useState("");
  const [sectionEditTitle, setSectionEditTitle] = useState("");
  const [selectedTaskUserId, setSelectedTaskUserId] = useState<string>("");
  const [selectedTaskRole, setSelectedTaskRole] = useState<"task_viewer" | "task_member" | "task_manager">(
    "task_member"
  );
  const [dataLoading, setDataLoading] = useState(false);
  const [savingManager, setSavingManager] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
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
          setCompanyUsers([]);
          setCompanyUsersWithRoles([]);
          setSelectedProjectId(null);
          setProjectUsers([]);
          return;
        }
        const [projectList, users, companyContextUsers] = await Promise.all([
          getProjects(token, firstCompany.id),
          getUsers(token, firstCompany.id),
          getCompanyUsersWithRoles(token, firstCompany.id)
        ]);
        if (!active) return;
        setProjects(projectList);
        setCompanyUsers(users);
        setCompanyUsersWithRoles(companyContextUsers);
        setSelectedProjectId((prev) => prev ?? (projectList[0]?.id ?? null));
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Cannot load settings");
      } finally {
        if (active) setDataLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!token || !selectedProjectId) {
      setProjectUsers([]);
      return;
    }
    let active = true;

    const loadUsers = async () => {
      try {
        const users = await getProjectUsers(token, selectedProjectId);
        if (!active) return;
        setProjectUsers(users);
      } catch (err) {
        if (!active) return;
        setProjectUsers([]);
        setError(err instanceof Error ? err.message : "Cannot load project users");
      }
    };

    loadUsers();
    return () => {
      active = false;
    };
  }, [token, selectedProjectId]);

  useEffect(() => {
    setSelectedProjectUserId("");
  }, [selectedProjectId]);

  useEffect(() => {
    if (!token || !selectedProjectId) {
      setProjectTasks([]);
      setSelectedTaskId(null);
      setTaskUsers([]);
      setTaskSections([]);
      setSelectedSectionId(null);
      return;
    }
    let active = true;
    const loadTasks = async () => {
      try {
        const tasks = await getTasksByProject(token, selectedProjectId);
        if (!active) return;
        setProjectTasks(Array.isArray(tasks) ? tasks : []);
        setSelectedTaskId((prev) => prev ?? (tasks[0]?.id ?? null));
      } catch (err) {
        if (!active) return;
        setProjectTasks([]);
        setSelectedTaskId(null);
        setTaskUsers([]);
        setTaskSections([]);
        setSelectedSectionId(null);
        setError(err instanceof Error ? err.message : "Cannot load project tasks");
      }
    };
    loadTasks();
    return () => {
      active = false;
    };
  }, [token, selectedProjectId]);

  useEffect(() => {
    if (!token || !selectedTaskId) {
      setTaskUsers([]);
      return;
    }
    let active = true;
    const loadTaskUsers = async () => {
      try {
        const users = await getTaskUsers(token, selectedTaskId);
        if (!active) return;
        setTaskUsers(Array.isArray(users) ? users : []);
      } catch (err) {
        if (!active) return;
        setTaskUsers([]);
        setError(err instanceof Error ? err.message : "Cannot load task users");
      }
    };
    loadTaskUsers();
    return () => {
      active = false;
    };
  }, [token, selectedTaskId]);

  useEffect(() => {
    setSelectedTaskUserId("");
  }, [selectedTaskId]);

  useEffect(() => {
    if (!token || !selectedTaskId) {
      setTaskSections([]);
      setSelectedSectionId(null);
      setSectionEditKey("");
      setSectionEditTitle("");
      return;
    }
    let active = true;
    const loadTaskSections = async () => {
      try {
        const sections = await getTaskSections(token, selectedTaskId);
        if (!active) return;
        const normalized = Array.isArray(sections) ? sections : [];
        setTaskSections(normalized);
        setSelectedSectionId((prev) => prev ?? (normalized[0]?.id ?? null));
      } catch (err) {
        if (!active) return;
        setTaskSections([]);
        setSelectedSectionId(null);
        setError(err instanceof Error ? err.message : "Cannot load task sections");
      }
    };
    loadTaskSections();
    return () => {
      active = false;
    };
  }, [token, selectedTaskId]);

  useEffect(() => {
    setSectionEditKey(selectedSection?.key ?? "");
    setSectionEditTitle(selectedSection?.title ?? "");
  }, [selectedSectionId, selectedSection]);

  useEffect(() => {
    setCompanyRoleDrafts(
      companyUsersWithRoles.reduce<Record<number, "company_viewer" | "company_member" | "company_admin">>((acc, user) => {
        if (user.role === "company_viewer" || user.role === "company_member" || user.role === "company_admin") {
          acc[user.id] = user.role;
        }
        return acc;
      }, {})
    );
  }, [companyUsersWithRoles]);

  const reloadCompanyContextData = async (options?: { keepProjectId?: boolean; preferredProjectId?: number | null }) => {
    if (!token || !company) return;
    const [projectList, users, companyContextUsers] = await Promise.all([
      getProjects(token, company.id),
      getUsers(token, company.id),
      getCompanyUsersWithRoles(token, company.id)
    ]);
    setProjects(projectList);
    setCompanyUsers(users);
    setCompanyUsersWithRoles(companyContextUsers);
    const preferred = options?.preferredProjectId ?? (options?.keepProjectId ? selectedProjectId : null);
    if (preferred && projectList.some((project) => project.id === preferred)) {
      setSelectedProjectId(preferred);
      return;
    }
    setSelectedProjectId(projectList[0]?.id ?? null);
  };

  const onCreateProject = async () => {
    if (!token || !company || !newProjectName.trim()) return;
    setSavingManager(true);
    setError(null);
    try {
      const created = await createProject(token, { company_id: company.id, name: newProjectName.trim() });
      setNewProjectName("");
      await reloadCompanyContextData({ preferredProjectId: created.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot create project");
    } finally {
      setSavingManager(false);
    }
  };

  const onDeleteProject = async (projectId: number) => {
    if (!token || !company) return;
    setSavingManager(true);
    setError(null);
    try {
      await deleteProject(token, projectId);
      await reloadCompanyContextData({ keepProjectId: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot delete project");
    } finally {
      setSavingManager(false);
    }
  };

  const onCreateCompanyUser = async () => {
    if (!token || !company || !newUserEmail.trim() || !newUserFullName.trim() || !newUserPassword) return;
    setSavingManager(true);
    setError(null);
    try {
      await createCompanyUser(token, {
        company_id: company.id,
        email: newUserEmail.trim(),
        full_name: newUserFullName.trim(),
        password: newUserPassword,
        role: newUserRole
      });
      setNewUserEmail("");
      setNewUserFullName("");
      setNewUserPassword("");
      setNewUserRole("company_member");
      await reloadCompanyContextData({ keepProjectId: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot create company user");
    } finally {
      setSavingManager(false);
    }
  };

  const onRemoveCompanyUser = async (userId: number) => {
    if (!token || !company) return;
    setSavingManager(true);
    setError(null);
    try {
      await removeCompanyUser(token, userId, company.id);
      await reloadCompanyContextData({ keepProjectId: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot remove company user");
    } finally {
      setSavingManager(false);
    }
  };

  const onUpdateCompanyUserRole = async (userId: number) => {
    if (!token || !company) return;
    const role = companyRoleDrafts[userId];
    if (!role) return;
    setSavingManager(true);
    setError(null);
    try {
      await updateCompanyUserRole(token, userId, company.id, role);
      await reloadCompanyContextData({ keepProjectId: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot update company user role");
    } finally {
      setSavingManager(false);
    }
  };

  const onAssignProjectRole = async () => {
    if (!token || !selectedProjectId || !selectedProjectUserId) return;
    setSavingManager(true);
    setError(null);
    try {
      await assignProjectUserRole(token, selectedProjectId, {
        user_id: Number(selectedProjectUserId),
        role: selectedProjectRole
      });
      const users = await getProjectUsers(token, selectedProjectId);
      setProjectUsers(users);
      setSelectedProjectUserId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot assign project role");
    } finally {
      setSavingManager(false);
    }
  };

  const onRemoveProjectRole = async (userId: number) => {
    if (!token || !selectedProjectId) return;
    setSavingManager(true);
    setError(null);
    try {
      await clearProjectUserRoles(token, selectedProjectId, userId);
      const users = await getProjectUsers(token, selectedProjectId);
      setProjectUsers(users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot remove project role");
    } finally {
      setSavingManager(false);
    }
  };

  const onAssignTaskRole = async () => {
    if (!token || !selectedTaskId || !selectedTaskUserId) return;
    setSavingManager(true);
    setError(null);
    try {
      await assignTaskUserRole(token, selectedTaskId, {
        user_id: Number(selectedTaskUserId),
        role: selectedTaskRole
      });
      const users = await getTaskUsers(token, selectedTaskId);
      setTaskUsers(Array.isArray(users) ? users : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot assign task role");
    } finally {
      setSavingManager(false);
    }
  };

  const onClearTaskRole = async (userId: number) => {
    if (!token || !selectedTaskId) return;
    setSavingManager(true);
    setError(null);
    try {
      await clearTaskUserRoles(token, selectedTaskId, userId);
      const users = await getTaskUsers(token, selectedTaskId);
      setTaskUsers(Array.isArray(users) ? users : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot remove task role");
    } finally {
      setSavingManager(false);
    }
  };

  const reloadSections = async () => {
    if (!token || !selectedTaskId) return;
    const sections = await getTaskSections(token, selectedTaskId);
    const normalized = Array.isArray(sections) ? sections : [];
    setTaskSections(normalized);
    setSelectedSectionId((prev) => {
      if (!normalized.length) return null;
      if (prev && normalized.some((section) => section.id === prev)) return prev;
      return normalized[0].id;
    });
  };

  const onCreateSection = async () => {
    if (!token || !selectedTaskId || !newSectionKey.trim() || !newSectionTitle.trim()) return;
    setSavingManager(true);
    setError(null);
    try {
      await createTaskSection(token, selectedTaskId, {
        key: newSectionKey.trim(),
        title: newSectionTitle.trim(),
        content: null,
        position: taskSections.length
      });
      setNewSectionKey("");
      setNewSectionTitle("");
      await reloadSections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot create section");
    } finally {
      setSavingManager(false);
    }
  };

  const onUpdateSection = async () => {
    if (!token || !selectedTaskId || !selectedSectionId || !sectionEditKey.trim() || !sectionEditTitle.trim()) return;
    setSavingManager(true);
    setError(null);
    try {
      await updateTaskSection(token, selectedTaskId, selectedSectionId, {
        key: sectionEditKey.trim(),
        title: sectionEditTitle.trim()
      });
      await reloadSections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot update section");
    } finally {
      setSavingManager(false);
    }
  };

  const onDeleteSection = async (sectionId: number) => {
    if (!token || !selectedTaskId) return;
    setSavingManager(true);
    setError(null);
    try {
      await deleteTaskSection(token, selectedTaskId, sectionId);
      await reloadSections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot delete section");
    } finally {
      setSavingManager(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h4">Settings</Typography>
        {(loading || dataLoading) && (
          <Stack direction="row" spacing={1.5} alignItems="center">
            <CircularProgress size={20} />
            <Typography>Loading...</Typography>
          </Stack>
        )}
        {error && <Alert severity="error">{error}</Alert>}

        {!loading && !dataLoading && !company && <Alert severity="warning">No available company context.</Alert>}

        {!loading && !dataLoading && company && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              Company: {company.name}
            </Typography>

            <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: "info.50", borderLeft: "4px solid", borderLeftColor: "info.main" }}>
              <Typography variant="subtitle1" sx={{ mt: 0.5, mb: 1 }}>
                Company projects
              </Typography>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ mb: 1.5 }}>
                <TextField
                  fullWidth
                  label="Project name"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                />
                <Button
                  variant="contained"
                  onClick={onCreateProject}
                  disabled={!newProjectName.trim() || savingManager}
                >
                  Add project
                </Button>
              </Stack>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell align="right">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {projects.length ? (
                    projects.map((project) => (
                      <TableRow key={project.id}>
                        <TableCell>{project.id}</TableCell>
                        <TableCell>{project.name}</TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            disabled={savingManager}
                            onClick={() => onDeleteProject(project.id)}
                          >
                            Delete project
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3}>No projects in this company.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Paper>

            <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: "success.50", borderLeft: "4px solid", borderLeftColor: "success.main" }}>
            <Typography variant="subtitle1" sx={{ mt: 0.5, mb: 1 }}>
              Company users
            </Typography>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ mb: 1.5 }}>
              <TextField
                fullWidth
                label="Full name"
                value={newUserFullName}
                onChange={(e) => setNewUserFullName(e.target.value)}
              />
              <TextField
                fullWidth
                label="Email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
              />
              <TextField
                fullWidth
                label="Password"
                type="password"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
              />
              <FormControl fullWidth>
                <InputLabel>Company role</InputLabel>
                <Select
                  value={newUserRole}
                  label="Company role"
                  onChange={(e) =>
                    setNewUserRole(e.target.value as "company_viewer" | "company_member")
                  }
                >
                  <MenuItem value="company_viewer">company_viewer</MenuItem>
                  <MenuItem value="company_member">company_member</MenuItem>
                </Select>
              </FormControl>
              <Button
                variant="contained"
                onClick={onCreateCompanyUser}
                disabled={!newUserEmail.trim() || !newUserFullName.trim() || !newUserPassword || savingManager}
              >
                Add user
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
                {companyUsersWithRoles.length ? (
                  companyUsersWithRoles.map((user) => (
                    <TableRow key={`${user.id}-${user.role}`}>
                      <TableCell>{user.full_name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Select
                          size="small"
                          value={companyRoleDrafts[user.id] ?? "company_member"}
                          onChange={(e) =>
                            setCompanyRoleDrafts((prev) => ({
                              ...prev,
                              [user.id]: e.target.value as "company_viewer" | "company_member" | "company_admin"
                            }))
                          }
                          disabled={user.role === "company_admin"}
                        >
                          <MenuItem value="company_viewer">company_viewer</MenuItem>
                          <MenuItem value="company_member">company_member</MenuItem>
                        </Select>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          <Button
                            size="small"
                            variant="outlined"
                            disabled={
                              savingManager ||
                              user.role === "company_admin" ||
                              !companyRoleDrafts[user.id] ||
                              companyRoleDrafts[user.id] === user.role
                            }
                            onClick={() => onUpdateCompanyUserRole(user.id)}
                          >
                            Save role
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            disabled={savingManager || user.role === "company_admin"}
                            onClick={() => onRemoveCompanyUser(user.id)}
                          >
                            Remove from company
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4}>No users in company context.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </Paper>

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

                <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: "warning.50", borderLeft: "4px solid", borderLeftColor: "warning.main" }}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  Project: {selectedProject?.name ?? "-"}
                </Typography>

                <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ mb: 1.5 }}>
                  <FormControl fullWidth>
                    <InputLabel>User for project role</InputLabel>
                    <Select
                      value={selectedProjectUserId}
                      label="User for project role"
                      onChange={(e) => setSelectedProjectUserId(String(e.target.value))}
                    >
                      <MenuItem value="">Select user</MenuItem>
                      {companyUsers.map((user) => (
                        <MenuItem key={user.id} value={String(user.id)}>
                          {user.full_name} ({user.email})
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl fullWidth>
                    <InputLabel>Project role</InputLabel>
                    <Select
                      value={selectedProjectRole}
                      label="Project role"
                      onChange={(e) =>
                        setSelectedProjectRole(
                          e.target.value as "project_viewer" | "project_member" | "project_manager"
                        )
                      }
                    >
                      <MenuItem value="project_viewer">project_viewer</MenuItem>
                      <MenuItem value="project_member">project_member</MenuItem>
                      <MenuItem value="project_manager">project_manager</MenuItem>
                    </Select>
                  </FormControl>
                  <Button
                    variant="contained"
                    onClick={onAssignProjectRole}
                    disabled={!selectedProjectUserId || savingManager || !selectedProjectId}
                  >
                    Save project role
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
                    {projectUsers.length ? (
                      projectUsers.map((user) => (
                        <TableRow key={`${user.id}-${user.role}`}>
                          <TableCell>{user.full_name}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>{user.role}</TableCell>
                          <TableCell align="right">
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              disabled={savingManager}
                              onClick={() => onRemoveProjectRole(user.id)}
                            >
                              Remove role
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4}>No users in selected project context.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                </Paper>

                <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: "secondary.50", borderLeft: "4px solid", borderLeftColor: "secondary.main" }}>
                <Typography variant="subtitle1" sx={{ mt: 0.5, mb: 1 }}>
                  Tasks
                </Typography>
                {projectTasks.length ? (
                  <>
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

                    <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ mb: 1.5 }}>
                      <FormControl fullWidth>
                        <InputLabel>User for task role</InputLabel>
                        <Select
                          value={selectedTaskUserId}
                          label="User for task role"
                          onChange={(e) => setSelectedTaskUserId(String(e.target.value))}
                        >
                          <MenuItem value="">Select user</MenuItem>
                          {companyUsers.map((user) => (
                            <MenuItem key={user.id} value={String(user.id)}>
                              {user.full_name} ({user.email})
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <FormControl fullWidth>
                        <InputLabel>Task role</InputLabel>
                        <Select
                          value={selectedTaskRole}
                          label="Task role"
                          onChange={(e) =>
                            setSelectedTaskRole(e.target.value as "task_viewer" | "task_member" | "task_manager")
                          }
                        >
                          <MenuItem value="task_viewer">task_viewer</MenuItem>
                          <MenuItem value="task_member">task_member</MenuItem>
                          <MenuItem value="task_manager">task_manager</MenuItem>
                        </Select>
                      </FormControl>
                      <Button
                        variant="contained"
                        onClick={onAssignTaskRole}
                        disabled={!selectedTaskUserId || savingManager || !selectedTaskId}
                      >
                        Save task role
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
                        {taskUsers.length ? (
                          taskUsers.map((taskUser) => (
                            <TableRow key={`${taskUser.id}-${taskUser.role}`}>
                              <TableCell>{taskUser.full_name}</TableCell>
                              <TableCell>{taskUser.email}</TableCell>
                              <TableCell>{taskUser.role}</TableCell>
                              <TableCell align="right">
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="error"
                                  disabled={savingManager}
                                  onClick={() => onClearTaskRole(taskUser.id)}
                                >
                                  Remove role
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4}>No users with task roles for selected task.</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>

                    <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>
                      Sections
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
                      <Button
                        variant="contained"
                        onClick={onCreateSection}
                        disabled={!newSectionKey.trim() || !newSectionTitle.trim() || savingManager || !selectedTaskId}
                      >
                        Add section
                      </Button>
                    </Stack>

                    {taskSections.length ? (
                      <Paper variant="outlined" sx={{ p: 1.25, bgcolor: "grey.100", borderLeft: "4px solid", borderLeftColor: "grey.500" }}>
                        <Tabs
                          value={selectedSectionId}
                          onChange={(_, value: number) => setSelectedSectionId(value)}
                          variant="scrollable"
                          scrollButtons="auto"
                          sx={{ mb: 1 }}
                        >
                          {taskSections.map((section) => (
                            <Tab key={section.id} label={section.title} value={section.id} />
                          ))}
                        </Tabs>

                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>ID</TableCell>
                              <TableCell>Key</TableCell>
                              <TableCell>Title</TableCell>
                              <TableCell>Position</TableCell>
                              <TableCell>Version</TableCell>
                              <TableCell align="right">Action</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {selectedSection ? (
                              <TableRow key={selectedSection.id}>
                                <TableCell>{selectedSection.id}</TableCell>
                                <TableCell>{selectedSection.key}</TableCell>
                                <TableCell>{selectedSection.title}</TableCell>
                                <TableCell>{selectedSection.position}</TableCell>
                                <TableCell>{selectedSection.version}</TableCell>
                                <TableCell align="right">
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    color="error"
                                    disabled={savingManager}
                                    onClick={() => onDeleteSection(selectedSection.id)}
                                  >
                                    Delete section
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ) : (
                              <TableRow>
                                <TableCell colSpan={6}>Select section tab.</TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>

                        <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ mt: 1.5 }}>
                          <TextField
                            fullWidth
                            label="Edit key"
                            value={sectionEditKey}
                            onChange={(e) => setSectionEditKey(e.target.value)}
                            disabled={!selectedSection}
                          />
                          <TextField
                            fullWidth
                            label="Edit title"
                            value={sectionEditTitle}
                            onChange={(e) => setSectionEditTitle(e.target.value)}
                            disabled={!selectedSection}
                          />
                          <Button
                            variant="contained"
                            onClick={onUpdateSection}
                            disabled={!selectedSection || !sectionEditKey.trim() || !sectionEditTitle.trim() || savingManager}
                          >
                            Update section
                          </Button>
                        </Stack>
                      </Paper>
                    ) : (
                      <Typography color="text.secondary">No sections in selected task.</Typography>
                    )}
                  </>
                ) : (
                  <Typography color="text.secondary">No tasks in selected project.</Typography>
                )}
                </Paper>
              </>
            ) : (
              <Typography color="text.secondary">No projects in this company.</Typography>
            )}
          </Paper>
        )}
      </Stack>
    </Container>
  );
}
