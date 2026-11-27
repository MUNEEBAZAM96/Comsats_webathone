import QRCode from "qrcode";

/** QR encodes only the verification URL — never PII or hashes from the client. */
export const generateVerificationQrDataUrl = async (verifyUrl: string) =>
  QRCode.toDataURL(verifyUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 256,
  });
