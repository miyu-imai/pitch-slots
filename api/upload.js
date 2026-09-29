import { handleUpload } from "@vercel/blob/client";

// Decks are PDFs; thumbs are the first slide, rendered in the browser as a JPEG.
const RULES = {
  "decks/": { allowedContentTypes: ["application/pdf"], maximumSizeInBytes: 25 * 1024 * 1024 },
  "thumbs/": { allowedContentTypes: ["image/jpeg", "image/png"], maximumSizeInBytes: 4 * 1024 * 1024 },
};

export async function POST(request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json({ error: "Deck storage is not connected" }, { status: 503 });
  }
  const body = await request.json();
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const prefix = Object.keys(RULES).find((p) => pathname.startsWith(p));
        if (!prefix || pathname.includes("..")) throw new Error("Invalid path");
        return { ...RULES[prefix], addRandomSuffix: true };
      },
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
