"use client";

import { useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";

type AppRole = "admin" | "manager" | "viewer";

type AppUser = {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  role: AppRole;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type AdminSettings = {
  defaultTimezone: string;
};

type TimeZoneOption = {
  value: string;
  label: string;
  offsetMinutes: number;
};

type AuditLogItem = {
  id: string;
  actorUserId: string | null;
  actorUsername: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type AuditLogsResponse = {
  items: AuditLogItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

function normalizeText(value: string) {
  return value.trim();
}

function normalizeOffsetLabel(raw: string) {
  const normalized = raw.replace("GMT", "").replace("UTC", "").trim();
  if (!normalized) {
    return "+00:00";
  }

  const match = normalized.match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) {
    return normalized;
  }

  const sign = match[1];
  const hours = match[2].padStart(2, "0");
  const minutes = (match[3] || "00").padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

function getTimezoneOffsetLabel(timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
      hour: "2-digit",
    }).formatToParts(new Date());

    const zonePart = parts.find((part) => part.type === "timeZoneName")?.value || "UTC";
    return normalizeOffsetLabel(zonePart);
  } catch {
    return "+00:00";
  }
}

function offsetLabelToMinutes(offsetLabel: string) {
  const match = offsetLabel.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) {
    return 0;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number.parseInt(match[2], 10);
  const minutes = Number.parseInt(match[3], 10);
  return sign * (hours * 60 + minutes);
}

function listSupportedTimeZones(): string[] {
  const intlWithSupportedValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };

  if (typeof intlWithSupportedValues.supportedValuesOf === "function") {
    return intlWithSupportedValues.supportedValuesOf("timeZone");
  }

  return ["UTC"];
}

