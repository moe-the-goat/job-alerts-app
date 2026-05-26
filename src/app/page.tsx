export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 font-sans dark:bg-black">
      <main className="w-full max-w-xl text-center sm:text-left">
        <p className="mb-4 text-xs font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          Private beta
        </p>
        <h1 className="mb-6 text-4xl font-semibold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
          Job Alerts
        </h1>
        <p className="mb-8 text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
          A personalized daily job feed scored against your CV — currently in
          closed beta for friends and family. Sign-ups open soon.
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          Built on top of an AI verdict pipeline that filters 9 job sources and
          6 ATS platforms down to the handful that actually fit you.
        </p>
      </main>
    </div>
  );
}
