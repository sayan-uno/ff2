'use client';

import { FileText, Download, Film, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { SupportFileRef, SupportMessage } from '@/lib/support-definitions';

// Browser uploads in 4MB pieces to stay under the platform request-size cap.
export const UPLOAD_CHUNK_SIZE = 4 * 1024 * 1024;
export const DEFAULT_UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_LIMIT_BYTES = 250 * 1024 * 1024;

// Human-readable size, e.g. "12.4 MB".
export function formatBytes(bytes: number): string {
    if (!bytes || bytes < 1024) return `${bytes || 0} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
    return `${(mb / 1024).toFixed(1)} GB`;
}

// Random, URL-safe upload id used to group a file's chunks server-side.
function makeUploadId(): string {
    return `up_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export interface ChunkUploadResult {
    success: boolean;
    done?: boolean;  // true once the server has assembled the final chunk
    fileId?: string;
    size?: number;
    code?: string;   // e.g. 'LIMIT_EXCEEDED'
    message?: string;
}

// Upload a single file to a ticket in sequential 4MB chunks. `onProgress` is
// called with a 0..1 fraction as each chunk lands. The server assembles the
// chunks into GridFS once the final one arrives and returns the new file id.
export async function uploadFileInChunks(
    file: File,
    ticketId: string,
    onProgress?: (fraction: number) => void
): Promise<ChunkUploadResult> {
    const uploadId = makeUploadId();
    const totalChunks = Math.max(1, Math.ceil(file.size / UPLOAD_CHUNK_SIZE));
    const contentType = file.type || 'application/octet-stream';

    for (let index = 0; index < totalChunks; index++) {
        const start = index * UPLOAD_CHUNK_SIZE;
        const blob = file.slice(start, start + UPLOAD_CHUNK_SIZE);

        const form = new FormData();
        form.append('ticketId', ticketId);
        form.append('uploadId', uploadId);
        form.append('index', String(index));
        form.append('totalChunks', String(totalChunks));
        form.append('totalSize', String(file.size));
        form.append('filename', file.name);
        form.append('contentType', contentType);
        form.append('chunk', blob);

        let res: Response;
        try {
            res = await fetch('/api/support/upload', { method: 'POST', body: form });
        } catch {
            return { success: false, message: 'Network error during upload.' };
        }

        let data: ChunkUploadResult = { success: false };
        try {
            data = await res.json();
        } catch {
            /* non-JSON error */
        }

        if (!res.ok || !data.success) {
            return {
                success: false,
                code: data.code,
                message: data.message || 'Upload failed.',
            };
        }

        onProgress?.((index + 1) / totalChunks);

        if (data.done) {
            return { success: true, fileId: data.fileId, size: data.size };
        }
    }

    return { success: false, message: 'Upload did not complete.' };
}

// A centered system banner inside the chat (limit requested / limit granted).
export function SystemNotice({ message, type }: { message: string; type?: string }) {
    const granted = type === 'upload_limit_granted';
    return (
        <div className="flex justify-center my-3">
            <div
                className={`max-w-[88%] text-center px-4 py-2.5 rounded-xl shadow-sm border text-[12.5px] leading-relaxed flex items-start gap-2 ${
                    granted
                        ? 'bg-[#E7F8EF] border-green-200 text-green-800'
                        : 'bg-[#FFF6E5] border-amber-200 text-amber-800'
                }`}
            >
                {granted ? (
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                ) : (
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                )}
                <span className="text-left">{message}</span>
            </div>
        </div>
    );
}

// Renders the video(s) / file(s) attached to a message. `uploading` dims the
// tile and shows a progress bar for the optimistic (in-flight) message.
export function FileAttachments({
    files,
    uploading = false,
    progress,
}: {
    files: SupportFileRef[];
    uploading?: boolean;
    progress?: number | null;
}) {
    if (!files || files.length === 0) return null;
    return (
        <div className="mb-1 space-y-1.5" style={{ maxWidth: 260 }}>
            {files.map((f) => {
                const src = `/api/support/file/${f._id}`;
                if (f.kind === 'video') {
                    return (
                        <div key={f._id} className="relative overflow-hidden rounded-md bg-black/5">
                            {uploading ? (
                                // Don't stream a temp/blocked id while still uploading.
                                <div className="flex h-40 w-full items-center justify-center bg-black/70 text-white">
                                    <Film className="h-8 w-8 opacity-80" />
                                </div>
                            ) : (
                                <video
                                    src={src}
                                    controls
                                    preload="metadata"
                                    className="max-h-72 w-full rounded-md bg-black"
                                />
                            )}
                            <div className="px-1 pt-1 text-[11px] text-gray-600 truncate">
                                {f.filename} · {formatBytes(f.size)}
                            </div>
                            {uploading && (
                                <UploadBar progress={progress} />
                            )}
                        </div>
                    );
                }
                // Generic file card with a download link.
                return (
                    <div key={f._id} className="rounded-lg border bg-white/80 p-2">
                        <div className="flex items-center gap-2">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#075E54]/10 text-[#075E54]">
                                <FileText className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[13px] font-medium text-gray-800">{f.filename}</div>
                                <div className="text-[11px] text-gray-500">{formatBytes(f.size)}</div>
                            </div>
                            {!uploading && (
                                <a
                                    href={src}
                                    download={f.filename}
                                    className="shrink-0 rounded-full p-1.5 text-[#075E54] hover:bg-black/5"
                                    title="Download"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Download className="h-4 w-4" />
                                </a>
                            )}
                            {uploading && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
                        </div>
                        {uploading && <UploadBar progress={progress} />}
                    </div>
                );
            })}
        </div>
    );
}

function UploadBar({ progress }: { progress?: number | null }) {
    const pct = Math.round(((progress ?? 0) as number) * 100);
    return (
        <div className="mt-1.5 px-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10">
                <div
                    className="h-full bg-[#075E54] transition-all duration-200"
                    style={{ width: `${pct}%` }}
                />
            </div>
            <div className="mt-0.5 text-[10px] text-gray-500">Uploading… {pct}%</div>
        </div>
    );
}

// True when a message is a system notice (rendered centered, not as a bubble).
export function isSystemMessage(msg: SupportMessage): boolean {
    return (msg as any).kind === 'system';
}
