"use client";

import { Alert, Box, Button, CircularProgress, Container, Dialog, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography, useTheme } from "@mui/material";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  getCompanies,
  getCompanyUsersWithRoles,
  getProjectUsers,
  getProjects,
  getScheduleByProject,
  getScheduleUsers,
  getTaskSectionPermissions,
  getTaskSections,
  getTasksByProject,
  getTaskUsers,
  getUsers
} from "@/shared/api/domain-api";
import { useAuth } from "@/shared/lib/auth/auth-context";
import { prepareUsersForDisplay } from "@/shared/lib/users/prepare-users-for-display";

type GraphNode = {
  id: string;
  name: string;
  category: number;
  symbolSize: number;
};

type GraphLink = {
  source: string;
  target: string;
  value?: string;
};

type GraphUserInfo = {
  id: number;
  full_name: string;
  email: string;
  phone?: string | null;
  section_editor_assignments: Array<{
    section_id: number;
    section_title: string;
    project_id: number;
    project_name: string;
  }>;
};

export function HomePage() {
  const muiTheme = useTheme();
  const isDarkMode = muiTheme.palette.mode === "dark";
  const router = useRouter();
  const { token, loading } = useAuth();
  const chartRef = useRef<HTMLDivElement | null>(null);
  const chartInstanceRef = useRef<{
    setOption: (option: unknown) => void;
    resize: () => void;
    dispose: () => void;
    dispatchAction: (payload: unknown) => void;
    on: (eventName: string, handler: (params: unknown) => void) => void;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [usersByNodeId, setUsersByNodeId] = useState<Record<string, GraphUserInfo>>({});
  const [selectedUser, setSelectedUser] = useState<GraphUserInfo | null>(null);
  const [search, setSearch] = useState("");
  const [nodeTypeFilter, setNodeTypeFilter] = useState<string>("all");

  const categories = useMemo(
    () => [
      { name: "Company" },
      { name: "Project" },
      { name: "Task" },
      { name: "Schedule" },
      { name: "User" },
      { name: "Section" }
    ],
    []
  );

  const { displayNodes, displayLinks } = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filteredByType = nodeTypeFilter === "all"
      ? nodes
      : nodes.filter((node) => categories[node.category]?.name === nodeTypeFilter);
    const filteredNodeIdsByType = new Set(filteredByType.map((node) => node.id));
    const linksByType = links.filter(
      (link) => filteredNodeIdsByType.has(link.source) && filteredNodeIdsByType.has(link.target)
    );

    if (!query) {
      return { displayNodes: filteredByType, displayLinks: linksByType };
    }

    const nodeById = new Map(filteredByType.map((node) => [node.id, node]));
    const matchedNodeIds = new Set<string>();
    for (const node of filteredByType) {
      if (node.name.toLowerCase().includes(query) || node.id.toLowerCase().includes(query)) {
        matchedNodeIds.add(node.id);
      }
    }

    const matchedLinkKeys = new Set<string>();
    const includedNodeIds = new Set<string>(matchedNodeIds);
    for (const link of linksByType) {
      const sourceNode = nodeById.get(link.source);
      const targetNode = nodeById.get(link.target);
      const sourceText = `${link.source} ${sourceNode?.name ?? ""}`.toLowerCase();
      const targetText = `${link.target} ${targetNode?.name ?? ""}`.toLowerCase();
      const valueText = (link.value ?? "").toLowerCase();
      const isMatch =
        valueText.includes(query) || sourceText.includes(query) || targetText.includes(query);
      if (isMatch) {
        matchedLinkKeys.add(`${link.source}|${link.target}|${link.value ?? ""}`);
        includedNodeIds.add(link.source);
        includedNodeIds.add(link.target);
      }
    }

    const filteredNodes = filteredByType.filter((node) => includedNodeIds.has(node.id));
    const filteredLinks = linksByType.filter((link) => {
      if (!includedNodeIds.has(link.source) || !includedNodeIds.has(link.target)) return false;
      if (matchedNodeIds.has(link.source) || matchedNodeIds.has(link.target)) return true;
      return matchedLinkKeys.has(`${link.source}|${link.target}|${link.value ?? ""}`);
    });

    return { displayNodes: filteredNodes, displayLinks: filteredLinks };
  }, [nodes, links, search, nodeTypeFilter, categories]);

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
        if (!active) return;

        const graphNodes: GraphNode[] = [];
        const graphLinks: GraphLink[] = [];
        const userSet = new Set<string>();
        const graphUsers: Record<string, GraphUserInfo> = {};

        for (const company of companies) {
          const companyId = `company-${company.id}`;
          graphNodes.push({
            id: companyId,
            name: company.name,
            category: 0,
            symbolSize: 64
          });

          const [projects, companyUsers, companyUserRoles] = await Promise.all([
            getProjects(token, company.id).catch(() => []),
            getUsers(token, company.id).catch(() => []),
            getCompanyUsersWithRoles(token, company.id).catch(() => [])
          ]);
          const displayUsers = prepareUsersForDisplay(companyUsers);
          const rolesByUser = new Map<number, string[]>();
          for (const roleItem of companyUserRoles) {
            const existing = rolesByUser.get(roleItem.id) ?? [];
            existing.push(roleItem.role);
            rolesByUser.set(roleItem.id, existing);
          }

          for (const user of displayUsers) {
            const userId = `user-${user.id}`;
            if (!userSet.has(userId)) {
              userSet.add(userId);
              graphNodes.push({
                id: userId,
                name: user.full_name,
                category: 4,
                symbolSize: 40
              });
            }
            graphUsers[userId] = {
              id: user.id,
              full_name: user.full_name,
              email: user.email,
              phone: user.phone ?? null,
              section_editor_assignments: graphUsers[userId]?.section_editor_assignments ?? []
            };
            const userRoles = rolesByUser.get(user.id);
            if (userRoles?.length) {
              for (const role of userRoles) {
                graphLinks.push({ source: companyId, target: userId, value: role });
              }
            } else {
              graphLinks.push({ source: companyId, target: userId, value: "company" });
            }
          }

          for (const project of projects) {
            const projectId = `project-${project.id}`;
            graphNodes.push({
              id: projectId,
              name: project.name,
              category: 1,
              symbolSize: 52
            });
            graphLinks.push({ source: companyId, target: projectId });

            const presentNodeId = `present-project-${project.id}`;
            graphNodes.push({
              id: presentNodeId,
              name: "present",
              category: 1,
              symbolSize: 34
            });
            graphLinks.push({ source: projectId, target: presentNodeId, value: "present" });

            const projectUsers = await getProjectUsers(token, project.id).catch(() => []);
            for (const role of projectUsers) {
              const userId = `user-${role.id}`;
              if (!userSet.has(userId)) {
                userSet.add(userId);
                graphNodes.push({
                  id: userId,
                  name: role.full_name,
                  category: 4,
                  symbolSize: 40
                });
              }
              graphUsers[userId] = {
                id: role.id,
                full_name: role.full_name,
                email: role.email,
                phone: graphUsers[userId]?.phone ?? null,
                section_editor_assignments: graphUsers[userId]?.section_editor_assignments ?? []
              };
              graphLinks.push({ source: projectId, target: userId, value: role.role });
            }

            const [tasks, schedules] = await Promise.all([
              getTasksByProject(token, project.id).catch(() => []),
              getScheduleByProject(token, project.id).catch(() => [])
            ]);
            const taskSchedules = schedules.filter((schedule) => schedule.task_id && !schedule.section_id);
            const scheduleByTaskId = new Map<number, number>();
            for (const schedule of taskSchedules) {
              if (schedule.task_id) {
                scheduleByTaskId.set(schedule.task_id, schedule.id);
              }
            }

            for (const task of tasks) {
              const taskId = `task-${task.id}`;
              graphNodes.push({
                id: taskId,
                name: task.title,
                category: 2,
                symbolSize: 44
              });
              graphLinks.push({ source: projectId, target: taskId });

              const taskRoles = await getTaskUsers(token, task.id).catch(() => []);
              for (const role of taskRoles) {
                const userId = `user-${role.id}`;
                graphLinks.push({ source: userId, target: taskId, value: role.role });
              }

              const sections = await getTaskSections(token, task.id).catch(() => []);
              for (const section of sections) {
                const sectionId = `section-${section.id}`;
                graphNodes.push({
                  id: sectionId,
                  name: section.title,
                  category: 5,
                  symbolSize: 36
                });
                graphLinks.push({ source: taskId, target: sectionId });

                const sectionPerms = await getTaskSectionPermissions(token, task.id, section.id).catch(() => []);
                for (const perm of sectionPerms) {
                  const userId = `user-${perm.user_id}`;
                  graphLinks.push({ source: userId, target: sectionId, value: perm.role });
                  if (perm.role === "section_editor") {
                    const existing = graphUsers[userId];
                    const assignment = {
                      section_id: section.id,
                      section_title: section.title,
                      project_id: project.id,
                      project_name: project.name
                    };
                    if (existing) {
                      const alreadyAdded = existing.section_editor_assignments.some(
                        (item) => item.section_id === section.id
                      );
                      if (!alreadyAdded) {
                        existing.section_editor_assignments.push(assignment);
                      }
                    } else {
                      graphUsers[userId] = {
                        id: perm.user_id,
                        full_name: perm.full_name,
                        email: perm.email,
                        phone: null,
                        section_editor_assignments: [assignment]
                      };
                    }
                  }
                }
              }
            }

            for (const schedule of taskSchedules) {
              const scheduleId = `schedule-${schedule.id}`;
              graphNodes.push({
                id: scheduleId,
                name: schedule.title,
                category: 3,
                symbolSize: 44
              });
              graphLinks.push({ source: projectId, target: scheduleId });

              const scheduleRoles = await getScheduleUsers(token, schedule.id).catch(() => []);
              for (const role of scheduleRoles) {
                const userId = `user-${role.id}`;
                graphLinks.push({ source: userId, target: scheduleId, value: role.role });
              }
            }
          }
        }

        if (!active) return;
        setNodes(graphNodes);
        setLinks(graphLinks);
        setUsersByNodeId(graphUsers);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Cannot load graph data");
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
    if (!chartRef.current) return;

    let disposed = false;
    let chart: {
      setOption: (option: unknown) => void;
      resize: () => void;
      dispose: () => void;
      on: (eventName: string, handler: (params: unknown) => void) => void;
      dispatchAction: (payload: unknown) => void;
    } | null = null;

    const init = async () => {
      const echarts = await import("echarts");
      if (!chartRef.current || disposed) return;

      chart = echarts.init(chartRef.current) as unknown as {
        setOption: (option: unknown) => void;
        resize: () => void;
        dispose: () => void;
        on: (eventName: string, handler: (params: unknown) => void) => void;
        dispatchAction: (payload: unknown) => void;
      };
      chartInstanceRef.current = chart;
      chart.setOption({
        tooltip: {},
        legend: [
          {
            data: categories.map((item) => item.name),
            top: 10,
            left: 12,
            itemWidth: 14,
            itemHeight: 10,
            itemGap: 14,
            textStyle: {
              fontSize: 12,
              color: isDarkMode ? "#e2e8f0" : "#12202f"
            }
          }
        ],
        series: [
          {
            type: "graph",
            layout: "force",
            roam: true,
            draggable: true,
            cursor: "pointer",
            data: displayNodes,
            links: displayLinks,
            categories,
            force: {
              repulsion: 360,
              edgeLength: 120
            },
            lineStyle: {
              color: "#9aa8b7",
              curveness: 0.12
            },
            emphasis: {
              focus: "adjacency",
              lineStyle: {
                width: 2
              }
            },
            blur: {
              itemStyle: {
                opacity: 0.15
              },
              lineStyle: {
                opacity: 0.08
              },
              label: {
                opacity: 0.15
              }
            },
            label: {
              show: true,
              position: "right",
              formatter: "{b}",
              fontSize: 11,
              color: isDarkMode ? "#f8fafc" : "#12202f"
            },
            edgeLabel: {
              show: true,
              color: isDarkMode ? "#dbeafe" : "#2f3f52",
              formatter: (params: { data?: { value?: string } }) => params.data?.value ?? ""
            }
          }
        ]
      });

      chart.on("click", (params: unknown) => {
        if (!params || typeof params !== "object") return;
        const event = params as { dataType?: string; data?: { id?: string } };
        if (event.dataType !== "node") return;
        const rawId = event.data?.id;
        if (!rawId) return;
        if (rawId.startsWith("schedule-")) {
          const scheduleId = rawId.replace("schedule-", "");
          if (!scheduleId) return;
          router.push(`/schedules/${scheduleId}`);
          return;
        }
        if (rawId.startsWith("task-")) {
          const taskId = rawId.replace("task-", "");
          if (!taskId) return;
          router.push(`/tasks/${taskId}`);
          return;
        }
        if (rawId.startsWith("present-project-")) {
          router.push("/present");
          return;
        }
        if (rawId.startsWith("user-")) {
          const info = usersByNodeId[rawId];
          if (info) {
            setSelectedUser(info);
          }
        }
      });

      const onResize = () => chart?.resize();
      window.addEventListener("resize", onResize);

      return () => {
        window.removeEventListener("resize", onResize);
      };
    };

    let cleanupResize: (() => void) | undefined;
    init().then((cleanup) => {
      cleanupResize = cleanup;
    });

    return () => {
      disposed = true;
      cleanupResize?.();
      chart?.dispose();
      chartInstanceRef.current = null;
    };
  }, [displayNodes, displayLinks, categories, router, usersByNodeId, isDarkMode]);

  return (
    <Container
      maxWidth={false}
      sx={{
        py: 1.5,
        px: { xs: 1.5, md: 3 },
        height: "calc(100vh - 64px)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column"
      }}
    >
      <Typography variant="h4" sx={{ mb: 1 }}>
        Context Graph
      </Typography>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ mb: 1.5 }}>
        <TextField
          size="small"
          fullWidth
          label="Search nodes and edges"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="node title, id, role name..."
        />
        <FormControl size="small" sx={{ minWidth: 210 }}>
          <InputLabel id="node-type-filter-label">Node type</InputLabel>
          <Select
            labelId="node-type-filter-label"
            value={nodeTypeFilter}
            label="Node type"
            onChange={(e) => setNodeTypeFilter(String(e.target.value))}
          >
            <MenuItem value="all">All types</MenuItem>
            {categories.filter((item) => item.name !== "Company").map((item) => (
              <MenuItem key={item.name} value={item.name}>
                {item.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button variant="outlined" onClick={() => setSearch("")} disabled={!search}>
          Clear
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Showing {displayNodes.length} nodes and {displayLinks.length} edges
      </Typography>
      {(loading || dataLoading) && (
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
          <CircularProgress size={20} />
          <Typography>Loading graph...</Typography>
        </Stack>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!dataLoading && !error && (
        <Paper variant="outlined" sx={{ flex: 1, mb: 0, overflow: "hidden", p: 1.5 }}>
          <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
            <Button variant="outlined" type="button" onClick={() => chartInstanceRef.current?.dispatchAction({ type: "restore" })}>
              Center graph
            </Button>
          </Box>
          <div ref={chartRef} style={{ width: "100%", height: "calc(100% - 44px)" }} />
        </Paper>
      )}
      <Dialog open={!!selectedUser} onClose={() => setSelectedUser(null)} maxWidth="xs" fullWidth>
        <DialogTitle>User info</DialogTitle>
        <DialogContent>
          {selectedUser && (
            <Stack spacing={1}>
              <Typography><strong>ID:</strong> {selectedUser.id}</Typography>
              <Typography><strong>Name:</strong> {selectedUser.full_name}</Typography>
              <Typography><strong>Email:</strong> {selectedUser.email}</Typography>
              <Typography><strong>Phone:</strong> {selectedUser.phone || "-"}</Typography>
              <Box>
                <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Section editor:</Typography>
                {selectedUser.section_editor_assignments.length ? (
                  <Stack spacing={0.5}>
                    {selectedUser.section_editor_assignments.map((item) => (
                      <Typography key={`${item.project_id}-${item.section_id}`} variant="body2">
                        {item.section_title} (project: {item.project_name})
                      </Typography>
                    ))}
                  </Stack>
                ) : (
                  <Typography variant="body2">-</Typography>
                )}
              </Box>
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </Container>
  );
}

export default HomePage;
