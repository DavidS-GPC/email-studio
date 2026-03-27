"use client";

import { useEffect, useRef, useState } from "react";
import grapesjs, { Editor } from "grapesjs";
import presetNewsletter from "grapesjs-preset-newsletter";
import "grapesjs/dist/css/grapes.min.css";

type Props = {
  initialHtml: string;
  initialDesignJson?: string;
  onChange: (html: string, designJson: string) => void;
  onReady?: (editor: Editor) => void;
};

type BuilderComponent = {
  get?: (key: string) => unknown;
  set?: (key: string, value: unknown) => void;
  closest?: (selector: string) => BuilderComponent | undefined;
  find?: (selector: string) => BuilderComponent[] | undefined;
  getEl?: () => Element | null | undefined;
};

type StoredUploadImage = {
  id: string;
  name: string;
  url: string;
  createdAt: string;
};

type TableInspectorState = {
  rows: number;
  columns: number;
  widths: number[];
};

type ColumnDragState = {
  tableComponent: BuilderComponent;
  columnIndex: number;
  startX: number;
  tableWidthPx: number;
  startWidths: number[];
  latestWidths: number[];
  moveCount: number;
};

const MIN_TABLE_DIMENSION = 1;
const MAX_TABLE_DIMENSION = 20;
const COLUMN_HANDLE_WIDTH_PX = 10;

function parseDimension(value: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(MAX_TABLE_DIMENSION, Math.max(MIN_TABLE_DIMENSION, Math.round(value)));
}

function normalizeTableWidths(columnCount: number, widths: number[]) {
  if (columnCount <= 0) {
    return [];
  }

  if (!widths.length) {
    return Array.from({ length: columnCount }, () => Number((100 / columnCount).toFixed(2)));
  }

  const padded = Array.from({ length: columnCount }, (_, index) => {
    const next = widths[index];
    return Number.isFinite(next) && next > 0 ? next : 0;
  });

  const providedTotal = padded.reduce((sum, part) => sum + part, 0);
  if (providedTotal <= 0) {
    return Array.from({ length: columnCount }, () => Number((100 / columnCount).toFixed(2)));
  }

  return padded.map((part) => Number(((part / providedTotal) * 100).toFixed(2)));
}

function normalizeEditableTableStyle(styleText: string | undefined) {
  const styleMap = new Map<string, string>();

  (styleText || "")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const separatorIndex = entry.indexOf(":");
      if (separatorIndex <= 0) {
        return;
      }

      const key = entry.slice(0, separatorIndex).trim().toLowerCase();
      const value = entry.slice(separatorIndex + 1).trim();
      if (!key || !value) {
        return;
      }

      styleMap.set(key, value);
    });

  styleMap.set("table-layout", "fixed");
  styleMap.set("width", "100%");

  return Array.from(styleMap.entries())
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
}

function scaleWidthsToPixels(widths: number[], totalPixels: number) {
  const normalized = normalizeTableWidths(widths.length, widths);
  return normalized.map((part) => (part / 100) * totalPixels);
}

function parseTableInspectorState(tableEl: HTMLTableElement): TableInspectorState {
  const rows = Math.max(
    MIN_TABLE_DIMENSION,
    tableEl.querySelectorAll("tr").length || MIN_TABLE_DIMENSION,
  );
  const firstRow = tableEl.querySelector("tr");
  const firstRowCells = firstRow ? Array.from(firstRow.querySelectorAll("th,td")) : [];
  const columns = Math.max(MIN_TABLE_DIMENSION, firstRowCells.length || MIN_TABLE_DIMENSION);

  const colGroup = tableEl.querySelector("colgroup");
  const colWidths = Array.from(colGroup?.querySelectorAll("col") || [])
    .slice(0, columns)
    .map((col) => {
      const styleWidth = Number.parseFloat(col.style.width || "");
      if (Number.isFinite(styleWidth) && styleWidth > 0) {
        return styleWidth;
      }

      const attrWidth = Number.parseFloat(col.getAttribute("width") || "");
      if (Number.isFinite(attrWidth) && attrWidth > 0) {
        return attrWidth;
      }

      const rectWidth = col.getBoundingClientRect().width;
      return Number.isFinite(rectWidth) && rectWidth > 0 ? rectWidth : 0;
    });

  if (colWidths.length === columns && colWidths.some((value) => value > 0)) {
    return {
      rows,
      columns,
      widths: normalizeTableWidths(columns, colWidths),
    };
  }

  const widths = normalizeTableWidths(
    columns,
    firstRowCells.map((cell) => {
      const attrWidth = Number.parseFloat(cell.getAttribute("width") || "");
      if (Number.isFinite(attrWidth) && attrWidth > 0) {
        return attrWidth;
      }

      const cssWidth = Number.parseFloat(cell.style.width || "");
      if (Number.isFinite(cssWidth) && cssWidth > 0) {
        return cssWidth;
      }

      const rectWidth = cell.getBoundingClientRect().width;
      return Number.isFinite(rectWidth) && rectWidth > 0 ? rectWidth : 0;
    }),
  );

  return { rows, columns, widths };
}

function extractTableMatrix(tableEl: HTMLTableElement): string[][] {
  return Array.from(tableEl.querySelectorAll("tr")).map((row) =>
    Array.from(row.querySelectorAll("th,td")).map((cell) => (cell.innerHTML || "").trim()),
  );
}

function buildEditableTableInner(
  rows: number,
  columns: number,
  matrix: string[][],
  widthParts: number[],
) {
  const widths = normalizeTableWidths(columns, widthParts);

  const colGroup = `<colgroup>${widths
    .map((width) => `<col style="width:${width}%;" />`)
    .join("")}</colgroup>`;

  const bodyRows = Array.from({ length: rows }, (_, rowIndex) => {
    const isHeader = rowIndex === 0;
    const tag = isHeader ? "th" : "td";
    const cellStyles = isHeader
      ? "padding:10px;border:1px solid #cbd5e1;background:#f1f5f9;font-size:14px;"
      : "padding:10px;border:1px solid #cbd5e1;font-size:14px;";

    const cells = Array.from({ length: columns }, (_, columnIndex) => {
      const existingValue = matrix[rowIndex]?.[columnIndex];
      const fallbackValue = isHeader ? `Column ${columnIndex + 1}` : "Value";
      const value = existingValue && existingValue.length ? existingValue : fallbackValue;
      const widthValue = Number(widths[columnIndex].toFixed(2));
      const fullCellStyle = `${cellStyles}width:${widthValue}%;`;

      return `<${tag} align="left" width="${widthValue}%" style="${fullCellStyle}">${value}</${tag}>`;
    }).join("");

    return `<tr>${cells}</tr>`;
  }).join("");

  return `${colGroup}<tbody>${bodyRows}</tbody>`;
}

