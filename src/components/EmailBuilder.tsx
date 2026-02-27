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

    window.addEventListener("brand-assets-updated", onBrandAssetUpdate);

    return () => {
      window.removeEventListener("brand-assets-updated", onBrandAssetUpdate);
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
