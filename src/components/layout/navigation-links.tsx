
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Download } from 'lucide-react';
import type { Notification, User } from '@/lib/definitions';
import NotificationBell from './notification-bell';


const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'T&C' },
  { href: '/refund', label: 'Refund Policy' },
  { href: '/delivery-policy', label: 'Delivery' },
  { href: '/contact', label: 'Contact' },
  { href: '/support', label: 'Support' },
];

interface NavigationLinksProps {
  mobile?: boolean;
  onLinkClick?: () => void;
  notifications: Notification[];
  user: User | null;
  notificationKey: number;
  onNotificationRefresh: () => void;
}

export default function NavigationLinks({ mobile, onLinkClick, notifications = [], user, notificationKey, onNotificationRefresh }: NavigationLinksProps) {
  const pathname = usePathname();

  if (mobile) {
    return (
      <>
        {navLinks.map(({ href, label }) => (
          <Link
            key={label}
            href={href}
            className={cn(
              'text-lg font-medium transition-colors hover:text-primary',
              pathname === href && 'text-primary'
            )}
            onClick={onLinkClick}
          >
            {label}
          </Link>
        ))}
         <a href="https://github.com/dhdgs23/Garena-Store/releases/download/v1.0/base.apk" download>
            <Button variant="outline" className="w-full">
                <Download className="mr-2" /> Download App
            </Button>
        </a>
      </>
    );
  }

  return (
    <>
      {notifications.length > 0 && <NotificationBell key={notificationKey} notifications={notifications} onRefresh={onNotificationRefresh} />}
      <Button asChild className={cn(
        'bg-primary/10 hover:bg-primary/20 text-primary',
        pathname === '/order' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
      )}>
        <Link href="/order">
          Order
          <ShoppingCart className="h-4 w-4" />
        </Link>
      </Button>
      {navLinks.map(({ href, label }) => (
        <Link
          key={label}
          href={href}
          className={cn(
            'transition-colors hover:text-primary',
            pathname === href ? 'text-primary font-semibold border-b-2 border-primary' : ''
          )}
        >
          {label}
        </Link>
      ))}
    </>
  );
}
