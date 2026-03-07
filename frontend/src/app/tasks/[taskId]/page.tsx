"use client";

import { Alert, Button, CircularProgress, Container, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, TextField, Typography } from "@mui/material";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  getTask,
  getTaskSectionPermissions,
  getTaskSections,
  updateTaskSection,
  updateTaskSectionStatus
} from "@/shared/api/domain-api";
import { useAuth } from "@/shared/lib/auth/auth-context";
import type { Task, TaskSection } from "@/shared/types/domain";

function unknownToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => unknownToText(item)).filter(Boolean).join("\n");
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => {
        const nestedText = unknownToText(nested);
        return nestedText ? `${key}: ${nestedText}` : key;
      })
      .join("\n");
  }
  return String(value);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function contentToText(content: Record<string, unknown> | null): string {
  if (!content) return "";
  if (typeof content.text === "string") return content.text;
  return unknownToText(content);
}

export default function TaskDetailsPage() {
  const params = useParams<{ taskId: string }>();
  const router = useRouter();
  const { token, currentUser, loading } = useAuth();

  const taskId = useMemo(() => Number(params?.taskId), [params?.taskId]);

  const [task, setTask] = useState<Task | null>(null);
  const [sections, setSections] = useState<TaskSection[]>([]);
  const [editorSectionIds, setEditorSectionIds] = useState<Record<number, boolean>>({});
  const [contentDrafts, setContentDrafts] = useState<Record<number, string>>({});
  const [savingSectionId, setSavingSectionId] = useState<number | null>(null);
  const [statusUpdatingSectionId, setStatusUpdatingSectionId] = useState<number | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !token) {
      router.replace("/login");
    }
  }, [loading, token, router]);

  useEffect(() => {
    if (!token || !Number.isFinite(taskId)) return;
    let active = true;

    const load = async () => {
      setDataLoading(true);
      setError(null);
      try {
        const [taskData, sectionList] = await Promise.all([
          getTask(token, taskId),
          getTaskSections(token, taskId)
        ]);
        if (!active) return;
        setTask(taskData);
        const normalizedSections = Array.isArray(sectionList) ? sectionList : [];
        setSections(normalizedSections);

        const editorMap: Record<number, boolean> = {};
        const drafts: Record<number, string> = {};
        await Promise.all(
          normalizedSections.map(async (section) => {
            drafts[section.id] = contentToText(section.content);
            const perms = await getTaskSectionPermissions(token, taskId, section.id).catch(() => []);
            editorMap[section.id] = Array.isArray(perms)
              ? perms.some(
                  (perm) => perm.user_id === currentUser?.id && perm.role === "section_editor"
                )
              : false;
          })
        );
        if (!active) return;
        setEditorSectionIds(editorMap);
        setContentDrafts(drafts);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Cannot load task sections content");
      } finally {
        if (active) setDataLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [token, taskId, currentUser]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const onSaveSection = async (sectionId: number) => {
    if (!token || !taskId || !editorSectionIds[sectionId]) return;
    const contentText = contentDrafts[sectionId] ?? "";
    setSavingSectionId(sectionId);
    setError(null);
    try {
      const updated = await updateTaskSection(token, taskId, sectionId, {
        content: { text: contentText }
      });
      setSections((prev) => prev.map((section) => (section.id === sectionId ? updated : section)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot save section content");
    } finally {
      setSavingSectionId(null);
    }
  };

  const onGeneratePdf = async () => {
    if (!task) return;
    setGeneratingPdf(true);
    setError(null);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      try {
        const fontResponse = await fetch("/fonts/Arial.ttf");
        if (fontResponse.ok) {
          const fontBuffer = await fontResponse.arrayBuffer();
          const fontBase64 = arrayBufferToBase64(fontBuffer);
          doc.addFileToVFS("Arial.ttf", fontBase64);
          doc.addFont("Arial.ttf", "ArialCustom", "normal");
          doc.setFont("ArialCustom", "normal");
        } else {
          doc.setFont("helvetica", "normal");
        }
      } catch {
        doc.setFont("helvetica", "normal");
      }

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 40;
      const marginTop = 48;
      const marginBottom = 40;
      const lineHeight = 16;
      let y = marginTop;

      const ensureSpace = (needHeight: number) => {
        if (y + needHeight <= pageHeight - marginBottom) return;
        doc.addPage();
        y = marginTop;
      };

      doc.setFontSize(16);
      const titleLines = doc.splitTextToSize(`Task: ${task.title}`, pageWidth - marginX * 2);
      ensureSpace(titleLines.length * lineHeight + 8);
      doc.text(titleLines, marginX, y);
      y += titleLines.length * lineHeight + 8;

      doc.setFontSize(11);
      const metaLines = doc.splitTextToSize(`task_id: ${task.id}`, pageWidth - marginX * 2);
      ensureSpace(metaLines.length * lineHeight + 8);
      doc.text(metaLines, marginX, y);
      y += metaLines.length * lineHeight + 12;

      if (!sections.length) {
        ensureSpace(lineHeight);
        doc.text("No sections in this task.", marginX, y);
      } else {
        for (const section of sections) {
          const sectionTitle = `Section: ${section.title}`;
          const sectionKey = `key: ${section.key}`;
          const sectionContent = contentToText(section.content) || "-";
          const sectionTitleLines = doc.splitTextToSize(sectionTitle, pageWidth - marginX * 2);
          const sectionKeyLines = doc.splitTextToSize(sectionKey, pageWidth - marginX * 2);
          const contentLines = doc.splitTextToSize(sectionContent, pageWidth - marginX * 2);

          ensureSpace((sectionTitleLines.length + sectionKeyLines.length + 1) * lineHeight);
          doc.setFontSize(13);
          doc.text(sectionTitleLines, marginX, y);
          y += sectionTitleLines.length * lineHeight;
          doc.setFontSize(10);
          doc.text(sectionKeyLines, marginX, y);
          y += sectionKeyLines.length * lineHeight + 4;

          doc.setDrawColor(220, 220, 220);
          doc.line(marginX, y, pageWidth - marginX, y);
          y += 8;

          doc.setFontSize(11);
          for (const line of contentLines) {
            ensureSpace(lineHeight);
            doc.text(line, marginX, y);
            y += lineHeight;
          }
          y += 12;
        }
      }

      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setPdfOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot generate PDF");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const nextSectionStatus = (status: TaskSection["status"]): TaskSection["status"] => {
    if (status === "new") return "in_progress";
    if (status === "in_progress") return "finished";
    return "finished";
  };

  const statusButtonText = (status: TaskSection["status"]): string => {
    if (status === "new") return "Принять в работу";
    if (status === "in_progress") return "Окончить редактирование";
    return "Окончено";
  };

  const onChangeSectionStatus = async (section: TaskSection) => {
    if (!token || !taskId || !editorSectionIds[section.id] || section.status === "finished") return;
    setStatusUpdatingSectionId(section.id);
    setError(null);
    try {
      const updated = await updateTaskSectionStatus(
        token,
        taskId,
        section.id,
        nextSectionStatus(section.status)
      );
      setSections((prev) => prev.map((item) => (item.id === section.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cannot update section status");
    } finally {
      setStatusUpdatingSectionId(null);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 2 }}>
      <Stack spacing={2.5}>
        <Typography variant="h4">Task Sections Content</Typography>

        {(loading || dataLoading) && (
          <Stack direction="row" spacing={1.5} alignItems="center">
            <CircularProgress size={20} />
            <Typography>Loading...</Typography>
          </Stack>
        )}

        {error && <Alert severity="error">{error}</Alert>}

        {!loading && !dataLoading && task && (
          <Paper variant="outlined" sx={{ p: 2.25, borderRadius: 2 }}>
            <Typography variant="h6">Task: {task.title}</Typography>
            <Typography variant="body2" color="text.secondary">
              task_id: {task.id}
            </Typography>
            <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1.5, pt: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
              <Button variant="contained" onClick={onGeneratePdf} disabled={generatingPdf}>
                Сохранить
              </Button>
            </Stack>
          </Paper>
        )}

        {!loading && !dataLoading && sections.length > 0 && (
          <Stack spacing={2}>
            {sections.map((section) => (
              <Paper
                key={section.id}
                variant="outlined"
                sx={{
                  p: 2,
                  borderRadius: 2,
                  borderLeft: "4px solid",
                  borderLeftColor: editorSectionIds[section.id] ? "primary.main" : "divider"
                }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {section.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  key: {section.key}
                </Typography>
                <Typography variant="caption" sx={{ display: "block", mb: 1, color: "text.secondary" }}>
                  {editorSectionIds[section.id] ? "Доступно редактирование" : "Только просмотр"}
                </Typography>
                {editorSectionIds[section.id] ? (
                  <Stack spacing={1.25}>
                    <TextField
                      multiline
                      minRows={5}
                      fullWidth
                      label="Section content"
                      value={contentDrafts[section.id] ?? ""}
                      onChange={(e) =>
                        setContentDrafts((prev) => ({ ...prev, [section.id]: e.target.value }))
                      }
                    />
                    <Stack direction="row" spacing={1.25}>
                      <Button
                        variant="contained"
                        onClick={() => onSaveSection(section.id)}
                        disabled={savingSectionId === section.id}
                        sx={{ width: 200 }}
                      >
                        Save section
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={() => onChangeSectionStatus(section)}
                        disabled={statusUpdatingSectionId === section.id || section.status === "finished"}
                        sx={{ width: 200 }}
                      >
                        {statusButtonText(section.status)}
                      </Button>
                    </Stack>
                  </Stack>
                ) : (
                  <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "grey.50", borderRadius: 1.5 }}>
                    <Typography sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.45 }}>
                      {contentToText(section.content) || "-"}
                    </Typography>
                  </Paper>
                )}
              </Paper>
            ))}
          </Stack>
        )}

        {!loading && !dataLoading && task && sections.length === 0 && (
          <Typography color="text.secondary">No sections in this task.</Typography>
        )}
      </Stack>

      <Dialog
        open={pdfOpen}
        onClose={() => setPdfOpen(false)}
        fullWidth
        maxWidth="lg"
      >
        <DialogTitle>PDF Preview</DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {pdfUrl ? (
            <iframe title="Task PDF" src={pdfUrl} style={{ width: "100%", height: "72vh", border: 0 }} />
          ) : (
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ p: 2 }}>
              <CircularProgress size={20} />
              <Typography>Generating PDF...</Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPdfOpen(false)}>Закрыть</Button>
          <Button
            variant="contained"
            disabled={!pdfUrl}
            onClick={() => {
              if (!pdfUrl) return;
              const link = document.createElement("a");
              link.href = pdfUrl;
              link.download = `task-${task?.id ?? "document"}.pdf`;
              link.click();
            }}
          >
            Скачать PDF
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
