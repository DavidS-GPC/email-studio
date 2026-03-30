"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor } from "grapesjs";
import { signOut } from "next-auth/react";
import EmailBuilder from "@/components/EmailBuilder";
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import { formatInTimeZone } from "@/lib/timezone";

const VARIABLE_REGEX = /\{\{([a-zA-Z_][a-zA-Z0-9_ ]*)\}\}/g;
const BUILT_IN_VARIABLES = new Set(["name"]);

function extractCustomVariables(html: string): string[] {
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = VARIABLE_REGEX.exec(html)) !== null) {
    const key = match[1].trim();
    if (key && !BUILT_IN_VARIABLES.has(key)) {
      found.add(key);
    }
  }
  return Array.from(found);
}

type Toast = {
  id: number;
  message: string;
  tone: "success" | "error";
};

let nextToastId = 1;

type Template = {
  id: string;
  name: string;
  description: string | null;
  subject: string;
  html: string;
  designJson: string | null;
};

type Group = {
  id: string;
  name: string;
  description: string | null;
  _count?: { memberships: number };
};

type Contact = {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  memberships: { group: Group }[];
};

type CampaignRecipient = {
  id: string;
  email: string;
  status: string;
  error: string | null;
  sentAt: string | null;
};

type Campaign = {
  id: string;
  name: string;
  subject: string;
  html: string;
  status: string;
  sendMode: "now" | "scheduled" | "staggered";
  scheduledFor: string | null;
  staggerMinutes: number | null;
  sendFailureReport?: boolean;
  failureReportEmail?: string | null;
  createdAt: string;
  sentAt: string | null;
  group: Group | null;
  recipients: CampaignRecipient[];
};

type StoredAttachment = {
  id: string;
  type: "upload" | "url";
  name: string;
  url: string;
};

type CurrentUser = {
  username: string;
  role: "admin" | "manager" | "viewer";
  source: "entra" | "local-db" | "local-env";
};

type AppSettings = {
  defaultTimezone: string;
};

const tabs = ["Contacts", "Groups", "Templates", "Campaigns"] as const;
const NEW_TEMPLATE_HTML = "<section><h1>Build your campaign</h1><p>Drag and drop blocks here.</p></section>";

