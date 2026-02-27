"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Editor } from "grapesjs";
import { signOut } from "next-auth/react";
import EmailBuilder from "@/components/EmailBuilder";

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

const tabs = ["Contacts", "Groups", "Templates", "Campaigns"] as const;

async function readApiJson<T>(response: Response, endpoint: string): Promise<T> {
  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`${endpoint} failed (${response.status}): ${raw.slice(0, 180) || "Empty response"}`);
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

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateHtml, setTemplateHtml] = useState("<section><h1>Build your campaign</h1><p>Drag and drop blocks here.</p></section>");
  const [templateDesignJson, setTemplateDesignJson] = useState("");
  const [isCopyTemplateModalOpen, setIsCopyTemplateModalOpen] = useState(false);
  const [copyTemplateName, setCopyTemplateName] = useState("");
  const [builderEditor, setBuilderEditor] = useState<Editor | null>(null);

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
  const [campaignStaggerMinutes, setCampaignStaggerMinutes] = useState("60");
  const [campaignSendFailureReport, setCampaignSendFailureReport] = useState(false);
  const [campaignFailureReportEmail, setCampaignFailureReportEmail] = useState("");
  const [isCampaignPreviewOpen, setIsCampaignPreviewOpen] = useState(false);
  const [campaignSubject, setCampaignSubject] = useState("");
  const [campaignHtml, setCampaignHtml] = useState("");
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

  const refreshAll = useCallback(async () => {
    await fetch("/api/campaigns/process-due", {
      method: "POST",
    }).catch(() => null);

    const [templateRes, groupRes, contactRes, campaignRes] = await Promise.all([
      fetch("/api/templates"),
      fetch("/api/groups"),
      fetch("/api/contacts"),
      fetch("/api/campaigns"),
    ]);

    const [templateData, groupData, contactData, campaignData] = await Promise.all([
      readApiJson<Template[]>(templateRes, "/api/templates"),
      readApiJson<Group[]>(groupRes, "/api/groups"),
      readApiJson<Contact[]>(contactRes, "/api/contacts"),
      readApiJson<Campaign[]>(campaignRes, "/api/campaigns"),
    ]);

    setTemplates(templateData);
    setGroups(groupData);
    setContacts(contactData);
    setCampaigns(campaignData);

    const selectedStillExists = templateData.some((item) => item.id === selectedTemplateId);

    if (templateData.length === 0) {
      setSelectedTemplateId("");
      setTemplateName("");
      setTemplateDescription("");
      setTemplateSubject("");
      setTemplateHtml("<section><h1>Build your campaign</h1><p>Drag and drop blocks here.</p></section>");
      setTemplateDesignJson("");
    } else if (!selectedTemplateId || !selectedStillExists) {
      loadTemplate(templateData[0]);
    }

    setStatus("Ready");
  }, [loadTemplate, selectedTemplateId]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      refreshAll().catch((error) => {
        setStatus(`Load error: ${error instanceof Error ? error.message : "Unknown"}`);
      });
    }, 0);

    return () => {
      window.clearTimeout(loadTimer);
    };
  }, [refreshAll]);

  useEffect(() => {
    fetch("/api/me")
      .then((response) => response.json())
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
    const payload = {
      name: templateName,
      description: templateDescription,
      subject: templateSubject,
      html: templateHtml,
      designJson: templateDesignJson,
    };

    if (selectedTemplate) {
      await fetch(`/api/templates/${selectedTemplate.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setStatus("Template updated");
    } else {
      await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
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
      const minutes = Number.parseInt(campaignStaggerMinutes, 10);
      if (Number.isNaN(minutes) || minutes < 1) {
        setStatus("Stagger duration must be at least 1 minute");
        return;
      }
    }

    if (campaignSendFailureReport && !campaignFailureReportEmail.trim()) {
      setStatus("Enter a report email address");
      return;
    }

    const response = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: campaignName,
        groupId: campaignGroupId,
        templateId: campaignTemplateId || null,
        subject: campaignSubject,
        html: campaignHtml,
        sendMode: campaignSendMode,
        scheduledFor: campaignSendMode === "scheduled" ? new Date(campaignScheduledFor).toISOString() : null,
        staggerMinutes: campaignSendMode === "staggered" ? Number.parseInt(campaignStaggerMinutes, 10) : null,
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
    setCampaignStaggerMinutes("60");
    setCampaignSendFailureReport(false);
    setCampaignFailureReportEmail("");
    setCampaignSubject("");
    setCampaignHtml("");
    setAttachments([]);

    if (campaignSendMode === "scheduled") {
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
                  className="field"
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
                  <option value="staggered">Stagger send over a period</option>
                </select>

                {campaignSendMode === "scheduled" && (
                  <input
                    required
                    type="datetime-local"
                    value={campaignScheduledFor}
                    onChange={(event) => setCampaignScheduledFor(event.target.value)}
                    className="field"
                  />
                )}

                {campaignSendMode === "staggered" && (
                  <input
                    required
                    type="number"
                    min={1}
                    placeholder="Total stagger duration in minutes"
                    value={campaignStaggerMinutes}
                    onChange={(event) => setCampaignStaggerMinutes(event.target.value)}
                    className="field"
                  />
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
                  {campaignSendMode === "scheduled" ? "Schedule campaign" : "Create and send campaign"}
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
                            ? ` • Runs at ${new Date(campaign.scheduledFor).toLocaleString()}`
                            : ""}
                          {campaign.sendMode === "staggered" && campaign.staggerMinutes
                            ? ` • Duration: ${campaign.staggerMinutes} min`
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
      </div>
    </div>
  );
}
