import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Supported MIME types for Gemini vision
const VISION_SUPPORTED_MIMES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];


type OpenAICompatibleProvider = "openai" | "azure" | "custom" | "ollama";

function isLocalOpenAICompatibleUrl(url: string): boolean {
  return url.startsWith("http://localhost") || url.startsWith("http://127.0.0.1");
}

function normalizeProvider(provider: string): OpenAICompatibleProvider {
  if (provider === "azure" || provider === "custom" || provider === "ollama") return provider;
  return "openai";
}

function providerRequiresApiKey(provider: OpenAICompatibleProvider, baseUrl: string): boolean {
  // Ollama commonly runs locally without auth; keep keyless usage supported.
  if (provider === "ollama") return false;

  if (provider === "custom") {
    const allowKeylessCustom = Deno.env.get("ALLOW_KEYLESS_CUSTOM_OPENAI") === "true";
    return !(allowKeylessCustom || isLocalOpenAICompatibleUrl(baseUrl));
  }

  // OpenAI/Azure should remain strict about API key presence.
  return true;
}

function buildOpenAICompatibleHeaders(apiKey?: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileBase64, fileName, mimeType } = await req.json();

    if (!fileBase64) {
      return new Response(
        JSON.stringify({ error: "No file data provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const provider = normalizeProvider((Deno.env.get("OPENAI_COMPAT_PROVIDER") || Deno.env.get("AI_PROVIDER") || "openai").toLowerCase());
    const openAICompatBaseUrl = (Deno.env.get("OPENAI_COMPAT_BASE_URL") || "https://ai.gateway.lovable.dev/v1").replace(/\/$/, "");
    const chatCompletionsUrl = `${openAICompatBaseUrl}/chat/completions`;
    const apiKey = Deno.env.get("LOVABLE_API_KEY") || Deno.env.get("OPENAI_API_KEY") || "";

    if (providerRequiresApiKey(provider, openAICompatBaseUrl) && !apiKey) {
      throw new Error("API key is required for the configured AI provider");
    }

    const effectiveMime = mimeType || "application/pdf";
    const isVisionSupported = VISION_SUPPORTED_MIMES.some(m => effectiveMime.startsWith(m));

    let extractedText = "";

    if (isVisionSupported) {
      // Use Gemini vision for PDFs and images
      extractedText = await extractWithVision(chatCompletionsUrl, apiKey, fileBase64, effectiveMime, fileName);
    } else {
      // For DOCX, PPTX, XLSX etc. — decode base64 and attempt to extract raw text
      // Then use AI to clean and structure it
      const rawText = extractRawText(fileBase64);
      if (rawText.length > 50) {
        extractedText = rawText;
      } else {
        // If raw text extraction fails, ask AI to describe based on the filename
        extractedText = await extractWithAIChat(chatCompletionsUrl, apiKey, rawText, fileName, effectiveMime);
      }
    }

    return new Response(
      JSON.stringify({ text: extractedText, charCount: extractedText.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("extract-document error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function extractWithVision(
  chatCompletionsUrl: string,
  apiKey: string,
  fileBase64: string,
  mimeType: string,
  fileName: string
): Promise<string> {
  const response = await fetch(chatCompletionsUrl, {
    method: "POST",
    headers: buildOpenAICompatibleHeaders(apiKey),
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract ALL text content from this document (${fileName}). Return ONLY the extracted text, preserving the document structure (headings, paragraphs, lists, tables). Do not add any commentary or interpretation — just the raw text content.`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${fileBase64}`,
              },
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("AI vision extraction error:", response.status, errorText);
    throw new Error(`Vision extraction failed (${response.status})`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

// Extract readable text from base64-encoded binary files (DOCX, PPTX, XLSX)
// These are ZIP-based XML formats — we extract XML text content
function extractRawText(fileBase64: string): string {
  try {
    const binaryStr = atob(fileBase64);
    // Look for readable text segments (filter out binary noise)
    const textSegments: string[] = [];
    let current = "";

    for (let i = 0; i < binaryStr.length; i++) {
      const code = binaryStr.charCodeAt(i);
      // Printable ASCII + common whitespace
      if ((code >= 32 && code <= 126) || code === 10 || code === 13 || code === 9) {
        current += binaryStr[i];
      } else {
        if (current.trim().length > 3) {
          textSegments.push(current.trim());
        }
        current = "";
      }
    }
    if (current.trim().length > 3) {
      textSegments.push(current.trim());
    }

    // For XML-based formats (DOCX, PPTX), try to extract text between XML tags
    const fullText = textSegments.join(" ");
    
    // Extract text from XML tags like <w:t>text</w:t> or <a:t>text</a:t>
    const xmlTextMatches = fullText.match(/<[wa]:t[^>]*>([^<]+)<\/[wa]:t>/g);
    if (xmlTextMatches && xmlTextMatches.length > 0) {
      return xmlTextMatches
        .map(m => m.replace(/<[^>]+>/g, ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    }

    // Fallback: return filtered text segments
    return textSegments
      .filter(s => s.length > 10 && /[a-zA-Z]{3,}/.test(s))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  } catch (e) {
    console.error("Raw text extraction error:", e);
    return "";
  }
}

// Use AI chat (non-vision) to clean up and structure raw extracted text
async function extractWithAIChat(
  chatCompletionsUrl: string,
  apiKey: string,
  rawText: string,
  fileName: string,
  mimeType: string
): Promise<string> {
  const response = await fetch(chatCompletionsUrl, {
    method: "POST",
    headers: buildOpenAICompatibleHeaders(apiKey),
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: `I have a file named "${fileName}" (${mimeType}). I extracted some raw text from it but it may be incomplete or noisy. Please clean it up and return the structured text content. If the raw text is too garbled, just say "Could not extract meaningful text from this file format."

Raw extracted text:
${rawText.slice(0, 10000)}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("AI chat extraction error:", response.status, errorText);
    throw new Error(`AI extraction failed (${response.status})`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}
