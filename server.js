import "dotenv/config";
import express from "express";
import multer from "multer";
import fs from "fs/promises";
import path from "path";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 8 * 1024 * 1024 }
});

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const TRUTH_FIRST = `
You are TruthAI, a careful, evidence-first assistant.

Core rules:
- Never knowingly invent facts, citations, quotes, sources, dates, statistics, or tool results.
- If a question depends on current, changing, niche, local, or uncertain information, use web grounding/search when available.
- Prefer primary sources, official documentation, government sites, academic papers, and direct statements over low-quality aggregators.
- If sources disagree, say that they disagree and explain the difference rather than silently choosing one.
- Separate established facts from inference and opinion.
- If you cannot verify something, say so plainly.
- Never claim certainty merely because the user asked for "truth".
- For calculations, show the key assumptions and check the arithmetic.
- Answer in the user's language when practical. If the user writes Roman Urdu, reply in Roman Urdu.
- Be useful and direct. Do not use fake confidence.
`;

function cleanMessages(messages = []) {
  return messages.slice(-20).map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || "").slice(0, 12000)
  }));
}

function extractOpenAISources(response) {
  const sources = [];
  const seen = new Set();
  const output = response?.output || [];
  for (const item of output) {
    const content = item?.content || [];
    for (const part of content) {
      const anns = part?.annotations || [];
      for (const a of anns) {
        const url = a?.url || a?.source?.url;
        const title = a?.title || a?.source?.title || url;
        if (url && !seen.has(url)) {
          seen.add(url);
          sources.push({ title, url });
        }
      }
    }
  }
  return sources.slice(0, 12);
}

function extractGeminiSources(response) {
  const sources = [];
  const seen = new Set();
  const steps = response?.steps || [];
  for (const step of steps) {
    const blocks = step?.content || [];
    for (const block of blocks) {
      const anns = block?.annotations || [];
      for (const a of anns) {
        const url = a?.url;
        const title = a?.title || url;
        if (url && !seen.has(url)) {
          seen.add(url);
          sources.push({ title, url });
        }
      }
    }
  }
  // Some SDK versions expose grounding metadata on candidates.
  const candidates = response?.candidates || [];
  for (const c of candidates) {
    const chunks = c?.groundingMetadata?.groundingChunks || [];
    for (const chunk of chunks) {
      const web = chunk?.web;
      const url = web?.uri;
      const title = web?.title || url;
      if (url && !seen.has(url)) {
        seen.add(url);
        sources.push({ title, url });
      }
    }
  }
  return sources.slice(0, 12);
}

async function askOpenAI(messages, web) {
  if (!openai) throw new Error("OPENAI_API_KEY is not configured.");
  const input = [
    { role: "developer", content: TRUTH_FIRST },
    ...cleanMessages(messages)
  ];
  const tools = web ? [{ type: "web_search" }] : undefined;

  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    input,
    tools
  });

  return {
    provider: "OpenAI",
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    answer: response.output_text || "No text response returned.",
    sources: extractOpenAISources(response)
  };
}

async function askGemini(messages, web) {
  if (!gemini) throw new Error("GEMINI_API_KEY is not configured.");

  const transcript = cleanMessages(messages)
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  const response = await gemini.models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
    contents: `${TRUTH_FIRST}\n\nConversation:\n${transcript}`,
    ...(web ? { config: { tools: [{ googleSearch: {} }] } } : {})
  });

  return {
    provider: "Gemini",
    model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
    answer: response.text || "No text response returned.",
    sources: extractGeminiSources(response)
  };
}

app.get("/api/status", (req, res) => {
  res.json({
    openai: Boolean(openai),
    gemini: Boolean(gemini),
    image: Boolean(openai)
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const {
      messages,
      provider = "openai",
      web = true
    } = req.body || {};

    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: "Messages are required." });
    }

    let result;
    if (provider === "gemini") {
      result = await askGemini(messages, web);
    } else {
      result = await askOpenAI(messages, web);
    }

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error?.message || "AI request failed."
    });
  }
});

app.post("/api/file", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });
  try {
    const text = await fs.readFile(req.file.path, "utf8");
    await fs.unlink(req.file.path).catch(() => {});
    res.json({
      name: req.file.originalname,
      text: text.slice(0, 50000)
    });
  } catch {
    await fs.unlink(req.file.path).catch(() => {});
    res.status(400).json({
      error: "This starter currently supports text-readable files such as TXT, MD, JSON, CSV and code files."
    });
  }
});

app.post("/api/image", async (req, res) => {
  try {
    if (!openai) throw new Error("OPENAI_API_KEY is not configured.");
    const prompt = String(req.body?.prompt || "").trim();
    if (!prompt) return res.status(400).json({ error: "Image prompt is required." });

    const result = await openai.images.generate({
      model: process.env.IMAGE_MODEL || "gpt-image-1",
      prompt
    });

    const b64 = result?.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image data returned.");
    res.json({ image: `data:image/png;base64,${b64}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error?.message || "Image generation failed." });
  }
});

app.get("*splat", (req, res) => {
  res.sendFile(path.resolve("public/index.html"));
});

app.listen(PORT, () => {
  console.log(`TruthAI running at http://localhost:${PORT}`);
});