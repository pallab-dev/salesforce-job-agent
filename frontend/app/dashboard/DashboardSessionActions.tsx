"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ConfirmAction = "activate" | "deactivate" | "switch" | null;

export default function DashboardSessionActions({ initialIsActive }: { initialIsActive: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"" | "toggle" | "switch">("");
  const [isActive, setIsActive] = useState<boolean>(initialIsActive);
  const [error, setError] = useState("");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  async function callAccountStatus(nextValue: boolean) {
    const response = await fetch("/api/account/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: nextValue })
    });
    const payload = (await response.json()) as { ok?: boolean; error?: string; is_active?: boolean };
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Failed to update account status");
    }
    return Boolean(payload.is_active);
  }

  async function callLogout() {
    const response = await fetch("/api/logout", {
      method: "POST"
    });
    const payload = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Failed to end session");
    }
  }

  async function onToggleStatus() {
    setError("");
    setConfirmAction(isActive ? "deactivate" : "activate");
  }

  async function onSwitchUser() {
    setError("");
    setConfirmAction("switch");
  }

  async function onConfirmAction() {
    if (!confirmAction) {
      return;
    }

    if (confirmAction === "switch") {
      setBusy("switch");
      try {
        await callLogout();
        router.push("/auth");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to switch user");
      } finally {
        setBusy("");
        setConfirmAction(null);
      }
      return;
    }

    const nextValue = confirmAction === "activate";
    setBusy("toggle");
    try {
      const savedValue = await callAccountStatus(nextValue);
      setIsActive(savedValue);
      if (!savedValue) {
        await callLogout();
        router.push("/auth");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setBusy("");
      setConfirmAction(null);
    }
  }

  function closeConfirm() {
    if (busy) {
      return;
    }
    setConfirmAction(null);
  }

  const confirmContent =
    confirmAction === "switch"
      ? {
          title: "Switch user?",
          message: "This will end the current session and open the auth page.",
          actionLabel: "Switch User"
        }
      : confirmAction === "deactivate"
        ? {
            title: "Set account to deactive?",
            message: "Your account will be marked deactive and you will be moved to the auth page. You can reactivate it when you sign in again.",
            actionLabel: "Deactive"
          }
        : confirmAction === "activate"
          ? {
              title: "Set account to active?",
              message: "Your account will be marked active and continue receiving alerts based on your preferences.",
              actionLabel: "Active"
            }
          : null;

  return (
    <>
      <div className="dash-side-foot">
        <button className="btn btn-danger" type="button" onClick={onToggleStatus} disabled={busy !== ""}>
          {busy === "toggle"
            ? "Updating..."
            : isActive
              ? "Deactive"
              : "Active"}
        </button>
        <button className="btn btn-secondary" type="button" onClick={onSwitchUser} disabled={busy !== ""}>
          {busy === "switch" ? "Switching..." : "Switch User"}
        </button>
        {error ? <div className="banner err compact-banner">{error}</div> : null}
      </div>

      {confirmContent ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="session-action-modal-title">
          <div className="modal-card">
            <h3 id="session-action-modal-title" className="section-title no-top">
              {confirmContent.title}
            </h3>
            <p className="subtitle compact">{confirmContent.message}</p>
            <div className="modal-actions">
              <button className="btn btn-secondary" type="button" onClick={closeConfirm} disabled={busy !== ""}>
                Cancel
              </button>
              <button className="btn" type="button" onClick={onConfirmAction} disabled={busy !== ""}>
                {busy ? "Please wait..." : confirmContent.actionLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
