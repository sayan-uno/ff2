'use client';

/**
 * Self-contained card for sending a notification to a selected group of users.
 *
 * The admin enters several Gaming IDs separated by commas (e.g.
 * "1111111111, 2222222222") and the same notification is delivered to every
 * matching user at once. This component is fully additive — it does not touch
 * the existing single-user or "send to all" flows.
 */

import { useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users } from 'lucide-react';
import { sendNotificationToMultiple } from '@/app/actions/multi-notification';

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
            {pending ? 'Sending...' : 'Send to Selected Users'}
        </Button>
    );
}

export default function MultiUserNotificationCard() {
    const { toast } = useToast();
    const formRef = useRef<HTMLFormElement>(null);

    const handleSubmit = async (formData: FormData) => {
        const result = await sendNotificationToMultiple(formData);
        if (result.success) {
            toast({ title: 'Success', description: result.message });
            formRef.current?.reset();
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
    };

    return (
        <Card className="mt-6">
            <CardHeader>
                <CardTitle>Send to Selected Users</CardTitle>
                <CardDescription>
                    Send the same notification to a specific group of users at once. Enter
                    multiple Gaming IDs separated by commas (e.g. 1111111111, 2222222222).
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form ref={formRef} action={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="gamingIds">Gaming IDs (comma-separated)</Label>
                        <Textarea
                            id="gamingIds"
                            name="gamingIds"
                            required
                            placeholder="1111111111, 2222222222, 3333333333"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="message-multi">Message</Label>
                        <Textarea
                            id="message-multi"
                            name="message"
                            required
                            placeholder="Your notification message..."
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="imageUrl-multi">Image URL (Optional)</Label>
                        <Input
                            id="imageUrl-multi"
                            name="imageUrl"
                            placeholder="https://example.com/image.png"
                        />
                    </div>
                    <div className="flex items-center space-x-2">
                        <Checkbox id="isPopup-multi" name="isPopup" />
                        <Label htmlFor="isPopup-multi">Show as Popup</Label>
                    </div>
                    <SubmitButton />
                </form>
            </CardContent>
        </Card>
    );
}
