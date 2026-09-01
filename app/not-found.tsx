import Link from "next/link";

export default function NotFound() {
  return (
    <main className="standalone-message">
      <span className="brand-orb">✦</span>
      <h1>Nothing scheduled here.</h1>
      <p>Let&apos;s get you back to the day that matters.</p>
      <Link className="button button-primary" href="/">Return to planner</Link>
    </main>
  );
}
