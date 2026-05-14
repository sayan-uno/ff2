'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { updateUpiId } from '../actions';
import { Loader2, ShieldAlert, ShieldCheck, History, AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface UpiChangeLog {
  oldUpiId: string;
  newUpiId: string;
  changedAt: string;
  changedBy: string;
}

interface UpiManagerProps {
  currentUpiId: string;
  changeHistory: UpiChangeLog[];
}

export default function UpiManager({ currentUpiId, changeHistory }: UpiManagerProps) {
  const [newUpiId, setNewUpiId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeUpi, setActiveUpi] = useState(currentUpiId);
  const { toast } = useToast();

  const handleUpdate = async () => {
    if (!newUpiId.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please enter a new UPI ID.' });
      return;
    }

    setIsLoading(true);
    const result = await updateUpiId(newUpiId.trim());

    if (result.success) {
      toast({ title: 'UPI ID Updated', description: result.message });
      setActiveUpi(newUpiId.trim());
      setNewUpiId('');
    } else {
      toast({ variant: 'destructive', title: 'Update Blocked', description: result.message });
    }

    setIsLoading(false);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Security Notice */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-300 rounded-lg text-amber-800">
        <ShieldAlert className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <div className="text-sm">
          <p className="font-semibold">High Security Section</p>
          <p>Any change to the UPI ID will trigger an immediate security alert email. The change will only proceed if the email is sent successfully.</p>
        </div>
      </div>

      {/* Active UPI Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-green-600" />
            <CardTitle>UPI Management</CardTitle>
          </div>
          <CardDescription>
            Manage the active UPI ID used for all payment QR codes across the store.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current UPI Display */}
          <div className="space-y-2">
            <Label>Current Active UPI ID</Label>
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <ShieldCheck className="w-4 h-4 text-green-600 flex-shrink-0" />
              <code className="text-sm font-mono font-semibold text-green-800 break-all">{activeUpi}</code>
            </div>
          </div>

          {/* Update Form */}
          <div className="space-y-4 border-t pt-4">
            <div className="space-y-2">
              <Label htmlFor="new-upi-id">New UPI ID</Label>
              <Input
                id="new-upi-id"
                placeholder="e.g., yourname@bank"
                value={newUpiId}
                onChange={(e) => setNewUpiId(e.target.value)}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Format: name@bankcode (e.g., mystore@yesg, shop123@paytm)
              </p>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  className="w-full"
                  variant="destructive"
                  disabled={isLoading || !newUpiId.trim()}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isLoading ? 'Updating UPI ID...' : 'Change UPI ID'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-5 w-5" />
                    Confirm UPI ID Change
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <span className="block">You are about to change the payment UPI ID. This will affect all future payments.</span>
                    <span className="block font-semibold">
                      Current: <code className="text-destructive">{activeUpi}</code>
                    </span>
                    <span className="block font-semibold">
                      New: <code className="text-green-700">{newUpiId}</code>
                    </span>
                    <span className="block text-sm mt-2">
                      A security alert email will be sent to your registered email before the change takes effect.
                    </span>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleUpdate}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Yes, Change UPI ID
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* Change History */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <History className="h-5 w-5" />
            <CardTitle className="text-lg">Change History</CardTitle>
          </div>
          <CardDescription>
            Audit log of all UPI ID changes. Last 20 entries shown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {changeHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No changes recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {changeHistory.map((log, index) => (
                <div key={index} className="flex flex-col gap-1 p-3 bg-muted rounded-lg text-sm">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="text-muted-foreground">From:</span>
                    <code className="text-destructive font-mono text-xs">{log.oldUpiId}</code>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-muted-foreground">To:</span>
                    <code className="text-green-700 font-mono text-xs">{log.newUpiId}</code>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(log.changedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} by {log.changedBy}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
