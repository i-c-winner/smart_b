"use client";

import {
  Box,
  Button,
  Chip,
  Container,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createEditor, Descendant, Editor, Element as SlateElement, Node, Path, Transforms } from "slate";
import { Editable, ReactEditor, RenderElementProps, Slate, withReact } from "slate-react";

type PresentationTheme = "light" | "dark" | "aurora";

type PresentationElement =
  | { type: "paragraph"; children: { text: string }[] }
  | { type: "heading"; children: { text: string }[] }
  | { type: "subtitle"; children: { text: string }[] }
  | { type: "slide-break"; children: { text: string }[] }
  | { type: "image"; url: string; alt?: string; children: { text: string }[] }
  | { type: "spreadsheet"; name: string; rows: string[][]; children: { text: string }[] };

const THEMES: Record<
  PresentationTheme,
  {
    label: string;
    slideBg: string;
    text: string;
    subtitle: string;
    border: string;
    leftBg: string;
    tableHeaderBg: string;
    tableText: string;
    tableBorder: string;
    deckBg: string;
  }
> = {
  light: {
    label: "Light",
    slideBg: "#ffffff",
    text: "#0f172a",
    subtitle: "#475569",
    border: "#d8dee7",
    leftBg: "#e5e7eb",
    tableHeaderBg: "#f1f5f9",
    tableText: "#0f172a",
    tableBorder: "#cbd5e1",
    deckBg: "#f8fafc"
  },
  dark: {
    label: "Dark",
    slideBg: "#0b1220",
    text: "#e2e8f0",
    subtitle: "#94a3b8",
    border: "#334155",
    leftBg: "#1e293b",
    tableHeaderBg: "#1f2937",
    tableText: "#e2e8f0",
    tableBorder: "#334155",
    deckBg: "#020617"
  },
  aurora: {
    label: "Aurora",
    slideBg: "linear-gradient(145deg, #e0f2fe 0%, #dcfce7 48%, #fef3c7 100%)",
    text: "#102a43",
    subtitle: "#28536b",
    border: "#93c5fd",
    leftBg: "#bfdbfe",
    tableHeaderBg: "#dbeafe",
    tableText: "#102a43",
    tableBorder: "#93c5fd",
    deckBg: "#e0f2fe"
  }
};

const INITIAL_VALUE: Descendant[] = [
  { type: "heading", children: [{ text: "Presentation Title" }] } as PresentationElement,
  { type: "subtitle", children: [{ text: "Presentation Subtitle" }] } as PresentationElement,
  { type: "paragraph", children: [{ text: "Describe your key message here." }] } as PresentationElement
];

type SlideTemplate = {
  title: string;
  subtitle: string;
  text: string;
  imageUrl: string | null;
  imageAlt: string;
  tables: Array<{ name: string; rows: string[][] }>;
};

function isSlideBreak(node: Descendant): boolean {
  return SlateElement.isElement(node) && (node as PresentationElement).type === "slide-break";
}

function splitToSlides(value: Descendant[]): Descendant[][] {
  const slides: Descendant[][] = [[]];

  for (const node of value) {
    if (isSlideBreak(node)) {
      if (slides[slides.length - 1].length) slides.push([]);
      continue;
    }
    slides[slides.length - 1].push(node);
  }

  const filtered = slides.filter((slide) => slide.length > 0);
  return filtered.length ? filtered : [[{ type: "paragraph", children: [{ text: "Empty slide" }] } as PresentationElement]];
}

