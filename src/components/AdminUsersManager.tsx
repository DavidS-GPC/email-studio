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

function normalizeText(value: string) {
  return value.trim();
}

export default function AdminUsersManager() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [status, setStatus] = useState("Loading users...");

  const [newUsername, setNewUsername] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<AppRole>("viewer");
  const [newEnabled, setNewEnabled] = useState(true);
  const [newPassword, setNewPassword] = useState("");

  const [editMap, setEditMap] = useState<Record<string, { displayName: string; email: string; role: AppRole; enabled: boolean; password: string }>>({});

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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refreshUsers()
        .then(() => setStatus("Ready"))
        .catch((error) => setStatus(`Load failed: ${error instanceof Error ? error.message : "Unknown"}`));
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

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
    await refreshUsers();
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

    await refreshUsers();
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
      </div>
    </main>
  );
}
