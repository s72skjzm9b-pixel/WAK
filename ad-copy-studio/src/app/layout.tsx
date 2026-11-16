import type { Metadata } from 'next';
import '@fontsource-variable/google-sans-flex/index.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/arimo/400.css';
import '@fontsource/arimo/700.css';
import './globals.css';
import { StudioProvider } from '@/components/client';
import { Shell } from '@/components/Shell';

export const metadata: Metadata = { title: 'La Cabra Ad Copy Studio', description: 'Local copy development, review and handover for La Cabra Google Ads.' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StudioProvider><Shell>{children}</Shell></StudioProvider>
      </body>
    </html>
  );
}
