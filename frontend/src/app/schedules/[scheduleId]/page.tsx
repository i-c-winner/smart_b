"use client";

import {
  Alert,
  Box,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography
} from "@mui/material";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getSchedule,
  getScheduleByProject,
  getTask,
  getTaskSectionPermissions,
  getTaskSections
} from "@/shared/api/domain-api";
import { useAuth } from "@/shared/lib/auth/auth-context";
import type { Schedule, TaskSection } from "@/shared/types/domain";

function statusColor(status: TaskSection["status"]): string {
  if (status === "finished") return "success.main";
  if (status === "in_progress") return "warning.main";
  return "error.main";
}

export default function ScheduleDetailsPage() {
  const params = useParams<{ scheduleId: string }>();
  const router = useRouter();
  const { token, loading } = useAuth();

  const scheduleId = useMemo(() => Number(params?.scheduleId), [params?.scheduleId]);

  const [sections, setSections] = useState<TaskSection[]>([]);
  const [sectionSchedules, setSectionSchedules] = useState<Record<number, Schedule>>({});
  const [sectionEditors, setSectionEditors] = useState<Record<number, string>>({});

  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !token) {
      router.replace("/login");
    }
  }, [loading, token, router]);

  const load = useCallback(async (activeGuard = { active: true }) => {
    if (!token || !Number.isFinite(scheduleId)) return;
    const isActive = () => activeGuard.active;
    try {
      setDataLoading(true);
      setError(null);

      const schedule = await getSchedule(token, scheduleId);
      if (!isActive()) return;

      if (!schedule.task_id) {
        setSections([]);
        setSectionSchedules({});
        setSectionEditors({});
        setError("This schedule is not attached to task-level context.");
        return;
      }

      const taskData = await getTask(token, schedule.task_id).catch(() => null);
      const projectSchedules = taskData ? await getScheduleByProject(token, taskData.project_id).catch(() => []) : [];
      const taskSections = taskData ? await getTaskSections(token, taskData.id).catch(() => []) : [];

      const sectionScheduleMap: Record<number, Schedule> = {};
      for (const item of projectSchedules) {
        if (item.section_id) {
          sectionScheduleMap[item.section_id] = item;
        }
      }

      const sectionEditorMap: Record<number, string> = {};

      if (taskData) {
        await Promise.all(
          taskSections.map(async (section) => {
            const perms = await getTaskSectionPermissions(token, taskData.id, section.id).catch(() => []);
            const editors = perms
              .filter((perm) => perm.role === "section_editor")
              .map((perm) => perm.full_name)
              .filter(Boolean);
            sectionEditorMap[section.id] = editors.length ? editors.join(", ") : "-";
          })
        );
      }

      if (!isActive()) return;
      setSections(taskSections);
      setSectionSchedules(sectionScheduleMap);
      setSectionEditors(sectionEditorMap);
    } catch (err) {
      if (!isActive()) return;
      setError(err instanceof Error ? err.message : "Cannot load schedule details");
    } finally {
      if (isActive()) setDataLoading(false);
    }
  }, [token, scheduleId]);

  useEffect(() => {
    if (!token || !Number.isFinite(scheduleId)) return;
    const activeGuard = { active: true };
    load(activeGuard);
    return () => {
      activeGuard.active = false;
    };
  }, [token, scheduleId, load]);

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Stack spacing={2}>
        {(loading || dataLoading) && (
          <Stack direction="row" spacing={1.5} alignItems="center">
            <CircularProgress size={20} />
            <Typography>Loading...</Typography>
          </Stack>
        )}

        {error && <Alert severity="error">{error}</Alert>}

        {!loading && !dataLoading && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 1.5 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Box
                  component="span"
                  sx={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    border: "5px solid",
                    borderColor: "error.main",
                    display: "inline-block",
                    boxSizing: "border-box"
                  }}
                />
                <Typography variant="body2">Новое</Typography>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Box
                  component="span"
                  sx={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    border: "5px solid",
                    borderColor: "warning.main",
                    display: "inline-block",
                    boxSizing: "border-box"
                  }}
                />
                <Typography variant="body2">Принято в работу</Typography>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Box
                  component="span"
                  sx={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    border: "5px solid",
                    borderColor: "success.main",
                    display: "inline-block",
                    boxSizing: "border-box"
                  }}
                />
                <Typography variant="body2">Окончено</Typography>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Box component="svg" viewBox="0 0 24 24" sx={{ width: 20, height: 20, display: "block" }}>
                  <path d="M12 2 22 20a2 2 0 0 1-1.74 3H3.74A2 2 0 0 1 2 20L12 2z" fill="#e40000" />
                  <rect x="11" y="8" width="2" height="7" rx="1" fill="#fff" />
                  <circle cx="12" cy="18" r="1.3" fill="#fff" />
                </Box>
                <Typography variant="body2">Просрочено</Typography>
              </Stack>
            </Stack>
            <Typography variant="h6" sx={{ mb: 1 }}>
              Sections
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Section</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Ответственный</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sections.length ? (
                  sections.map((section) => {
                    const schedule = sectionSchedules[section.id];
                    const plannedEnd = schedule?.planned_end_at ? new Date(schedule.planned_end_at) : null;
                    const isOverdue = !!plannedEnd && !Number.isNaN(plannedEnd.getTime()) && Date.now() > plannedEnd.getTime();
                    return (
                      <TableRow key={section.id}>
                        <TableCell>{section.title}</TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={1} alignItems="center">
                            {isOverdue ? (
                              <Tooltip title="Planned end date is in the past">
                                <Box
                                  component="svg"
                                  viewBox="0 0 24 24"
                                  sx={{ width: 28, height: 28, display: "block" }}
                                >
                                  <path d="M12 2 22 20a2 2 0 0 1-1.74 3H3.74A2 2 0 0 1 2 20L12 2z" fill="#e40000" />
                                  <rect x="11" y="8" width="2" height="7" rx="1" fill="#fff" />
                                  <circle cx="12" cy="18" r="1.3" fill="#fff" />
                                </Box>
                              </Tooltip>
                            ) : (
                              <Typography
                                component="span"
                                sx={{
                                  width: 31,
                                  height: 31,
                                  borderRadius: "50%",
                                  border: "8px solid",
                                  borderColor: statusColor(section.status),
                                  display: "inline-block",
                                  boxSizing: "border-box"
                                }}
                              >
                                &nbsp;
                              </Typography>
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell>{sectionEditors[section.id] ?? "-"}</TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={3}>No sections</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        )}
      </Stack>
    </Container>
  );
}
