const version = process.env.NEXT_PUBLIC_GIT_SHA ?? "dev";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">Brain Trails</h1>
      <p className="text-sm text-neutral-500">
        EEG trails through embedding space — LuMentis prototype
      </p>
      <p className="text-xs text-neutral-400" data-testid="version">
        version {version}
      </p>
    </main>
  );
}
