import { SiteFooter, SiteHeader } from "../components/SiteChrome";

// Privacy policy + terms. Written to match what the product actually does (CLAUDE.md, SYSTEM_DESIGN.md).
// DRAFT: have a lawyer review before relying on it, and add the registered entity name and address.

const UPDATED = "9 October 2026";
const CONTACT = "hello@flowdocs.co.in";

function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="text-3xl font-semibold tracking-[-0.02em]">{title}</h2>
      <p className="mt-2 text-sm text-muted">Last updated: {UPDATED}</p>
      <div className="legal mt-8 space-y-8">{children}</div>
    </section>
  );
}

function Block({ title, children }) {
  return (
    <div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-muted">{children}</div>
    </div>
  );
}

const List = ({ items }) => (
  <ul className="list-disc space-y-1.5 pl-5 marker:text-line">
    {items.map((t) => <li key={t}>{t}</li>)}
  </ul>
);

export default function Legal() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-20 px-4 pt-8 pb-20 sm:px-6 md:pt-14">
        <nav aria-label="On this page" className="flex gap-5 text-sm">
          <a href="#privacy" className="text-accent hover:underline">Privacy Policy</a>
          <a href="#terms" className="text-accent hover:underline">Terms of Service</a>
        </nav>

        <Section id="privacy" title="Privacy Policy">
          <Block title="Who we are">
            <p>
              FlowDocs (flowdocs.co.in) builds an AI Lead Conversion System for businesses: new enquiries get a WhatsApp
              reply, are qualified, and can book an appointment or site visit. This policy explains what personal data we
              handle and why. Questions: <a href={`mailto:${CONTACT}`} className="text-ink underline">{CONTACT}</a>.
            </p>
          </Block>

          <Block title="Data we collect">
            <p>From people who request a Free Lead Leak Audit on this website:</p>
            <List items={[
              "Name, business name, WhatsApp number, and optionally email and city",
              "Business type, approximate monthly lead volume, and anything you write in the message box",
              "The page you came from and campaign tags in the link (referrer, utm parameters)",
            ]} />
            <p>
              On behalf of our client businesses, about the people who enquire with them (their leads): name, phone number,
              the lead form details, WhatsApp messages exchanged, answers to qualifying questions (for example budget or
              timeline), and appointment details. For this data the client business decides why it is collected, and we
              process it for them.
            </p>
          </Block>

          <Block title="How we use it">
            <List items={[
              "To contact you about the audit you requested",
              "To run the service for our clients: reply to their leads on WhatsApp, ask qualifying questions, book appointments, send reminders and follow-ups, and alert the client's team",
              "To keep an audit log of actions so clients can see what happened with each lead",
              "To keep the service secure and prevent abuse",
            ]} />
            <p>We do not sell personal data. A lead's details are used only for the business they enquired with.</p>
          </Block>

          <Block title="Automated replies">
            <p>
              Replies to leads are written by an AI assistant that identifies itself as the business's virtual assistant.
              It only shares information the business has provided, and hands the conversation to a person for pricing,
              payments, complaints, or anything it cannot answer. Anyone can ask to speak to a person at any time.
            </p>
          </Block>

          <Block title="Stopping messages">
            <p>
              Reply STOP to any message and we stop messaging that number for that business, including scheduled
              follow-ups.
            </p>
          </Block>

          <Block title="Service providers">
            <p>We use these providers to run the service. They process data only to provide their service to us:</p>
            <List items={[
              "Supabase: database and server functions",
              "Vercel: website hosting",
              "Meta (WhatsApp Business Platform): sending and receiving WhatsApp messages",
              "Anthropic: AI that writes the assistant's replies",
              "Resend: email notifications",
            ]} />
            <p>Some of these providers may store or process data outside India.</p>
          </Block>

          <Block title="How long we keep data">
            <p>
              Audit requests are kept while we are in discussion with you and for a reasonable time after. Client lead data
              is kept for as long as the client uses the service, then deleted or returned as agreed with the client, unless
              the law requires us to keep it longer.
            </p>
          </Block>

          <Block title="Security">
            <p>
              Data is encrypted in transit. Each client can only see its own leads, enforced at the database level, and
              WhatsApp access tokens are kept in an encrypted store, never in the browser.
            </p>
          </Block>

          <Block title="Your rights">
            <p>
              Under the Digital Personal Data Protection Act, 2023 you can ask to access, correct, or erase your personal
              data, and raise a grievance. If you were contacted as a lead of one of our client businesses, you can also
              contact that business directly. Write to <a href={`mailto:${CONTACT}`} className="text-ink underline">{CONTACT}</a>{" "}
              and we will respond within a reasonable time.
            </p>
          </Block>

          <Block title="Changes">
            <p>We may update this policy. The date at the top shows when it last changed.</p>
          </Block>
        </Section>

        <Section id="terms" title="Terms of Service">
          <Block title="The service">
            <p>
              FlowDocs provides an AI Lead Conversion System: automated WhatsApp replies to new leads, qualification,
              appointment booking, follow-ups, owner alerts, and a dashboard. Pricing, scope and payment terms for each
              client are set out in a separate agreement or invoice.
            </p>
          </Block>

          <Block title="Your responsibilities as a client">
            <List items={[
              "Get valid consent from your leads to be contacted on WhatsApp, for example with consent text on your lead forms",
              "Give us accurate business information, prices and policies. The assistant only says what you configure, so keep it up to date",
              "Follow Meta's WhatsApp Business policies, including message template approval",
              "Pay WhatsApp messaging charges, which Meta bills to you directly",
              "Handle conversations the assistant hands over to your team, such as negotiation, payments and complaints",
            ]} />
          </Block>

          <Block title="AI limitations">
            <p>
              The assistant can make mistakes or misunderstand a message. It is designed to hand over to a person when unsure,
              and not to invent prices or offers, but you are responsible for reviewing conversations and for any commitments
              made to your customers. Appointments booked by the assistant should be honoured or rescheduled by your team.
            </p>
          </Block>

          <Block title="Acceptable use">
            <p>
              Do not use the service to send spam, to contact people who have not agreed to be contacted, or for anything
              unlawful or misleading. We may suspend the service if it is misused.
            </p>
          </Block>

          <Block title="Availability">
            <p>
              We work to keep the service running but cannot guarantee it will be uninterrupted. It depends on third-party
              platforms such as WhatsApp, which may change or restrict access.
            </p>
          </Block>

          <Block title="Liability">
            <p>
              To the extent the law allows, FlowDocs is not liable for indirect or consequential losses, such as lost sales,
              and our total liability is limited to the fees you paid us in the three months before the claim.
            </p>
          </Block>

          <Block title="Ending the service">
            <p>
              Either side can end the service as set out in your agreement. When it ends, we stop messaging your leads and
              delete or return your data as agreed.
            </p>
          </Block>

          <Block title="Law">
            <p>These terms are governed by the laws of India.</p>
          </Block>

          <Block title="Contact">
            <p>
              <a href={`mailto:${CONTACT}`} className="text-ink underline">{CONTACT}</a>
            </p>
          </Block>
        </Section>
      </main>

      <SiteFooter />
    </div>
  );
}
