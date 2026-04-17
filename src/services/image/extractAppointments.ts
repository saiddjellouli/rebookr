import OpenAI from "openai";
import type { ImportAppointmentInput } from "../import/persistRows.js";
import { ocrImageBuffer } from "./ocr.js";
import { importRowSchema, parseImportRowList, toImportInput } from "./schemas.js";

function normalizeOpenAiRows(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    for (const key of ["rows", "appointments", "rendez_vous", "items"]) {
      const v = o[key];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

async function extractWithOpenAI(
  apiKey: string,
  ocrText: string,
): Promise<{ rows: ImportAppointmentInput[]; skippedInvalid: number }> {
  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `Tu extrais des rendez-vous depuis du texte (OCR, copier-coller, export agenda).
Réponds uniquement avec un JSON de la forme : {"rows":[...]}.
Chaque élément de rows peut avoir : name, email, phone, date, time, datetime, duration, title.
Valeurs manquantes : null ou omis. date/heure en chaînes (ex. 15/04/2026, 2026-04-15, 14:30).
Ne pas inventer d’emails ou de numéros absents du texte.`,
      },
      {
        role: "user",
        content: ocrText.slice(0, 14_000),
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) {
    return { rows: [], skippedInvalid: 0 };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { rows: [], skippedInvalid: 0 };
  }
  const arr = normalizeOpenAiRows(parsed);
  return parseImportRowList(arr);
}

const emailRe = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi;
const phoneRe =
  /(?:\+33|0033|0)\s*[1-9](?:[\s./-]?\d{2}){4}|\b0[1-9](?:[\s./-]?\d{2}){4}\b/gi;
const dateRe =
  /\b(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/g;
const timeRe = /\b([01]?\d|2[0-3])[:h.]([0-5]\d)\b/gi;

/** Lignes type « 06/04/2026 14:30 Dupont » ou « 2026-04-06 9h00 Jean » sans e-mail (planning collé). */
function heuristicLinesPlanning(text: string): ImportAppointmentInput[] {
  const rows: ImportAppointmentInput[] = [];
  const lineDateRe =
    /\b(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/;
  const lineTimeRe = /\b([01]?\d|2[0-3])[:h.]([0-5]\d)\b/gi;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length < 2) continue;
    const dateMatch = line.match(lineDateRe);
    const timeMatches = [...line.matchAll(lineTimeRe)];
    const emails = line.match(emailRe) ?? [];
    const phones = [...line.matchAll(phoneRe)].map((m) =>
      m[0].replace(/\s+/g, " ").trim(),
    );
    const timeStr =
      timeMatches[0] !== undefined
        ? `${timeMatches[0][1]}:${timeMatches[0][2]}`
        : null;
    if (!dateMatch && !timeStr) continue;

    let namePart = line;
    if (dateMatch) namePart = namePart.replace(dateMatch[0], " ");
    if (timeMatches[0]) namePart = namePart.replace(timeMatches[0][0], " ");
    for (const e of emails) namePart = namePart.split(e).join(" ");
    for (const p of phones) namePart = namePart.split(p).join(" ");
    const name = namePart.replace(/\s+/g, " ").trim() || null;
    if (!name && emails.length === 0 && phones.length === 0) continue;

    rows.push(
      toImportInput(
        importRowSchema.parse({
          name,
          email: emails[0] ?? null,
          phone: phones[0] ?? null,
          date: dateMatch ? dateMatch[1] : null,
          time: timeStr,
          datetime: null,
          duration: null,
          title: null,
        }),
      ),
    );
  }
  return rows;
}

function heuristicExtractRows(text: string): ImportAppointmentInput[] {
  const chunks = text
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
  const rows: ImportAppointmentInput[] = [];

  for (const chunk of chunks) {
    const emails = chunk.match(emailRe) ?? [];
    const phones = [...chunk.matchAll(phoneRe)].map((m) => m[0].replace(/\s+/g, " ").trim());
    const dateMatch = chunk.match(dateRe);
    const times = [...chunk.matchAll(timeRe)];
    const timeStr =
      times[0] !== undefined ? `${times[0][1]}:${times[0][2]}` : null;

    if (emails.length === 0 && phones.length === 0) continue;

    const lines = chunk.split(/\n/).map((l) => l.trim()).filter(Boolean);
    let name: string | null = null;
    for (const line of lines) {
      if (emails.some((e) => line.includes(e))) continue;
      if (phones.some((p) => line.replace(/\s/g, "").includes(p.replace(/\s/g, "")))) continue;
      if (dateRe.test(line)) continue;
      if (line.length >= 2 && line.length < 120 && !/^\d+$/.test(line)) {
        name = line;
        break;
      }
    }

    rows.push(
      toImportInput(
        importRowSchema.parse({
          name,
          email: emails[0] ?? null,
          phone: phones[0] ?? null,
          date: dateMatch?.[1] ?? null,
          time: timeStr,
          datetime: null,
          duration: null,
          title: null,
        }),
      ),
    );
  }

  return rows;
}

async function extractFromTextContent(
  ocrText: string,
  openaiApiKey?: string,
): Promise<ImageAnalyzeResult> {
  const warnings: string[] = [];

  if (!ocrText) {
    return {
      ocrText: "",
      rows: [],
      extractionMethod: "heuristic",
      warnings: ["Texte vide."],
      skippedInvalid: 0,
    };
  }

  if (openaiApiKey) {
    try {
      const { rows, skippedInvalid } = await extractWithOpenAI(openaiApiKey, ocrText);
      if (skippedInvalid > 0) {
        warnings.push(`${skippedInvalid} ligne(s) ignorée(s) (JSON invalide).`);
      }
      if (rows.length > 0) {
        return {
          ocrText,
          rows,
          extractionMethod: "openai",
          warnings,
          skippedInvalid,
        };
      }
      warnings.push("OpenAI n’a retourné aucune ligne exploitable, essai heuristique.");
    } catch (e) {
      warnings.push(
        e instanceof Error ? `OpenAI : ${e.message}` : "Erreur OpenAI, essai heuristique.",
      );
    }
  } else {
    warnings.push(
      "OPENAI_API_KEY absent : extraction heuristique seule (moins fiable sur texte libre).",
    );
  }

  let heuristicRows = heuristicExtractRows(ocrText);
  if (heuristicRows.length === 0) {
    heuristicRows = heuristicLinesPlanning(ocrText);
  }
  return {
    ocrText,
    rows: heuristicRows,
    extractionMethod: "heuristic",
    warnings,
    skippedInvalid: 0,
  };
}

export type ImageAnalyzeResult = {
  ocrText: string;
  rows: ImportAppointmentInput[];
  extractionMethod: "openai" | "heuristic";
  warnings: string[];
  skippedInvalid: number;
};

export async function analyzeImageImport(params: {
  imageBuffer: Buffer;
  openaiApiKey?: string;
}): Promise<ImageAnalyzeResult> {
  const ocrText = await ocrImageBuffer(params.imageBuffer);
  if (!ocrText.trim()) {
    return {
      ocrText: "",
      rows: [],
      extractionMethod: "heuristic",
      warnings: ["OCR vide : image illisible ou sans texte."],
      skippedInvalid: 0,
    };
  }
  return extractFromTextContent(ocrText, params.openaiApiKey);
}

/** Texte collé (planning, liste) — même pipeline qu’après OCR. */
export async function analyzePlanningPastedText(params: {
  text: string;
  openaiApiKey?: string;
}): Promise<ImageAnalyzeResult> {
  return extractFromTextContent(params.text.trim(), params.openaiApiKey);
}
