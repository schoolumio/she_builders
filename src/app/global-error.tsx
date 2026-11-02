"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 40, textAlign: "center", background: "#faf7f2" }}>
        <h1>Something went wrong</h1>
        <p>Please refresh the page or try again shortly.</p>
        <button onClick={reset}>Try again</button>
      </body>
    </html>
  );
}
