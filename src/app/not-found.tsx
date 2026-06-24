import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6 text-center">
      <h1 className="text-3xl font-bold text-ezi-gray">404</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        El recurso solicitado no existe.
      </p>
      <Link
        href="/dashboards"
        className="mt-4 rounded-md bg-ezi-orange px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
      >
        Ir a Dashboards
      </Link>
    </div>
  );
}