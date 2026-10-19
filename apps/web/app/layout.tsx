import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'IMarket — Shop together. Save more.',
  description: 'A prototype for original group-buy commerce. Demo only, no real purchases or financing.'
};
export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="en"><body>{children}</body></html>;
}
