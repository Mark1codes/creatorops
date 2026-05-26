import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap"
});

export const metadata = {
  title: "YT Creator Scraper Dashboard",
  description: "Operations dashboard for the YouTube creator scraper"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
