import type { ExportFile } from "@/features/exports/services/exportBuilders";

export const downloadExportFile = (file: ExportFile) => {
  let blob: Blob;
  if (file.encoding === "base64") {
    const bin = atob(file.body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    blob = new Blob([bytes], { type: file.mime });
  } else {
    blob = new Blob([file.body], { type: file.mime });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.filename;
  a.click();
  URL.revokeObjectURL(url);
};
