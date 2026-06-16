'use client';

// --- Admin "New report" dialog ---
// Self-contained UI that lets an admin search any UID, see the reports already on
// that user, and open a brand-new report addressed to them. It talks only to the
// new admin-create-actions module and reports back through callbacks, so the main
// admin support client needs only a tiny hook-in (a button + this component).

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Search, Loader2, Send, UserRound, MessageSquarePlus, Inbox } from 'lucide-react';
import {
  lookupUserForAdminReport,
  adminCreateTicketForUser,
  type AdminUserLookup,
} from '../admin-create-actions';
import type { SupportTicket } from '@/lib/support-definitions';

export default function AdminCreateReportDialog({
  open,
  onOpenChange,
  onCreated,
  onOpenTicket,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Called after a report is successfully created (so the parent can refresh).
  onCreated: (ticketId: string) => void;
  // Optional: open one of the user's existing reports in the main inbox.
  onOpenTicket?: (ticket: SupportTicket) => void;
}) {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [lookup, setLookup] = useState<AdminUserLookup | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Reset everything whenever the dialog is closed so it opens clean next time.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setQuery('');
      setLookup(null);
      setSubject('');
      setMessage('');
      setIsSearching(false);
      setIsSending(false);
    }
    onOpenChange(next);
  };

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setIsSearching(true);
    setLookup(null);
    const result = await lookupUserForAdminReport(q);
    setIsSearching(false);
    setLookup(result);
    if (!result.found) {
      toast({ variant: 'destructive', title: 'Not found', description: result.message || 'No user found.' });
    }
  };

  const handleCreate = async () => {
    if (!lookup?.found || !lookup.gamingId) return;
    if (!message.trim()) {
      toast({ variant: 'destructive', title: 'Message required', description: 'Please write a message.' });
      return;
    }
    setIsSending(true);
    const result = await adminCreateTicketForUser(lookup.gamingId, message, subject);
    setIsSending(false);
    if (result.success && result.ticketId) {
      toast({ title: 'Report created', description: result.message });
      onCreated(result.ticketId);
      handleOpenChange(false);
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5" /> New report for a user
          </DialogTitle>
          <DialogDescription>
            Search a UID to see their existing reports, then open a brand-new report addressed to them.
            The user is notified instantly.
          </DialogDescription>
        </DialogHeader>

        {/* UID search */}
        <div className="space-y-1.5">
          <Label htmlFor="admin-report-uid" className="text-xs text-muted-foreground">User UID (or Visual ID)</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="admin-report-uid"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(); } }}
                placeholder="Enter the user's UID"
                className="pl-8"
              />
            </div>
            <Button onClick={handleSearch} disabled={isSearching || !query.trim()}>
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </Button>
          </div>
        </div>

        {/* Lookup result */}
        {lookup && lookup.found && (
          <div className="space-y-3 border-t pt-3">
            <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2.5 text-sm">
              <div className="h-9 w-9 rounded-full bg-[#075E54] flex items-center justify-center text-white shrink-0">
                <UserRound className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold truncate">{lookup.visualGamingId || lookup.gamingId}</div>
                <div className="text-xs text-muted-foreground truncate">UID: {lookup.gamingId}</div>
              </div>
            </div>

            {/* Existing reports on this UID */}
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <Inbox className="h-3.5 w-3.5" />
                Existing reports ({lookup.tickets?.length || 0})
              </div>
              {(lookup.tickets?.length || 0) === 0 ? (
                <p className="text-xs text-muted-foreground italic">No reports yet for this user.</p>
              ) : (
                <div className="max-h-40 overflow-y-auto rounded-md border divide-y">
                  {lookup.tickets!.map((t) => {
                    const last = t.messages[t.messages.length - 1];
                    return (
                      <button
                        key={t._id.toString()}
                        type="button"
                        onClick={() => onOpenTicket?.(t)}
                        disabled={!onOpenTicket}
                        className="w-full text-left p-2.5 hover:bg-muted/60 transition-colors disabled:cursor-default"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm truncate">{t.subject}</span>
                          <span className="text-[10px] text-muted-foreground border rounded px-1 shrink-0">{t.status}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {!last ? 'No messages' : `${last.sender === 'admin' ? 'Garena: ' : 'User: '}${last.text || '📎 Attachment'}`}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* New report form */}
            <div className="space-y-2 border-t pt-3">
              <div className="space-y-1.5">
                <Label htmlFor="admin-report-subject" className="text-xs text-muted-foreground">
                  Subject <span className="opacity-60">(optional — auto-named if left blank)</span>
                </Label>
                <Input
                  id="admin-report-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Regarding your recent order"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="admin-report-message" className="text-xs text-muted-foreground">Message</Label>
                <Textarea
                  id="admin-report-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Write the message the user will see…"
                  rows={4}
                  className="resize-none"
                />
              </div>
              <Button onClick={handleCreate} disabled={isSending || !message.trim()} className="w-full">
                {isSending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Create report &amp; notify user
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
