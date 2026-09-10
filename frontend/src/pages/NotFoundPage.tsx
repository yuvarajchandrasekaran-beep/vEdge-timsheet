import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-5xl font-bold text-brand-primary">404</p>
      <p className="text-lg font-semibold text-gray-900">Page not found</p>
      <p className="max-w-sm text-sm text-gray-500">The page you're looking for doesn't exist or you don't have access to it.</p>
      <Link to="/dashboard" className="btn-primary mt-2 inline-flex">
        Back to Dashboard
      </Link>
    </div>
  );
}
