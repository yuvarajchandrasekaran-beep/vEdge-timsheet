import { useCallback, useRef, useState } from "react";
import { IconFileSpreadsheet, IconUpload } from "./icons";

export function Dropzone({
  onFile,
  accept = ".xlsx,.xls,.csv",
  file,
}: {
  onFile: (file: File) => void;
  accept?: string;
  file: File | null;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = e.dataTransfer.files?.[0];
      if (dropped) onFile(dropped);
    },
    [onFile]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
        isDragging ? "border-brand-primary bg-blue-50" : "border-gray-200 bg-gray-50/50 hover:border-brand-primary/50"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const selected = e.target.files?.[0];
          if (selected) onFile(selected);
        }}
      />
      {file ? (
        <>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <IconFileSpreadsheet size={22} />
          </div>
          <p className="text-sm font-medium text-gray-900">{file.name}</p>
          <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB — click or drop to replace</p>
        </>
      ) : (
        <>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-brand-primary">
            <IconUpload size={22} />
          </div>
          <p className="text-sm font-medium text-gray-900">Drag &amp; drop your file here, or click to browse</p>
          <p className="text-xs text-gray-500">Supports .xlsx, .xls, .csv</p>
        </>
      )}
    </div>
  );
}
