"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  CV_MAX_BYTES,
  CV_MAX_CHARS,
  CV_MIME_TYPES,
  detectCvKind,
  normalizeCvText,
  parseCv,
} from "@/lib/cv-parser";

const CV_BUCKET = "cvs";

export type CvState = {
  ok: boolean;
  error?: string;
  message?: string;
  preview?: string;
  chars?: number;
};

function bucketPath(userId: string, kind: "pdf" | "docx"): string {
  return `${userId}/cv.${kind}`;
}

export async function uploadCvAction(
  _prev: CvState | undefined,
  formData: FormData,
): Promise<CvState> {
  const file = formData.get("cv");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Please choose a PDF or DOCX file to upload." };
  }
  if (file.size > CV_MAX_BYTES) {
    return {
      ok: false,
      error: `File is too large. Max ${Math.round(CV_MAX_BYTES / (1024 * 1024))}MB.`,
    };
  }

  const kind = detectCvKind(file.type, file.name);
  if (!kind) {
    return { ok: false, error: "Only PDF and DOCX files are supported." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session has expired. Please sign in again." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let parsed;
  try {
    parsed = await parseCv(buffer, kind);
  } catch {
    return {
      ok: false,
      error:
        "We couldn't read this file. It may be scanned, encrypted, or corrupted. Try a text-based PDF or paste the text manually below.",
    };
  }

  if (parsed.chars < 200) {
    return {
      ok: false,
      error:
        "We only extracted a handful of characters — this CV may be a scanned image. Paste your CV text manually below.",
    };
  }

  const path = bucketPath(user.id, kind);
  const otherKind = kind === "pdf" ? "docx" : "pdf";
  const otherPath = bucketPath(user.id, otherKind);

  const { error: uploadErr } = await supabase.storage
    .from(CV_BUCKET)
    .upload(path, buffer, {
      contentType: CV_MIME_TYPES[kind],
      upsert: true,
    });
  if (uploadErr) {
    return {
      ok: false,
      error: `Could not save the file to storage: ${uploadErr.message}`,
    };
  }

  await supabase.storage.from(CV_BUCKET).remove([otherPath]);

  const { error: dbErr } = await supabase
    .from("profiles")
    .update({
      cv_text: parsed.text,
      cv_file_path: path,
      cv_uploaded_at: new Date().toISOString(),
      cv_embedding: null,
    })
    .eq("user_id", user.id);
  if (dbErr) {
    return {
      ok: false,
      error: `Saved the file but couldn't update your profile: ${dbErr.message}`,
    };
  }

  revalidatePath("/onboarding/cv");
  revalidatePath("/dashboard");

  return {
    ok: true,
    message: `Parsed ${parsed.chars.toLocaleString()} characters from your ${kind.toUpperCase()}.`,
    preview: parsed.text,
    chars: parsed.chars,
  };
}

export async function saveCvTextAction(
  _prev: CvState | undefined,
  formData: FormData,
): Promise<CvState> {
  const raw = String(formData.get("cv_text") ?? "");
  const text = normalizeCvText(raw);

  if (text.length < 200) {
    return {
      ok: false,
      error: "Your CV text looks too short. Please paste at least a few paragraphs.",
    };
  }
  if (text.length > CV_MAX_CHARS) {
    return {
      ok: false,
      error: `Your CV is too long. Max ${CV_MAX_CHARS.toLocaleString()} characters.`,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session has expired. Please sign in again." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      cv_text: text,
      cv_uploaded_at: new Date().toISOString(),
      cv_embedding: null,
    })
    .eq("user_id", user.id);
  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/onboarding/cv");
  revalidatePath("/dashboard");

  return {
    ok: true,
    message: `Saved ${text.length.toLocaleString()} characters.`,
    preview: text,
    chars: text.length,
  };
}
