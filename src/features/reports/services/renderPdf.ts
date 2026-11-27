import { pdf, type DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";

export const renderPdfToBuffer = async (
  document: ReactElement<DocumentProps>,
) => {
  const instance = pdf(document);
  const blob = await instance.toBlob();
  const ab = await blob.arrayBuffer();
  return Buffer.from(ab);
};