export default function AdminUsersManager() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [status, setStatus] = useState("Loading users...");
  const [defaultTimezone, setDefaultTimezone] = useState("UTC");
  const [defaultTimezoneDraft, setDefaultTimezoneDraft] = useState("UTC");
  const [isTimezoneMenuOpen, setIsTimezoneMenuOpen] = useState(false);

  const [newUsername, setNewUsername] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("viewer");
  const [newEnabled, setNewEnabled] = useState(true);
  const [newPassword, setNewPassword] = useState("");

  const [auditActionFilter, setAuditActionFilter] = useState("");
  const [auditActorFilter, setAuditActorFilter] = useState("");
  const [auditFromFilter, setAuditFromFilter] = useState("");
  const [auditToFilter, setAuditToFilter] = useState("");
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(25);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditTotalPages, setAuditTotalPages] = useState(1);

  const [editMap, setEditMap] = useState<Record<string, { displayName: string; email: string; role: AppRole; enabled: boolean; password: string }>>({});

  const timezoneOptions = useMemo<TimeZoneOption[]>(() => {
    const options = listSupportedTimeZones().map((timeZone) => {
      const offsetLabel = getTimezoneOffsetLabel(timeZone);
      return {
        value: timeZone,
        label: `${offsetLabel} ${timeZone}`,
        offsetMinutes: offsetLabelToMinutes(offsetLabel),
      };
    });

    return options.sort((a, b) => {
      if (a.offsetMinutes !== b.offsetMinutes) {
        return a.offsetMinutes - b.offsetMinutes;
      }

      return a.value.localeCompare(b.value);
    });
  }, []);

  const filteredTimezoneOptions = useMemo(() => {
    const query = defaultTimezoneDraft.trim().toLowerCase();
    const base =
      query.length === 0
        ? timezoneOptions
        : timezoneOptions.filter(
            (option) => option.value.toLowerCase().includes(query) || option.label.toLowerCase().includes(query),
          );

    return base.slice(0, 120);
  }, [defaultTimezoneDraft, timezoneOptions]);

  async function refreshUsers() {
    const response = await fetch("/api/admin/users");
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(raw || `Failed (${response.status})`);
    }

    const data = JSON.parse(raw) as AppUser[];
    setUsers(data);
    setEditMap(
      Object.fromEntries(
        data.map((user) => [
          user.id,
          {
            displayName: user.displayName || "",
            email: user.email || "",
            role: user.role,
            enabled: user.enabled,
            password: "",
          },
        ]),
      ),
    );
  }

  async function refreshSettings() {
    const response = await fetch("/api/admin/settings");
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(raw || `Failed (${response.status})`);
    }

    const data = JSON.parse(raw) as AdminSettings;
    setDefaultTimezone(data.defaultTimezone);
    setDefaultTimezoneDraft(data.defaultTimezone);
  }

  async function refreshAuditLogs(options?: {
    page?: number;
    action?: string;
    actor?: string;
    from?: string;
    to?: string;
  }) {
    const targetPage = options?.page || auditPage;
    const targetAction = options?.action ?? auditActionFilter;
    const targetActor = options?.actor ?? auditActorFilter;
    const targetFrom = options?.from ?? auditFromFilter;
    const targetTo = options?.to ?? auditToFilter;

    const params = new URLSearchParams();
    params.set("limit", String(auditPageSize));
    params.set("page", String(targetPage));
    if (targetAction.trim()) {
      params.set("action", targetAction.trim());
    }
    if (targetActor.trim()) {
      params.set("actor", targetActor.trim());
    }
    if (targetFrom) {
      params.set("from", new Date(targetFrom).toISOString());
    }
    if (targetTo) {
      params.set("to", new Date(targetTo).toISOString());
    }

    const response = await fetch(`/api/admin/audit-logs?${params.toString()}`, { cache: "no-store" });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(raw || `Failed (${response.status})`);
    }

    const data = JSON.parse(raw) as AuditLogsResponse;
    setAuditLogs(data.items || []);
    setAuditPage(data.page || targetPage);
    setAuditPageSize(data.pageSize || auditPageSize);
    setAuditTotal(data.total || 0);
    setAuditTotalPages(data.totalPages || 1);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const loadInitialAuditLogs = async () => {
        const response = await fetch("/api/admin/audit-logs?limit=25&page=1", { cache: "no-store" });
        const raw = await response.text();
        if (!response.ok) {
          throw new Error(raw || `Failed (${response.status})`);
        }

        const data = JSON.parse(raw) as AuditLogsResponse;
        setAuditLogs(data.items || []);
        setAuditPage(data.page || 1);
        setAuditPageSize(data.pageSize || 25);
        setAuditTotal(data.total || 0);
        setAuditTotalPages(data.totalPages || 1);
      };

      Promise.all([refreshUsers(), refreshSettings(), loadInitialAuditLogs()])
        .then(() => setStatus("Ready"))
        .catch((error) => setStatus(`Load failed: ${error instanceof Error ? error.message : "Unknown"}`));
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  async function onSaveSettings(event: React.FormEvent) {
    event.preventDefault();

    const normalizedTimezone = normalizeText(defaultTimezoneDraft);
    const isKnownTimezone = timezoneOptions.some((option) => option.value === normalizedTimezone);
    if (!isKnownTimezone) {
      setStatus("Settings update failed: Choose a timezone from the list");
      return;
    }

    const response = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultTimezone: normalizedTimezone }),
    });

    if (!response.ok) {
      setStatus(`Settings update failed: ${await response.text()}`);
      return;
    }

    await refreshSettings();
    setStatus("Settings updated");
  }

  function resetAuditFilters() {
    setAuditActionFilter("");
    setAuditActorFilter("");
    setAuditFromFilter("");
    setAuditToFilter("");
    setAuditPage(1);
  }

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.username.localeCompare(b.username)),
    [users],
  );

  async function onCreateUser(event: React.FormEvent) {
    event.preventDefault();

    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: normalizeText(newUsername).toLowerCase(),
        displayName: normalizeText(newDisplayName),
        email: normalizeText(newEmail).toLowerCase(),
        role: newRole,
        enabled: newEnabled,
        password: normalizeText(newPassword),
      }),
    });

    if (!response.ok) {
      setStatus(`Create failed: ${await response.text()}`);
      return;
    }

    setNewUsername("");
    setNewDisplayName("");
    setNewEmail("");
    setNewRole("viewer");
    setNewEnabled(true);
    setNewPassword("");
    await Promise.all([refreshUsers(), refreshAuditLogs()]);
    setStatus("User created");
  }

  async function onSaveUser(userId: string) {
    const draft = editMap[userId];
    if (!draft) {
      return;
    }

    const response = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: normalizeText(draft.displayName),
        email: normalizeText(draft.email).toLowerCase(),
        role: draft.role,
        enabled: draft.enabled,
        password: normalizeText(draft.password),
      }),
    });

    if (!response.ok) {
      setStatus(`Update failed: ${await response.text()}`);
      return;
    }

    await Promise.all([refreshUsers(), refreshAuditLogs()]);
    setStatus("User updated");
  }

  return (
    <main className="shell-bg min-h-screen px-5 py-6 md:px-8 md:py-8 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="glass-panel rounded-2xl p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="panel-title text-2xl">Access Administration</h1>
            <button type="button" className="secondary-btn px-3 py-2 text-xs" onClick={() => signOut({ callbackUrl: "/signin" })}>
              Logout
            </button>
          </div>
          <p className="mt-2 text-sm subtle-text">
            Manage allowed users and roles. Entra sign-in is allowed only when the incoming username matches a configured account.
          </p>
          <p className="mt-2 text-xs subtle-text">Status: {status}</p>
        </section>

        <section className="glass-panel rounded-2xl p-5 md:p-6">
          <h2 className="panel-title text-lg">Add User</h2>
          <form onSubmit={onCreateUser} className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <input className="field" placeholder="Username (usually Entra UPN/email)" value={newUsername} onChange={(event) => setNewUsername(event.target.value)} required />
            <input className="field" placeholder="Display name" value={newDisplayName} onChange={(event) => setNewDisplayName(event.target.value)} />
            <input className="field" placeholder="Email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />
            <select className="field-select" value={newRole} onChange={(event) => setNewRole(event.target.value as AppRole)}>
              <option value="viewer">viewer</option>
              <option value="manager">manager</option>
              <option value="admin">admin</option>
            </select>
            <input className="field" placeholder="Optional local password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" />
            <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <input type="checkbox" checked={newEnabled} onChange={(event) => setNewEnabled(event.target.checked)} />
              Enabled
            </label>
            <button type="submit" className="primary-btn md:col-span-2">Create user</button>
          </form>
        </section>

        <section className="glass-panel relative z-20 overflow-visible rounded-2xl p-5 md:p-6">
          <h2 className="panel-title text-lg">Campaign Scheduling Settings</h2>
          <p className="mt-2 text-sm subtle-text">
            Default timezone controls how scheduled and staggered campaign date/time values are interpreted and displayed.
          </p>
          <form onSubmit={onSaveSettings} className="mt-3">
            <label className="mb-1 block text-xs subtle-text">IANA timezone</label>
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="relative min-w-0 flex-1">
                <input
                  className="field"
                  placeholder="Type to search (e.g. Pacific/Auckland)"
                  value={defaultTimezoneDraft}
                  onFocus={() => setIsTimezoneMenuOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => setIsTimezoneMenuOpen(false), 120);
                  }}
                  onChange={(event) => {
                    setDefaultTimezoneDraft(event.target.value);
                    setIsTimezoneMenuOpen(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setIsTimezoneMenuOpen(false);
                    }
                  }}
                  required
                />

                {isTimezoneMenuOpen ? (
                  <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                    {filteredTimezoneOptions.length > 0 ? (
                      filteredTimezoneOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            setDefaultTimezoneDraft(option.value);
                            setIsTimezoneMenuOpen(false);
                          }}
                        >
                          {option.label}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-slate-500">No matching timezones</div>
                    )}
                  </div>
                ) : null}
              </div>
              <button type="submit" className="primary-btn md:shrink-0">Save timezone</button>
            </div>
            <p className="mt-1 text-xs subtle-text">Current: {defaultTimezone}</p>
          </form>
        </section>

        <section className="glass-panel rounded-2xl p-5 md:p-6">
          <h2 className="panel-title text-lg">Existing Users</h2>
          <div className="table-shell mt-3 max-h-[520px]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-3 py-2">Username</th>
                  <th className="px-3 py-2">Display name</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Enabled</th>
                  <th className="px-3 py-2">Set local password</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map((user) => {
                  const draft = editMap[user.id];
                  if (!draft) {
                    return null;
                  }

                  return (
                    <tr key={user.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium">{user.username}</td>
                      <td className="px-3 py-2">
                        <input className="field" value={draft.displayName} onChange={(event) => setEditMap((old) => ({ ...old, [user.id]: { ...old[user.id], displayName: event.target.value } }))} />
                      </td>
                      <td className="px-3 py-2">
                        <input className="field" value={draft.email} onChange={(event) => setEditMap((old) => ({ ...old, [user.id]: { ...old[user.id], email: event.target.value } }))} />
                      </td>
                      <td className="px-3 py-2">
                        <select className="field-select" value={draft.role} onChange={(event) => setEditMap((old) => ({ ...old, [user.id]: { ...old[user.id], role: event.target.value as AppRole } }))}>
                          <option value="viewer">viewer</option>
                          <option value="manager">manager</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={draft.enabled} onChange={(event) => setEditMap((old) => ({ ...old, [user.id]: { ...old[user.id], enabled: event.target.checked } }))} />
                      </td>
                      <td className="px-3 py-2">
                        <input className="field" type="password" placeholder="Leave blank to keep" value={draft.password} onChange={(event) => setEditMap((old) => ({ ...old, [user.id]: { ...old[user.id], password: event.target.value } }))} />
                      </td>
                      <td className="px-3 py-2">
                        <button className="primary-btn" type="button" onClick={() => onSaveUser(user.id)}>
                          Save
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="glass-panel rounded-2xl p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="panel-title text-lg">Security Audit Trail</h2>
            <button
              type="button"
              className="secondary-btn px-3 py-2 text-xs"
              onClick={() => {
                refreshAuditLogs({ page: auditPage })
                  .then(() => setStatus("Audit trail refreshed"))
                  .catch((error) => setStatus(`Audit log refresh failed: ${error instanceof Error ? error.message : "Unknown"}`));
              }}
            >
              Refresh
            </button>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              className="field"
              placeholder="Action (e.g. admin_user_update)"
              value={auditActionFilter}
              onChange={(event) => setAuditActionFilter(event.target.value)}
            />
            <input
              className="field"
              placeholder="Actor username contains..."
              value={auditActorFilter}
              onChange={(event) => setAuditActorFilter(event.target.value)}
            />
            <div>
              <label className="mb-1 block text-xs subtle-text">From (UTC)</label>
              <input
                className="field"
                type="datetime-local"
                value={auditFromFilter}
                onChange={(event) => setAuditFromFilter(event.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs subtle-text">To (UTC)</label>
              <input
                className="field"
                type="datetime-local"
                value={auditToFilter}
                onChange={(event) => setAuditToFilter(event.target.value)}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="primary-btn px-3 py-2 text-xs"
              onClick={() => {
                setAuditPage(1);
                refreshAuditLogs({ page: 1 })
                  .then(() => setStatus("Audit filters applied"))
                  .catch((error) => setStatus(`Audit filter failed: ${error instanceof Error ? error.message : "Unknown"}`));
              }}
            >
              Apply Filters
            </button>
            <button
              type="button"
              className="secondary-btn px-3 py-2 text-xs"
              onClick={() => {
                resetAuditFilters();
                refreshAuditLogs({ page: 1, action: "", actor: "", from: "", to: "" })
                  .then(() => setStatus("Audit filters cleared"))
                  .catch((error) => setStatus(`Audit filter reset failed: ${error instanceof Error ? error.message : "Unknown"}`));
              }}
            >
              Clear Filters
            </button>
            <span className="text-xs subtle-text">Showing {auditLogs.length} of {auditTotal}</span>
          </div>

          <div className="table-shell mt-3 max-h-[380px]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Actor</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Target</th>
                  <th className="px-3 py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 ? (
                  <tr className="border-t border-slate-100">
                    <td className="px-3 py-3 text-slate-500" colSpan={5}>No audit entries yet.</td>
                  </tr>
                ) : (
                  auditLogs.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2 whitespace-nowrap">{new Date(item.createdAt).toLocaleString()}</td>
                      <td className="px-3 py-2">{item.actorUsername || "Unknown"}</td>
                      <td className="px-3 py-2 font-medium">{item.action}</td>
                      <td className="px-3 py-2">{[item.targetType, item.targetId].filter(Boolean).join(": ") || "-"}</td>
                      <td className="px-3 py-2 max-w-[320px]">
                        {item.metadata ? (
                          <code className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(item.metadata)}</code>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="subtle-text">Page {auditPage} of {auditTotalPages}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="secondary-btn px-3 py-2"
                disabled={auditPage <= 1}
                onClick={() => {
                  const nextPage = Math.max(1, auditPage - 1);
                  refreshAuditLogs({ page: nextPage })
                    .catch((error) => setStatus(`Audit pagination failed: ${error instanceof Error ? error.message : "Unknown"}`));
                }}
              >
                Previous
              </button>
              <button
                type="button"
                className="secondary-btn px-3 py-2"
                disabled={auditPage >= auditTotalPages}
                onClick={() => {
                  const nextPage = Math.min(auditTotalPages, auditPage + 1);
                  refreshAuditLogs({ page: nextPage })
                    .catch((error) => setStatus(`Audit pagination failed: ${error instanceof Error ? error.message : "Unknown"}`));
                }}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
