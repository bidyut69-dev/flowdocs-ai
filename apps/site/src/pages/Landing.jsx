import { ArrowRight } from "lucide-react";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";

// flowdocs.co.in landing. Hero only for now.
export default function Landing() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-8 pb-16 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,380px)] md:gap-10 md:pt-12 lg:min-h-[calc(100dvh-76px)] lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16 lg:pt-0 lg:pb-12">
          <div className="min-w-0">
            <h1 className="rise text-[2.6rem] leading-[1.02] font-semibold tracking-[-0.035em] text-balance sm:text-6xl lg:text-7xl">
              Lead aaye, <em className="font-semibold whitespace-nowrap text-accent italic">60 second</em> me reply. Visit book.
            </h1>
            <p className="rise rise-2 mt-6 max-w-md text-lg text-muted sm:text-xl">
              Aapki team sirf visit aur closing pe rahegi.
            </p>
            <a
              href="/audit"
              className="rise rise-3 group mt-9 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3.5 text-[15px] font-semibold text-accent-ink transition-transform active:scale-[0.98]"
            >
              Free Lead Leak Audit
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </a>
          </div>

          <figure className="rise rise-4 mx-auto w-full max-w-[300px] sm:max-w-[340px] md:max-w-none">
            <img
              src="/simulator-chat.png"
              width={407}
              height={763}
              alt="WhatsApp chat: lead apna budget, BHK aur timeline batata hai, aur visit Sunday 11 AM ko book ho jaati hai"
              fetchPriority="high"
              className="h-auto w-full rounded-[2rem] border border-line shadow-2xl shadow-black/40"
            />
          </figure>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
