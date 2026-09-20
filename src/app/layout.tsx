
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Order Desk | Restaurant Operations",
  description: "A calm command center for restaurant service.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
          crossOrigin="anonymous"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
