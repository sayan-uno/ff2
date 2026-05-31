
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { getUserData } from '@/app/actions';
import { createTicket, uploadSupportImage, sendUserImageMessage, getImageQuota } from '@/app/support/actions';
import { Loader2, ImagePlus, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import GamingIdModal from '@/components/gaming-id-modal';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function RefundRequestPage() {
  const [transactionId, setTransactionId] = useState('');
  const [gamingId, setGamingId] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [message, setMessage] = useState('');
  const [isLoadingId, setIsLoadingId] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [imageRemaining, setImageRemaining] = useState(10);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    async function fetchUserId() {
      setIsLoadingId(true);
      const user = await getUserData();
      if (user) {
        setGamingId(user.visualGamingId || user.gamingId);
        setIsLoggedIn(true);
        const quota = await getImageQuota();
        setImageRemaining(quota.remaining);
      } else {
        // Not logged in — show the same Gaming ID login popup as the home page.
        setShowLogin(true);
      }
      setIsLoadingId(false);
    }
    fetchUserId();
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const capacity = imageRemaining - images.length;
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
    if (accepted.length > 0) setImages((prev) => [...prev, ...accepted]);
  };

  const handleContactNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow digits
    const numericValue = value.replace(/\D/g, '');
    setContactNumber(numericValue);
  };

  const handleSubmitRequest = async () => {
    // Not logged in: show the Gaming ID register popup instead of submitting.
    if (!isLoggedIn) {
      setShowLogin(true);
      return;
    }

    setIsSubmitting(true);

    const reportMessage = `🧾 Refund Request

Gaming ID: ${gamingId}
Contact Number: ${contactNumber}
UTR / Transaction ID: ${transactionId}

Reason for refund:
${message}`;

    // Reports created here are named "Refund Request 1", "Refund Request 2", ...
    const result = await createTicket(reportMessage, 'Refund Request');

    if (!result.success || !result.ticketId) {
      setIsSubmitting(false);
      toast({
        variant: 'destructive',
        title: 'Could not submit request',
        description: result.message,
      });
      return;
    }

    // Upload any attached images, then post them to the new report.
    const imagesToSend = [...images];
    if (imagesToSend.length > 0) {
      const uploadedIds: string[] = [];
      for (const uri of imagesToSend) {
        const up = await uploadSupportImage(result.ticketId, uri);
        if (up.success && up.imageId) {
          uploadedIds.push(up.imageId);
        } else {
          toast({ variant: 'destructive', title: 'Could not send image', description: up.message });
          break;
        }
      }
      if (uploadedIds.length > 0) {
        await sendUserImageMessage(result.ticketId, uploadedIds, '');
      }
    }

    setIsSubmitting(false);
    toast({
      title: 'Refund request submitted',
      description: 'Your request has been sent to our support team. You can track replies in Garena Support.',
    });

    // Clear the fields
    setTransactionId('');
    setContactNumber('');
    setMessage('');
    setImages([]);

    // Open the new report's chat (inbox) directly; the chat's back button
    // then returns the user to the support page.
    router.push(`/support?ticket=${result.ticketId}`);
  };

  return (
    <div className="container mx-auto px-6 py-16 flex justify-center">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-3xl font-headline">Refund Request</CardTitle>
          <CardDescription>
            Fill out the form below to submit a refund request. Your request will be sent directly to our
            support team and you can track their replies in Garena Support — no email needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
           <div className="space-y-2">
            <Label htmlFor="gaming-id">Your Gaming ID</Label>
            <Input
              id="gaming-id"
              placeholder="Enter your Gaming ID"
              value={gamingId}
              onChange={(e) => setGamingId(e.target.value.replace(/\D/g, ''))}
              type="tel"
              pattern="[0-9]*"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-number">Contact Number</Label>
            <Input
              id="contact-number"
              placeholder="Enter your contact number"
              value={contactNumber}
              onChange={handleContactNumberChange}
              type="tel"
              pattern="[0-9]*"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="transaction-id">UTR/Transaction ID</Label>
            <Input
              id="transaction-id"
              placeholder="Enter your transaction ID"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="message">Why do you want a refund?</Label>
            <Textarea
              id="message"
              placeholder="Please describe the issue..."
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Attach Images (optional)</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (imageRemaining <= 0) {
                  toast({ variant: 'destructive', title: 'Image limit reached', description: 'You can only send 10 images in every hour.' });
                  return;
                }
                fileInputRef.current?.click();
              }}
              className={`w-full ${imageRemaining <= 0 ? 'opacity-40' : ''}`}
            >
              <ImagePlus className="h-4 w-4 mr-2" />
              Add Images
            </Button>
            <p className="text-xs text-muted-foreground">Max 8 MB per image, up to 10 images per hour.</p>
            {images.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {images.map((uri, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={uri} alt="preview" className="h-16 w-16 object-cover rounded-md border" />
                    <button
                      type="button"
                      onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
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
        </CardContent>
        <CardFooter>
          <Button onClick={handleSubmitRequest} size="lg" className="w-full" disabled={isSubmitting || !gamingId || !transactionId || !message || !contactNumber}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? 'Submitting...' : 'Submit Refund Request'}
          </Button>
        </CardFooter>
      </Card>

      {/* Login popup (same as the home page). It is dismissible — if the user
          doesn't want to log in right now they can close it and look around.
          The modal reloads the page on successful login. */}
      <GamingIdModal isOpen={showLogin} onOpenChange={setShowLogin} />
    </div>
  );
}
