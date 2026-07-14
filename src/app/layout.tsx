import type { Metadata, Viewport } from "next";
import { Baloo_2, Gochi_Hand, Playfair_Display, Special_Elite } from "next/font/google";
import "./globals.css";

const baloo = Baloo_2({
  variable: "--font-cute",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const gochi = Gochi_Hand({
  variable: "--font-hand",
  subsets: ["latin"],
  weight: "400",
});

const playfair = Playfair_Display({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
  style: ["normal", "italic"],
});

const typewriter = Special_Elite({
  variable: "--font-type",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Pocket Photo Booth",
  description: "Create memories, one strip at a time.",
};

export const viewport: Viewport = {
  themeColor: "#fdf6f0",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${baloo.variable} ${gochi.variable} ${playfair.variable} ${typewriter.variable} font-cute antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
