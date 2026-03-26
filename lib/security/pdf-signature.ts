const PDF_HEADER_BYTES = [0x25, 0x50, 0x44, 0x46, 0x2d] as const; // %PDF-

function containsPdfHeader(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_HEADER_BYTES.length) {
    return false;
  }

  const maxStart = Math.min(bytes.length - PDF_HEADER_BYTES.length, 1024);

  for (let start = 0; start <= maxStart; start += 1) {
    let matches = true;

    for (let i = 0; i < PDF_HEADER_BYTES.length; i += 1) {
      if (bytes[start + i] !== PDF_HEADER_BYTES[i]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return true;
    }
  }

  return false;
}

export async function hasPdfSignature(file: Blob, bytesToRead = 2048): Promise<boolean> {
  const head = file.slice(0, bytesToRead);
  const bytes = new Uint8Array(await head.arrayBuffer());
  return containsPdfHeader(bytes);
}
