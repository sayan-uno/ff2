'use client';

import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Send,
  Loader2,
  ArrowLeft,
  Search,
  Inbox,
  CheckCheck,
  Lock,
  Unlock,
  X,
  ImagePlus,
  Trash2,
  MoreVertical,
  Ban,
  ShieldCheck,
} from 'lucide-react';
import {
  getAllTicketsForAdmin,
  getTicketForAdmin,
  sendAdminReply,
  markTicketReadByAdmin,
  setTicketStatus,
  uploadAdminImage,
  sendAdminImageMessage,
  deleteTicket,
  blockSupportUser,
  unblockSupportUser,
  getSupportBlockStatus,
} from '@/app/support/actions';
import type { SupportTicket, SupportMessage } from '@/lib/support-definitions';

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayLabel(dateString: string) {
  const d = new Date(dateString);
  const today = new Date();
  if (isSameDay(d, today)) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function DateSeparator({ date }: { date: string }) {
  return (
    <div className="flex justify-center my-2">
      <span className="text-[11px] bg-[#E1F2FB] text-gray-600 px-3 py-1 rounded-md shadow-sm">
        {dayLabel(date)}
      </span>
    </div>
  );
}

function ClosedNotice() {
  return (
    <div className="flex justify-center my-3">
      <div className="max-w-[85%] text-center bg-[#FCF4CB] text-gray-700 px-4 py-2 rounded-lg shadow-sm text-[12px] leading-relaxed">
        This chat has been closed. If you want to reopen it, just send a message again.
      </div>
    </div>
  );
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface Props {
  initialTickets: SupportTicket[];
}

// WhatsApp-style album of one or more images inside a chat bubble.
function ChatImages({
  images,
  onZoom,
  uploading = false,
  progress,
}: {
  images: { _id: string; url: string }[];
  onZoom: (url: string) => void;
  uploading?: boolean;
  progress?: { done: number; total: number } | null;
}) {
  if (!images || images.length === 0) return null;
  const isGrid = images.length > 1;
  return (
    <div
      className={`mb-1 ${isGrid ? 'grid grid-cols-2 gap-1' : ''}`}
      style={{ maxWidth: isGrid ? 260 : 240 }}
    >
      {images.map((img) => (
        <div
          key={img._id}
          className={`relative overflow-hidden rounded-md bg-black/5 ${isGrid ? 'aspect-square' : ''}`}
        >
          <button type="button" onClick={() => !uploading && onZoom(img.url)} className="block h-full w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.url}
              alt="attachment"
              className={`${isGrid ? 'h-full w-full object-cover' : 'max-h-72 w-full object-cover rounded-md'} ${uploading ? 'blur-[1px]' : ''}`}
            />
          </button>
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <Loader2 className="h-7 w-7 text-white animate-spin" />
            </div>
          )}
        </div>
      ))}
      {uploading && progress && (
        <div className="col-span-2 text-[11px] text-gray-600 mt-0.5 flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Uploading {progress.done}/{progress.total}…
        </div>
      )}
    </div>
  );
}

function MessageTime({ date }: { date: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <>
      {new Date(date).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })}
    </>
  );
}

