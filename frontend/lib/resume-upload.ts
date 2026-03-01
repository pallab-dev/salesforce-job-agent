const MAX_TEXT_SIZE = 100_000;

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function extractPdfLikeText(bytes: Uint8Array): string {
  const text = Buffer.from(bytes).toString("latin1");
  const fragments = text
    .match(/\(([^\)]{2,200})\)/g)
    ?.map((chunk) => chunk.slice(1, -1).replace(/\\[nrt]/g, " ").replace(/\\\(|\\\)|\\\\/g, ""))
    .filter((chunk) => /[a-zA-Z]{2,}/.test(chunk))
    .slice(0, 1200);

  return fragments?.join(" ") || "";
}

export async function extractResumeTextFromFile(file: File): Promise<string> {
  const name = (file.name || "").toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (name.endsWith(".txt") || file.type.startsWith("text/")) {
    return decodeUtf8(bytes).slice(0, MAX_TEXT_SIZE).trim();
  }

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    return extractPdfLikeText(bytes).slice(0, MAX_TEXT_SIZE).trim();
  }

  throw new Error("Only .txt and .pdf uploads are supported right now.");
}