async function readApiJson<T>(response: Response, endpoint: string): Promise<T> {
  const raw = await response.text();

  if (!response.ok) {
    const error = new Error(`${endpoint} failed (${response.status}): ${raw.slice(0, 180) || "Empty response"}`) as Error & {
      status?: number;
      endpoint?: string;
    };
    error.status = response.status;
    error.endpoint = endpoint;
    throw error;
  }

  if (!raw.trim()) {
    throw new Error(`${endpoint} returned an empty response body`);
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`${endpoint} returned invalid JSON`);
  }
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Contacts");

  const [templates, setTemplates] = useState<Template[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [status, setStatus] = useState<string>("Loading data...");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [defaultTimezone, setDefaultTimezone] = useState(DEFAULT_TIMEZONE);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const showToast = useCallback((message: string, tone: "success" | "error" = "success") => {
    const id = nextToastId++;
    setToasts((prev) => [...prev, { id, message, tone }]);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      toastTimersRef.current.delete(id);
    }, 3500);
    toastTimersRef.current.set(id, timer);
  }, []);

  useEffect(() => {
    return () => {
      toastTimersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateHtml, setTemplateHtml] = useState(NEW_TEMPLATE_HTML);
  const [templateDesignJson, setTemplateDesignJson] = useState("");
  const [isNewTemplateModalOpen, setIsNewTemplateModalOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [isCopyTemplateModalOpen, setIsCopyTemplateModalOpen] = useState(false);
  const [copyTemplateName, setCopyTemplateName] = useState("");
  const [builderEditor, setBuilderEditor] = useState<Editor | null>(null);
  const [customVariableName, setCustomVariableName] = useState("");

  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupDescription, setEditGroupDescription] = useState("");
  const [groupMemberGroupId, setGroupMemberGroupId] = useState("");
  const [groupMemberContactId, setGroupMemberContactId] = useState("");
  const [groupDeleteTargetId, setGroupDeleteTargetId] = useState<string | null>(null);
  const [groupDeleteMode, setGroupDeleteMode] = useState<"move-to-default" | "delete-members">("move-to-default");
  const [contactImportGroup, setContactImportGroup] = useState("");
  const [importStatusOpen, setImportStatusOpen] = useState(false);
  const [isImportingContacts, setIsImportingContacts] = useState(false);
  const [importStatusTone, setImportStatusTone] = useState<"info" | "success" | "error">("info");
  const [importStatusMessage, setImportStatusMessage] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactCompany, setContactCompany] = useState("");
  const [contactGroupId, setContactGroupId] = useState("");
  const [contactFilterGroupId, setContactFilterGroupId] = useState("all");
  const [contactSortBy, setContactSortBy] = useState<"newest" | "name-asc" | "name-desc" | "email-asc" | "email-desc">("newest");
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editContactEmail, setEditContactEmail] = useState("");
  const [editContactName, setEditContactName] = useState("");
  const [editContactCompany, setEditContactCompany] = useState("");

  const [campaignName, setCampaignName] = useState("");
  const [campaignGroupId, setCampaignGroupId] = useState("");
  const [campaignTemplateId, setCampaignTemplateId] = useState("");
  const [campaignSendMode, setCampaignSendMode] = useState<"now" | "scheduled" | "staggered">("now");
  const [campaignScheduledFor, setCampaignScheduledFor] = useState("");
  const [campaignStaggerStart, setCampaignStaggerStart] = useState("");
  const [campaignStaggerEnd, setCampaignStaggerEnd] = useState("");
  const [campaignSendFailureReport, setCampaignSendFailureReport] = useState(false);
  const [campaignFailureReportEmail, setCampaignFailureReportEmail] = useState("");
  const [isCampaignPreviewOpen, setIsCampaignPreviewOpen] = useState(false);
  const [campaignSubject, setCampaignSubject] = useState("");
  const [campaignHtml, setCampaignHtml] = useState("");
  const [campaignVariables, setCampaignVariables] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<StoredAttachment[]>([]);
  const [assetImageUrl, setAssetImageUrl] = useState("");
  const [campaignAttachmentUrl, setCampaignAttachmentUrl] = useState("");
  const [selectedCampaignDetailsId, setSelectedCampaignDetailsId] = useState<string | null>(null);
  const [resendConfirmCampaignId, setResendConfirmCampaignId] = useState<string | null>(null);

  const pageWidthClass = activeTab === "Templates" ? "max-w-[1700px]" : "max-w-7xl";

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === selectedTemplateId) || null,
    [templates, selectedTemplateId],
  );

  const sentRecipients = useMemo(
    () => campaigns.reduce((acc, campaign) => acc + campaign.recipients.filter((item) => item.status === "sent").length, 0),
    [campaigns],
  );
  const failedRecipients = useMemo(
    () => campaigns.reduce((acc, campaign) => acc + campaign.recipients.filter((item) => item.status === "failed").length, 0),
    [campaigns],
  );

  const selectedCampaignDetails = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignDetailsId) || null,
    [campaigns, selectedCampaignDetailsId],
  );

  const resendConfirmCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === resendConfirmCampaignId) || null,
    [campaigns, resendConfirmCampaignId],
  );

  const groupDeleteTarget = useMemo(
    () => groups.find((group) => group.id === groupDeleteTargetId) || null,
    [groupDeleteTargetId, groups],
  );

  const filteredContacts = useMemo(() => {
    let next = [...contacts];

    if (contactFilterGroupId === "unassigned") {
      next = next.filter((contact) => contact.memberships.length === 0);
    } else if (contactFilterGroupId !== "all") {
      next = next.filter((contact) => contact.memberships.some((membership) => membership.group.id === contactFilterGroupId));
    }

    switch (contactSortBy) {
      case "name-asc":
        next.sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }));
        break;
      case "name-desc":
        next.sort((a, b) => (b.name || "").localeCompare(a.name || "", undefined, { sensitivity: "base" }));
        break;
      case "email-asc":
        next.sort((a, b) => a.email.localeCompare(b.email, undefined, { sensitivity: "base" }));
        break;
      case "email-desc":
        next.sort((a, b) => b.email.localeCompare(a.email, undefined, { sensitivity: "base" }));
        break;
      case "newest":
      default:
        break;
    }

    return next;
  }, [contacts, contactFilterGroupId, contactSortBy]);

  const editingContact = useMemo(
    () => contacts.find((contact) => contact.id === editingContactId) || null,
    [contacts, editingContactId],
  );

  const allFilteredContactsSelected = useMemo(() => {
    if (filteredContacts.length === 0) {
      return false;
    }

    return filteredContacts.every((contact) => selectedContactIds.includes(contact.id));
  }, [filteredContacts, selectedContactIds]);

  const loadTemplate = useCallback((template: Template) => {
    setSelectedTemplateId(template.id);
    setTemplateName(template.name);
    setTemplateDescription(template.description || "");
    setTemplateSubject(template.subject);
    setTemplateHtml(template.html);
    setTemplateDesignJson(template.designJson || "");
  }, []);

  const onStartNewTemplate = useCallback(() => {
    setNewTemplateName("New template");
    setIsNewTemplateModalOpen(true);
  }, []);

  const refreshAll = useCallback(async () => {
    await fetch("/api/campaigns/process-due", {
      method: "POST",
    }).catch(() => null);

    const [templateRes, groupRes, contactRes, campaignRes, settingsRes] = await Promise.all([
      fetch("/api/templates"),
      fetch("/api/groups"),
      fetch("/api/contacts"),
      fetch("/api/campaigns"),
      fetch("/api/settings"),
    ]);

    const [templateData, groupData, contactData, campaignData, settingsData] = await Promise.all([
      readApiJson<Template[]>(templateRes, "/api/templates"),
      readApiJson<Group[]>(groupRes, "/api/groups"),
      readApiJson<Contact[]>(contactRes, "/api/contacts"),
      readApiJson<Campaign[]>(campaignRes, "/api/campaigns"),
      readApiJson<AppSettings>(settingsRes, "/api/settings"),
    ]);

    setTemplates(templateData);
    setGroups(groupData);
    setContacts(contactData);
    setCampaigns(campaignData);
    setDefaultTimezone(settingsData.defaultTimezone || DEFAULT_TIMEZONE);

    const selectedStillExists = templateData.some((item) => item.id === selectedTemplateId);

    if (templateData.length === 0) {
      setSelectedTemplateId("");
      setTemplateName("");
      setTemplateDescription("");
      setTemplateSubject("");
      setTemplateHtml(NEW_TEMPLATE_HTML);
      setTemplateDesignJson("");
    } else if (!selectedTemplateId || !selectedStillExists) {
      loadTemplate(templateData[0]);
    }

    setStatus("Ready");
  }, [loadTemplate, selectedTemplateId]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      refreshAll().catch((error) => {
        const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 0;
        if (status === 401 || status === 403) {
          const callbackUrl = `${window.location.pathname}${window.location.search}`;
          setStatus("Session expired. Redirecting to sign in...");
          window.location.href = `/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`;
          return;
        }

        setStatus(`Load error: ${error instanceof Error ? error.message : "Unknown"}`);
      });
    }, 0);

    return () => {
      window.clearTimeout(loadTimer);
    };
  }, [refreshAll]);

  useEffect(() => {
    fetch("/api/me")
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            const callbackUrl = `${window.location.pathname}${window.location.search}`;
            window.location.href = `/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`;
            return null;
          }

          throw new Error(`Failed to load current user (${response.status})`);
        }

        return response.json();
      })
      .then((payload) => {
        if (payload?.username && payload?.role) {
          setCurrentUser(payload as CurrentUser);
        }
      })
      .catch(() => {
        setCurrentUser(null);
      });
  }, []);

  async function onCreateGroup(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: groupName, description: groupDescription }),
    });

    if (!response.ok) {
      const raw = await response.text();
      setStatus(`Group save failed: ${raw || response.status}`);
      return;
    }

    setGroupName("");
    setGroupDescription("");
    setStatus("Group created");
    await refreshAll();
  }

  function onEditGroup(group: Group) {
    setEditingGroupId(group.id);
    setEditGroupName(group.name);
    setEditGroupDescription(group.description || "");
  }

  function onCancelGroupEdit() {
    setEditingGroupId(null);
    setEditGroupName("");
    setEditGroupDescription("");
  }

  async function onSaveGroupEdits(event: React.FormEvent) {
    event.preventDefault();

    if (!editingGroupId) {
      return;
    }

    const response = await fetch(`/api/groups/${editingGroupId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editGroupName, description: editGroupDescription }),
    });

    if (!response.ok) {
      const raw = await response.text();
      setStatus(`Group save failed: ${raw || response.status}`);
      return;
    }

    setStatus("Group updated");
    onCancelGroupEdit();
    await refreshAll();
  }

  async function onAddContactToGroup(event: React.FormEvent) {
    event.preventDefault();

    if (!groupMemberGroupId || !groupMemberContactId) {
      setStatus("Select both a group and contact");
      return;
    }

    const response = await fetch(`/api/groups/${groupMemberGroupId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: groupMemberContactId }),
    });

    if (!response.ok) {
      const raw = await response.text();
      setStatus(`Add to group failed: ${raw || response.status}`);
      return;
    }

    setGroupMemberContactId("");
    setStatus("Contact added to group");
    await refreshAll();
  }

  function onRequestDeleteGroup(groupId: string) {
    setGroupDeleteTargetId(groupId);
    setGroupDeleteMode("move-to-default");
  }

  function onCloseDeleteGroupModal() {
    setGroupDeleteTargetId(null);
    setGroupDeleteMode("move-to-default");
  }

  async function onConfirmDeleteGroup() {
    if (!groupDeleteTargetId) {
      return;
    }

    const response = await fetch(`/api/groups/${groupDeleteTargetId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: groupDeleteMode }),
    });

    if (!response.ok) {
      const raw = await response.text();
      setStatus(`Delete group failed: ${raw || response.status}`);
      return;
    }

    setStatus(groupDeleteMode === "delete-members" ? "Group and members deleted" : "Group deleted and members moved to default group");
    onCloseDeleteGroupModal();
    await refreshAll();
  }

  async function onImportContacts(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.append("groupName", contactImportGroup);

    setImportStatusOpen(true);
    setIsImportingContacts(true);
    setImportStatusTone("info");
    setImportStatusMessage("Importing contacts. Please wait...");

    try {
      const response = await fetch("/api/contacts/import", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const raw = await response.text();
        throw new Error(raw || `Import failed (${response.status})`);
      }

      const data = await response.json();
      const importedCount = data.importedCount || 0;
      setStatus(`Imported ${importedCount} contacts`);
      setImportStatusTone("success");
      setImportStatusMessage(`Import complete. Imported ${importedCount} contacts.`);
      form.reset();
      await refreshAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown import error";
      setStatus(`Import failed: ${message}`);
      setImportStatusTone("error");
      setImportStatusMessage(`Import failed: ${message}`);
    } finally {
      setIsImportingContacts(false);
    }
  }

  function onCloseImportStatusPopup() {
    if (isImportingContacts) {
      return;
    }

    setImportStatusOpen(false);
  }

  async function onCreateContact(event: React.FormEvent) {
    event.preventDefault();

    const response = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: contactEmail,
        name: contactName,
        company: contactCompany,
        groupId: contactGroupId || null,
      }),
    });

    if (!response.ok) {
      const raw = await response.text();
      setStatus(`Contact save failed: ${raw || response.status}`);
      return;
    }

    setContactEmail("");
    setContactName("");
    setContactCompany("");
    setContactGroupId("");
    setStatus("Contact saved");
    await refreshAll();
  }

  function onToggleContactSelection(contactId: string) {
    setSelectedContactIds((current) =>
      current.includes(contactId)
        ? current.filter((id) => id !== contactId)
        : [...current, contactId],
    );
  }

  function onToggleSelectAllFilteredContacts() {
    const visibleIds = filteredContacts.map((contact) => contact.id);

    if (visibleIds.length === 0) {
      return;
    }

    setSelectedContactIds((current) => {
      const everyVisibleSelected = visibleIds.every((id) => current.includes(id));

      if (everyVisibleSelected) {
        return current.filter((id) => !visibleIds.includes(id));
      }

      return Array.from(new Set([...current, ...visibleIds]));
    });
  }

  async function onDeleteSelectedContacts() {
    if (selectedContactIds.length === 0) {
      return;
    }

    const confirmed = window.confirm(`Delete ${selectedContactIds.length} selected contact(s)? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    const response = await fetch("/api/contacts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedContactIds }),
    });

    if (!response.ok) {
      const raw = await response.text();
      setStatus(`Delete failed: ${raw || response.status}`);
      return;
    }

    const data = await response.json();
    setStatus(`Deleted ${data.deletedCount || 0} contacts`);
    setSelectedContactIds([]);
    await refreshAll();
  }

  function onOpenEditContact(contact: Contact) {
    setEditingContactId(contact.id);
    setEditContactEmail(contact.email);
    setEditContactName(contact.name || "");
    setEditContactCompany(contact.company || "");
  }

  function onCloseEditContact() {
    setEditingContactId(null);
    setEditContactEmail("");
    setEditContactName("");
    setEditContactCompany("");
  }

  async function onSaveContactEdits(event: React.FormEvent) {
    event.preventDefault();

    if (!editingContactId) {
      return;
    }

    const response = await fetch(`/api/contacts/${editingContactId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: editContactEmail,
        name: editContactName,
        company: editContactCompany,
      }),
    });

    if (!response.ok) {
      const raw = await response.text();
      setStatus(`Contact update failed: ${raw || response.status}`);
      return;
    }

    setStatus("Contact updated");
    onCloseEditContact();
    await refreshAll();
  }

  async function onSaveTemplate() {
    // Read the latest content directly from the editor to avoid stale state
    // (e.g. when user types in a cell and clicks Save before the update event fires)
    let latestHtml = templateHtml;
    let latestDesignJson = templateDesignJson;
    if (builderEditor) {
      const editorHtml = builderEditor.getHtml();
      const editorCss = builderEditor.getCss();
      latestHtml = `${editorHtml}<style>${editorCss}</style>`;
      latestDesignJson = JSON.stringify(builderEditor.getProjectData());
      setTemplateHtml(latestHtml);
      setTemplateDesignJson(latestDesignJson);
    }

    const payload = {
      name: templateName,
      description: templateDescription,
      subject: templateSubject,
      html: latestHtml,
      designJson: latestDesignJson,
    };

    if (selectedTemplate) {
      const response = await fetch(`/api/templates/${selectedTemplate.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        showToast("Template updated successfully");
      } else {
        showToast("Template update failed", "error");
      }
      setStatus("Template updated");
    } else {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        showToast("Template created successfully");
      } else {
        showToast("Template creation failed", "error");
      }
      setStatus("Template created");
    }

    await refreshAll();
  }

  async function onDeleteTemplate() {
    if (!selectedTemplate) {
      return;
    }

    const confirmed = window.confirm(`Delete template \"${selectedTemplate.name}\"?`);
    if (!confirmed) {
      return;
    }

    const response = await fetch(`/api/templates/${selectedTemplate.id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const raw = await response.text();
      setStatus(`Delete failed: ${raw || response.status}`);
      return;
    }

    setStatus("Template deleted");
    setSelectedTemplateId("");
    await refreshAll();
  }

  function insertVariableIntoEditor(variableName: string) {
    if (!builderEditor || !variableName.trim()) {
      return;
    }
    const tag = `{{${variableName.trim()}}}`;
    const selected = builderEditor.getSelected();
    if (selected) {
      const el = selected.getEl();
      if (el instanceof HTMLElement && el.isContentEditable) {
        const doc = el.ownerDocument;
        const sel = doc.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(doc.createTextNode(tag));
          range.collapse(false);
          return;
        }
      }
      // Append to component content if not in content-editable mode
      const currentHtml = builderEditor.getHtml();
      const css = builderEditor.getCss();
      // Insert at cursor position isn't possible - append as text node to selected
      const currentContent = typeof selected.get === "function" ? selected.get("content") : "";
      if (typeof selected.set === "function") {
        selected.set("content", `${currentContent || ""}${tag}`);
      }
    } else {
      // No component selected - append to root
      builderEditor.addComponents(`<span>${tag}</span>`);
    }
  }

  function onInsertCustomVariable() {
    const name = customVariableName.trim().replace(/\s+/g, "_");
    if (!name) return;
    insertVariableIntoEditor(name);
    setCustomVariableName("");
  }

  function onOpenCopyTemplateModal() {
    if (!templateName.trim()) {
      return;
    }

    setCopyTemplateName(`${templateName.trim()} Copy`);
    setIsCopyTemplateModalOpen(true);
  }

  async function onConfirmCopyTemplate(event: React.FormEvent) {
    event.preventDefault();

    const nextName = copyTemplateName.trim();
    if (!nextName) {
      return;
    }

    const response = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nextName,
        description: templateDescription,
        subject: templateSubject,
        html: templateHtml,
        designJson: templateDesignJson,
      }),
    });

    const createdTemplate = await response.json();
    setStatus("Template copied");
    setIsCopyTemplateModalOpen(false);
    setCopyTemplateName("");
    await refreshAll();

    if (createdTemplate?.id) {
      loadTemplate(createdTemplate);
    }
  }

  async function onConfirmCreateTemplate(event: React.FormEvent) {
    event.preventDefault();

    const nextName = newTemplateName.trim();
    if (!nextName) {
      return;
    }

    const response = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nextName,
        description: "",
        subject: "",
        html: NEW_TEMPLATE_HTML,
        designJson: "",
      }),
    });

    if (!response.ok) {
      const raw = await response.text();
      setStatus(`Template create failed: ${raw || response.status}`);
      return;
    }

    const createdTemplate = await response.json();
    setIsNewTemplateModalOpen(false);
    setNewTemplateName("");
    setStatus("Template created");
    await refreshAll();

    if (createdTemplate?.id) {
      loadTemplate(createdTemplate);
    }
  }

  async function onUploadAsset(file: File | null) {
    if (!file) {
      return;
    }

    const form = new FormData();
    form.set("file", file);
    const response = await fetch("/api/upload", { method: "POST", body: form });
    const uploaded = await response.json();

    builderEditor?.addComponents(
      `<img src="${uploaded.url}" alt="${uploaded.name}" style="max-width:100%;border-radius:10px;" />`,
    );

    window.dispatchEvent(new Event("brand-assets-updated"));
  }

  async function onAddAssetByUrl() {
    if (!assetImageUrl.trim()) {
      return;
    }

    const response = await fetch("/api/upload", {
      method: "POST",
      body: (() => {
        const data = new FormData();
        data.set("url", assetImageUrl);
        data.set("name", "External image");
        return data;
      })(),
    });

    const uploaded = await response.json();
    builderEditor?.addComponents(
      `<img src="${uploaded.url}" alt="${uploaded.name}" style="max-width:100%;border-radius:10px;" />`,
    );
    setAssetImageUrl("");
  }

  async function onAddCampaignAttachmentFile(file: File | null) {
    if (!file) {
      return;
    }

    const form = new FormData();
    form.set("file", file);
    const response = await fetch("/api/upload", { method: "POST", body: form });
    const item = await response.json();
    setAttachments((old) => [...old, item]);
  }

  async function onAddCampaignAttachmentUrl() {
    if (!campaignAttachmentUrl.trim()) {
      return;
    }

    const form = new FormData();
    form.set("url", campaignAttachmentUrl);
    form.set("name", campaignAttachmentUrl.split("/").pop() || "attachment");
    const response = await fetch("/api/upload", { method: "POST", body: form });
    const item = await response.json();
    setAttachments((old) => [...old, item]);
    setCampaignAttachmentUrl("");
  }

  async function onCreateCampaign(event: React.FormEvent) {
    event.preventDefault();

    if (campaignSendMode === "scheduled" && !campaignScheduledFor) {
      setStatus("Choose a scheduled date/time");
      return;
    }

    if (campaignSendMode === "staggered") {
      if (!campaignStaggerStart || !campaignStaggerEnd) {
        setStatus("Choose both stagger start and end date/time");
        return;
      }

      const staggerStart = new Date(campaignStaggerStart);
      const staggerEnd = new Date(campaignStaggerEnd);

      if (Number.isNaN(staggerStart.getTime()) || Number.isNaN(staggerEnd.getTime())) {
        setStatus("Choose valid stagger start and end date/time values");
        return;
      }

      if (staggerStart.getTime() <= Date.now()) {
        setStatus("Stagger start date/time must be in the future");
        return;
      }

      if (staggerEnd.getTime() <= staggerStart.getTime()) {
        setStatus("Stagger end date/time must be after the start date/time");
        return;
      }
    }

    if (campaignSendFailureReport && !campaignFailureReportEmail.trim()) {
      setStatus("Enter a report email address");
      return;
    }

    // Apply dynamic variable values to the campaign HTML before sending
    let finalHtml = campaignHtml;
    for (const [key, value] of Object.entries(campaignVariables)) {
      if (value) {
        finalHtml = finalHtml.replaceAll(`{{${key}}}`, value);
      }
    }

    const response = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: campaignName,
        groupId: campaignGroupId,
        templateId: campaignTemplateId || null,
        subject: campaignSubject,
        html: finalHtml,
        sendMode: campaignSendMode,
        timeZone: defaultTimezone,
        scheduledForLocal: campaignSendMode === "scheduled" ? campaignScheduledFor : null,
        staggerStartLocal: campaignSendMode === "staggered" ? campaignStaggerStart : null,
        staggerEndLocal: campaignSendMode === "staggered" ? campaignStaggerEnd : null,
        sendFailureReport: campaignSendFailureReport,
        failureReportEmail: campaignSendFailureReport ? campaignFailureReportEmail.trim().toLowerCase() : null,
        attachments,
      }),
    });

    if (!response.ok) {
      const raw = await response.text();
      setStatus(`Campaign save failed: ${raw || response.status}`);
      return;
    }

    const data = await response.json();

    setCampaignName("");
    setCampaignGroupId("");
    setCampaignTemplateId("");
    setCampaignSendMode("now");
    setCampaignScheduledFor("");
    setCampaignStaggerStart("");
    setCampaignStaggerEnd("");
    setCampaignSendFailureReport(false);
    setCampaignFailureReportEmail("");
    setCampaignSubject("");
    setCampaignHtml("");
    setCampaignVariables({});
    setAttachments([]);

    if (campaignSendMode === "scheduled" || campaignSendMode === "staggered") {
      setStatus("Campaign scheduled successfully");
    } else {
      setStatus(`Campaign sent. Success: ${data.sent || 0}, Failed: ${data.failed || 0}`);
    }

    await refreshAll();
  }

  async function onSendCampaign(campaignId: string) {
    const response = await fetch(`/api/campaigns/${campaignId}/send`, {
      method: "POST",
    });
    const result = await response.json();
    setStatus(`Campaign sent. Success: ${result.sent || 0}, Failed: ${result.failed || 0}`);
    await refreshAll();
  }

  function onCampaignSendAction(campaign: Campaign) {
    if (campaign.status === "sent" || campaign.sentAt) {
      setResendConfirmCampaignId(campaign.id);
      return;
    }

    onSendCampaign(campaign.id);
  }

  function onCloseResendConfirm() {
    setResendConfirmCampaignId(null);
  }

  async function onConfirmResend() {
    if (!resendConfirmCampaignId) {
      return;
    }

    await onSendCampaign(resendConfirmCampaignId);
    setResendConfirmCampaignId(null);
  }

  function onCampaignTemplateChange(nextTemplateId: string) {
    setCampaignTemplateId(nextTemplateId);
    const template = templates.find((item) => item.id === nextTemplateId);
    if (template) {
      setCampaignSubject(template.subject);
      setCampaignHtml(template.html);
      const vars = extractCustomVariables(template.html);
      const initial: Record<string, string> = {};
      for (const v of vars) {
        initial[v] = "";
      }
      setCampaignVariables(initial);
    } else {
      setCampaignVariables({});
    }
  }

  const onOpenCampaignDetails = useCallback((campaignId: string) => {
    setSelectedCampaignDetailsId(campaignId);
  }, []);

  const onCloseCampaignDetails = useCallback(() => {
    setSelectedCampaignDetailsId(null);
  }, []);

  useEffect(() => {
    if (!selectedCampaignDetails) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseCampaignDetails();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onCloseCampaignDetails, selectedCampaignDetails]);

  useEffect(() => {
    if (!resendConfirmCampaignId) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseResendConfirm();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [resendConfirmCampaignId]);

  return (
    <div className="shell-bg min-h-screen text-slate-900">
      <div className={`mx-auto ${pageWidthClass} px-5 py-6 md:px-8 md:py-8`}>
        <header className="glass-panel fade-up mb-6 rounded-3xl p-6 md:p-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-3">
              <p className="inline-flex w-fit items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold tracking-wide text-blue-700">
                OPERATIONS COMMUNICATION HUB
              </p>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Email Alerts & Marketing Studio</h1>
              <p className="max-w-2xl text-sm subtle-text md:text-base">
                Launch enterprise-quality campaigns, segment high-value audiences, and monitor send reliability in one refined workspace.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="metric-card">
                <p className="text-[11px] font-semibold uppercase tracking-wide subtle-text">Contacts</p>
                <p className="mt-1 text-xl font-bold">{contacts.length}</p>
              </div>
              <div className="metric-card">
                <p className="text-[11px] font-semibold uppercase tracking-wide subtle-text">Groups</p>
                <p className="mt-1 text-xl font-bold">{groups.length}</p>
              </div>
              <div className="metric-card">
                <p className="text-[11px] font-semibold uppercase tracking-wide subtle-text">Sent</p>
                <p className="mt-1 text-xl font-bold text-emerald-700">{sentRecipients}</p>
              </div>
              <div className="metric-card">
                <p className="text-[11px] font-semibold uppercase tracking-wide subtle-text">Failed</p>
                <p className="mt-1 text-xl font-bold text-rose-700">{failedRecipients}</p>
              </div>
            </div>
          </div>

          <div className="mt-4 border-t border-slate-200/70 pt-4 text-xs subtle-text flex flex-wrap items-center justify-between gap-2">
            <span>System status: {status}</span>
            <span>
              {currentUser ? `Signed in as ${currentUser.username} (${currentUser.role})` : ""}
              {currentUser ? (
                <button
                  type="button"
                  className="secondary-btn ml-2 px-3 py-1 text-xs"
                  onClick={() => signOut({ callbackUrl: "/signin" })}
                >
                  Logout
                </button>
              ) : null}
              {currentUser?.role === "admin" ? (
                <a href="/admin" className="ml-3 font-semibold text-sky-700 hover:underline">
                  Open admin page
                </a>
              ) : null}
            </span>
          </div>
        </header>

        <div className="fade-up mb-6 flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`chip-btn ${activeTab === tab ? "active" : ""}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "Contacts" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="glass-panel fade-up rounded-2xl p-5 md:p-6">
              <h2 className="panel-title mb-3 text-lg">Create Contact</h2>
              <form onSubmit={onCreateContact} className="space-y-3">
                <input
                  required
                  type="email"
                  placeholder="Email"
                  value={contactEmail}
                  onChange={(event) => setContactEmail(event.target.value)}
                  className="field"
                />
                <input
                  placeholder="Name"
                  value={contactName}
                  onChange={(event) => setContactName(event.target.value)}
                  className="field"
                />
                <input
                  placeholder="Company"
                  value={contactCompany}
                  onChange={(event) => setContactCompany(event.target.value)}
                  className="field"
                />
                <select
                  value={contactGroupId}
                  onChange={(event) => setContactGroupId(event.target.value)}
                  className="field-select"
                >
                  <option value="">No group</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className="primary-btn">
                  Save contact
                </button>
              </form>
            </section>

            <section className="glass-panel fade-up rounded-2xl p-5 md:p-6">
              <h2 className="panel-title mb-3 text-lg">Import Contacts (CSV/XLSX)</h2>
              <form onSubmit={onImportContacts} className="space-y-3">
                <input
                  type="file"
                  name="file"
                  accept=".csv,.xlsx,.xls"
                  required
                  className="field file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
                />
                <input
                  placeholder="Optional fallback group name"
                  value={contactImportGroup}
                  onChange={(event) => setContactImportGroup(event.target.value)}
                  className="field"
                />
                <button type="submit" className="primary-btn" disabled={isImportingContacts}>
                  {isImportingContacts ? "Importing..." : "Import contacts"}
                </button>
              </form>
              <div className="mt-3">
                <div className="flex flex-wrap gap-2">
                  <a
                    href="/examples/contacts-import-example.csv"
                    download
                    className="secondary-btn inline-flex items-center"
                  >
                    Download example CSV
                  </a>
                  <a
                    href="/examples/contacts-import-example.xlsx"
                    download
                    className="secondary-btn inline-flex items-center"
                  >
                    Download example XLSX
                  </a>
                </div>
                <p className="mt-2 text-xs subtle-text">Includes headers: email, name, company, tags, group.</p>
              </div>
            </section>

            <section className="glass-panel fade-up rounded-2xl p-5 md:p-6 lg:col-span-2">
              <h2 className="panel-title mb-3 text-lg">Contacts</h2>
              <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <select
                  value={contactFilterGroupId}
                  onChange={(event) => setContactFilterGroupId(event.target.value)}
                  className="field-select"
                >
                  <option value="all">All groups</option>
                  <option value="unassigned">Unassigned only</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>

                <select
                  value={contactSortBy}
                  onChange={(event) => setContactSortBy(event.target.value as "newest" | "name-asc" | "name-desc" | "email-asc" | "email-desc")}
                  className="field-select"
                >
                  <option value="newest">Sort: Newest first</option>
                  <option value="name-asc">Sort: Name A → Z</option>
                  <option value="name-desc">Sort: Name Z → A</option>
                  <option value="email-asc">Sort: Email A → Z</option>
                  <option value="email-desc">Sort: Email Z → A</option>
                </select>
              </div>

              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs subtle-text">
                  Selected: {selectedContactIds.length}
                </p>
                <button
                  type="button"
                  onClick={onDeleteSelectedContacts}
                  className="secondary-btn"
                  disabled={selectedContactIds.length === 0}
                >
                  Delete selected
                </button>
              </div>

              <div className="table-shell max-h-[450px]">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50/80 text-slate-700">
                    <tr>
                      <th className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={allFilteredContactsSelected}
                          onChange={onToggleSelectAllFilteredContacts}
                          aria-label="Select all visible contacts"
                        />
                      </th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Company</th>
                      <th className="px-3 py-2">Groups</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContacts.map((contact) => (
                      <tr key={contact.id} className="border-t border-slate-100/80">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selectedContactIds.includes(contact.id)}
                            onChange={() => onToggleContactSelection(contact.id)}
                            aria-label={`Select ${contact.email}`}
                          />
                        </td>
                        <td className="px-3 py-2">{contact.name || "—"}</td>
                        <td className="px-3 py-2">{contact.email}</td>
                        <td className="px-3 py-2">{contact.company || "—"}</td>
                        <td className="px-3 py-2">
                          {contact.memberships.map((membership) => membership.group.name).join(", ") || "Unassigned"}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => onOpenEditContact(contact)}
                            className="secondary-btn"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {activeTab === "Groups" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="glass-panel fade-up rounded-2xl p-5 md:p-6">
              <h2 className="panel-title mb-3 text-lg">Create Group</h2>
              <form onSubmit={onCreateGroup} className="space-y-3">
                <input
                  required
                  placeholder="Group name"
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  className="field"
                />
                <input
                  placeholder="Description"
                  value={groupDescription}
                  onChange={(event) => setGroupDescription(event.target.value)}
                  className="field"
                />
                <button type="submit" className="primary-btn">
                  Create group
                </button>
              </form>
            </section>

            <section className="glass-panel fade-up rounded-2xl p-5 md:p-6">
              <h2 className="panel-title mb-3 text-lg">Add Contact to Group</h2>
              <form onSubmit={onAddContactToGroup} className="space-y-3">
                <select
                  value={groupMemberGroupId}
                  onChange={(event) => setGroupMemberGroupId(event.target.value)}
                  className="field-select"
                  required
                >
                  <option value="">Select group</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>

                <select
                  value={groupMemberContactId}
                  onChange={(event) => setGroupMemberContactId(event.target.value)}
                  className="field-select"
                  required
                >
                  <option value="">Select contact</option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.name || contact.email} ({contact.email})
                    </option>
                  ))}
                </select>

                <button type="submit" className="primary-btn">
                  Add to group
                </button>
              </form>
            </section>

            <section className="glass-panel fade-up rounded-2xl p-5 md:p-6 lg:col-span-2">
              <h2 className="panel-title mb-3 text-lg">Groups</h2>
              <div className="table-shell max-h-[500px]">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50/80 text-slate-700">
                    <tr>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2">Members</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((group) => (
                      <tr key={group.id} className="border-t border-slate-100/80">
                        <td className="px-3 py-2 font-medium">{group.name}</td>
                        <td className="px-3 py-2">{group.description || "—"}</td>
                        <td className="px-3 py-2">{group._count?.memberships || 0}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => onEditGroup(group)} className="secondary-btn">
                              Edit
                            </button>
                            <button type="button" onClick={() => onRequestDeleteGroup(group.id)} className="secondary-btn">
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {groups.length === 0 && (
                      <tr>
                        <td className="px-3 py-3 text-sm subtle-text" colSpan={4}>
                          No groups created yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {activeTab === "Templates" && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
            <aside className="glass-panel fade-up rounded-2xl p-5 md:p-6">
              <h2 className="panel-title mb-3 text-lg">Saved Templates</h2>
              <div className="space-y-2">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => loadTemplate(template)}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                      selectedTemplateId === template.id
                        ? "border-blue-400 bg-blue-50/70 shadow-sm"
                        : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-medium">{template.name}</div>
                    <div className="text-xs text-slate-500">{template.subject}</div>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={onStartNewTemplate}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                    selectedTemplateId
                      ? "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50"
                      : "border-blue-400 bg-blue-50/70 shadow-sm"
                  }`}
                >
                  <div className="font-medium">+ New template</div>
                  <div className="text-xs text-slate-500">Create a new template draft</div>
                </button>
              </div>
            </aside>

            <section className="glass-panel fade-up min-w-0 rounded-2xl p-5 md:p-6">
              <h2 className="panel-title mb-3 text-lg">Drag & Drop Designer</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  placeholder="Template name"
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                  className="field"
                />
                <input
                  placeholder="Subject"
                  value={templateSubject}
                  onChange={(event) => setTemplateSubject(event.target.value)}
                  className="field"
                />
                <input
                  placeholder="Description"
                  value={templateDescription}
                  onChange={(event) => setTemplateDescription(event.target.value)}
                  className="field md:col-span-2"
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <label className="secondary-btn inline-flex cursor-pointer items-center gap-2">
                  Upload image
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => onUploadAsset(event.target.files?.[0] || null)}
                  />
                </label>
                <input
                  placeholder="Image URL"
                  value={assetImageUrl}
                  onChange={(event) => setAssetImageUrl(event.target.value)}
                  className="field min-w-[240px] flex-1"
                />
                <button type="button" onClick={onAddAssetByUrl} className="secondary-btn">
                  Add image URL
                </button>
                <button
                  type="button"
                  onClick={onOpenCopyTemplateModal}
                  className="secondary-btn"
                  disabled={!templateName.trim()}
                >
                  Copy template
                </button>
                <button
                  type="button"
                  onClick={onDeleteTemplate}
                  className="secondary-btn"
                  disabled={!selectedTemplate}
                >
                  Delete template
                </button>
                <button type="button" onClick={onSaveTemplate} className="primary-btn">
                  Save template
                </button>
              </div>

              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <p className="mb-2 text-sm font-medium text-slate-700">Insert Dynamic Variable</p>
                <p className="mb-2 text-xs text-slate-500">
                  Add placeholder variables like <code className="rounded bg-slate-200 px-1">{"{{outage_details}}"}</code> that can be filled in when creating a campaign. <code className="rounded bg-slate-200 px-1">{"{{name}}"}</code> is auto-filled with each contact&apos;s name.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => insertVariableIntoEditor("name")} className="chip-btn text-xs">
                    {"{{name}}"}
                  </button>
                  <span className="text-xs text-slate-400">|</span>
                  <input
                    placeholder="Custom variable name"
                    value={customVariableName}
                    onChange={(event) => setCustomVariableName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        onInsertCustomVariable();
                      }
                    }}
                    className="field min-w-[180px] flex-1 !py-1.5 text-sm"
                  />
                  <button type="button" onClick={onInsertCustomVariable} className="secondary-btn text-xs" disabled={!customVariableName.trim()}>
                    Insert variable
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <EmailBuilder
                  initialHtml={templateHtml}
                  initialDesignJson={templateDesignJson}
                  onReady={(editor) => setBuilderEditor(editor)}
                  onChange={(html, designJson) => {
                    setTemplateHtml(html);
                    setTemplateDesignJson(designJson);
                  }}
                />
              </div>
            </section>
          </div>
        )}

        {activeTab === "Campaigns" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="glass-panel fade-up rounded-2xl p-5 md:p-6">
              <h2 className="panel-title mb-3 text-lg">Create Campaign</h2>
              <form onSubmit={onCreateCampaign} className="space-y-3">
                <input
                  required
                  placeholder="Campaign name"
                  value={campaignName}
                  onChange={(event) => setCampaignName(event.target.value)}
                  className="field"
                />

                <select
                  required
                  value={campaignGroupId}
                  onChange={(event) => setCampaignGroupId(event.target.value)}
                  className="field-select"
                >
                  <option value="">Select target group</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name} ({group._count?.memberships || 0})
                    </option>
                  ))}
                </select>

                <select
                  value={campaignTemplateId}
                  onChange={(event) => onCampaignTemplateChange(event.target.value)}
                  className="field-select"
                >
                  <option value="">Select template</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>

                <select
                  value={campaignSendMode}
                  onChange={(event) => setCampaignSendMode(event.target.value as "now" | "scheduled" | "staggered")}
                  className="field-select"
                >
                  <option value="now">Send now</option>
                  <option value="scheduled">Send on specific date/time</option>
                  <option value="staggered">Stagger send over date range</option>
                </select>

                {campaignSendMode === "scheduled" && (
                  <div className="space-y-2">
                    <input
                      required
                      type="datetime-local"
                      value={campaignScheduledFor}
                      onChange={(event) => setCampaignScheduledFor(event.target.value)}
                      className="field"
                    />
                    <p className="text-xs subtle-text">Timezone: {defaultTimezone}</p>
                  </div>
                )}

                {campaignSendMode === "staggered" && (
                  <div className="space-y-2">
                    <div className="grid gap-3 md:grid-cols-2">
                      <input
                        required
                        type="datetime-local"
                        value={campaignStaggerStart}
                        onChange={(event) => setCampaignStaggerStart(event.target.value)}
                        className="field"
                      />
                      <input
                        required
                        type="datetime-local"
                        value={campaignStaggerEnd}
                        onChange={(event) => setCampaignStaggerEnd(event.target.value)}
                        className="field"
                      />
                    </div>
                    <p className="text-xs subtle-text">Timezone: {defaultTimezone}</p>
                  </div>
                )}

                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={campaignSendFailureReport}
                    onChange={(event) => setCampaignSendFailureReport(event.target.checked)}
                  />
                  Email me a report of failed deliveries
                </label>

                {campaignSendFailureReport && (
                  <input
                    required
                    type="email"
                    placeholder="Report email address"
                    value={campaignFailureReportEmail}
                    onChange={(event) => setCampaignFailureReportEmail(event.target.value)}
                    className="field"
                  />
                )}

                <input
                  required
                  placeholder="Subject"
                  value={campaignSubject}
                  onChange={(event) => setCampaignSubject(event.target.value)}
                  className="field"
                />

                {Object.keys(campaignVariables).length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                    <p className="mb-2 text-sm font-semibold text-amber-800">Template Variables</p>
                    <p className="mb-3 text-xs text-amber-700">
                      This template contains dynamic fields. Fill in the values below — they will be inserted into the email content for this campaign.
                    </p>
                    <div className="grid gap-2">
                      {Object.entries(campaignVariables).map(([key, value]) => (
                        <label key={key} className="grid gap-1 text-sm text-slate-700">
                          <span className="font-medium text-amber-900">{`{{${key}}}`}</span>
                          <input
                            placeholder={`Enter value for ${key}`}
                            value={value}
                            onChange={(event) =>
                              setCampaignVariables((prev) => ({ ...prev, [key]: event.target.value }))
                            }
                            className="field"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <textarea
                  required
                  rows={7}
                  placeholder="Campaign HTML"
                  value={campaignHtml}
                  onChange={(event) => setCampaignHtml(event.target.value)}
                  className="field-textarea"
                />

                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  <p className="mb-2 text-sm font-medium">Attachments (file or URL)</p>
                  <div className="flex flex-wrap gap-2">
                    <label className="secondary-btn inline-flex cursor-pointer items-center">
                      Upload attachment
                      <input
                        type="file"
                        className="hidden"
                        onChange={(event) => onAddCampaignAttachmentFile(event.target.files?.[0] || null)}
                      />
                    </label>
                    <input
                      placeholder="Attachment URL"
                      value={campaignAttachmentUrl}
                      onChange={(event) => setCampaignAttachmentUrl(event.target.value)}
                      className="field min-w-[220px] flex-1"
                    />
                    <button type="button" onClick={onAddCampaignAttachmentUrl} className="secondary-btn">
                      Add URL
                    </button>
                  </div>

                  {attachments.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-slate-600">
                      {attachments.map((item) => (
                        <li key={item.id}>
                          {item.name} ({item.type})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <button type="submit" className="primary-btn">
                  {campaignSendMode === "scheduled" || campaignSendMode === "staggered"
                    ? "Schedule campaign"
                    : "Create and send campaign"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsCampaignPreviewOpen(true)}
                  className="secondary-btn"
                  disabled={!campaignHtml.trim()}
                >
                  Preview email
                </button>
              </form>
            </section>

            <section className="glass-panel fade-up rounded-2xl p-5 md:p-6">
              <h2 className="panel-title mb-3 text-lg">Campaign History</h2>
              <div className="space-y-3">
                {campaigns.map((campaign) => (
                  <div key={campaign.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{campaign.name}</p>
                        <p className="text-xs text-slate-500">
                          {campaign.subject} • Group: {campaign.group?.name || "None"}
                        </p>
                        <p className="text-xs text-slate-500">
                          Status: {campaign.status} • Recipients: {campaign.recipients.length}
                        </p>
                        <p className="text-xs text-slate-500">
                          Mode: {campaign.sendMode === "scheduled" ? "Scheduled" : campaign.sendMode === "staggered" ? "Staggered" : "Send now"}
                          {campaign.sendMode === "scheduled" && campaign.scheduledFor
                            ? ` • Runs at ${formatInTimeZone(campaign.scheduledFor, defaultTimezone)} (${defaultTimezone})`
                            : ""}
                          {campaign.sendMode === "staggered" && campaign.staggerMinutes
                            ? ` • Runs ${campaign.scheduledFor ? `from ${formatInTimeZone(campaign.scheduledFor, defaultTimezone)} to ${formatInTimeZone(new Date(new Date(campaign.scheduledFor).getTime() + campaign.staggerMinutes * 60_000).toISOString(), defaultTimezone)} (${defaultTimezone})` : `for ${campaign.staggerMinutes} min`}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenCampaignDetails(campaign.id)}
                          className="secondary-btn"
                        >
                          View details
                        </button>
                        <button
                          type="button"
                          onClick={() => onCampaignSendAction(campaign)}
                          className="primary-btn"
                        >
                          {campaign.status === "sent" || campaign.sentAt ? "Resend campaign" : "Send now"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {selectedCampaignDetails && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
            onClick={onCloseCampaignDetails}
          >
            <div
              className="glass-panel w-full max-w-4xl rounded-2xl p-5 md:p-6"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="panel-title text-lg">Campaign details</h3>
                  <p className="mt-1 text-sm subtle-text">
                    {selectedCampaignDetails.name} • Status: {selectedCampaignDetails.status}
                  </p>
                </div>
                <button type="button" onClick={onCloseCampaignDetails} className="secondary-btn">
                  Close
                </button>
              </div>

              <p className="mt-3 text-sm subtle-text">
                Group: {selectedCampaignDetails.group?.name || "None"} • Recipients: {selectedCampaignDetails.recipients.length}
              </p>

              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                <p className="mb-2 text-sm font-medium text-slate-800">Email preview</p>
                <div className="h-[420px] overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  <iframe
                    title={`Campaign preview - ${selectedCampaignDetails.name}`}
                    srcDoc={selectedCampaignDetails.html}
                    className="h-full w-full bg-white"
                    sandbox="allow-same-origin"
                  />
                </div>
              </div>

              <div className="table-shell mt-4 max-h-[420px]">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-700">
                    <tr>
                      <th className="px-2 py-1">Recipient</th>
                      <th className="px-2 py-1">Delivery status</th>
                      <th className="px-2 py-1">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCampaignDetails.recipients.map((recipient) => (
                      <tr key={recipient.id} className="border-t border-slate-100">
                        <td className="px-2 py-1">{recipient.email}</td>
                        <td className="px-2 py-1">{recipient.status}</td>
                        <td className="px-2 py-1 text-rose-700">{recipient.error || "—"}</td>
                      </tr>
                    ))}
                    {selectedCampaignDetails.recipients.length === 0 && (
                      <tr>
                        <td className="px-2 py-2 text-slate-500" colSpan={3}>
                          No send details yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {isCampaignPreviewOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
            onClick={() => setIsCampaignPreviewOpen(false)}
          >
            <div
              className="glass-panel w-full max-w-4xl rounded-2xl p-5 md:p-6"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="panel-title text-lg">Campaign preview</h3>
                  <p className="mt-1 text-sm subtle-text">Preview of the email content before saving or sending.</p>
                </div>
                <button type="button" onClick={() => setIsCampaignPreviewOpen(false)} className="secondary-btn">
                  Close
                </button>
              </div>

              <div className="mt-4 h-[520px] overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                <iframe
                  title="Campaign create preview"
                  srcDoc={campaignHtml}
                  className="h-full w-full bg-white"
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          </div>
        )}

        {resendConfirmCampaign && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
            onClick={onCloseResendConfirm}
          >
            <div
              className="glass-panel w-full max-w-lg rounded-2xl p-5 md:p-6"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="panel-title text-lg">Confirm resend</h3>
              <p className="mt-2 text-sm subtle-text">
                This will resend <span className="font-semibold text-slate-800">{resendConfirmCampaign.name}</span> to everyone in the selected campaign group.
              </p>
              <p className="mt-2 text-sm text-rose-700">
                Please confirm you want to continue to prevent an accidental resend.
              </p>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button type="button" onClick={onCloseResendConfirm} className="secondary-btn">
                  Cancel
                </button>
                <button type="button" onClick={onConfirmResend} className="primary-btn">
                  Confirm resend
                </button>
              </div>
            </div>
          </div>
        )}

        {groupDeleteTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
            onClick={onCloseDeleteGroupModal}
          >
            <div
              className="glass-panel w-full max-w-xl rounded-2xl p-5 md:p-6"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="panel-title text-lg">Delete group</h3>
              <p className="mt-2 text-sm subtle-text">
                Choose how to delete <span className="font-semibold text-slate-800">{groupDeleteTarget.name}</span>.
              </p>

              <div className="mt-4 space-y-2">
                <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm">
                  <input
                    type="radio"
                    name="group-delete-mode"
                    value="move-to-default"
                    checked={groupDeleteMode === "move-to-default"}
                    onChange={() => setGroupDeleteMode("move-to-default")}
                  />
                  <span>Delete only the group and move members to the default group.</span>
                </label>

                <label className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                  <input
                    type="radio"
                    name="group-delete-mode"
                    value="delete-members"
                    checked={groupDeleteMode === "delete-members"}
                    onChange={() => setGroupDeleteMode("delete-members")}
                  />
                  <span>Delete the group and all contacts that are members of this group.</span>
                </label>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button type="button" onClick={onCloseDeleteGroupModal} className="secondary-btn">
                  Cancel
                </button>
                <button type="button" onClick={onConfirmDeleteGroup} className="primary-btn">
                  Confirm delete
                </button>
              </div>
            </div>
          </div>
        )}

        {editingGroupId && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
            onClick={onCancelGroupEdit}
          >
            <div
              className="glass-panel w-full max-w-md rounded-2xl p-5 md:p-6"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="panel-title text-lg">Edit group</h3>
              <p className="mt-2 text-sm subtle-text">Update group details.</p>

              <form onSubmit={onSaveGroupEdits} className="mt-4 space-y-3">
                <input
                  required
                  value={editGroupName}
                  onChange={(event) => setEditGroupName(event.target.value)}
                  placeholder="Group name"
                  className="field"
                />
                <input
                  value={editGroupDescription}
                  onChange={(event) => setEditGroupDescription(event.target.value)}
                  placeholder="Description"
                  className="field"
                />

                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={onCancelGroupEdit} className="secondary-btn">
                    Cancel
                  </button>
                  <button type="submit" className="primary-btn">
                    Save changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {importStatusOpen && (
          <div className="fixed bottom-4 right-4 z-50 w-full max-w-sm px-4">
            <div
              className={`rounded-2xl border p-4 shadow-sm ${
                importStatusTone === "success"
                  ? "border-emerald-200 bg-emerald-50"
                  : importStatusTone === "error"
                    ? "border-rose-200 bg-rose-50"
                    : "glass-panel"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="panel-title text-sm">
                    {isImportingContacts
                      ? "Import in progress"
                      : importStatusTone === "success"
                        ? "Import complete"
                        : "Import issue"}
                  </h3>
                  <p
                    className={`mt-1 text-xs ${
                      importStatusTone === "error" ? "text-rose-700" : "subtle-text"
                    }`}
                  >
                    {importStatusMessage}
                  </p>
                </div>
                {!isImportingContacts && (
                  <button type="button" onClick={onCloseImportStatusPopup} className="secondary-btn">
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {editingContact && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onCloseEditContact}>
            <div className="glass-panel w-full max-w-md rounded-2xl p-5 md:p-6" onClick={(event) => event.stopPropagation()}>
              <h3 className="panel-title text-lg">Edit contact</h3>
              <p className="mt-2 text-sm subtle-text">Update contact details if anything was mistyped.</p>

              <form onSubmit={onSaveContactEdits} className="mt-4 space-y-3">
                <input
                  required
                  type="email"
                  value={editContactEmail}
                  onChange={(event) => setEditContactEmail(event.target.value)}
                  placeholder="Email"
                  className="field"
                />
                <input
                  value={editContactName}
                  onChange={(event) => setEditContactName(event.target.value)}
                  placeholder="Name"
                  className="field"
                />
                <input
                  value={editContactCompany}
                  onChange={(event) => setEditContactCompany(event.target.value)}
                  placeholder="Company"
                  className="field"
                />

                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={onCloseEditContact} className="secondary-btn">
                    Cancel
                  </button>
                  <button type="submit" className="primary-btn">
                    Save changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {isCopyTemplateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="glass-panel w-full max-w-md rounded-2xl p-5 md:p-6">
              <h3 className="panel-title text-lg">Copy template</h3>
              <p className="mt-2 text-sm subtle-text">Enter a name for the copied template.</p>

              <form onSubmit={onConfirmCopyTemplate} className="mt-4 space-y-3">
                <input
                  autoFocus
                  value={copyTemplateName}
                  onChange={(event) => setCopyTemplateName(event.target.value)}
                  placeholder="Copied template name"
                  className="field"
                />

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCopyTemplateModalOpen(false);
                      setCopyTemplateName("");
                    }}
                    className="secondary-btn"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="primary-btn" disabled={!copyTemplateName.trim()}>
                    Create copy
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {isNewTemplateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="glass-panel w-full max-w-md rounded-2xl p-5 md:p-6">
              <h3 className="panel-title text-lg">Create template</h3>
              <p className="mt-2 text-sm subtle-text">Enter a name for the new blank template.</p>

              <form onSubmit={onConfirmCreateTemplate} className="mt-4 space-y-3">
                <input
                  autoFocus
                  value={newTemplateName}
                  onChange={(event) => setNewTemplateName(event.target.value)}
                  placeholder="Template name"
                  className="field"
                />

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewTemplateModalOpen(false);
                      setNewTemplateName("");
                    }}
                    className="secondary-btn"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="primary-btn" disabled={!newTemplateName.trim()}>
                    Create template
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Toast notifications */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="animate-toast-in rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-lg"
            style={{
              background: toast.tone === "success" ? "#16a34a" : "#dc2626",
            }}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
