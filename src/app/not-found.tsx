import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card px-6 py-12 text-center">
      <h1 className="serif text-3xl text-forest">Page not in this prototype</h1>
      <p className="mt-2 text-sm text-muted">The route does not exist. Return to the dashboard rather than a blank state.</p>
      <Link className="btn mt-4 inline-flex" href="/">Dashboard</Link>
    </div>
  );
}
