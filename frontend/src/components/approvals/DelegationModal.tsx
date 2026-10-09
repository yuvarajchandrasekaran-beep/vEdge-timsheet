import { useState } from "react";
import { Modal } from "../common/Modal";
import { Spinner } from "../common/Spinner";
import { useCreateDelegation, useDelegations, useEligibleProxies, useRevokeDelegation } from "../../hooks/useApprovals";
import { getApiErrorMessage } from "../../api/client";
import { formatDate } from "../../utils/format";
import { IconTrash } from "../common/icons";

/**
 * Nominate a temporary proxy approver for a date range — any timesheet the
 * current user would normally approve during that window also routes to the
 * proxy automatically (see backend/src/services/approvalRouting.ts). The
 * proxy sees it in their own Approvals > Pending tab; there's nothing else
 * to configure on their side.
 */
export function DelegationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [toUserId, setToUserId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const delegationsQuery = useDelegations(open);
  // The backend accepts Super Admin or anyone who already administers at
  // least one project — which can include someone whose global role is,
  // say, HR Admin (a project's admin list is assignable to anyone; see
  // approvalRouting.ts#isProjectAdminAnywhere). /delegations/eligible-proxies
  // computes exactly that list server-side, so this never offers someone the
  // backend would just turn around and reject.
  const proxiesQuery = useEligibleProxies(open);
  const eligibleDelegates = proxiesQuery.data ?? [];

  const createDelegation = useCreateDelegation();
  const revokeDelegation = useRevokeDelegation();

  function handleClose() {
    setToUserId("");
    setStartDate("");
    setEndDate("");
    setError(null);
    onClose();
  }

  function handleCreate() {
    if (!toUserId || !startDate || !endDate) {
      setError("Pick a proxy and both dates.");
      return;
    }
    if (endDate < startDate) {
      setError("End date must be on or after the start date.");
      return;
    }
    setError(null);
    createDelegation.mutate(
      { toUserId, startDate, endDate },
      {
        onSuccess: () => {
          setToUserId("");
          setStartDate("");
          setEndDate("");
        },
        onError: (err) => setError(getApiErrorMessage(err, "Couldn't create this delegation.")),
      }
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Modal open={open} onClose={handleClose} title="Delegate my approvals">
      <p className="mb-4 text-sm text-gray-600">
        Nominate someone to cover your approvals while you're out. During the date range below, any timesheet you'd
        normally approve also shows up in their own Approvals &gt; Pending tab — they don't need to do anything else to
        see it.
      </p>

      <div className="space-y-3 rounded-xl border border-gray-100 p-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">Proxy (Project Admin or Super Admin)</span>
          <select value={toUserId} onChange={(e) => setToUserId(e.target.value)} className="input">
            <option value="">Select a person…</option>
            {eligibleDelegates.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} — {u.reason}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">From</span>
            <input type="date" min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">To</span>
            <input type="date" min={startDate || today} value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input" />
          </label>
        </div>
        {error && <p className="text-xs text-status-danger">{error}</p>}
        <button onClick={handleCreate} disabled={createDelegation.isPending} className="btn-primary w-full justify-center">
          {createDelegation.isPending && <Spinner size={14} className="text-white" />}
          Nominate proxy
        </button>
      </div>

      <div className="mt-5">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Your delegations</h3>
        {delegationsQuery.isLoading ? (
          <p className="py-4 text-center text-sm text-gray-400">Loading…</p>
        ) : !delegationsQuery.data?.length ? (
          <p className="py-4 text-center text-sm text-gray-400">No delegations yet.</p>
        ) : (
          <div className="space-y-2">
            {delegationsQuery.data.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium text-gray-800">{d.toUserName}</p>
                  <p className="text-xs text-gray-500">
                    {formatDate(d.startDate)} – {formatDate(d.endDate)}
                    {!d.active && " · Revoked"}
                  </p>
                </div>
                {d.active && (
                  <button
                    onClick={() => revokeDelegation.mutate(d.id)}
                    disabled={revokeDelegation.isPending}
                    className="rounded-lg p-1.5 text-gray-300 hover:bg-rose-50 hover:text-status-danger"
                    aria-label="Revoke delegation"
                    title="Revoke"
                  >
                    <IconTrash size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
