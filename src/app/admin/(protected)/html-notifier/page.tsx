'use client';

/**
 * "HTML Notifier" admin section.
 *
 * Lets an admin send a rich HTML notification card to a single user, a hand-picked
 * group of users, or every active user (broadcast). The HTML can either be:
 *   - picked from a ready-made, good-looking TEMPLATE (Event / Order Failed /
 *     Technical Error / Website Notice) whose fields the admin fills in, or
 *   - hand-written from scratch in "Custom HTML" mode.
 *
 * It reuses the dedicated server actions in `src/app/actions/html-notification.ts`
 * and the template builders in `src/lib/notification-templates.ts`. It does not
 * modify any existing notification feature. The HTML renders in the user's
 * notification bell exactly as shown in the live preview.
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
import { Loader2, Send, Users, SendToBack, Code2, LayoutTemplate } from 'lucide-react';
import {
    sendHtmlNotificationToUser,
    sendHtmlNotificationToMultiple,
    sendHtmlNotificationToAll,
    type HtmlNotificationResult,
} from '@/app/actions/html-notification';
import {
    NOTIFICATION_TEMPLATES,
    getTemplateById,
    type NotificationTemplate,
} from '@/lib/notification-templates';

const CUSTOM_SAMPLE_HTML = `<div style="border-radius:14px;padding:16px;color:#fff;font-family:system-ui,sans-serif;
  background:linear-gradient(135deg,#4c1d95,#db2777);box-shadow:0 8px 24px -8px rgba(124,58,237,.6);">
  <div style="font-size:15px;font-weight:800;">🎉 Special Offer!</div>
  <div style="font-size:12.5px;opacity:.9;margin-top:6px;">
    Write any HTML here — it renders in the user's notification bell exactly like this preview.
  </div>
</div>`;

const CATEGORY_ORDER: NotificationTemplate['category'][] = [
    'Event', 'Order Failed', 'Technical Error', 'Website Notice',
];

export default function HtmlNotifierPage() {
    const { toast } = useToast();
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    // null = Custom HTML mode; otherwise a template id is selected.
    const [templateId, setTemplateId] = useState<string | null>(NOTIFICATION_TEMPLATES[0].id);

    // Template field values.
    const initial = NOTIFICATION_TEMPLATES[0].defaults;
    const [tTitle, setTTitle] = useState(initial.title);
    const [tMessage, setTMessage] = useState(initial.message);
    const [tImageUrl, setTImageUrl] = useState('');
    const [tButtonText, setTButtonText] = useState(initial.buttonText);
    const [tButtonUrl, setTButtonUrl] = useState('');

    // Custom HTML mode values.
    const [customHtml, setCustomHtml] = useState(CUSTOM_SAMPLE_HTML);
    const [customMessage, setCustomMessage] = useState('');
    const [customImageUrl, setCustomImageUrl] = useState('');

    const [gamingId, setGamingId] = useState('');
    const [gamingIds, setGamingIds] = useState('');
    const [showBroadcastDialog, setShowBroadcastDialog] = useState(false);

    const selectedTemplate = templateId ? getTemplateById(templateId) : undefined;
    const isTemplate = !!selectedTemplate;

    // The HTML that will actually be sent / previewed.
    const effectiveHtml = useMemo(() => {
        if (selectedTemplate) {
            return selectedTemplate.build({
                title: tTitle,
                message: tMessage,
                imageUrl: tImageUrl,
                buttonText: tButtonText,
                buttonUrl: tButtonUrl,
            });
        }
        return customHtml;
    }, [selectedTemplate, tTitle, tMessage, tImageUrl, tButtonText, tButtonUrl, customHtml]);

    // In template mode the image is embedded inside the HTML, so we don't also
    // send the separate `imageUrl` field (that would duplicate it in the bell).
    const effectiveImageUrl = isTemplate ? '' : customImageUrl;
    // Plain-text fallback used for the push notification body.
    const effectiveFallback = isTemplate ? tMessage : customMessage;

    const previewSrcDoc = useMemo(
        () => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;padding:14px;background:transparent;font-family:system-ui,sans-serif;}
img,video{max-width:100%;}</style></head><body>${effectiveHtml}</body></html>`,
        [effectiveHtml]
    );

    const selectTemplate = (id: string) => {
        const tpl = getTemplateById(id);
        if (!tpl) return;
        setTemplateId(id);
        setTTitle(tpl.defaults.title);
        setTMessage(tpl.defaults.message);
        setTButtonText(tpl.defaults.buttonText);
        // Keep any image/button URL the admin already typed so switching styles is easy.
    };

    const baseFormData = () => {
        const fd = new FormData();
        fd.set('html', effectiveHtml);
        if (effectiveFallback.trim()) fd.set('message', effectiveFallback);
        if (effectiveImageUrl.trim()) fd.set('imageUrl', effectiveImageUrl.trim());
        return fd;
    };

    const guard = (): boolean => {
        if (!effectiveHtml.trim()) {
            toast({ variant: 'destructive', title: 'Error', description: 'There is no HTML content to send.' });
            return false;
        }
        return true;
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
        if (!guard()) return;
        if (!gamingId.trim()) return toast({ variant: 'destructive', title: 'Error', description: "Enter the user's Gaming ID." });
        const fd = baseFormData();
        fd.set('gamingId', gamingId.trim());
        startTransition(async () => handleResult(await sendHtmlNotificationToUser(fd), () => setGamingId('')));
    };

    const sendMultiple = () => {
        if (!guard()) return;
        if (!gamingIds.trim()) return toast({ variant: 'destructive', title: 'Error', description: 'Enter at least one Gaming ID.' });
        const fd = baseFormData();
        fd.set('gamingIds', gamingIds);
        startTransition(async () => handleResult(await sendHtmlNotificationToMultiple(fd), () => setGamingIds('')));
    };

    const sendAll = () => {
        if (!guard()) return;
        const fd = baseFormData();
        startTransition(async () => handleResult(await sendHtmlNotificationToAll(fd), () => {
            setShowBroadcastDialog(false);
            router.push('/admin/users-notification?tab=broadcasts');
        }));
    };

    return (
        <div className="max-w-5xl mx-auto pb-10">
            <div className="mb-4">
                <h1 className="text-2xl font-bold flex items-center gap-2"><Code2 className="h-6 w-6" /> HTML Notifier</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Pick a ready-made template or write custom HTML, then send it to one user, selected users, or everyone.
                    The card renders in the user's notification bell exactly like the live preview.
                </p>
            </div>

            {/* Template picker */}
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><LayoutTemplate className="h-5 w-5" /> Choose a Template</CardTitle>
                    <CardDescription>Each template embeds your image inside the card and shows a button only when you add a link.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {CATEGORY_ORDER.map((category) => (
                        <div key={category}>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{category}</p>
                            <div className="flex flex-wrap gap-2">
                                {NOTIFICATION_TEMPLATES.filter((t) => t.category === category).map((t) => (
                                    <Button
                                        key={t.id}
                                        type="button"
                                        size="sm"
                                        variant={templateId === t.id ? 'default' : 'outline'}
                                        onClick={() => selectTemplate(t.id)}
                                    >
                                        {t.name.split('·')[1]?.trim() || t.name}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    ))}
                    <div className="pt-2 border-t">
                        <Button
                            type="button"
                            size="sm"
                            variant={templateId === null ? 'default' : 'secondary'}
                            onClick={() => setTemplateId(null)}
                        >
                            <Code2 className="mr-2 h-4 w-4" /> Custom HTML (advanced)
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Editor */}
                <Card>
                    <CardHeader>
                        <CardTitle>{isTemplate ? 'Template Content' : 'HTML Content'}</CardTitle>
                        <CardDescription>
                            {isTemplate
                                ? 'Fill in the fields below. Add an image link to embed it inside the card, and a button link to show a button.'
                                : 'Paste any HTML (inline styles recommended). This is admin-authored, trusted content.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {isTemplate ? (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="t-title">Title</Label>
                                    <Input id="t-title" value={tTitle} onChange={(e) => setTTitle(e.target.value)} placeholder="Notification title" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="t-message">Message</Label>
                                    <Textarea id="t-message" rows={5} value={tMessage} onChange={(e) => setTMessage(e.target.value)} placeholder="Your message... (line breaks are preserved)" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="t-image">Image URL (Optional — embedded inside the card)</Label>
                                    <Input id="t-image" value={tImageUrl} onChange={(e) => setTImageUrl(e.target.value)} placeholder="https://example.com/banner.png" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-2">
                                        <Label htmlFor="t-btn-text">Button Text</Label>
                                        <Input id="t-btn-text" value={tButtonText} onChange={(e) => setTButtonText(e.target.value)} placeholder="View Now" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="t-btn-url">Button Link (Optional)</Label>
                                        <Input id="t-btn-url" value={tButtonUrl} onChange={(e) => setTButtonUrl(e.target.value)} placeholder="https://..." />
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    The button only appears when a link is provided. The Message is also used as the
                                    push-notification text.
                                </p>
                            </>
                        ) : (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="c-html">HTML</Label>
                                    <Textarea id="c-html" rows={12} className="font-mono text-xs" value={customHtml} onChange={(e) => setCustomHtml(e.target.value)} placeholder="<div>...your notification HTML...</div>" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="c-message">Fallback text (Optional)</Label>
                                    <Textarea id="c-message" rows={2} value={customMessage} onChange={(e) => setCustomMessage(e.target.value)} placeholder="Plain text used for the push notification & non-HTML clients." />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="c-image">Image URL (Optional)</Label>
                                    <Input id="c-image" value={customImageUrl} onChange={(e) => setCustomImageUrl(e.target.value)} placeholder="https://example.com/image.png" />
                                    <p className="text-xs text-muted-foreground">Shown below the HTML card in the bell. Leave empty if your HTML already includes its own image.</p>
                                </div>
                            </>
                        )}
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
                                className="w-full h-[340px] rounded-md border-0 bg-transparent"
                                sandbox="allow-same-origin"
                            />
                            {!isTemplate && customImageUrl.trim() && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={customImageUrl.trim()} alt="Notification media preview" className="mt-2 w-full rounded-md object-cover aspect-video" />
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Send modes */}
            <Card className="mt-6">
                <CardHeader>
                    <CardTitle>Send</CardTitle>
                    <CardDescription>Choose who receives the notification above.</CardDescription>
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
                                Sends the notification to every active (non-banned, non-hidden) user. Push notifications
                                are delivered in batches; progress is tracked on the Users Notification page.
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
                                            This will send the notification to every single active user. Push notifications
                                            will be delivered in batches of 500.
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