function splitHtmlAndCss(source: string) {
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  const cssParts: string[] = [];
  const htmlWithoutStyle = source.replace(styleRegex, (_, cssPart: string) => {
    cssParts.push(cssPart);
    return "";
  });

  return {
    html: htmlWithoutStyle.trim(),
    css: cssParts.join("\n").trim(),
  };
}

function registerQuickBlocks(editor: Editor) {
  const blockManager = editor.BlockManager;
  const category = "Quick Layouts";

  const previewLabel = (title: string, preview: string) => `
    <div style="display:flex;flex-direction:column;gap:8px;padding:6px;border-radius:10px;background:#0f172a;">
      <div style="height:54px;border:1px solid #334155;border-radius:8px;background:#fff;overflow:hidden;">
        ${preview}
      </div>
      <div style="font-size:12px;font-weight:700;color:#e2e8f0;line-height:1;letter-spacing:.01em;">${title}</div>
    </div>
  `;

  blockManager.add("quick-hero", {
    label: previewLabel(
      "Hero section",
      `
        <div style="height:100%;background:linear-gradient(130deg,#0f172a,#2563eb);padding:8px;box-sizing:border-box;">
          <div style="width:42px;height:5px;background:rgba(255,255,255,.8);border-radius:999px;margin-bottom:6px;"></div>
          <div style="width:78%;height:8px;background:#ffffff;border-radius:4px;margin-bottom:4px;"></div>
          <div style="width:60%;height:6px;background:rgba(255,255,255,.75);border-radius:4px;margin-bottom:8px;"></div>
          <div style="width:38px;height:10px;background:#ffffff;border-radius:999px;"></div>
        </div>
      `,
    ),
    category,
    content: `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;color:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="padding:28px 24px;">
            <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.85;">Announcement</div>
            <h1 style="margin:10px 0 8px;font-size:28px;line-height:1.2;">Your headline goes here</h1>
            <p style="margin:0 0 18px;font-size:15px;line-height:1.6;opacity:.92;">Use this section for the main campaign message.</p>
            <a href="https://example.com" style="display:inline-block;padding:12px 18px;background:#ffffff;color:#0f172a;text-decoration:none;border-radius:999px;font-weight:700;">Primary action</a>
          </td>
        </tr>
      </table>
    `,
  });

  blockManager.add("quick-two-cards", {
    label: previewLabel(
      "Two cards",
      `
        <div style="display:flex;gap:6px;padding:7px;height:100%;box-sizing:border-box;background:#f8fafc;">
          <div style="flex:1;border:1px solid #dbe2ea;border-radius:6px;background:#fff;padding:5px;box-sizing:border-box;">
            <div style="width:70%;height:5px;background:#334155;border-radius:4px;margin-bottom:4px;"></div>
            <div style="width:92%;height:4px;background:#cbd5e1;border-radius:4px;"></div>
          </div>
          <div style="flex:1;border:1px solid #dbe2ea;border-radius:6px;background:#fff;padding:5px;box-sizing:border-box;">
            <div style="width:70%;height:5px;background:#334155;border-radius:4px;margin-bottom:4px;"></div>
            <div style="width:92%;height:4px;background:#cbd5e1;border-radius:4px;"></div>
          </div>
        </div>
      `,
    ),
    category,
    content: `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
        <tr>
          <td width="50%" valign="top" style="padding:0 6px 0 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;background:#ffffff;">
              <tr><td style="padding:14px;"><h3 style="margin:0 0 8px;font-size:17px;">Card title</h3><p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">Add supporting content here.</p></td></tr>
            </table>
          </td>
          <td width="50%" valign="top" style="padding:0 0 0 6px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;background:#ffffff;">
              <tr><td style="padding:14px;"><h3 style="margin:0 0 8px;font-size:17px;">Card title</h3><p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">Add supporting content here.</p></td></tr>
            </table>
          </td>
        </tr>
      </table>
    `,
  });

  blockManager.add("quick-three-columns", {
    label: previewLabel(
      "Three columns",
      `
        <div style="display:flex;gap:4px;padding:7px;height:100%;box-sizing:border-box;background:#f8fafc;">
          <div style="flex:1;border:1px solid #dbe2ea;border-radius:6px;background:#fff;padding:4px;box-sizing:border-box;"><div style="width:80%;height:4px;background:#334155;border-radius:4px;"></div><div style="margin-top:3px;width:95%;height:3px;background:#cbd5e1;border-radius:4px;"></div></div>
          <div style="flex:1;border:1px solid #dbe2ea;border-radius:6px;background:#fff;padding:4px;box-sizing:border-box;"><div style="width:80%;height:4px;background:#334155;border-radius:4px;"></div><div style="margin-top:3px;width:95%;height:3px;background:#cbd5e1;border-radius:4px;"></div></div>
          <div style="flex:1;border:1px solid #dbe2ea;border-radius:6px;background:#fff;padding:4px;box-sizing:border-box;"><div style="width:80%;height:4px;background:#334155;border-radius:4px;"></div><div style="margin-top:3px;width:95%;height:3px;background:#cbd5e1;border-radius:4px;"></div></div>
        </div>
      `,
    ),
    category,
    content: `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
        <tr>
          <td width="33.33%" valign="top" style="padding:0 6px 0 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;background:#ffffff;"><tr><td style="padding:12px;"><h4 style="margin:0 0 6px;font-size:15px;">Point one</h4><p style="margin:0;font-size:13px;line-height:1.5;color:#64748b;">Describe this benefit.</p></td></tr></table>
          </td>
          <td width="33.33%" valign="top" style="padding:0 3px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;background:#ffffff;"><tr><td style="padding:12px;"><h4 style="margin:0 0 6px;font-size:15px;">Point two</h4><p style="margin:0;font-size:13px;line-height:1.5;color:#64748b;">Describe this benefit.</p></td></tr></table>
          </td>
          <td width="33.33%" valign="top" style="padding:0 0 0 6px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;background:#ffffff;"><tr><td style="padding:12px;"><h4 style="margin:0 0 6px;font-size:15px;">Point three</h4><p style="margin:0;font-size:13px;line-height:1.5;color:#64748b;">Describe this benefit.</p></td></tr></table>
          </td>
        </tr>
      </table>
    `,
  });

  blockManager.add("quick-data-table", {
    label: previewLabel(
      "Data table",
      `
        <div style="height:100%;background:#f8fafc;padding:6px;box-sizing:border-box;display:grid;gap:3px;">
          <div style="height:7px;background:#1e293b;border-radius:4px;"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px;">
            <div style="height:6px;background:#cbd5e1;border-radius:3px;"></div>
            <div style="height:6px;background:#cbd5e1;border-radius:3px;"></div>
            <div style="height:6px;background:#cbd5e1;border-radius:3px;"></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px;">
            <div style="height:6px;background:#e2e8f0;border-radius:3px;"></div>
            <div style="height:6px;background:#e2e8f0;border-radius:3px;"></div>
            <div style="height:6px;background:#e2e8f0;border-radius:3px;"></div>
          </div>
        </div>
      `,
    ),
    category,
    content: `
      <table data-editable-table="true" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;border-collapse:collapse;border:1px solid #cbd5e1;table-layout:fixed;">
        <colgroup>
          <col style="width:33.33%;" />
          <col style="width:33.33%;" />
          <col style="width:33.34%;" />
        </colgroup>
        <tbody>
          <tr>
            <th align="left" width="33.33%" style="padding:10px;border:1px solid #cbd5e1;background:#f1f5f9;font-size:14px;">Column 1</th>
            <th align="left" width="33.33%" style="padding:10px;border:1px solid #cbd5e1;background:#f1f5f9;font-size:14px;">Column 2</th>
            <th align="left" width="33.34%" style="padding:10px;border:1px solid #cbd5e1;background:#f1f5f9;font-size:14px;">Column 3</th>
          </tr>
          <tr>
            <td width="33.33%" style="padding:10px;border:1px solid #cbd5e1;font-size:14px;">Value</td>
            <td width="33.33%" style="padding:10px;border:1px solid #cbd5e1;font-size:14px;">Value</td>
            <td width="33.34%" style="padding:10px;border:1px solid #cbd5e1;font-size:14px;">Value</td>
          </tr>
          <tr>
            <td width="33.33%" style="padding:10px;border:1px solid #cbd5e1;font-size:14px;">Value</td>
            <td width="33.33%" style="padding:10px;border:1px solid #cbd5e1;font-size:14px;">Value</td>
            <td width="33.34%" style="padding:10px;border:1px solid #cbd5e1;font-size:14px;">Value</td>
          </tr>
        </tbody>
      </table>
    `,
  });

  blockManager.add("quick-disclaimer", {
    label: previewLabel(
      "No-reply footer",
      `
        <div style="height:100%;background:#f8fafc;padding:7px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-end;">
          <div style="width:86%;height:4px;background:#94a3b8;border-radius:4px;margin:0 auto 3px;"></div>
          <div style="width:72%;height:4px;background:#94a3b8;border-radius:4px;margin:0 auto;"></div>
        </div>
      `,
    ),
    category,
    content: `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
        <tr>
          <td style="padding:12px 8px 0;color:#64748b;font-size:12px;line-height:1.5;text-align:center;">
            This message was sent from a no-reply address. Please do not reply directly to this email.
          </td>
        </tr>
      </table>
    `,
  });
}

