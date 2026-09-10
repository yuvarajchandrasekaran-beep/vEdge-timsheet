import { useState, type ReactNode } from "react";
import { Modal } from "../common/Modal";
import { Spinner } from "../common/Spinner";
import { useCreateClient } from "../../hooks/useProjects";

export function NewClientModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createClient = useCreateClient();

  const [name, setName] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setStatus("ACTIVE");
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError("Please enter a client name.");
      return;
    }
    createClient.mutate({ name: name.trim(), status }, { onSuccess: handleClose });
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="New Client"
      size="sm"
      footer={
        <>
          <button onClick={handleClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={createClient.isPending}
            className="flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-dark disabled:opacity-60"
          >
            {createClient.isPending && <Spinner size={14} className="text-white" />}
            Create Client
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4">
        <Field label="Client name" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Vivid Edge Inc."
            className="input"
          />
        </Field>
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "ACTIVE" | "INACTIVE")}
            className="input"
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </Field>
      </div>

      {error && <p className="mt-4 text-sm text-status-danger">{error}</p>}
      {createClient.isError && (
        <p className="mt-2 text-sm text-status-danger">Couldn't create the client. Please try again.</p>
      )}
    </Modal>
  );
}

function Field({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-status-danger">*</span>}
      </label>
      {children}
    </div>
  );
}