function parseSlide(nodes: Descendant[]): SlideTemplate {
  let title = "Title";
  let subtitle = "Subtitle";
  let imageUrl: string | null = null;
  let imageAlt = "Slide image";
  const textParts: string[] = [];
  const tables: Array<{ name: string; rows: string[][] }> = [];

  for (const node of nodes) {
    if (!SlateElement.isElement(node)) continue;
    const element = node as PresentationElement;
    const nodeText = Node.string(node).trim();

    if (element.type === "heading" && nodeText) {
      title = nodeText;
      continue;
    }
    if (element.type === "subtitle" && nodeText) {
      subtitle = nodeText;
      continue;
    }
    if (element.type === "paragraph" && nodeText) {
      textParts.push(nodeText);
      continue;
    }
    if (element.type === "image" && !imageUrl) {
      imageUrl = element.url;
      imageAlt = element.alt ?? "Slide image";
      continue;
    }
    if (element.type === "spreadsheet") {
      tables.push({ name: element.name, rows: element.rows });
    }
  }

  return {
    title,
    subtitle,
    text: textParts.join("\n\n"),
    imageUrl,
    imageAlt,
    tables
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildPrintHtml(slides: Descendant[][], theme: PresentationTheme): string {
  const t = THEMES[theme];
  const slidesHtml = slides
    .map((slide) => {
      const s = parseSlide(slide);
      const left = s.imageUrl
        ? `<img src="${escapeHtml(s.imageUrl)}" alt="${escapeHtml(s.imageAlt)}" />`
        : `<div class="print-image-placeholder">Image</div>`;

      const text = s.text ? `<p>${escapeHtml(s.text)}</p>` : "";
      const tables = s.tables
        .map((table) => {
          const rows = table.rows
            .map((row, i) => {
              const tag = i === 0 ? "th" : "td";
              return `<tr>${row.map((cell) => `<${tag}>${escapeHtml(String(cell ?? ""))}</${tag}>`).join("")}</tr>`;
            })
            .join("");
          return `<div class="print-table-wrap"><div class="print-table-title">${escapeHtml(table.name)}</div><table class="print-table"><tbody>${rows}</tbody></table></div>`;
        })
        .join("");

      return `<section class="print-slide"><div class="print-left">${left}</div><div class="print-right"><div class="print-header"><h2>${escapeHtml(s.title)}</h2><h3>${escapeHtml(s.subtitle)}</h3></div><div class="print-title-gap"></div><div class="print-text">${text}</div>${tables}</div></section>`;
    })
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>Presentation Print</title><style>
  @page { size: landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif; color: ${t.text}; background: ${t.deckBg}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .print-slide { width: 100%; min-height: 170mm; border: 1px solid ${t.border}; border-radius: 12px; margin: 0; display: grid; grid-template-columns: 25% 1fr; gap: 18px; break-after: page; page-break-after: always; page-break-inside: avoid; }
  .print-left { min-height: 170mm; background: ${t.leftBg}; }
  .print-left img { width: 100%; height: 170mm; object-fit: cover; }
  .print-image-placeholder { width: 100%; min-height: 170mm; display: flex; align-items: center; justify-content: center; color: ${t.subtitle}; font-size: 20px; }
  .print-right { padding: 14mm 12mm; margin: 0; display: flex; flex-direction: column; min-height: 170mm; background: ${t.slideBg}; overflow: visible; }
  .print-slide:last-child { break-after: auto; page-break-after: auto; }
  .print-header { display: flex; flex-direction: column; align-items: center; text-align: center; }
  h2 { margin: 0; font-size: 42px; line-height: 1.2; }
  h3 { margin: 6px 0 0; font-size: 26px; line-height: 1.3; color: ${t.subtitle}; font-weight: 600; }
  .print-title-gap { height: 50px; flex: 0 0 auto; }
  p { margin: 0; font-size: 18px; line-height: 1.45; white-space: pre-wrap; }
  .print-table-wrap { margin-top: 14px; overflow-x: auto; }
  .print-table-title { font-size: 13px; color: ${t.subtitle}; margin-bottom: 6px; }
  .print-table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .print-table th, .print-table td { border: 1px solid ${t.tableBorder}; color: ${t.tableText}; padding: 6px 8px; text-align: left; vertical-align: top; }
  .print-table th { background: ${t.tableHeaderBg}; }
  </style></head><body>${slidesHtml}</body></html>`;
}

function SlideContent({ nodes, theme }: { nodes: Descendant[]; theme: PresentationTheme }) {
  const t = THEMES[theme];
  const slide = parseSlide(nodes);

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "25% 1fr",
        minHeight: 360,
        height: "100%",
        border: "1px solid",
        borderColor: t.border,
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: t.slideBg,
        color: t.text
      }}
    >
      <Box sx={{ height: "100%", bgcolor: t.leftBg }}>
        {slide.imageUrl ? (
          <Box component="img" src={slide.imageUrl} alt={slide.imageAlt} sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <Box sx={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: t.subtitle }}>
            <Typography variant="body2">Image</Typography>
          </Box>
        )}
      </Box>

      <Box sx={{ p: { xs: 2, md: 3 }, display: "flex", flexDirection: "column", minHeight: "100%" }}>
        <Box sx={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Typography variant="h4" fontWeight={700} sx={{ lineHeight: 1.2 }}>
            {slide.title}
          </Typography>
          <Typography variant="h6" fontWeight={600} sx={{ mt: 0.75, color: t.subtitle }}>
            {slide.subtitle}
          </Typography>
        </Box>

        <Box sx={{ height: "3.3rem", flexShrink: 0 }} />

        <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
          {slide.text}
        </Typography>

        {slide.tables.map((table, tableIndex) => (
          <Box key={`table-${tableIndex}`} sx={{ mt: 2 }}>
            <Typography variant="caption" sx={{ color: t.subtitle, display: "block", mb: 0.75 }}>
              {table.name}
            </Typography>
            <Box sx={{ overflowX: "auto" }}>
              <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", minWidth: 360 }}>
                <Box component="tbody">
                  {table.rows.map((row, rowIndex) => (
                    <Box component="tr" key={`row-${tableIndex}-${rowIndex}`}>
                      {row.map((cell, colIndex) => (
                        <Box
                          component={rowIndex === 0 ? "th" : "td"}
                          key={`cell-${tableIndex}-${rowIndex}-${colIndex}`}
                          sx={{
                            border: "1px solid",
                            borderColor: t.tableBorder,
                            px: 1,
                            py: 0.75,
                            fontSize: rowIndex === 0 ? 13 : 14,
                            fontWeight: rowIndex === 0 ? 700 : 400,
                            bgcolor: rowIndex === 0 ? t.tableHeaderBg : "transparent",
                            color: t.tableText,
                            textAlign: "left"
                          }}
                        >
                          {cell}
                        </Box>
                      ))}
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function PresentationDeck({ slides, theme }: { slides: Descendant[][]; theme: PresentationTheme }) {
  const t = THEMES[theme];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex((prev) => Math.min(prev, Math.max(slides.length - 1, 0)));
  }, [slides]);

  const current = slides[index] ?? slides[0] ?? [];

  return (
    <Stack spacing={1.25}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Button variant="outlined" size="small" onClick={() => setIndex((p) => Math.max(0, p - 1))} disabled={index <= 0}>
          Prev
        </Button>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          Slide {slides.length ? index + 1 : 0} / {slides.length}
        </Typography>
        <Button
          variant="outlined"
          size="small"
          onClick={() => setIndex((p) => Math.min(Math.max(slides.length - 1, 0), p + 1))}
          disabled={index >= slides.length - 1}
        >
          Next
        </Button>
      </Stack>
      <Box sx={{ border: "1px solid", borderColor: t.border, borderRadius: 2, overflow: "hidden", minHeight: 420, background: t.deckBg }}>
        <SlideContent nodes={current} theme={theme} />
      </Box>
    </Stack>
  );
}

export function PresentPage() {
  const editor = useMemo(() => {
    const base = withReact(createEditor());
    const { isVoid } = base;
    base.isVoid = (element) => {
      const t = (element as PresentationElement).type;
      if (t === "slide-break" || t === "image" || t === "spreadsheet") return true;
      return isVoid(element);
    };
    return base;
  }, []);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const excelInputRef = useRef<HTMLInputElement | null>(null);

  const [value, setValue] = useState<Descendant[]>(INITIAL_VALUE);
  const [theme, setTheme] = useState<PresentationTheme>("light");
  const [selectedImagePath, setSelectedImagePath] = useState<Path | null>(null);
  const [selectedSheetPath, setSelectedSheetPath] = useState<Path | null>(null);

  const slides = useMemo(() => splitToSlides(value), [value]);

  const selectedSheet = useMemo(() => {
    if (!selectedSheetPath) return null;
    try {
      const node = Node.get(editor, selectedSheetPath);
      if (!SlateElement.isElement(node)) return null;
      const element = node as PresentationElement;
      return element.type === "spreadsheet" ? element : null;
    } catch {
      return null;
    }
  }, [editor, selectedSheetPath]);

  const ensureSelection = () => {
    if (!editor.selection) {
      const end = Editor.end(editor, []);
      Transforms.select(editor, end);
    }
    ReactEditor.focus(editor);
  };

  const insertSlideBreak = () => {
    ensureSelection();
    Transforms.insertNodes(editor, { type: "slide-break", children: [{ text: "" }] } as PresentationElement);
    Transforms.insertNodes(editor, { type: "heading", children: [{ text: "New Slide" }] } as PresentationElement);
    Transforms.insertNodes(editor, { type: "subtitle", children: [{ text: "Subtitle" }] } as PresentationElement);
    Transforms.insertNodes(editor, { type: "paragraph", children: [{ text: "Text block" }] } as PresentationElement);
  };

  const insertHeading = () => {
    ensureSelection();
    Transforms.insertNodes(editor, { type: "heading", children: [{ text: "Slide Title" }] } as PresentationElement);
  };

  const insertSubtitle = () => {
    ensureSelection();
    Transforms.insertNodes(editor, { type: "subtitle", children: [{ text: "Slide Subtitle" }] } as PresentationElement);
  };

  const insertText = () => {
    ensureSelection();
    Transforms.insertNodes(editor, { type: "paragraph", children: [{ text: "Text block" }] } as PresentationElement);
  };

  const insertImage = (url: string, alt: string) => {
    ensureSelection();
    Transforms.insertNodes(editor, { type: "image", url, alt, children: [{ text: "" }] } as PresentationElement);
  };

  const insertSpreadsheet = (name: string, rows: string[][]) => {
    ensureSelection();
    const normalized = rows.length ? rows.map((r) => r.map((c) => String(c ?? ""))) : [["Column 1", "Column 2"], ["", ""]];
    Transforms.insertNodes(editor, { type: "spreadsheet", name, rows: normalized, children: [{ text: "" }] } as PresentationElement);
  };

  const insertSpreadsheetSlide = (name: string, rows: string[][], withBreak: boolean) => {
    ensureSelection();
    const normalized = rows.length ? rows.map((r) => r.map((c) => String(c ?? ""))) : [["Column 1", "Column 2"], ["", ""]];
    const nodes: PresentationElement[] = [];
    if (withBreak) nodes.push({ type: "slide-break", children: [{ text: "" }] });
    nodes.push({ type: "heading", children: [{ text: name || "Sheet" }] });
    nodes.push({ type: "subtitle", children: [{ text: "Excel sheet" }] });
    nodes.push({ type: "spreadsheet", name: name || "Sheet", rows: normalized, children: [{ text: "" }] });
    Transforms.insertNodes(editor, nodes as Descendant[]);
  };

  const updateSheetRows = (rows: string[][]) => {
    if (!selectedSheetPath) return;
    Transforms.setNodes(editor, { rows } as Partial<PresentationElement>, { at: selectedSheetPath });
  };

  const setCellValue = (row: number, col: number, nextValue: string) => {
    if (!selectedSheet) return;
    const nextRows = selectedSheet.rows.map((r) => [...r]);
    if (!nextRows[row]) return;
    nextRows[row][col] = nextValue;
    updateSheetRows(nextRows);
  };

  const addSheetRow = () => {
    if (!selectedSheet) return;
    const cols = selectedSheet.rows[0]?.length ?? 2;
    updateSheetRows([...selectedSheet.rows, Array.from({ length: cols }, () => "")]);
  };

  const removeSheetRow = () => {
    if (!selectedSheet || selectedSheet.rows.length <= 1) return;
    updateSheetRows(selectedSheet.rows.slice(0, -1));
  };

  const addSheetCol = () => {
    if (!selectedSheet) return;
    updateSheetRows(selectedSheet.rows.map((r, i) => [...r, i === 0 ? `Column ${r.length + 1}` : ""]));
  };

  const removeSheetCol = () => {
    if (!selectedSheet) return;
    const cols = selectedSheet.rows[0]?.length ?? 0;
    if (cols <= 1) return;
    updateSheetRows(selectedSheet.rows.map((r) => r.slice(0, -1)));
  };

  const handleImagePick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") return;
      insertImage(result, file.name);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const handleExcelPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const isCsv = file.name.toLowerCase().endsWith(".csv");
      if (isCsv) {
        const text = await file.text();
        const rows = text
          .split(/\r?\n/)
          .filter((line) => line.length > 0)
          .map((line) => line.split(","));
        insertSpreadsheet(file.name, rows);
        return;
      }

      const xlsx = await import("xlsx");
      const arrayBuffer = await file.arrayBuffer();
      const workbook = xlsx.read(arrayBuffer, { type: "array" });
      const names = workbook.SheetNames;
      if (!names.length) {
        insertSpreadsheet(file.name, [["Sheet is empty"]]);
        return;
      }

      names.forEach((name, index) => {
        const sheet = workbook.Sheets[name];
        const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false }) as unknown[][];
        const normalized = rows.map((r) => r.map((c) => String(c ?? "")));
        insertSpreadsheetSlide(name, normalized, index > 0);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown parse error";
      insertSpreadsheet(file.name, [["Cannot parse file"], [message], ["Try CSV or a simple XLSX sheet"]]);
    } finally {
      event.target.value = "";
    }
  };

  const openImagePicker = () => {
    setSelectedSheetPath(null);
    imageInputRef.current?.click();
  };

  const openExcelPicker = () => {
    setSelectedImagePath(null);
    excelInputRef.current?.click();
  };

  const printPresentation = () => {
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.setAttribute("aria-hidden", "true");
    document.body.appendChild(frame);

    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) {
      frame.remove();
      return;
    }

    doc.open();
    doc.write(buildPrintHtml(slides, theme));
    doc.close();

    const images = Array.from(doc.images);
    Promise.all(
      images.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) {
              resolve();
              return;
            }
            img.onload = () => resolve();
            img.onerror = () => resolve();
          })
      )
    ).then(() => {
      setTimeout(() => {
        win.focus();
        win.print();
        frame.remove();
      }, 120);
    });
  };

  const renderElement = useCallback((props: RenderElementProps) => {
    const element = props.element as PresentationElement;

    if (element.type === "heading") {
      return (
        <Typography component="h2" variant="h6" sx={{ m: 0, fontWeight: 700 }} {...props.attributes}>
          {props.children}
        </Typography>
      );
    }

    if (element.type === "subtitle") {
      return (
        <Typography component="h3" variant="subtitle1" sx={{ m: 0, fontWeight: 600, color: "text.secondary" }} {...props.attributes}>
          {props.children}
        </Typography>
      );
    }

    if (element.type === "slide-break") {
      return (
        <Box
          {...props.attributes}
          contentEditable={false}
          sx={{ my: 1.5, border: "1px dashed", borderColor: "primary.main", borderRadius: 1, px: 1, py: 0.5, color: "primary.main", fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}
        >
          --- Slide Break ---
          {props.children}
        </Box>
      );
    }

    if (element.type === "image") {
      let isSelected = false;
      try {
        const path = ReactEditor.findPath(editor, props.element);
        isSelected = !!selectedImagePath && Path.equals(path, selectedImagePath);
      } catch {
        isSelected = false;
      }

      return (
        <Box
          {...props.attributes}
          contentEditable={false}
          onMouseDown={(event) => {
            event.preventDefault();
            const path = ReactEditor.findPath(editor, props.element);
            setSelectedImagePath(path);
            setSelectedSheetPath(null);
            Transforms.select(editor, path);
            ReactEditor.focus(editor);
          }}
          sx={{ my: 1, p: 1, border: "1px solid", borderColor: isSelected ? "primary.main" : "divider", borderRadius: 2, bgcolor: "background.paper" }}
        >
          <Box component="img" src={element.url} alt={element.alt ?? "Slide image"} sx={{ display: "block", maxWidth: "100%", maxHeight: 260, width: "100%", objectFit: "contain", borderRadius: 1 }} />
          {props.children}
        </Box>
      );
    }

    if (element.type === "spreadsheet") {
      let isSelected = false;
      try {
        const path = ReactEditor.findPath(editor, props.element);
        isSelected = !!selectedSheetPath && Path.equals(path, selectedSheetPath);
      } catch {
        isSelected = false;
      }

      return (
        <Box
          {...props.attributes}
          contentEditable={false}
          onMouseDown={(event) => {
            event.preventDefault();
            const path = ReactEditor.findPath(editor, props.element);
            setSelectedSheetPath(path);
            setSelectedImagePath(null);
            Transforms.select(editor, path);
            ReactEditor.focus(editor);
          }}
          sx={{ my: 1, p: 1.25, border: "1px solid", borderColor: isSelected ? "primary.main" : "divider", borderRadius: 2, bgcolor: "background.paper" }}
        >
          <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 0.75 }}>
            Excel: {element.name}
          </Typography>
          <Box sx={{ overflowX: "auto" }}>
            <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", minWidth: 280 }}>
              <Box component="tbody">
                {element.rows.slice(0, 6).map((row, rowIndex) => (
                  <Box component="tr" key={`sheet-row-${rowIndex}`}>
                    {row.slice(0, 8).map((cell, colIndex) => (
                      <Box
                        component={rowIndex === 0 ? "th" : "td"}
                        key={`sheet-cell-${rowIndex}-${colIndex}`}
                        sx={{ border: "1px solid", borderColor: "divider", px: 0.75, py: 0.5, fontSize: 12, fontWeight: rowIndex === 0 ? 700 : 400, bgcolor: rowIndex === 0 ? "grey.100" : "transparent", textAlign: "left" }}
                      >
                        {cell}
                      </Box>
                    ))}
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
          {props.children}
        </Box>
      );
    }

    return (
      <Typography component="p" variant="body1" sx={{ my: 0.5 }} {...props.attributes}>
        {props.children}
      </Typography>
    );
  }, [editor, selectedImagePath, selectedSheetPath]);

  return (
    <Container maxWidth={false} sx={{ py: 3 }}>
      <Stack spacing={2.5}>
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, "@media print": { display: "none" } }}>
          <Stack direction={{ xs: "column", md: "row" }} alignItems={{ xs: "flex-start", md: "center" }} spacing={1}>
            <Typography variant="h5" fontWeight={700}>Presentation Builder</Typography>
            <Chip size="small" color="primary" label="Next.js" />
            <Chip size="small" color="primary" variant="outlined" label="Slate.js editor" />
            <Chip size="small" color="primary" variant="outlined" label="Slides layout" />
            <Chip size="small" color="primary" variant="outlined" label="Viewer" />
          </Stack>

          <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
            {(Object.keys(THEMES) as PresentationTheme[]).map((key) => (
              <Button key={key} size="small" variant={theme === key ? "contained" : "outlined"} onClick={() => setTheme(key)}>
                {THEMES[key].label}
              </Button>
            ))}
          </Stack>

          <Typography sx={{ mt: 1, color: "text.secondary" }}>
            Use Add Slide or separator &quot;---&quot; to split content into slides.
          </Typography>
        </Paper>

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1.2fr" }, gap: 2 }}>
          <Paper
            variant="outlined"
            sx={{ p: 2, borderRadius: 3, minHeight: 560, display: "flex", flexDirection: "column", maxHeight: { xs: "none", lg: "calc(100vh - 140px)" }, overflow: "hidden", "@media print": { display: "none" } }}
          >
            <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: "wrap" }}>
              <Button variant="contained" size="small" onClick={insertSlideBreak}>Add Slide</Button>
              <Button variant="outlined" size="small" onClick={insertHeading}>Add Title</Button>
              <Button variant="outlined" size="small" onClick={insertSubtitle}>Add Subtitle</Button>
              <Button variant="outlined" size="small" onClick={insertText}>Add Text</Button>
              <Button variant="outlined" size="small" onClick={openImagePicker}>Add Image</Button>
              <Button variant="outlined" size="small" onClick={openExcelPicker}>Add Excel</Button>
            </Stack>

            <input ref={imageInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImagePick} />
            <input
              ref={excelInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: "none" }}
              onChange={(event) => {
                void handleExcelPick(event);
              }}
            />

            {selectedSheet && (
              <Paper variant="outlined" sx={{ p: 1.25, mb: 1.5, borderRadius: 2 }}>
                <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                  <Button variant="outlined" size="small" onClick={addSheetRow}>Row +</Button>
                  <Button variant="outlined" size="small" onClick={removeSheetRow}>Row -</Button>
                  <Button variant="outlined" size="small" onClick={addSheetCol}>Col +</Button>
                  <Button variant="outlined" size="small" onClick={removeSheetCol}>Col -</Button>
                </Stack>

                <Box sx={{ overflowX: "auto" }}>
                  <Box sx={{ display: "grid", gap: 0.75, minWidth: 520 }}>
                    {selectedSheet.rows.map((row, rowIndex) => (
                      <Box key={`edit-row-${rowIndex}`} sx={{ display: "grid", gridTemplateColumns: `repeat(${row.length || 1}, minmax(120px, 1fr))`, gap: 0.75 }}>
                        {row.map((cell, colIndex) => (
                          <TextField key={`edit-cell-${rowIndex}-${colIndex}`} size="small" value={cell} onChange={(e) => setCellValue(rowIndex, colIndex, e.target.value)} />
                        ))}
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Paper>
            )}

            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", pr: 0.5 }}>
              <Divider sx={{ mb: 1.5 }} />
              <Slate editor={editor} initialValue={value} onChange={setValue}>
                <Editable
                  renderElement={renderElement}
                  spellCheck
                  autoFocus
                  placeholder="Type slide content..."
                  onKeyDown={(event) => {
                    if (!(event.ctrlKey || event.metaKey)) return;
                    if (event.key.toLowerCase() === "-") {
                      event.preventDefault();
                      insertSlideBreak();
                    }
                    if (event.key.toLowerCase() === "h") {
                      event.preventDefault();
                      insertHeading();
                    }
                    if (event.key.toLowerCase() === "s") {
                      event.preventDefault();
                      insertSubtitle();
                    }
                    if (event.key.toLowerCase() === "t") {
                      event.preventDefault();
                      insertText();
                    }
                    if (event.key.toLowerCase() === "i") {
                      event.preventDefault();
                      openImagePicker();
                    }
                  }}
                  style={{ minHeight: 480, outline: "none" }}
                />
              </Slate>
            </Box>
          </Paper>

          <Stack spacing={2}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }}>
                <Typography variant="h6" fontWeight={700}>
                  Presentation Viewer
                </Typography>
                <Button variant="contained" size="small" onClick={printPresentation} sx={{ "@media print": { display: "none" } }}>
                  Print
                </Button>
              </Stack>
              <PresentationDeck slides={slides} theme={theme} />
            </Paper>
          </Stack>
        </Box>
      </Stack>
    </Container>
  );
}
