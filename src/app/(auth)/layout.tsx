import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Iniciar sesión — EBI",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ezi-gray px-4">
      {children}
    </div>
  );
}