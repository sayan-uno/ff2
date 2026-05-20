
'use client';

import { useState, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { sendNotification, sendNotificationToAll } from '@/app/actions';
import { Loader2, Send, SendToBack } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useRouter } from 'next/navigation';

function SubmitButton({ children }: { children: React.ReactNode }) {
    const { pending } = useFormStatus();
    return (
         <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {pending ? 'Sending...' : children }
        </Button>
    )
}

export default function NotificationsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const singleUserFormRef = useRef<HTMLFormElement>(null);
  const allUsersFormRef = useRef<HTMLFormElement>(null);
  const [showSendAllDialog, setShowSendAllDialog] = useState(false);

  const handleSendSingle = async (formData: FormData) => {
    const result = await sendNotification(formData);
    if (result.success) {
      toast({ title: 'Success', description: result.message });
      singleUserFormRef.current?.reset();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
  };

  const handleSendAll = async (formData: FormData) => {
    const result = await sendNotificationToAll(formData);
     if (result.success) {
      toast({ title: 'Success', description: result.message + ' Track progress in Users Notification page.' });
      allUsersFormRef.current?.reset();
      setShowSendAllDialog(false);
      // Navigate to Users Notification page to see progress
      router.push('/admin/users-notification?tab=broadcasts');
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Send Notification</CardTitle>
          <CardDescription>
            Send a message to a specific user or to all users. Check the box to send as a popup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form ref={singleUserFormRef} action={handleSendSingle} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="gamingId">User's Gaming ID (for single user)</Label>
              <Input id="gamingId" name="gamingId" placeholder="Enter Gaming ID" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea id="message" name="message" required placeholder="Your notification message..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="imageUrl">Image URL (Optional)</Label>
              <Input id="imageUrl" name="imageUrl" placeholder="https://example.com/image.png" />
            </div>
             <div className="flex items-center space-x-2">
              <Checkbox id="isPopup-single" name="isPopup" />
              <Label htmlFor="isPopup-single">Show as Popup</Label>
            </div>
            <div className="space-y-2">
                <SubmitButton>
                    <Send className="mr-2"/> Send to Specific User
                </SubmitButton>
                
                <AlertDialog open={showSendAllDialog} onOpenChange={setShowSendAllDialog}>
                    <AlertDialogTrigger asChild>
                        <Button type="button" variant="secondary" className="w-full">
                            <SendToBack className="mr-2 h-4 w-4" />
                            Send to All Users
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                         <form ref={allUsersFormRef} action={handleSendAll}>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will send the notification to every single user. Push notifications will be delivered in batches of 500. You can track progress in the Users Notification page.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                             <div className="space-y-4 my-4">
                                <div className="space-y-2">
                                    <Label htmlFor="message-all">Message</Label>
                                    <Textarea id="message-all" name="message" required placeholder="Your notification message..."/>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="imageUrl-all">Image URL (Optional)</Label>
                                    <Input id="imageUrl-all" name="imageUrl" placeholder="https://example.com/image.png" />
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox id="isPopup-all" name="isPopup" />
                                    <Label htmlFor="isPopup-all">Show as Popup</Label>
                                </div>
                            </div>
                            <AlertDialogFooter className="mt-4">
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction asChild>
                                    <SubmitButton>Yes, Send to All</SubmitButton>
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </form>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}