// frontend/depth-chat-ui/app/layout.tsx

import { Inter } from "next/font/google";
import "./globals.css"; // Ensure you keep your global styles import if you have one

// Initialize the font
const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning> 
      <body className={inter.className} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
