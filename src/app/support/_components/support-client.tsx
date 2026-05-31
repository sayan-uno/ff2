'use client';

import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  Plus,
  Send,
  Loader2,
  MessageSquarePlus,
  CheckCheck,
  ImagePlus,
  X,
} from 'lucide-react';
import {
  createTicket,
  getMyTickets,
  getMyTicket,
  sendUserMessage,
  markTicketReadByUser,
  uploadSupportImage,
  sendUserImageMessage,
  getImageQuota,
} from '../actions';
import type { SupportTicket, SupportMessage } from '@/lib/support-definitions';
import GamingIdModal from '@/components/gaming-id-modal';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_LIMIT_PER_HOUR = 10;

// Read a File as a base64 data URI.
function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// WhatsApp-style album of one or more images inside a chat bubble.
// While `uploading` is true, a dimming overlay + spinner (and optional
// progress) is shown so the user knows the upload is in flight.
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
          <button
            type="button"
            onClick={() => !uploading && onZoom(img.url)}
            className="block h-full w-full"
          >
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

interface SupportClientProps {
  initialUser: { gamingId: string; visualGamingId?: string } | null;
  initialTickets: SupportTicket[];
}

// Whether two dates fall on the same calendar day (device local time).
function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// WhatsApp-style day label: "Today", "Yesterday", or a full date.
function dayLabel(dateString: string) {
  const d = new Date(dateString);
  const today = new Date();
  if (isSameDay(d, today)) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Centered date chip shown between messages from different days.
function DateSeparator({ date }: { date: string }) {
  return (
    <div className="flex justify-center my-2">
      <span className="text-[11px] bg-[#E1F2FB] text-gray-600 px-3 py-1 rounded-md shadow-sm">
        {dayLabel(date)}
      </span>
    </div>
  );
}

// Centered "chat closed" notice.
function ClosedNotice() {
  return (
    <div className="flex justify-center my-3">
      <div className="max-w-[85%] text-center bg-[#FCF4CB] text-gray-700 px-4 py-2 rounded-lg shadow-sm text-[12px] leading-relaxed">
        This chat has been closed. If you want to reopen it, just send a message again.
      </div>
    </div>
  );
}

type View = 'list' | 'new' | 'chat';

// Format a timestamp like WhatsApp (only after mount to avoid hydration issues).
function MessageTime({ date }: { date: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <>
      {new Date(date).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })}
    </>
  );
}

