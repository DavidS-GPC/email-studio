"use client";

import { useEffect, useRef } from "react";
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
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;border-collapse:collapse;border:1px solid #cbd5e1;">
        <tr>
          <th align="left" style="padding:10px;border:1px solid #cbd5e1;background:#f1f5f9;font-size:14px;">Column 1</th>
          <th align="left" style="padding:10px;border:1px solid #cbd5e1;background:#f1f5f9;font-size:14px;">Column 2</th>
          <th align="left" style="padding:10px;border:1px solid #cbd5e1;background:#f1f5f9;font-size:14px;">Column 3</th>
        </tr>
        <tr>
          <td style="padding:10px;border:1px solid #cbd5e1;font-size:14px;">Value</td>
          <td style="padding:10px;border:1px solid #cbd5e1;font-size:14px;">Value</td>
          <td style="padding:10px;border:1px solid #cbd5e1;font-size:14px;">Value</td>
        </tr>
        <tr>
          <td style="padding:10px;border:1px solid #cbd5e1;font-size:14px;">Value</td>
          <td style="padding:10px;border:1px solid #cbd5e1;font-size:14px;">Value</td>
          <td style="padding:10px;border:1px solid #cbd5e1;font-size:14px;">Value</td>
        </tr>
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

      if (event?.target instanceof HTMLElement) {
        const cellEl = event.target.closest("td,th");
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

    editor.on("component:selected", (component) => {
      const cellComponent = resolveTableCellComponent(component as BuilderComponent);
      if (cellComponent) {
        enableTextEditForTableCell(cellComponent);
      }
    });

    editor.on("component:dblclick", (component, event?: MouseEvent) => {
      const cellComponent = resolveTableCellComponent(component as BuilderComponent, event);
      const targetComponent = cellComponent || component;

      enableTextEditForTableCell(targetComponent);
      editor.select(targetComponent);
      editor.runCommand("core:component-text-edit", { target: targetComponent });
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

    let canvasWindow: Window | null = null;
    const bindCanvasShortcut = () => {
      const frameEl = editor.Canvas.getFrameEl();
      const nextCanvasWindow = frameEl?.contentWindow || null;

      if (canvasWindow && canvasWindow !== nextCanvasWindow) {
        canvasWindow.removeEventListener("keydown", onOpenCodeShortcut);
      }

      if (nextCanvasWindow && canvasWindow !== nextCanvasWindow) {
        nextCanvasWindow.addEventListener("keydown", onOpenCodeShortcut);
      }

      canvasWindow = nextCanvasWindow;
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

  return <div ref={containerRef} className="email-builder-shell w-full rounded-xl border border-slate-200" />;
}
