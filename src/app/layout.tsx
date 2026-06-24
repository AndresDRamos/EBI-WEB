import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { MsalProviderWrapper } from "@/components/providers/msal-provider-wrapper";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "EBI — Portal de inteligencia de negocio",
  description:
    "Portal interno EBI: catálogo y embebido de reportes de Power BI con administración.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${montserrat.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <MsalProviderWrapper>{children}</MsalProviderWrapper>
      </body>
    </html>
  );
}