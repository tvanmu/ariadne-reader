export async function calculateFileHash(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer.slice(0));
  const bytes = Array.from(new Uint8Array(digest));

  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim() || fileName;
}

export function sanitizeStorageFileName(fileName: string): string {
  return fileName
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}
