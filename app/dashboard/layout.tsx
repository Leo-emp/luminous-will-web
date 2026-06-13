export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="py-6 px-6 border-b border-[#1a1a1a] flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/" className="text-xl font-bold tracking-[4px]" style={{ color: "#E8A817" }}>
            LUMINOUS WILL
          </a>
          <span className="text-xs uppercase tracking-wider" style={{ color: "#555" }}>
            Dashboard
          </span>
        </div>
        <a
          href="/"
          className="text-xs uppercase tracking-wider hover:text-[#E8A817] transition-colors"
          style={{ color: "#555" }}
        >
          Generator
        </a>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">{children}</main>
    </div>
  );
}
