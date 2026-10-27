/** Runs the scheduled tick once against the configured database (alternative to /api/cron/tick). */
const url = `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/cron/tick`;

async function main() {
  const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` } });
  console.log(res.status, await res.text());
  if (!res.ok) process.exit(1);
}

main();