function toSafeText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function refreshStoredImageBlocks(editor: Editor) {
  const response = await fetch("/api/upload?kind=image", { cache: "no-store" });
  if (!response.ok) {
    return;
  }

  const images = (await response.json()) as StoredUploadImage[];
  const blockManager = editor.BlockManager;
  const prefix = "quick-brand-";
  const blocks = blockManager.getAll() as unknown as {
    forEach: (callback: (block: { getId?: () => string; id?: string }) => void) => void;
  };

  const removableIds: string[] = [];
  blocks.forEach((block) => {
    const blockId = typeof block.getId === "function" ? block.getId() : String(block.id || "");
    if (blockId.startsWith(prefix)) {
      removableIds.push(blockId);
    }
  });

  removableIds.forEach((id) => {
    blockManager.remove(id);
  });

  images.forEach((image) => {
    const labelName = toSafeText(image.name);
    const labelUrl = toSafeText(image.url);

    blockManager.add(`${prefix}${image.id}`, {
      label: `
        <div style="display:flex;flex-direction:column;gap:8px;padding:6px;border-radius:10px;background:#0f172a;">
          <div style="height:54px;border:1px solid #334155;border-radius:8px;background:#fff;display:grid;place-items:center;overflow:hidden;">
            <img src="${labelUrl}" alt="${labelName}" style="max-width:100%;max-height:100%;object-fit:contain;" />
          </div>
          <div style="font-size:12px;font-weight:700;color:#e2e8f0;line-height:1;letter-spacing:.01em;">${labelName}</div>
        </div>
      `,
      category: "Quick Layouts",
      content: `<img src="${labelUrl}" alt="${labelName}" style="max-width:100%;border-radius:10px;" />`,
    });
  });
}

