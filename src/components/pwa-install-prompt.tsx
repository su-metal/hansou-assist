'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Download, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
    readonly platforms: Array<string>;
    readonly userChoice: Promise<{
        outcome: 'accepted' | 'dismissed';
        platform: string;
    }>;
    prompt(): Promise<void>;
}

export function PwaInstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

    useEffect(() => {
        // Check if already in standalone mode
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches
            || (window.navigator as any).standalone
            || document.referrer.includes('android-app://');

        if (isStandalone) return;

        // --- Android / Chrome logic ---
        const handleBeforeInstallPrompt = (e: Event) => {
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault();
            // Stash the event so it can be triggered later.
            setDeferredPrompt(e as BeforeInstallPromptEvent);

            // Show toast
            toast("アプリとしてインストール", {
                description: "ホーム画面に追加すると、オフラインでもスムーズに利用できます。",
                duration: 10000,
                action: {
                    label: "インストール",
                    onClick: async () => {
                        const promptEvent = e as BeforeInstallPromptEvent;
                        await promptEvent.prompt();
                        const { outcome } = await promptEvent.userChoice;
                        console.log(`User response to the install prompt: ${outcome}`);
                        setDeferredPrompt(null);
                    },
                },
            });
        };

        // --- iOS Safari logic ---
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

        if (isIOS && isSafari && !isStandalone) {
            // Small delay to not annoy immediately
            const timer = setTimeout(() => {
                // Only show if not shown recently
                const lastShown = localStorage.getItem('ios-pwa-prompt-last-shown');
                const now = Date.now();
                if (!lastShown || now - parseInt(lastShown) > 1000 * 60 * 60 * 24 * 7) { // once a week
                    toast("iPhoneをご利用中の方へ", {
                        description: "共有アイコンから「ホーム画面に追加」をするとアプリとして利用できます。",
                        duration: 15000,
                        icon: <Smartphone className="size-4" />,
                    });
                    localStorage.setItem('ios-pwa-prompt-last-shown', now.toString());
                }
            }, 3000);
            return () => clearTimeout(timer);
        }

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    return null;
}
