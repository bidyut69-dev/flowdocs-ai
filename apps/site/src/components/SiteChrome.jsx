// Header + footer shared by every marketing page.

export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center px-4 py-5 sm:px-6">
      <a href="/" className="text-[15px] font-semibold tracking-tight">
        FlowDocs AI
      </a>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>© {new Date().getFullYear()} FlowDocs</p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Footer">
          <a href="/legal#privacy" className="hover:text-ink">Privacy</a>
          <a href="/legal#terms" className="hover:text-ink">Terms</a>
          <a href="mailto:hello@flowdocs.co.in" className="hover:text-ink">hello@flowdocs.co.in</a>
        </nav>
      </div>
    </footer>
  );
}
