import { rebaseLocalhost } from "./config";
import type { UploadTicketDto } from "./contracts/dto";
import { ApiError } from "./errors";
import type { LocalFile } from "@/types/message";
import { t } from "@/i18n";

/** React Native (Expo Go / dev build) — par opposition au web et aux scripts Node (tests d'intégration). */
const isReactNative = (): boolean =>
  typeof navigator !== "undefined" && (navigator as { product?: string }).product === "ReactNative";

/**
 * API de fichiers natifs d'Expo, chargée à la demande : ce module doit rester importable hors React Native.
 * `uploadAsync` envoie le fichier tel quel depuis le disque — sans le recopier en mémoire sous forme de Blob
 * (`fetch(file://…).blob()` est capricieux sur Android : taille nulle, type inattendu, échec sur gros fichiers).
 */
function nativeFiles(): typeof import("expo-file-system/legacy") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("expo-file-system/legacy");
}

/** PUT d'un fichier local avec la nouvelle API d'expo-file-system (`File.upload`), chargée à la demande. */
async function nextFileUpload(url: string, uri: string, headers: Record<string, string>): Promise<{ status: number }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { File } = require("expo-file-system") as typeof import("expo-file-system");
  return new File(uri).upload(url, { httpMethod: "PUT", headers });
}

/** Variantes de type audio rencontrées selon l'appareil → le type que le serveur accepte. */
const AUDIO_ALIASES: Record<string, string> = {
  "audio/m4a": "audio/mp4",
  "audio/x-m4a": "audio/mp4",
  "audio/mp4a-latm": "audio/mp4",
  "audio/aac": "audio/mp4",
  "audio/x-aac": "audio/mp4",
  "audio/mpeg4-generic": "audio/mp4",
  "video/mp4": "audio/mp4", // certains systèmes typent un .m4a de « vidéo »
  "audio/x-mpeg": "audio/mpeg",
  "audio/mp3": "audio/mpeg",
  "audio/x-opus+ogg": "audio/ogg",
  "audio/opus": "audio/ogg",
};

const AUDIO_BY_EXTENSION: Record<string, string> = {
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/mp4",
  webm: "audio/webm",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  mp3: "audio/mpeg",
};

/**
 * Type MIME d'un enregistrement audio tel que le serveur l'attend (audio/mp4 · webm · ogg · mpeg).
 * Le type annoncé par l'appareil est imprévisible (« audio/mp4a-latm », « audio/x-m4a », vide…) : on le ramène à
 * une valeur connue, et à défaut on le déduit de l'extension du fichier.
 */
export function normalizeAudioMime(rawType: string | null | undefined, uri: string, fallback = "audio/mp4"): string {
  const type = (rawType ?? "").split(";")[0].trim().toLowerCase();
  if (type) {
    const mapped = AUDIO_ALIASES[type] ?? type;
    // Type inconnu (audio/wav…) : on ne le « corrige » pas, le serveur le refusera clairement.
    return mapped;
  }
  // Aucun type annoncé : on le déduit de l'extension du fichier.
  const extension = uri.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  return AUDIO_BY_EXTENSION[extension] ?? fallback;
}

/**
 * Étape 2 de l'upload : PUT direct vers le stockage (Supabase Storage / stockage local en dev).
 * Le fichier ne traverse jamais l'API. L'URL signée porte déjà son jeton (?token=…) : AUCUN en-tête
 * Authorization (un JWT inattendu serait refusé par Supabase).
 */
export async function uploadToSignedUrl(ticket: UploadTicketDto, file: LocalFile): Promise<void> {
  const url = rebaseLocalhost(ticket.signedUrl);

  if (isReactNative()) {
    const headers = { "Content-Type": file.mimeType, "x-upsert": "false" };
    let status: number;
    try {
      const files = nativeFiles();
      status = (
        await files.uploadAsync(url, file.uri, {
          httpMethod: "PUT",
          uploadType: files.FileSystemUploadType.BINARY_CONTENT,
          headers,
        })
      ).status;
    } catch (legacyError) {
      // L'ancienne API refuse parfois un fichier pourtant copié par le sélecteur (« Location … isn't readable » sur
      // Android) : la nouvelle API de fichiers, qui a ses propres droits d'accès, prend le relais.
      try {
        status = (await nextFileUpload(url, file.uri, headers)).status;
      } catch (nextError) {
        const detail = nextError instanceof Error ? nextError.message : legacyError instanceof Error ? legacyError.message : "";
        throw ApiError.local("network_error", t("api.upload.uploadFailedCheckConnection") + (detail ? ` (${detail})` : ""));
      }
    }
    if (status === 401 || status === 403) throw ApiError.local("upload_expired", t("api.upload.theUploadExpiredPleaseTry"));
    if (status < 200 || status >= 300) {
      throw ApiError.local("network_error", t("api.upload.theFileCouldNotBe", { status }));
    }
    return;
  }

  let blob: Blob;
  try {
    blob = await (await fetch(file.uri)).blob();
  } catch {
    throw ApiError.local("network_error", t("api.upload.theSelectedFileIsUnreadable"));
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": file.mimeType, "x-upsert": "false" },
      body: blob,
    });
  } catch {
    throw ApiError.local("network_error", t("api.upload.theFileUploadFailedCheck"));
  }
  if (res.status === 403 || res.status === 401) {
    throw ApiError.local("upload_expired", t("api.upload.theUploadExpiredPleaseTry"));
  }
  if (!res.ok) throw ApiError.local("network_error", t("api.upload.theFileCouldNotBe", { status: res.status }));
}

/** Lit la taille réelle et le type d'un fichier local (enregistrement audio, vidéo…) sans dépendance native hors mobile. */
export async function describeLocalFile(uri: string, fallbackMime: string): Promise<{ sizeBytes: number; mimeType: string }> {
  const isAudio = fallbackMime.startsWith("audio/");

  if (isReactNative()) {
    const info = await nativeFiles().getInfoAsync(uri);
    if (!info.exists) throw new Error("Fichier introuvable.");
    return {
      sizeBytes: info.size ?? 0,
      // Le type que l'appareil annonce pour un fichier local n'est pas fiable : on se fie à l'extension.
      mimeType: isAudio ? normalizeAudioMime(null, uri, fallbackMime) : fallbackMime,
    };
  }

  const blob = await (await fetch(uri)).blob();
  // Les navigateurs ajoutent les codecs (« audio/webm;codecs=opus ») : le serveur attend le type nu.
  const raw = (blob.type || fallbackMime).split(";")[0].trim().toLowerCase();
  return { sizeBytes: blob.size, mimeType: isAudio ? normalizeAudioMime(raw, uri, fallbackMime) : raw };
}