export default function EmailBuilder({ initialHtml, initialDesignJson, onChange, onReady }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const isApplyingExternalRef = useRef(false);
  const lastEmittedHtmlRef = useRef("");
  const releaseApplyTimerRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  const onReadyRef = useRef(onReady);
  const initialHtmlRef = useRef(initialHtml);
  const initialDesignJsonRef = useRef(initialDesignJson);
  const selectedEditableTableRef = useRef<BuilderComponent | null>(null);
  const [tableInspector, setTableInspector] = useState<TableInspectorState | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    initialHtmlRef.current = initialHtml;
  }, [initialHtml]);

  useEffect(() => {
    initialDesignJsonRef.current = initialDesignJson;
  }, [initialDesignJson]);

  function setExternalComponents(editor: Editor, html: string, designJson?: string) {
    isApplyingExternalRef.current = true;

    if (releaseApplyTimerRef.current) {
      window.clearTimeout(releaseApplyTimerRef.current);
    }

    const fallbackHtml = "<section><h1>New Template</h1><p>Start designing...</p></section>";

    if (designJson) {
      try {
        const projectData = JSON.parse(designJson);
        editor.loadProjectData(projectData);
      } catch {
        const parsed = splitHtmlAndCss(html || fallbackHtml);
        editor.Css.clear();
        editor.setComponents(parsed.html || fallbackHtml);
        if (parsed.css) {
          editor.setStyle(parsed.css);
        }
      }
    } else {
      const parsed = splitHtmlAndCss(html || fallbackHtml);
      editor.Css.clear();
      editor.setComponents(parsed.html || fallbackHtml);
      if (parsed.css) {
        editor.setStyle(parsed.css);
      }
    }

    releaseApplyTimerRef.current = window.setTimeout(() => {
      isApplyingExternalRef.current = false;
      releaseApplyTimerRef.current = null;
    }, 160);
  }

  const syncInspectorFromTable = (tableComponent: BuilderComponent | null) => {
    const tableEl = tableComponent?.getEl?.();
    if (!(tableEl instanceof HTMLTableElement)) {
      setTableInspector(null);
      return;
    }

    setTableInspector(parseTableInspectorState(tableEl));
  };

  const applyTableLayout = (rows: number, columns: number, widths?: number[]) => {
    const tableComponent = selectedEditableTableRef.current;
    if (!tableComponent) {
      return;
    }

    const safeRows = parseDimension(rows, 3);
    const safeColumns = parseDimension(columns, 3);
    const tableEl = tableComponent.getEl?.();
    const existingMatrix = tableEl instanceof HTMLTableElement ? extractTableMatrix(tableEl) : [];

    const nextWidths = normalizeTableWidths(safeColumns, widths || tableInspector?.widths || []);
    const nextInner = buildEditableTableInner(safeRows, safeColumns, existingMatrix, nextWidths);
    const attributes = (tableComponent.get?.("attributes") as Record<string, unknown> | undefined) || {};

    tableComponent.set?.("attributes", {
      ...attributes,
      "data-editable-table": "true",
      width: "100%",
      cellpadding: "0",
      cellspacing: "0",
      style: normalizeEditableTableStyle(String(attributes.style || "")),
    });
    tableComponent.set?.("components", nextInner);

    syncInspectorFromTable(tableComponent);
  };

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const editor = grapesjs.init({
      container: containerRef.current,
      height: "560px",
      fromElement: false,
      storageManager: false,
      plugins: [presetNewsletter],
      pluginsOpts: {
        [presetNewsletter as unknown as string]: {},
      },
    });

    registerQuickBlocks(editor);
    refreshStoredImageBlocks(editor).catch(() => {
      // Non-blocking: static quick blocks remain available even if image listing fails.
    });

    const getEventElement = (target: EventTarget | null) => {
      if (target instanceof HTMLElement) {
        return target;
      }

      if (target instanceof Node) {
        return target.parentElement;
      }

      return null;
    };

    const applyTableColumnWidths = (tableComponent: BuilderComponent, widths: number[]) => {
      const tableEl = tableComponent.getEl?.();
      if (!(tableEl instanceof HTMLTableElement)) {
        return;
      }

      const currentState = parseTableInspectorState(tableEl);
      const normalizedWidths = normalizeTableWidths(currentState.columns, widths);

      // Ensure the live canvas DOM reflects the final widths before syncing back into the model.
      applyColumnWidthsToDom(tableComponent, normalizedWidths);

      const rowComponents = (tableComponent.find?.("tr") || []) as BuilderComponent[];
      rowComponents.forEach((rowComponent) => {
        const cellComponents = (rowComponent.find?.("th,td") || []) as BuilderComponent[];
        cellComponents.forEach((cellComponent, index) => {
          if (index >= normalizedWidths.length) {
            return;
          }

          const widthText = `${Number(normalizedWidths[index].toFixed(2))}%`;
          const existingAttributes =
            (cellComponent.get?.("attributes") as Record<string, unknown> | undefined) || {};
          cellComponent.set?.("attributes", {
            ...existingAttributes,
            width: widthText,
          });
        });
      });

      const colComponents = (tableComponent.find?.("col") || []) as BuilderComponent[];
      colComponents.forEach((colComponent, index) => {
        if (index >= normalizedWidths.length) {
          return;
        }

        const widthText = `${Number(normalizedWidths[index].toFixed(2))}%`;
        const existingAttributes =
          (colComponent.get?.("attributes") as Record<string, unknown> | undefined) || {};
        colComponent.set?.("attributes", {
          ...existingAttributes,
          width: widthText,
        });
      });

      const attributes = (tableComponent.get?.("attributes") as Record<string, unknown> | undefined) || {};
      tableComponent.set?.("attributes", {
        ...attributes,
        "data-editable-table": "true",
        width: "100%",
        cellpadding: "0",
        cellspacing: "0",
        style: normalizeEditableTableStyle(String(attributes.style || "")),
      });
      syncInspectorFromTable(tableComponent);
    };

    const openEditableCodeModal = () => {
        const modal = editor.Modal;
        const wrapper = document.createElement("div");
        wrapper.style.display = "grid";
        wrapper.style.gap = "12px";

        const textarea = document.createElement("textarea");
        textarea.value = `${editor.getHtml()}<style>${editor.getCss()}</style>`;
        textarea.style.width = "100%";
        textarea.style.minHeight = "420px";
        textarea.style.resize = "vertical";
        textarea.style.padding = "10px";
        textarea.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace";
        textarea.style.fontSize = "13px";
        textarea.style.lineHeight = "1.5";
        textarea.style.border = "1px solid #cbd5e1";
        textarea.style.borderRadius = "8px";

        const buttonRow = document.createElement("div");
        buttonRow.style.display = "flex";
        buttonRow.style.justifyContent = "flex-end";
        buttonRow.style.gap = "8px";

        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.textContent = "Cancel";
        cancelButton.style.padding = "8px 14px";
        cancelButton.style.border = "1px solid #cbd5e1";
        cancelButton.style.borderRadius = "8px";
        cancelButton.style.background = "#ffffff";
        cancelButton.style.color = "#334155";
        cancelButton.style.cursor = "pointer";
        cancelButton.addEventListener("click", () => modal.close());

        const applyButton = document.createElement("button");
        applyButton.type = "button";
        applyButton.textContent = "Apply HTML";
        applyButton.style.padding = "8px 14px";
        applyButton.style.border = "1px solid #1d4ed8";
        applyButton.style.borderRadius = "8px";
        applyButton.style.background = "#2563eb";
        applyButton.style.color = "#ffffff";
        applyButton.style.cursor = "pointer";
        applyButton.addEventListener("click", () => {
          const fallbackHtml = "<section><h1>New Template</h1><p>Start designing...</p></section>";
          const parsed = splitHtmlAndCss(textarea.value || fallbackHtml);

          isApplyingExternalRef.current = true;
          if (releaseApplyTimerRef.current) {
            window.clearTimeout(releaseApplyTimerRef.current);
          }

          editor.Css.clear();
          editor.setComponents(parsed.html || fallbackHtml);
          editor.setStyle(parsed.css || "");

          const fullHtml = `${editor.getHtml()}<style>${editor.getCss()}</style>`;
          lastEmittedHtmlRef.current = fullHtml;
          onChangeRef.current(fullHtml, JSON.stringify(editor.getProjectData()));

          releaseApplyTimerRef.current = window.setTimeout(() => {
            isApplyingExternalRef.current = false;
            releaseApplyTimerRef.current = null;
          }, 160);

          modal.close();
        });

        buttonRow.appendChild(cancelButton);
        buttonRow.appendChild(applyButton);
        wrapper.appendChild(textarea);
        wrapper.appendChild(buttonRow);

        modal.setTitle("Edit HTML");
        modal.setContent(wrapper);
        modal.open();
    };

    editor.Commands.add("custom:open-editable-code", {
      run: openEditableCodeModal,
    });

    editor.Commands.add("core:open-code", {
      run: openEditableCodeModal,
    });

    editor.Commands.add("gjs-open-export-template", {
      run: openEditableCodeModal,
    });

    editor.Commands.add("gjs-open-import-template", {
      run: openEditableCodeModal,
    });

    const installEditableCodeButton = () => {
      const panelsApi = editor.Panels as unknown as {
        getPanels?: () => {
          forEach: (callback: (panel: {
            get?: (key: string) => unknown;
          }) => void) => void;
        };
        getPanel?: (id: string) => unknown;
        addButton?: (panelId: string, button: Record<string, unknown>) => void;
        removeButton?: (panelId: string, buttonId: string) => void;
      };

      const staleButtonMarkers = ["open-code", "export-template", "import-template", "gjs-open-export-template"];
      const panelCollection = panelsApi.getPanels?.();

      panelCollection?.forEach((panel) => {
        if (!panel) {
          return;
        }

        const panelId = String(panel.get?.("id") || "");
        const buttonCollection = panel.get?.("buttons") as
          | {
              forEach: (callback: (button: {
                get?: (key: string) => unknown;
                getId?: () => string;
              }) => void) => void;
            }
          | undefined;

        if (!panelId || !buttonCollection) {
          return;
        }

        buttonCollection.forEach((button) => {
          if (!button) {
            return;
          }

          const id = String(button.getId?.() || button.get?.("id") || "").toLowerCase();
          const command = button.get?.("command");
          const commandText = typeof command === "string" ? command.toLowerCase() : "";
          const attributes = (button.get?.("attributes") || {}) as { title?: string };
          const title = String(attributes.title || "").toLowerCase();

          const shouldRemoveBuiltInButton =
            staleButtonMarkers.some((marker) => id.includes(marker) || commandText.includes(marker)) ||
            title.includes("export template") ||
            title === "view code";

          if (shouldRemoveBuiltInButton && id) {
            panelsApi.removeButton?.(panelId, id);
          }
        });
      });

      const buttonConfig = {
        id: "custom-edit-html",
        className: "fa fa-code",
        attributes: { title: "Edit HTML" },
        command: "custom:open-editable-code",
      };

      const preferredPanels = ["options", "views"];
      let installed = false;

      preferredPanels.forEach((panelId) => {
        if (installed || !panelsApi.getPanel?.(panelId)) {
          return;
        }

        panelsApi.removeButton?.(panelId, "custom-edit-html");
        panelsApi.addButton?.(panelId, buttonConfig);
        installed = true;
      });
    };

    installEditableCodeButton();
    editor.on("load", installEditableCodeButton);

    editorRef.current = editor;
    setExternalComponents(editor, initialHtmlRef.current, initialDesignJsonRef.current);

    const enableTextEditForTableCell = (component: BuilderComponent | undefined) => {
      const tagNameValue = component?.get?.("tagName");
      const tagName = typeof tagNameValue === "string" ? tagNameValue.toLowerCase() : "";
      if (tagName !== "td" && tagName !== "th") {
        return;
      }

      component?.set?.("editable", true);
      component?.set?.("selectable", true);
      component?.set?.("hoverable", true);
      component?.set?.("draggable", false);
      component?.set?.("copyable", true);
    };

    const resolveEditableTableComponent = (component: BuilderComponent | undefined) => {
      const ownTagNameValue = component?.get?.("tagName");
      const ownTagName = typeof ownTagNameValue === "string" ? ownTagNameValue.toLowerCase() : "";
      if (ownTagName === "table") {
        return component;
      }

      const closestTable = component?.closest?.("table") as BuilderComponent | undefined;
      if (!closestTable) {
        return undefined;
      }

      return closestTable;
    };

    const resolveTableCellComponent = (component: BuilderComponent | undefined, event?: MouseEvent) => {
      const ownTagNameValue = component?.get?.("tagName");
      const ownTagName = typeof ownTagNameValue === "string" ? ownTagNameValue.toLowerCase() : "";
      if (ownTagName === "td" || ownTagName === "th") {
        return component;
      }

      const closestCell = component?.closest?.("td,th");
      if (closestCell) {
        return closestCell;
      }

      const eventElement = getEventElement(event?.target || null);
      if (eventElement) {
        const cellEl = eventElement.closest("td,th");
        if (cellEl) {
          const wrapper = editor.getWrapper();
          const allCells = wrapper?.find?.("td,th") || [];
          const exact = allCells.find((item) => item.getEl?.() === cellEl);
          if (exact) {
            return exact as BuilderComponent;
          }
        }
      }

      const found = component?.find?.("td,th")?.[0] as BuilderComponent | undefined;
      if (found) {
        return found;
      }

      return undefined;
    };

    const beginCellTextEditing = (targetComponent: BuilderComponent | undefined) => {
      if (!targetComponent) {
        return;
      }

      enableTextEditForTableCell(targetComponent);
      editor.select(targetComponent);

      const targetElement = targetComponent.getEl?.();
      if (!(targetElement instanceof HTMLElement)) {
        return;
      }

      targetElement.setAttribute("contenteditable", "true");
      targetElement.focus();

      const selection = targetElement.ownerDocument.getSelection();
      if (selection) {
        const range = targetElement.ownerDocument.createRange();
        range.selectNodeContents(targetElement);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    };

    editor.on("component:selected", (component) => {
      const cellComponent = resolveTableCellComponent(component as BuilderComponent);
      if (cellComponent) {
        window.setTimeout(() => {
          beginCellTextEditing(cellComponent);
        }, 0);
      }

      const tableComponent = resolveEditableTableComponent(component as BuilderComponent);
      if (tableComponent) {
        const existingAttributes =
          (tableComponent.get?.("attributes") as Record<string, unknown> | undefined) || {};
        tableComponent.set?.("attributes", {
          ...existingAttributes,
          "data-editable-table": "true",
          width: "100%",
          cellpadding: String(existingAttributes.cellpadding || "0"),
          cellspacing: String(existingAttributes.cellspacing || "0"),
          style: normalizeEditableTableStyle(String(existingAttributes.style || "")),
        });

        selectedEditableTableRef.current = tableComponent;
        syncInspectorFromTable(tableComponent);
        window.setTimeout(() => {
          renderResizeHandles();
        }, 0);
      } else {
        selectedEditableTableRef.current = null;
        setTableInspector(null);
        clearResizeHandles();
      }
    });

    editor.on("component:dblclick", (component, event?: MouseEvent) => {
      const cellComponent = resolveTableCellComponent(component as BuilderComponent, event);
      const targetComponent = cellComponent || component;
      beginCellTextEditing(targetComponent as BuilderComponent);
    });

    editor.on("component:update", (component) => {
      const selected = selectedEditableTableRef.current;
      if (!selected || selected !== (component as BuilderComponent)) {
        return;
      }

      syncInspectorFromTable(selected);
      window.setTimeout(() => {
        renderResizeHandles();
      }, 0);
    });

    editor.on("update", () => {
      if (isApplyingExternalRef.current) {
        return;
      }

      const html = editor.getHtml();
      const css = editor.getCss();
      const fullHtml = `${html}<style>${css}</style>`;
      lastEmittedHtmlRef.current = fullHtml;
      onChangeRef.current(fullHtml, JSON.stringify(editor.getProjectData()));
    });

    onReadyRef.current?.(editor);

    const onBrandAssetUpdate = () => {
      refreshStoredImageBlocks(editor).catch(() => {
        // Ignore background refresh errors.
      });
    };

    const onOpenCodeShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== "e") {
        return;
      }

      const target = event.target as HTMLElement | null;
      const targetTag = target?.tagName?.toLowerCase();
      const isTypingTarget =
        target?.isContentEditable || targetTag === "input" || targetTag === "textarea" || targetTag === "select";

      if (isTypingTarget) {
        return;
      }

      event.preventDefault();
      editor.runCommand("custom:open-editable-code");
    };

    const columnDragStateRef = { current: null as ColumnDragState | null };
    const resizeHandlesRef = { current: [] as HTMLDivElement[] };

    const clearCanvasCursor = (doc: Document) => {
      doc.body.style.cursor = "";
      doc.body.style.userSelect = "";
    };

    function clearResizeHandles() {
      resizeHandlesRef.current.forEach((handle) => handle.remove());
      resizeHandlesRef.current = [];
    }

    function startColumnDrag(tableComponent: BuilderComponent, dividerIndex: number, startX: number) {
      const tableEl = tableComponent.getEl?.();
      if (!(tableEl instanceof HTMLTableElement)) {
        return;
      }

      const currentState = parseTableInspectorState(tableEl);
      const tableWidthPx = tableEl.getBoundingClientRect().width;
      if (!Number.isFinite(tableWidthPx) || tableWidthPx <= 0) {
        return;
      }

      const normalizedWidths = normalizeTableWidths(currentState.columns, currentState.widths);

      columnDragStateRef.current = {
        tableComponent,
        columnIndex: dividerIndex,
        startX,
        tableWidthPx,
        startWidths: normalizedWidths,
        latestWidths: normalizedWidths,
        moveCount: 0,
      };

      const doc = tableEl.ownerDocument;
      doc.body.style.cursor = "col-resize";
      doc.body.style.userSelect = "none";
    }

    function applyColumnWidthsToDom(tableComponent: BuilderComponent, widths: number[]) {
      const tableEl = tableComponent.getEl?.();
      if (!(tableEl instanceof HTMLTableElement)) {
        return;
      }

      const firstRow = tableEl.querySelector("tr");
      if (!firstRow) {
        return;
      }

      const firstRowCells = Array.from(firstRow.querySelectorAll("th,td"));
      const columns = firstRowCells.length;
      if (!columns) {
        return;
      }

      const normalized = normalizeTableWidths(columns, widths);

      let colgroup = tableEl.querySelector("colgroup");
      if (!colgroup) {
        colgroup = tableEl.ownerDocument.createElement("colgroup");
        tableEl.insertBefore(colgroup, tableEl.firstChild);
      }

      const existingCols = Array.from(colgroup.querySelectorAll("col"));
      if (existingCols.length !== columns) {
        colgroup.innerHTML = Array.from({ length: columns }, () => "<col />").join("");
      }

      const cols = Array.from(colgroup.querySelectorAll("col"));
      cols.forEach((col, index) => {
        const widthValue = Number(normalized[index].toFixed(2));
        const widthText = `${widthValue}%`;
        col.style.setProperty("width", widthText, "important");
        col.style.setProperty("min-width", widthText, "important");
        col.style.setProperty("max-width", widthText, "important");
        col.setAttribute("width", widthText);
      });

      tableEl.style.setProperty("table-layout", "fixed", "important");
      tableEl.style.setProperty("width", "100%", "important");
      if (!tableEl.style.borderCollapse) {
        tableEl.style.borderCollapse = "collapse";
      }
      if (!tableEl.style.border) {
        tableEl.style.border = "1px solid #cbd5e1";
      }

      const rows = Array.from(tableEl.querySelectorAll("tr"));
      rows.forEach((row) => {
        const rowCells = Array.from(row.querySelectorAll("th,td"));
        rowCells.forEach((cell, index) => {
          const widthValue = Number(normalized[index].toFixed(2));
          const widthText = `${widthValue}%`;
          cell.style.setProperty("width", widthText, "important");
          cell.style.setProperty("min-width", widthText, "important");
          cell.style.setProperty("max-width", widthText, "important");

          // Preserve a visible table grid even if component serialization drops style metadata.
          if (!cell.style.padding) {
            cell.style.padding = "10px";
          }
          if (!cell.style.border) {
            cell.style.border = "1px solid #cbd5e1";
          }
          if (!cell.style.fontSize) {
            cell.style.fontSize = "14px";
          }
          if (cell.tagName.toLowerCase() === "th" && !cell.style.background) {
            cell.style.background = "#f1f5f9";
          }

          cell.setAttribute("width", widthText);
        });
      });
    }

    function calculateDraggedWidths(dragState: ColumnDragState, clientX: number) {
      // Keep columns usable while still allowing meaningful resizing.
      const minColumnWidthPx = Math.max(24, dragState.tableWidthPx * 0.08);
      const deltaPx = clientX - dragState.startX;
      const startPixels = scaleWidthsToPixels(dragState.startWidths, dragState.tableWidthPx);
      const leftIndex = dragState.columnIndex;
      const rightIndex = leftIndex + 1;

      if (rightIndex >= startPixels.length) {
        return null;
      }

      const nextPixels = [...startPixels];
      const combined = startPixels[leftIndex] + startPixels[rightIndex];
      const nextLeft = Math.min(
        combined - minColumnWidthPx,
        Math.max(minColumnWidthPx, startPixels[leftIndex] + deltaPx),
      );
      const nextRight = combined - nextLeft;

      nextPixels[leftIndex] = nextLeft;
      nextPixels[rightIndex] = nextRight;

      return normalizeTableWidths(
        nextPixels.length,
        nextPixels.map((pixelWidth) => (pixelWidth / dragState.tableWidthPx) * 100),
      );
    }

    function renderResizeHandles() {
      clearResizeHandles();

      const tableComponent = selectedEditableTableRef.current;
      const tableEl = tableComponent?.getEl?.();
      if (!(tableEl instanceof HTMLTableElement)) {
        return;
      }

      const firstRow = tableEl.querySelector("tr");
      if (!firstRow) {
        return;
      }

      const cells = Array.from(firstRow.querySelectorAll("th,td"));
      if (cells.length < 2) {
        return;
      }

      const doc = tableEl.ownerDocument;
      const tableRect = tableEl.getBoundingClientRect();
      if (tableRect.width <= 0 || tableRect.height <= 0) {
        return;
      }

      const handles: HTMLDivElement[] = [];
      const fragment = doc.createDocumentFragment();

      for (let index = 0; index < cells.length - 1; index += 1) {
        const boundaryX = cells[index].getBoundingClientRect().right;
        const handle = doc.createElement("div");
        handle.setAttribute("data-table-resize-handle", "true");
        handle.style.position = "fixed";
        handle.style.left = `${boundaryX - COLUMN_HANDLE_WIDTH_PX / 2}px`;
        handle.style.top = `${tableRect.top}px`;
        handle.style.width = `${COLUMN_HANDLE_WIDTH_PX}px`;
        handle.style.height = `${tableRect.height}px`;
        handle.style.cursor = "col-resize";
        handle.style.background = "rgba(37,99,235,0.12)";
        handle.style.borderLeft = "1px dashed rgba(37,99,235,0.65)";
        handle.style.borderRight = "1px dashed rgba(37,99,235,0.65)";
        handle.style.zIndex = "2147483647";
        handle.style.pointerEvents = "auto";

        handle.addEventListener("pointerdown", (event) => {
          if (event.button !== 0) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          startColumnDrag(tableComponent as BuilderComponent, index, event.clientX);

          const pointerId = event.pointerId;
          const ownerDocument = handle.ownerDocument;
          let dragEnded = false;

          const stopDrag = (endEvent?: PointerEvent) => {
            if (dragEnded) {
              return;
            }

            if (endEvent && endEvent.pointerId !== pointerId) {
              return;
            }

            dragEnded = true;
            ownerDocument.removeEventListener("pointermove", onPointerMove, true);
            ownerDocument.removeEventListener("pointerup", stopDrag, true);
            ownerDocument.removeEventListener("pointercancel", stopDrag, true);
            handle.removeEventListener("lostpointercapture", onLostPointerCapture);

            if (handle.hasPointerCapture(pointerId)) {
              handle.releasePointerCapture(pointerId);
            }

            const dragState = columnDragStateRef.current;
            if (!dragState) {
              return;
            }

            const endClientX = endEvent?.clientX;
            const finalWidths =
              typeof endClientX === "number"
                ? calculateDraggedWidths(dragState, endClientX) || dragState.latestWidths
                : dragState.latestWidths;

            dragState.latestWidths = finalWidths;

            applyTableColumnWidths(dragState.tableComponent, finalWidths);
            columnDragStateRef.current = null;

            const doc = (tableComponent as BuilderComponent).getEl?.()?.ownerDocument || document;
            clearCanvasCursor(doc);
            renderResizeHandles();
          };

          const onLostPointerCapture = () => {
            stopDrag();
          };

          const onPointerMove = (moveEvent: PointerEvent) => {
            if (moveEvent.pointerId !== pointerId) {
              return;
            }

            const dragState = columnDragStateRef.current;
            if (!dragState) {
              return;
            }

            const nextWidths = calculateDraggedWidths(dragState, moveEvent.clientX);
            if (!nextWidths) {
              return;
            }

            dragState.moveCount += 1;
            dragState.latestWidths = nextWidths;
            applyColumnWidthsToDom(dragState.tableComponent, nextWidths);

            moveEvent.preventDefault();
          };

          ownerDocument.addEventListener("pointermove", onPointerMove, true);
          ownerDocument.addEventListener("pointerup", stopDrag, true);
          ownerDocument.addEventListener("pointercancel", stopDrag, true);
          handle.addEventListener("lostpointercapture", onLostPointerCapture);

          if (typeof handle.setPointerCapture === "function") {
            handle.setPointerCapture(pointerId);
          }
        });

        fragment.appendChild(handle);
        handles.push(handle);
      }

      doc.body.appendChild(fragment);
      resizeHandlesRef.current = handles;
    }

    let canvasWindow: Window | null = null;
    let canvasDocument: Document | null = null;
    const bindCanvasShortcut = () => {
      const frameEl = editor.Canvas.getFrameEl();
      const nextCanvasWindow = frameEl?.contentWindow || null;
      const nextCanvasDocument = nextCanvasWindow?.document || null;

      if (canvasDocument && canvasDocument !== nextCanvasDocument) {
        canvasDocument.removeEventListener("scroll", renderResizeHandles, true);
        clearCanvasCursor(canvasDocument);
        clearResizeHandles();
      }

      if (canvasWindow && canvasWindow !== nextCanvasWindow) {
        canvasWindow.removeEventListener("keydown", onOpenCodeShortcut);
        canvasWindow.removeEventListener("resize", renderResizeHandles);
      }

      if (nextCanvasWindow && canvasWindow !== nextCanvasWindow) {
        nextCanvasWindow.addEventListener("keydown", onOpenCodeShortcut);
        nextCanvasWindow.addEventListener("resize", renderResizeHandles);
      }

      if (nextCanvasDocument && canvasDocument !== nextCanvasDocument) {
        nextCanvasDocument.addEventListener("scroll", renderResizeHandles, true);
      }

      canvasWindow = nextCanvasWindow;
      canvasDocument = nextCanvasDocument;
      renderResizeHandles();
    };

    window.addEventListener("brand-assets-updated", onBrandAssetUpdate);
    window.addEventListener("keydown", onOpenCodeShortcut);
    bindCanvasShortcut();
    editor.on("canvas:frame:load", bindCanvasShortcut);

    return () => {
      window.removeEventListener("brand-assets-updated", onBrandAssetUpdate);
      window.removeEventListener("keydown", onOpenCodeShortcut);
      if (canvasWindow) {
        canvasWindow.removeEventListener("keydown", onOpenCodeShortcut);
        canvasWindow.removeEventListener("resize", renderResizeHandles);
      }
      if (canvasDocument) {
        canvasDocument.removeEventListener("scroll", renderResizeHandles, true);
        clearCanvasCursor(canvasDocument);
        clearResizeHandles();
      }
      if (releaseApplyTimerRef.current) {
        window.clearTimeout(releaseApplyTimerRef.current);
      }
      editor.destroy();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    if (initialHtml && initialHtml !== lastEmittedHtmlRef.current) {
      setExternalComponents(editor, initialHtml, initialDesignJson);
    }
  }, [initialHtml, initialDesignJson]);

  return (
    <div className="space-y-3">
      <div ref={containerRef} className="email-builder-shell w-full rounded-xl border border-slate-200" />
      {tableInspector ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected Data Table</div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="grid gap-1 text-sm text-slate-700">
              Rows
              <input
                type="number"
                min={MIN_TABLE_DIMENSION}
                max={MAX_TABLE_DIMENSION}
                value={tableInspector.rows}
                onChange={(event) => {
                  const nextRows = parseDimension(Number(event.target.value), tableInspector.rows);
                  applyTableLayout(nextRows, tableInspector.columns, tableInspector.widths);
                }}
                className="rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="grid gap-1 text-sm text-slate-700">
              Columns
              <input
                type="number"
                min={MIN_TABLE_DIMENSION}
                max={MAX_TABLE_DIMENSION}
                value={tableInspector.columns}
                onChange={(event) => {
                  const nextColumns = parseDimension(Number(event.target.value), tableInspector.columns);
                  applyTableLayout(tableInspector.rows, nextColumns, tableInspector.widths);
                }}
                className="rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <div className="grid gap-1 text-sm text-slate-700">
              <span>Column Widths (%)</span>
              <div className="flex flex-wrap gap-2">
                {tableInspector.widths.map((width, index) => (
                  <label key={`column-width-${index}`} className="flex items-center gap-1 text-xs text-slate-600">
                    <span>C{index + 1}</span>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      step={1}
                      value={Number(width.toFixed(2))}
                      onChange={(event) => {
                        const nextWidth = Number(event.target.value);
                        const nextWidths = [...tableInspector.widths];
                        nextWidths[index] = Number.isFinite(nextWidth) && nextWidth > 0 ? nextWidth : width;
                        applyTableLayout(tableInspector.rows, tableInspector.columns, nextWidths);
                      }}
                      className="w-20 rounded-md border border-slate-300 px-2 py-1"
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
