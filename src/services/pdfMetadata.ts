import { pdfjsLib } from '../lib/pdf';

export async function getPdfPageCount(buffer: ArrayBuffer): Promise<number> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer.slice(0)),
  });

  const document = await loadingTask.promise;

  try {
    return document.numPages;
  } finally {
    await document.destroy();
  }
}
