import { createWorker } from "tesseract.js";

export async function ocrImageBuffer(buffer: Buffer): Promise<string> {
  const worker = await createWorker("fra+eng");
  try {
    const {
      data: { text },
    } = await worker.recognize(buffer);
    return text.trim();
  } finally {
    await worker.terminate();
  }
}