export default function AdminSupportClient({ initialTickets }: Props) {
  const { toast } = useToast();
  const [tickets, setTickets] = useState<SupportTicket[]>(initialTickets);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [reply, setReply] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [search, setSearch] = useState('');
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [stagedImages, setStagedImages] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [activeBlocked, setActiveBlocked] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Guards the poll from clobbering an in-flight optimistic send.
  const sendingRef = useRef(false);

  // Scroll only the inner messages box, never the whole admin page.
  const scrollToBottom = useCallback((smooth = true) => {
    const el = messagesContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    }
  }, []);

  useEffect(() => {
    if (activeTicket) {
      requestAnimationFrame(() => scrollToBottom(false));
    }
  }, [activeTicket?.messages.length, scrollToBottom]);

  const refreshList = useCallback(async () => {
    const fresh = await getAllTicketsForAdmin();
    setTickets(fresh);
  }, []);

  // Poll the open ticket + the list so new user messages show up live.
  useEffect(() => {
    if (activeId) {
      pollRef.current = setInterval(async () => {
        if (sendingRef.current) return; // don't clobber an in-flight send
        const fresh = await getTicketForAdmin(activeId);
        if (sendingRef.current) return;
        if (fresh) {
          setActiveTicket(fresh);
          if (fresh.adminUnread > 0) markTicketReadByAdmin(activeId);
        }
        refreshList();
      }, 5000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeId, refreshList]);

  const openTicket = async (ticket: SupportTicket) => {
    const id = ticket._id.toString();
    setActiveId(id);
    setStagedImages([]);
    setReply('');
    const fresh = await getTicketForAdmin(id);
    setActiveTicket(fresh || ticket);
    setActiveBlocked(await getSupportBlockStatus((fresh || ticket).gamingId));
    if ((fresh || ticket).adminUnread > 0) {
      await markTicketReadByAdmin(id);
      setTickets((prev) => prev.map((t) => (t._id.toString() === id ? { ...t, adminUnread: 0 } : t)));
    }
  };

  const handleDelete = async () => {
    if (!activeTicket) return;
    setIsDeleting(true);
    const result = await deleteTicket(activeTicket._id.toString());
    setIsDeleting(false);
    setShowDeleteDialog(false);
    if (result.success) {
      toast({ title: 'Deleted', description: result.message });
      const id = activeTicket._id.toString();
      setActiveId(null);
      setActiveTicket(null);
      setTickets((prev) => prev.filter((t) => t._id.toString() !== id));
      refreshList();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
  };

  const handleToggleBlock = async () => {
    if (!activeTicket) return;
    const gamingId = activeTicket.gamingId;
    if (activeBlocked) {
      const result = await unblockSupportUser(gamingId);
      if (result.success) {
        setActiveBlocked(false);
        toast({ title: 'Unblocked', description: result.message });
      }
    } else {
      const result = await blockSupportUser(gamingId);
      if (result.success) {
        setActiveBlocked(true);
        toast({ title: 'Blocked', description: result.message });
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const accepted: string[] = [];
    let rejectedForSize = false;
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > MAX_IMAGE_BYTES) {
        rejectedForSize = true;
        continue;
      }
      try {
        accepted.push(await fileToDataUri(file));
      } catch {
        /* ignore */
      }
    }
    if (rejectedForSize) {
      toast({ variant: 'destructive', title: 'Image too large', description: 'Max 8 MB images are supported.' });
    }
    if (accepted.length > 0) {
      setStagedImages((prev) => [...prev, ...accepted]);
    }
  };

  const removeStagedImage = (index: number) => {
    setStagedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleReply = async () => {
    if (!activeTicket) return;
    const id = activeTicket._id.toString();
    const text = reply.trim();
    const imagesToSend = [...stagedImages];

    if (!text && imagesToSend.length === 0) return;

    setIsSending(true);
    sendingRef.current = true;

    // --- Send images (if any) ---
    if (imagesToSend.length > 0) {
      const optimistic: SupportTicket = {
        ...activeTicket,
        messages: [
          ...activeTicket.messages,
          {
            _id: `temp-${Date.now()}` as any,
            sender: 'admin',
            text,
            images: imagesToSend.map((url, i) => ({ _id: `temp-img-${i}`, url })),
            uploading: true,
            createdAt: new Date().toISOString() as any,
          } as SupportMessage,
        ],
        lastSenderRole: 'admin',
      };
      setActiveTicket(optimistic);
      setReply('');
      setStagedImages([]);
      setUploadProgress({ done: 0, total: imagesToSend.length });

      const uploadedIds: string[] = [];
      for (const uri of imagesToSend) {
        const up = await uploadAdminImage(id, uri);
        if (up.success && up.imageId) {
          uploadedIds.push(up.imageId);
          setUploadProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
        } else {
          toast({ variant: 'destructive', title: 'Could not send image', description: up.message });
          break;
        }
      }

      if (uploadedIds.length > 0) {
        await sendAdminImageMessage(id, uploadedIds, text);
      }

      const fresh = await getTicketForAdmin(id);
      if (fresh) setActiveTicket(fresh);
      setUploadProgress(null);
      refreshList();
      sendingRef.current = false;
      setIsSending(false);
      return;
    }

    // --- Text-only reply ---
    const optimistic: SupportTicket = {
      ...activeTicket,
      messages: [
        ...activeTicket.messages,
        {
          _id: `temp-${Date.now()}` as any,
          sender: 'admin',
          text,
          createdAt: new Date().toISOString() as any,
        } as SupportMessage,
      ],
      lastSenderRole: 'admin',
    };
    setActiveTicket(optimistic);
    setReply('');

    const result = await sendAdminReply(id, text);

    if (result.success) {
      const fresh = await getTicketForAdmin(id);
      if (fresh) setActiveTicket(fresh);
      refreshList();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    sendingRef.current = false;
    setIsSending(false);
  };

  const handleToggleStatus = async () => {
    if (!activeTicket) return;
    const id = activeTicket._id.toString();
    const next = activeTicket.status === 'open' ? 'closed' : 'open';
    await setTicketStatus(id, next);
    const fresh = await getTicketForAdmin(id);
    if (fresh) setActiveTicket(fresh);
    refreshList();
  };

  const filtered = tickets.filter((t) => {
    const q = search.toLowerCase();
    return (
      !q ||
      t.subject.toLowerCase().includes(q) ||
      t.gamingId.toLowerCase().includes(q) ||
      (t.visualGamingId || '').toLowerCase().includes(q)
    );
  });

  const totalUnread = tickets.reduce((sum, t) => sum + (t.adminUnread || 0), 0);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Inbox className="h-6 w-6" /> Support Inbox
          {totalUnread > 0 && (
            <span className="h-6 min-w-6 px-2 rounded-full bg-destructive text-destructive-foreground text-sm flex items-center justify-center">
              {totalUnread}
            </span>
          )}
        </h1>
        <p className="text-muted-foreground text-sm">User reports and live chat. Replies appear to the user instantly.</p>
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-[340px_1fr] h-[75vh] min-h-0">
          {/* Ticket list */}
          <div className={`border-r flex-col min-h-0 overflow-hidden ${activeId ? 'hidden md:flex' : 'flex'}`}>
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search subject or Gaming ID"
                  className="pl-8"
                />
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="text-center text-muted-foreground py-16 text-sm">No reports found.</div>
              ) : (
                filtered.map((ticket) => {
                  const id = ticket._id.toString();
                  const last = ticket.messages[ticket.messages.length - 1];
                  return (
                    <button
                      key={id}
                      onClick={() => openTicket(ticket)}
                      className={`w-full text-left flex items-center gap-3 p-3 border-b hover:bg-muted/60 transition-colors ${
                        activeId === id ? 'bg-muted' : ''
                      }`}
                    >
                      <div className="relative h-10 w-10 rounded-full bg-[#075E54] flex items-center justify-center overflow-hidden shrink-0">
                        <Image src="/img/garena.png" alt="" width={24} height={24} className="object-contain" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold truncate text-sm">{ticket.subject}</span>
                          {ticket.adminUnread > 0 && (
                            <span className="shrink-0 h-5 min-w-5 px-1.5 rounded-full bg-[#25D366] text-white text-xs font-bold flex items-center justify-center">
                              {ticket.adminUnread}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {ticket.visualGamingId || ticket.gamingId}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {last
                            ? `${last.sender === 'admin' ? 'You: ' : ''}${
                                last.text || (last.imageIds && last.imageIds.length > 0 ? '📷 Photo' : '')
                              }`
                            : ''}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Conversation */}
          <div className={`flex-col min-h-0 overflow-hidden ${activeId ? 'flex' : 'hidden md:flex'}`}>
            {!activeTicket ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Inbox className="h-12 w-12 mx-auto mb-2 opacity-40" />
                  <p>Select a report to view the conversation.</p>
                </div>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="flex items-center gap-3 bg-[#075E54] text-white px-3 py-2.5">
                  <button
                    onClick={() => { setActiveId(null); setActiveTicket(null); setStagedImages([]); setReply(''); }}
                    className="md:hidden p-1 -ml-1 rounded-full hover:bg-white/10"
                    aria-label="Back"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <div className="relative h-10 w-10 rounded-full bg-white flex items-center justify-center overflow-hidden">
                    <Image src="/img/garena.png" alt="" width={30} height={30} className="object-contain" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[15px] truncate flex items-center gap-1.5">
                      {activeTicket.subject}
                      {activeBlocked && (
                        <span className="text-[10px] font-normal bg-red-600 text-white px-1.5 py-0.5 rounded">
                          Blocked
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-white/80 truncate">
                      {activeTicket.visualGamingId || activeTicket.gamingId} · {activeTicket.status}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleToggleStatus}
                    className="h-8"
                  >
                    {activeTicket.status === 'open' ? (
                      <><Lock className="h-3.5 w-3.5 mr-1" /> Close</>
                    ) : (
                      <><Unlock className="h-3.5 w-3.5 mr-1" /> Reopen</>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setShowDeleteDialog(true)}
                    className="h-8"
                    title="Delete report"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {activeBlocked ? (
                        <DropdownMenuItem onClick={handleToggleBlock}>
                          <ShieldCheck className="h-4 w-4 mr-2 text-green-600" />
                          Unblock from support
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={handleToggleBlock} className="text-destructive focus:text-destructive">
                          <Ban className="h-4 w-4 mr-2" />
                          Block from support
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Messages */}
                <div
                  ref={messagesContainerRef}
                  className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-1.5"
                  style={{ backgroundColor: '#ECE5DD' }}
                >
                  {activeTicket.messages.map((msg, idx) => {
                    const isAdmin = msg.sender === 'admin';
                    const prev = idx > 0 ? activeTicket.messages[idx - 1] : null;
                    const showDate =
                      !prev || !isSameDay(new Date(prev.createdAt as any), new Date(msg.createdAt as any));
                    return (
                      <Fragment key={msg._id?.toString() || idx}>
                        {showDate && <DateSeparator date={msg.createdAt as any} />}
                        <div className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`relative max-w-[75%] p-1 rounded-lg shadow-sm text-[14px] leading-snug ${
                              isAdmin ? 'bg-[#DCF8C6] rounded-tr-none' : 'bg-white rounded-tl-none'
                            }`}
                          >
                            {/* Sender label always on top, above any image */}
                            <div className="px-1.5 pt-0.5">
                              <span className={`block text-[12px] font-semibold mb-0.5 ${isAdmin ? 'text-[#075E54]' : 'text-blue-700'}`}>
                                {isAdmin ? 'You (Garena)' : (activeTicket.visualGamingId || activeTicket.gamingId)}
                              </span>
                            </div>
                            {msg.images && msg.images.length > 0 && (
                              <ChatImages
                                images={msg.images}
                                onZoom={(url) => setZoomedImage(url)}
                                uploading={(msg as any).uploading}
                                progress={(msg as any).uploading ? uploadProgress : null}
                              />
                            )}
                            <div className="px-1.5 pb-1">
                              {msg.text && <span className="whitespace-pre-wrap break-words">{msg.text}</span>}
                              <span className="float-right ml-2 mt-1 text-[10px] text-gray-500 flex items-center gap-0.5">
                                <MessageTime date={msg.createdAt as any} />
                                {isAdmin &&
                                  (activeTicket.userLastReadAt &&
                                  new Date(activeTicket.userLastReadAt).getTime() >=
                                    new Date(msg.createdAt as any).getTime() ? (
                                    // The user genuinely viewed the chat after this reply → seen.
                                    <CheckCheck className="h-3 w-3 text-[#34B7F1]" />
                                  ) : (
                                    // Delivered, but the user hasn't opened it yet → grey double tick.
                                    <CheckCheck className="h-3 w-3 text-gray-400" />
                                  ))}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Fragment>
                    );
                  })}

                  {activeTicket.status === 'closed' && <ClosedNotice />}
                </div>

                {/* Staged image previews (before sending) */}
                {stagedImages.length > 0 && (
                  <div className="bg-[#F0F0F0] border-t px-2.5 pt-2.5 flex gap-2 overflow-x-auto">
                    {stagedImages.map((uri, i) => (
                      <div key={i} className="relative shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={uri} alt="preview" className="h-16 w-16 object-cover rounded-md border" />
                        <button
                          onClick={() => removeStagedImage(i)}
                          className="absolute -top-1.5 -right-1.5 bg-black/70 text-white rounded-full p-0.5"
                          aria-label="Remove image"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Reply bar */}
                <div className="flex items-end gap-2 bg-[#F0F0F0] px-2.5 py-2 border-t">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    size="icon"
                    variant="ghost"
                    title="Attach images"
                    className="h-11 w-11 rounded-full shrink-0 text-[#075E54] hover:bg-black/5"
                  >
                    <ImagePlus className="h-5 w-5" />
                  </Button>
                  <Textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleReply();
                      }
                    }}
                    placeholder="Type your reply..."
                    rows={1}
                    className="flex-1 resize-none bg-white rounded-full px-4 py-2 min-h-[42px] max-h-32 border-0 focus-visible:ring-0 text-[14px]"
                  />
                  <Button
                    onClick={handleReply}
                    disabled={isSending || (!reply.trim() && stagedImages.length === 0)}
                    size="icon"
                    className="h-11 w-11 rounded-full bg-[#075E54] hover:bg-[#0a7d6f] shrink-0"
                  >
                    {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Full-screen image viewer */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setZoomedImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white p-2"
            onClick={() => setZoomedImage(null)}
            aria-label="Close"
          >
            <X className="h-7 w-7" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoomedImage} alt="attachment" className="max-h-full max-w-full object-contain rounded" />
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this report?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the whole report and its images from the database. It will also
              disappear from the user&apos;s support page. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
