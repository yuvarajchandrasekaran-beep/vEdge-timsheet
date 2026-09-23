import { useState } from "react";
import clsx from "clsx";
import { Modal } from "../common/Modal";
import { IconEdit } from "../common/icons";

/**
 * NetSuite-style comment capture: a small icon next to the hours entry box
 * that opens an overlay window to type the actual comment, instead of an
 * always-visible textarea taking up grid space.
 */
export function CommentOverlay({
  value,
  onSave,
  required,
  disabled,
  title = "Comment",
}: {
  value: string;
  onSave: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  function openOverlay() {
    setDraft(value);
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={openOverlay}
        disabled={disabled}
        title={value || (required ? "A comment is required for this entry" : "Add a comment")}
        aria-label="Comment"
        className={clsx(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors",
          required
            ? "bg-rose-50 text-status-danger hover:bg-rose-100"
            : value
              ? "bg-blue-50 text-brand-primary hover:bg-blue-100"
              : "text-gray-300 hover:bg-gray-100 hover:text-gray-500",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <IconEdit size={12} />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        size="sm"
        footer={
          <>
            <button onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
              Cancel
            </button>
            <button
              onClick={() => {
                onSave(draft);
                setOpen(false);
              }}
              className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-dark"
            >
              Save
            </button>
          </>
        }
      >
        {required && (
          <p className="mb-2 text-xs font-medium text-status-danger">A comment is required for entries over 8h.</p>
        )}
        <textarea
          autoFocus
          rows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What was this for?"
          className="w-full resize-none rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
        />
      </Modal>
    </>
  );
}
