'use client';

/**
 * "HTML Notifier" admin section.
 *
 * A completely self-contained page that lets an admin paste ANY hand-written HTML
 * and deliver it as a notification card to a single user, a hand-picked group of
 * users, or every active user (broadcast). It reuses the dedicated server actions
 * in `src/app/actions/html-notification.ts` and does not modify any existing
 * notification feature.
 *
 * The HTML the admin types is rendered by the existing notification bell exactly
 * as previewed here, so a live preview is shown alongside the editor.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send, Users, SendToBack, Code2 } from 'lucide-react';
import {
    sendHtmlNotificationToUser,
    sendHtmlNotificationToMultiple,
    sendHtmlNotificationToAll,
    type HtmlNotificationResult,
} from '@/app/actions/html-notification';

const SAMPLE_HTML = `<div style="border-radius:14px;padding:16px;color:#fff;font-family:system-ui,sans-serif;
  background:linear-gradient(135deg,#4c1d95,#db2777);box-shadow:0 8px 24px -8px rgba(124,58,237,.6);">
  <div style="font-size:15px;font-weight:800;">🎉 Special Offer!</div>
  <div style="font-size:12.5px;opacity:.9;margin-top:6px;">
    Write any HTML here — it renders in the user's notification bell exactly like this preview.
  </div>
  <a href="https://www.garenafreefire.store/order" target="_blank"
     style="display:block;text-align:center;margin-top:12px;background:#fff;color:#7c3aed;
     text-decoration:none;font-weight:800;padding:10px;border-radius:10px;">View Now →</a>
</div>`;

export default function HtmlNotifierPage() {
    const { toast } = useToast();
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    // Shared content (the HTML is the same regardless of who it goes to).
    const [html, setHtml] = useState<string>(SAMPLE_HTML);
    const [message, setMessage] = useState<string>('');
    const [imageUrl, setImageUrl] = useState<string>('');

    // Per-mode recipients.
    const [gamingId, setGamingId] = useState<string>('');
    const [gamingIds, setGamingIds] = useState<string>('');

    const [showBroadcastDialog, setShowBroadcastDialog] = useState(false);

    const previewSrcDoc = useMemo(
        () => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;padding:14px;background:transparent;font-family:system-ui,sans-serif;}
img,video{max-width:100%;}</style></head><body>${html}</body></html>`,
        [html]
    );

    const baseFormData = () => {
        const fd = new FormData();
        fd.set('html', html);
        if (message.trim()) fd.set('message', message);
        if (imageUrl.trim()) fd.set('imageUrl', imageUrl.trim());
        return fd;
    };

    const handleResult = (result: HtmlNotificationResult, onSuccess?: () => void) => {
        if (result.success) {
            toast({ title: 'Success', description: result.message });
            onSuccess?.();
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
    };

    const sendSingle = () => {
        if (!html.trim()) return toast({ variant: 'destructive', title: 'Error', description: 'HTML content is required.' });
        if (!gamingId.trim()) return toast({ variant: 'destructive', title: 'Error', description: "Enter the user's Gaming ID." });
        const fd = baseFormData();
        fd.set('gamingId', gamingId.trim());
        startTransition(async () => handleResult(await sendHtmlNotificationToUser(fd), () => setGamingId('')));
    };

    const sendMultiple = () => {
        if (!html.trim()) return toast({ variant: 'destructive', title: 'Error', description: 'HTML content is required.' });
        if (!gamingIds.trim()) return toast({ variant: 'destructive', title: 'Error', description: 'Enter at least one Gaming ID.' });
        const fd = baseFormData();
        fd.set('gamingIds', gamingIds);
        startTransition(async () => handleResult(await sendHtmlNotificationToMultiple(fd), () => setGamingIds('')));
    };

    const sendAll = () => {
        if (!html.trim()) return toast({ variant: 'destructive', title: 'Error', description: 'HTML content is required.' });
        const fd = baseFormData();
        startTransition(async () => handleResult(await sendHtmlNotificationToAll(fd), () => {
            setShowBroadcastDialog(false);
            router.push('/admin/users-notification?tab=broadcasts');
        }));
    };

    return (
        <div className="max-w-5xl mx-auto">
            <div className="mb-4">
                <h1 className="text-2xl font-bold flex items-center gap-2"><Code2 className="h-6 w-6" /> HTML Notifier</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Compose any HTML notification card and send it to one user, selected users, or everyone.
                    The HTML renders in the user's notification bell exactly like the live preview.
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Editor + shared content */}
                <Card>
                    <CardHeader>
                        <CardTitle>HTML Content</CardTitle>
                        <CardDescription>
                            Paste any HTML (inline styles recommended so it renders consistently).
                            This is admin-authored, trusted content.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="html">HTML</Label>
                            <Textarea
                                id="html"
                                value={html}
                                onChange={(e) => setHtml(e.target.value)}
                                rows={12}
                                className="font-mono text-xs"
                                placeholder="<div>...your notification HTML...</div>"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="message">Fallback text (Optional)</Label>
                            <Textarea
                                id="message"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                rows={2}
                                placeholder="Plain text used for the push notification & non-HTML clients."
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="imageUrl">Image URL (Optional)</Label>
                            <Input
                                id="imageUrl"
                                value={imageUrl}
                                onChange={(e) => setImageUrl(e.target.value)}
                                placeholder="https://example.com/image.png"
                            />
                            <p className="text-xs text-muted-foreground">
                                Shown below the HTML card in the bell (same as other notifications). Leave
                                empty if your HTML already includes its own image.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Live preview */}
                <Card>
                    <CardHeader>
                        <CardTitle>Live Preview</CardTitle>
                        <CardDescription>How the card will appear in the user's notification bell.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-lg border bg-card p-4">
                            <iframe
                                title="HTML notification preview"
                                srcDoc={previewSrcDoc}
                                className="w-full h-[320px] rounded-md border-0 bg-transparent"
                                sandbox="allow-same-origin"
                            />
                            {imageUrl.trim() && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={imageUrl.trim()}
                                    alt="Notification media preview"
                                    className="mt-2 w-full rounded-md object-cover aspect-video"
                                />
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Send modes */}
            <Card className="mt-6">
                <CardHeader>
                    <CardTitle>Send</CardTitle>
                    <CardDescription>Choose who receives the HTML notification above.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="single">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="single">Single User</TabsTrigger>
                            <TabsTrigger value="bulk">Selected Users</TabsTrigger>
                            <TabsTrigger value="broadcast">Broadcast</TabsTrigger>
                        </TabsList>

                        <TabsContent value="single" className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <Label htmlFor="gamingId">User's Gaming ID</Label>
                                <Input id="gamingId" value={gamingId} onChange={(e) => setGamingId(e.target.value)} placeholder="Enter Gaming ID" />
                            </div>
                            <Button className="w-full" onClick={sendSingle} disabled={isPending}>
                                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                Send to Specific User
                            </Button>
                        </TabsContent>

                        <TabsContent value="bulk" className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <Label htmlFor="gamingIds">Gaming IDs (comma or newline separated)</Label>
                                <Textarea id="gamingIds" value={gamingIds} onChange={(e) => setGamingIds(e.target.value)} placeholder="1111111111, 2222222222, 3333333333" />
                            </div>
                            <Button className="w-full" onClick={sendMultiple} disabled={isPending}>
                                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                                Send to Selected Users
                            </Button>
                        </TabsContent>

                        <TabsContent value="broadcast" className="space-y-4 pt-4">
                            <p className="text-sm text-muted-foreground">
                                Sends the HTML notification to every active (non-banned, non-hidden) user.
                                Push notifications are delivered in batches; progress is tracked on the
                                Users Notification page.
                            </p>
                            <AlertDialog open={showBroadcastDialog} onOpenChange={setShowBroadcastDialog}>
                                <AlertDialogTrigger asChild>
                                    <Button variant="secondary" className="w-full" disabled={isPending}>
                                        <SendToBack className="mr-2 h-4 w-4" /> Send to All Users
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This will send the HTML notification to every single active user.
                                            Push notifications will be delivered in batches of 500.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={(e) => { e.preventDefault(); sendAll(); }} disabled={isPending}>
                                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            Yes, Send to All
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
}