// The chat header that mimics a WhatsApp contact: Garena logo + name + bluetick.
function ChatHeader({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex items-center gap-3 bg-[#075E54] text-white px-3 py-2.5 shadow-md">
      <button
        onClick={onBack}
        className="p-1 -ml-1 rounded-full hover:bg-white/10 transition-colors"
        aria-label="Back"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div className="relative h-10 w-10 rounded-full bg-white flex items-center justify-center overflow-hidden ring-2 ring-white/30">
        <Image src="/img/garena.png" alt="Garena" width={32} height={32} className="object-contain" />
      </div>
      <div className="flex flex-col leading-tight">
        <div className="flex items-center gap-1">
          <span className="font-semibold text-[15px]">Garena</span>
          <Image src="/img/bluetick.gif" alt="Verified" width={16} height={16} className="h-4 w-4" />
        </div>
        <span className="text-[11px] text-white/80">Official Support</span>
      </div>
    </div>
  );
}

export default function SupportClient({ initialUser, initialTickets }: SupportClientProps) {
  const { toast } = useToast();
  const [view, setView] = useState<View>('list');
  const [tickets, setTickets] = useState<SupportTicket[]>(initialTickets);
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);

  // New report compose state
  const [newMessage, setNewMessage] = useState('');

  // Chat input state
  const [chatInput, setChatInput] = useState('');

  const [isSending, setIsSending] = useState(false);

  // Image attachment state
  const [stagedImages, setStagedImages] = useState<string[]>([]); // data URIs staged to send (chat)
  const [newImages, setNewImages] = useState<string[]>([]);       // data URIs staged in the create form
  const [imageRemaining, setImageRemaining] = useState<number>(IMAGE_LIMIT_PER_HOUR);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  // Upload progress for the optimistic image message ({ done, total }).
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newFileInputRef = useRef<HTMLInputElement>(null);
  const newTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Login popup (shown only when a logged-out user tries to create a report).
  const [showLogin, setShowLogin] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const listPollRef = useRef<NodeJS.Timeout | null>(null);
  // True while a send/upload is in progress, so the poll won't overwrite
  // the optimistic message (which caused images to flicker/vanish).
  const sendingRef = useRef(false);

  // Scroll only the inner messages box to the bottom (never the whole page).
  const scrollToBottom = useCallback((smooth = true) => {
    const el = messagesContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    }
  }, []);

  // Auto scroll when the active conversation changes / grows.
  useEffect(() => {
    if (view === 'chat') {
      // Defer so the DOM has painted the new messages before we scroll.
      requestAnimationFrame(() => scrollToBottom(false));
    }
  }, [activeTicket?.messages.length, view, scrollToBottom]);

  // Poll the open ticket every 5s so admin replies appear automatically.
  useEffect(() => {
    if (view === 'chat' && activeTicket) {
      const ticketId = activeTicket._id.toString();
      pollRef.current = setInterval(async () => {
        if (sendingRef.current) return; // don't clobber an in-flight send
        const fresh = await getMyTicket(ticketId);
        if (sendingRef.current) return; // a send started while we were fetching
        if (fresh) {
          setActiveTicket(fresh);
          if (fresh.userUnread > 0) {
            markTicketReadByUser(ticketId);
          }
        }
      }, 5000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [view, activeTicket?._id]);

  const refreshList = useCallback(async () => {
    const fresh = await getMyTickets();
    setTickets(fresh);
  }, []);

  const refreshQuota = useCallback(async () => {
    const quota = await getImageQuota();
    setImageRemaining(quota.remaining);
  }, []);

  // Refresh the image quota whenever a chat or the create form is open (and
  // every minute, so the button re-enables once the rolling hour passes).
  useEffect(() => {
    if (view === 'chat' || view === 'new') {
      refreshQuota();
      const id = setInterval(refreshQuota, 60000);
      return () => clearInterval(id);
    }
  }, [view, activeTicket?._id, refreshQuota]);

  // While viewing the report list, poll so admin replies / unread badges
  // show up live without the user manually refreshing the page.
  useEffect(() => {
    if (view === 'list') {
      listPollRef.current = setInterval(() => {
        refreshList();
      }, 5000);
    }
    return () => {
      if (listPollRef.current) clearInterval(listPollRef.current);
    };
  }, [view, refreshList]);

  // Auto-focus the textarea when the create-report form opens, so the
  // mobile keyboard comes up and the user knows to start typing.
  useEffect(() => {
    if (view === 'new') {
      const t = setTimeout(() => newTextareaRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [view]);

  // If we arrived with ?ticket=<id> (e.g. from the refund form), open that
  // report's chat directly so the user lands in the inbox.
  useEffect(() => {
    if (typeof window === 'undefined' || !initialUser) return;
    const ticketId = new URLSearchParams(window.location.search).get('ticket');
    if (!ticketId) return;
    (async () => {
      const fresh = await getMyTicket(ticketId);
      if (fresh) {
        setActiveTicket(fresh);
        setView('chat');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openTicket = useCallback(async (ticket: SupportTicket) => {
    setActiveTicket(ticket);
    setView('chat');
    const ticketId = ticket._id.toString();
    if (ticket.userUnread > 0) {
      await markTicketReadByUser(ticketId);
      setTickets((prev) =>
        prev.map((t) => (t._id.toString() === ticketId ? { ...t, userUnread: 0 } : t))
      );
    }
  }, []);

  const handleCreate = async () => {
    if (!newMessage.trim()) {
      toast({ variant: 'destructive', title: 'Empty message', description: 'Please write a message.' });
      return;
    }
    setIsSending(true);
    // Reports created here are named "Support Report 1", "Support Report 2", ...
    const result = await createTicket(newMessage, 'Support Report');

    if (!result.success || !result.ticketId) {
      setIsSending(false);
      toast({ variant: 'destructive', title: 'Error', description: result.message });
      return;
    }

    const ticketId = result.ticketId;

    // Upload any images attached to the create form, then post them.
    const imagesToSend = [...newImages];
    if (imagesToSend.length > 0) {
      const uploadedIds: string[] = [];
      for (const uri of imagesToSend) {
        const up = await uploadSupportImage(ticketId, uri);
        if (up.success && up.imageId) {
          uploadedIds.push(up.imageId);
        } else {
          toast({ variant: 'destructive', title: 'Could not send image', description: up.message });
          break;
        }
      }
      if (uploadedIds.length > 0) {
        await sendUserImageMessage(ticketId, uploadedIds, '');
      }
      await refreshQuota();
    }

    setNewMessage('');
    setNewImages([]);
    setIsSending(false);

    const fresh = await getMyTicket(ticketId);
    await refreshList();
    if (fresh) {
      setActiveTicket(fresh);
      setView('chat');
    } else {
      setView('list');
    }
  };

  // Validate + stage images chosen in the create-report form.
  const handleNewFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const capacity = imageRemaining - newImages.length;
    if (capacity <= 0) {
      toast({ variant: 'destructive', title: 'Image limit reached', description: 'You can only send 10 images in every hour.' });
      return;
    }

    const accepted: string[] = [];
    let rejectedForSize = false;
    let rejectedForLimit = false;
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > MAX_IMAGE_BYTES) {
        rejectedForSize = true;
        continue;
      }
      if (accepted.length >= capacity) {
        rejectedForLimit = true;
        break;
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
    if (rejectedForLimit) {
      toast({ variant: 'destructive', title: 'Image limit reached', description: 'You can only send 10 images in every hour.' });
    }
    if (accepted.length > 0) setNewImages((prev) => [...prev, ...accepted]);
  };

  // Open the device file picker (or warn if the hourly image limit is reached).
  const handleAttachClick = () => {
    if (imageRemaining <= 0) {
      toast({
        variant: 'destructive',
        title: 'Image limit reached',
        description: 'You can only send 10 images in every hour.',
      });
      return;
    }
    fileInputRef.current?.click();
  };

  // Validate + stage the chosen images (8MB cap + hourly limit).
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // allow re-selecting the same file later
    if (files.length === 0) return;

    const capacity = imageRemaining - stagedImages.length;
    if (capacity <= 0) {
      toast({
        variant: 'destructive',
        title: 'Image limit reached',
        description: 'You can only send 10 images in every hour.',
      });
      return;
    }

    const accepted: string[] = [];
    let rejectedForSize = false;
    let rejectedForLimit = false;

    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > MAX_IMAGE_BYTES) {
        rejectedForSize = true;
        continue;
      }
      if (accepted.length >= capacity) {
        rejectedForLimit = true;
        break;
      }
      try {
        accepted.push(await fileToDataUri(file));
      } catch {
        /* ignore unreadable file */
      }
    }

    if (rejectedForSize) {
      toast({
        variant: 'destructive',
        title: 'Image too large',
        description: 'Max 8 MB images are supported.',
      });
    }
    if (rejectedForLimit) {
      toast({
        variant: 'destructive',
        title: 'Image limit reached',
        description: 'You can only send 10 images in every hour.',
      });
    }
    if (accepted.length > 0) {
      setStagedImages((prev) => [...prev, ...accepted]);
    }
  };

  const removeStagedImage = (index: number) => {
    setStagedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (!activeTicket) return;
    const ticketId = activeTicket._id.toString();
    const text = chatInput.trim();
    const imagesToSend = [...stagedImages];

    if (!text && imagesToSend.length === 0) return;

    setIsSending(true);
    sendingRef.current = true;

    // --- Send images (if any) ---
    if (imagesToSend.length > 0) {
      const tempId = `temp-${Date.now()}`;
      // Optimistically show the album immediately (stays visible while uploading).
      const optimistic: SupportTicket = {
        ...activeTicket,
        messages: [
          ...activeTicket.messages,
          {
            _id: tempId as any,
            sender: 'user',
            text,
            images: imagesToSend.map((url, i) => ({ _id: `temp-img-${i}`, url })),
            uploading: true,
            createdAt: new Date().toISOString() as any,
          } as SupportMessage,
        ],
        lastSenderRole: 'user',
      };
      setActiveTicket(optimistic);
      setChatInput('');
      setStagedImages([]);
      setUploadProgress({ done: 0, total: imagesToSend.length });

      // Upload each image one at a time, then post a single message.
      const uploadedIds: string[] = [];
      for (const uri of imagesToSend) {
        const up = await uploadSupportImage(ticketId, uri);
        if (up.success && up.imageId) {
          uploadedIds.push(up.imageId);
          setUploadProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
        } else {
          toast({ variant: 'destructive', title: 'Could not send image', description: up.message });
          break; // stop on the first failure (e.g. hit the hourly limit)
        }
      }

      if (uploadedIds.length > 0) {
        await sendUserImageMessage(ticketId, uploadedIds, text);
      }

      const fresh = await getMyTicket(ticketId);
      if (fresh) setActiveTicket(fresh);
      setUploadProgress(null);
      await refreshQuota();
      refreshList();
      sendingRef.current = false;
      setIsSending(false);
      return;
    }

    // --- Text-only message ---
    const optimistic: SupportTicket = {
      ...activeTicket,
      messages: [
        ...activeTicket.messages,
        {
          _id: `temp-${Date.now()}` as any,
          sender: 'user',
          text,
          createdAt: new Date().toISOString() as any,
        } as SupportMessage,
      ],
      lastSenderRole: 'user',
    };
    setActiveTicket(optimistic);
    setChatInput('');

    const result = await sendUserMessage(ticketId, text);

    if (result.success) {
      const fresh = await getMyTicket(ticketId);
      if (fresh) setActiveTicket(fresh);
      refreshList();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    sendingRef.current = false;
    setIsSending(false);
  };

  // Open the create-report form, but require login first for logged-out users.
  const handleCreateReportClick = () => {
    if (!initialUser) {
      setShowLogin(true);
      return;
    }
    setView('new');
  };

  // -------------------------------------------------------------------------
  // CHAT VIEW (WhatsApp-style)
  // -------------------------------------------------------------------------
  if (view === 'chat' && activeTicket) {
    return (
      // Full-screen overlay: covers the site header & footer so the chat
      // behaves like a real messaging app and only the messages scroll.
      // h-[100dvh] adapts to the device's actual visible screen height.
      <div className="fixed inset-0 z-[60] bg-[#ECE5DD] flex justify-center">
        <div className="flex flex-col w-full max-w-2xl h-[100dvh] min-h-0 bg-[#ECE5DD] sm:border-x sm:shadow-2xl">
          <ChatHeader onBack={() => { setView('list'); setActiveTicket(null); setStagedImages([]); setChatInput(''); refreshList(); }} />

          {/* Messages area with WhatsApp-like background */}
          <div
            ref={messagesContainerRef}
            className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-1.5"
            style={{
              backgroundColor: '#ECE5DD',
              backgroundImage:
                'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2740%27 height=%2740%27 viewBox=%270 0 40 40%27%3E%3Cg fill=%27%23d9cfc4%27 fill-opacity=%270.35%27%3E%3Cpath d=%27M0 38h2v2H0zM38 0h2v2h-2z%27/%3E%3C/g%3E%3C/svg%3E")',
            }}
          >
            <div className="flex justify-center mb-2">
              <span className="text-[11px] bg-[#FCF4CB] text-gray-600 px-3 py-1 rounded-md shadow-sm">
                {activeTicket.subject}
              </span>
            </div>

            {/* System notice shown in the middle of the chat for every report */}
            <div className="flex justify-center mb-3">
              <div className="max-w-[88%] text-center bg-white/95 text-gray-700 px-4 py-3 rounded-xl shadow-sm border border-gray-200">
                <p className="text-[13px] font-semibold text-[#075E54] mb-1 flex items-center justify-center gap-1.5">
                  <CheckCheck className="h-4 w-4" /> Report Created
                </p>
                <p className="text-[12.5px] leading-relaxed">
                  Our customer support team will reach out to you soon after reviewing and identifying
                  your issue. Our typical reply time is within{' '}
                  <span className="font-semibold">32 working hours</span>. Thank you for your patience.
                </p>
              </div>
            </div>

            {activeTicket.messages.map((msg, idx) => {
              const isUser = msg.sender === 'user';
              const prev = idx > 0 ? activeTicket.messages[idx - 1] : null;
              const showDate =
                !prev || !isSameDay(new Date(prev.createdAt as any), new Date(msg.createdAt as any));
              return (
                <Fragment key={msg._id?.toString() || idx}>
                  {showDate && <DateSeparator date={msg.createdAt as any} />}
                  <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`relative max-w-[78%] p-1 rounded-lg shadow-sm text-[14px] leading-snug ${
                        isUser
                          ? 'bg-[#DCF8C6] text-gray-900 rounded-tr-none'
                          : 'bg-white text-gray-900 rounded-tl-none'
                      }`}
                    >
                      {!isUser && (
                        <div className="px-1.5 pt-0.5">
                          <span className="block text-[12px] font-semibold text-[#075E54] mb-0.5">
                            Garena Support
                          </span>
                        </div>
                      )}
                      {msg.images && msg.images.length > 0 && (
                        <ChatImages
                          images={msg.images}
                          onZoom={(url) => setZoomedImage(url)}
                          uploading={(msg as any).uploading}
                          progress={(msg as any).uploading ? uploadProgress : null}
                        />
                      )}
                      <div className="px-1.5 pb-1 pt-0.5">
                        {msg.text && (
                          <span className="whitespace-pre-wrap break-words">{msg.text}</span>
                        )}
                        <span className="float-right ml-2 mt-1 text-[10px] text-gray-500 flex items-center gap-0.5">
                          <MessageTime date={msg.createdAt as any} />
                          {isUser && <CheckCheck className="h-3 w-3 text-[#34B7F1]" />}
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

          {/* Input bar */}
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
              onClick={handleAttachClick}
              size="icon"
              variant="ghost"
              title={imageRemaining > 0 ? `Attach images (${imageRemaining} left this hour)` : 'You can only send 10 images in every hour'}
              className={`h-11 w-11 rounded-full shrink-0 text-[#075E54] hover:bg-black/5 ${imageRemaining <= 0 ? 'opacity-40' : ''}`}
            >
              <ImagePlus className="h-5 w-5" />
            </Button>
            <Textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Type a message"
              rows={1}
              className="flex-1 resize-none bg-white rounded-full px-4 py-2 min-h-[42px] max-h-32 border-0 focus-visible:ring-0 text-[14px]"
            />
            <Button
              onClick={handleSend}
              disabled={isSending || (!chatInput.trim() && stagedImages.length === 0)}
              size="icon"
              className="h-11 w-11 rounded-full bg-[#075E54] hover:bg-[#0a7d6f] shrink-0"
            >
              {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </Button>
          </div>
        </div>

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
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // NEW REPORT VIEW
  // -------------------------------------------------------------------------
  if (view === 'new') {
    return (
      <div className="container mx-auto px-6 py-10 max-w-xl">
        <Button variant="ghost" className="mb-4 -ml-2" onClick={() => { setNewImages([]); setView('list'); }}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <Card className="overflow-hidden">
          {/* Branded header */}
          <div className="bg-[#075E54] text-white p-6 flex items-center gap-3">
            <div className="relative h-12 w-12 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0">
              <Image src="/img/garena.png" alt="Garena" width={32} height={32} className="object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-xl font-bold font-headline">Create a Report</h1>
                <Image src="/img/bluetick.gif" alt="Verified" width={18} height={18} className="h-[18px] w-[18px]" />
              </div>
              <p className="text-sm text-white/80">Describe your issue and our team will help you.</p>
            </div>
          </div>

          <div className="p-6 space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <MessageSquarePlus className="h-4 w-4 text-primary" />
                Describe your issue
              </label>
              <Textarea
                ref={newTextareaRef}
                autoFocus
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Please describe your issue in as much detail as possible — include your order, payment UTR, or Free Fire ID if related. The more details you share, the faster we can help you."
                rows={7}
                maxLength={2000}
                className="resize-none text-[15px] leading-relaxed"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Be clear and specific so we can resolve it quickly.</span>
                <span>{newMessage.length}/2000</span>
              </div>
            </div>

            {/* Attach images */}
            <div className="space-y-2">
              <input
                ref={newFileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleNewFileSelect}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (imageRemaining <= 0) {
                    toast({ variant: 'destructive', title: 'Image limit reached', description: 'You can only send 10 images in every hour.' });
                    return;
                  }
                  newFileInputRef.current?.click();
                }}
                className={`w-full ${imageRemaining <= 0 ? 'opacity-40' : ''}`}
              >
                <ImagePlus className="h-4 w-4 mr-2" />
                Attach Images
              </Button>
              {newImages.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {newImages.map((uri, i) => (
                    <div key={i} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={uri} alt="preview" className="h-16 w-16 object-cover rounded-md border" />
                      <button
                        type="button"
                        onClick={() => setNewImages((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute -top-1.5 -right-1.5 bg-black/70 text-white rounded-full p-0.5"
                        aria-label="Remove image"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button onClick={handleCreate} disabled={isSending || !newMessage.trim()} size="lg" className="w-full">
              {isSending ? (
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              ) : (
                <Send className="h-5 w-5 mr-2" />
              )}
              Send Report
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // LIST VIEW (the "blank page with create report option")
  // -------------------------------------------------------------------------
  return (
    <div className="container mx-auto px-6 py-10 max-w-2xl">
      <div className="flex items-center gap-3 mb-2">
        <div className="relative h-12 w-12 rounded-full bg-white border flex items-center justify-center overflow-hidden">
          <Image src="/img/garena.png" alt="Garena" width={32} height={32} className="object-contain" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-2xl font-bold font-headline">Garena Support</h1>
            <Image src="/img/bluetick.gif" alt="Verified" width={20} height={20} className="h-5 w-5" />
          </div>
          <p className="text-sm text-muted-foreground">
            {initialUser
              ? `Logged in as ${initialUser.visualGamingId || initialUser.gamingId}`
              : 'Create a report and chat with our team'}
          </p>
        </div>
      </div>

      <Button onClick={handleCreateReportClick} className="w-full my-6" size="lg">
        <Plus className="h-5 w-5 mr-2" /> Create Report
      </Button>

      {tickets.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MessageSquarePlus className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No reports yet</p>
          <p className="text-sm">Create a report and our team will reply here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">
            Your Reports
          </h2>
          {tickets.map((ticket) => {
            const last = ticket.messages[ticket.messages.length - 1];
            return (
              <button
                key={ticket._id.toString()}
                onClick={() => openTicket(ticket)}
                className="w-full text-left flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-muted/60 transition-colors"
              >
                <div className="relative h-12 w-12 rounded-full bg-white border flex items-center justify-center overflow-hidden shrink-0">
                  <Image src="/img/garena.png" alt="Garena" width={28} height={28} className="object-contain" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold truncate flex items-center gap-1">
                      {ticket.subject}
                      {ticket.status === 'closed' && (
                        <span className="text-[10px] font-normal text-muted-foreground border rounded px-1">
                          Closed
                        </span>
                      )}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {last
                      ? `${last.sender === 'admin' ? 'Garena: ' : 'You: '}${
                          last.text || (last.imageIds && last.imageIds.length > 0 ? '📷 Photo' : '')
                        }`
                      : 'No messages'}
                  </p>
                </div>
                {ticket.userUnread > 0 && (
                  <span className="shrink-0 h-5 min-w-5 px-1.5 rounded-full bg-[#25D366] text-white text-xs font-bold flex items-center justify-center">
                    {ticket.userUnread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Login popup — dismissible, shown only when a logged-out user taps
          "Create Report". The modal reloads the page on successful login. */}
      <GamingIdModal isOpen={showLogin} onOpenChange={setShowLogin} />
    </div>
  );
}
