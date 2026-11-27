import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";

export const renderPdfToBuffer = (document: ReactElement<DocumentProps>) =>
  renderToBuffer(document);
