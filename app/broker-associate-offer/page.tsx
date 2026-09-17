import { headers } from 'next/headers'
import { Bodoni_Moda, Public_Sans, IBM_Plex_Mono } from 'next/font/google'
import { getUserPermissions } from '@/lib/permissions'
import styles from './page.module.css'

// This is a server component on purpose. The offer terms name specific splits
// and fees for one person, so they must never ship in a client bundle that any
// authenticated user could read. Middleware has already required a session and
// set x-user-id by the time this runs; the permission check happens here, and
// the content below is only rendered for someone who passes it.
export const dynamic = 'force-dynamic'

const display = Bodoni_Moda({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-offer-display',
})

const body = Public_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-offer-body',
})

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-offer-mono',
})

const fontVars = `${display.variable} ${body.variable} ${mono.variable}`

function Shell({ children }: { children: React.ReactNode }) {
  return <div className={`${fontVars} ${styles.page}`}>{children}</div>
}

export default async function BrokerAssociateOfferPage() {
  const userId = (await headers()).get('x-user-id')
  const permissions = userId ? await getUserPermissions(userId) : new Set<string>()

  if (!permissions.has('can_view_broker_offer')) {
    return (
      <Shell>
        <div className={styles.wrap}>
          <div className={styles.denied}>
            <p className={styles.deniedTitle}>Not available</p>
            <p className={styles.foot}>This page is not available on your account.</p>
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className={styles.wrap}>
        <div className={styles.band}>
          <div className={styles.bandIn}>
            <p className={styles.firm}>Collective Realty Co.</p>
            <h1 className={styles.title}>Broker Associate or Broker in a Box</h1>
            <p className={styles.for}>Two paths for licensed brokers at Collective Realty Co.</p>
          </div>
        </div>

        <section className={styles.section}>
          <p className={styles.eyebrow}>Who this is for</p>
          <h2 className={styles.h2}>
            You hold a broker license and you have outgrown an agent&apos;s plan
          </h2>
          <p>
            These two paths are for a licensed Texas broker who is already producing here, leading a
            team here, or both, and who wants more than the best agent economics we offer. One keeps
            you sponsored by Collective Realty Co. on the top split in the firm. The other hands you
            our systems so you can open your own brokerage. They are different jobs, not better and
            worse versions of the same one.
          </p>
        </section>

        <nav className={styles.jump} aria-label="On this page">
          <a href="#option-one">Broker Associate Plan</a>
          <a href="#option-two">Broker in a Box</a>
          <a href="#overhead">Team 10 Overhead</a>
          <a href="#difference">The Honest Difference</a>
          <a href="#next">What&apos;s Next</a>
        </nav>

        <div className={styles.opts}>
          {/* OPTION ONE */}
          <div className={styles.opt} id="option-one">
            <div className={styles.optHead}>
              <span className={styles.optNum}>Option one</span>
              <p className={styles.optName}>Broker Associate Plan</p>
              <p className={styles.optTag}>
                You stay sponsored by Collective Realty Co., keep your team, and take the top split
                in the firm.
              </p>
            </div>
            <div className={styles.optBody}>
              <div className={styles.figs}>
                <div className={styles.fig}>
                  <span className={styles.figValue}>97/3</span>
                  <span className={styles.figKey}>Your sales</span>
                </div>
                <div className={styles.fig}>
                  <span className={styles.figValue}>95/5</span>
                  <span className={styles.figKey}>Your leases</span>
                </div>
                <div className={styles.fig}>
                  <span className={styles.figValue}>90/10</span>
                  <span className={styles.figKey}>Your team</span>
                </div>
                <div className={styles.fig}>
                  <span className={styles.figValue}>$799</span>
                  <span className={styles.figKey}>Per year, all in</span>
                </div>
              </div>

              <div className={styles.pull}>
                <span>
                  <strong>The 90 is yours to carve.</strong> On every deal your agents close,
                  ninety percent comes to your team and you decide how it splits between you and the
                  agent. Collective Realty Co. takes ten, and that ten is your overhead.
                </span>
              </div>

              <div className={styles.grp}>
                <span className={styles.grpTitle}>Your economics</span>
                <ul className={styles.list}>
                  <li>
                    <strong>97/3 on every sale you personally close.</strong> No cap.
                  </li>
                  <li>
                    <strong>95/5 on every lease you personally close.</strong> No cap.
                  </li>
                  <li>
                    <strong>90/10 on your team&apos;s production.</strong> Sales and leases both.
                    You carve your share out of the 90, and the 10 is your overhead.
                  </li>
                  <li>Processing fees stay exactly as they are today. Nothing new added.</li>
                  <li>
                    The New Agent Plan coaching fee still applies to your agents&apos; first five
                    deals, unchanged.
                  </li>
                  <li>Your agents continue on the standard monthly agent fee.</li>
                  <li>
                    <strong>$799 a year for errors and omissions,</strong> deducted once from your
                    first sale of the year. Never from a lease. If you close no sales, it does not
                    come out of a lease to reach it.
                  </li>
                </ul>
              </div>

              <div className={styles.grp}>
                <span className={styles.grpTitle}>What the firm carries for you</span>
                <ul className={`${styles.list} ${styles.plain}`}>
                  <li>TREC sponsorship, and the firm accepts your broker associate association</li>
                  <li>Errors and omissions coverage under the firm&apos;s policy</li>
                  <li>Full compliance and contract review on every file, both offices</li>
                  <li>CDA and commission statement preparation on every deal</li>
                  <li>Commission calculation and payout processing</li>
                  <li>1099 and W-9 administration</li>
                  <li>
                    Collective Agent: transaction management, checklists, compliance tracking,
                    reporting
                  </li>
                  <li>Microsoft 365 mailbox and firm email</li>
                  <li>Training Center, on demand, contracts through systems and process</li>
                  <li>Coaching calendar, including your own training program carried by the firm</li>
                  <li>Branded listing flyers and a firm email signature</li>
                  <li>Canva Pro</li>
                  <li>Your profile on the public roster</li>
                  <li>
                    Your team registered with the firm, agreements and splits administered by
                    operations
                  </li>
                  <li>
                    Coverage of you and your team by the broker and operations when you are
                    away, up to 30 scheduled days a year
                  </li>
                  <li>Two offices, Houston and Irving</li>
                </ul>
              </div>

              <div className={styles.grp}>
                <span className={styles.grpTitle}>What you take on</span>
                <ul className={styles.list}>
                  <li>
                    <strong>First escalation for your team.</strong> Your agents bring their
                    questions to you before they come to the firm. Agents outside your team route
                    to Courtney, except while you are covering the brokerage.
                  </li>
                  <li>
                    <strong>
                      Delegated supervisor for your team, and for the brokerage while you are
                      covering it.
                    </strong>{' '}
                    The firm appoints you under TREC Rule 535.2. Day to day the appointment covers
                    your agents. During scheduled coverage it widens to every sponsored license
                    holder, because there is no one else it can fall to. It comes with the six hour
                    Broker Responsibility course in every continuing education cycle, and Courtney
                    remains ultimately responsible throughout, as the rule requires.
                  </li>
                  <li>
                    <strong>Which means you go on their contracts.</strong> Your name and license
                    number appear as the Licensed Supervisor of Sales Agent/Associate on your
                    agents&apos; Information About Brokerage Services form, and you are named on
                    their agreements. Every client they sign sees your name on the paperwork, and
                    every file they submit carries it.
                  </li>
                  <li>
                    <strong>A monthly training program in your specialty,</strong> run as a firm
                    program and open to every agent, not only yours.
                  </li>
                  <li>
                    <strong>Coverage that runs both ways, up to 30 scheduled days a year each.</strong>{' '}
                    You cover the brokerage on sales and leases when the broker is away, which
                    means every sponsored agent and not only your own. The broker and operations
                    cover you and your team when you are away. <strong>It applies to any absence of
                    three days or more.</strong> Anything shorter is resolved by whoever is out
                    rather than handed off. Scheduled in advance in either direction, not on call,
                    and not open ended.
                  </li>
                </ul>
              </div>

              <div className={styles.grp}>
                <span className={styles.grpTitle}>What is required</span>
                <ul className={`${styles.list} ${styles.plain}`}>
                  <li>An active Texas broker license, kept active</li>
                  <li>
                    Submit the associate broker request in the TREC REALM portal so the firm can
                    approve it
                  </li>
                  <li>Every deal through brokerage compliance, yours and your team&apos;s</li>
                  <li>Your agents keep their monthly fees current</li>
                </ul>
              </div>

              <div className={styles.grp}>
                <span className={styles.grpTitle}>If your license lapses or goes inactive</span>
                <p>
                  Texas is not flexible on this. An active license is required to negotiate a
                  transaction, and doing brokerage work with an inactive one is a violation subject
                  to sanctions (Texas Occupations Code 1101.351(c)). So the day your license goes
                  inactive, three things happen at once and none of them can wait.
                </p>
                <ul className={styles.list}>
                  <li>
                    <strong>You cannot be paid.</strong> The firm cannot legally disburse a
                    commission to an inactive license holder. Every payout that lands during the
                    lapse stops where it is, yours and anything of yours in process.
                  </li>
                  <li>
                    <strong>Your agents&apos; paperwork breaks.</strong> Your name sits on their
                    contracts as their Licensed Supervisor. With an inactive license you are not
                    one, so every affected file has to be corrected, re-papered, and in some cases
                    re-disclosed to the client.
                  </li>
                  <li>
                    <strong>The firm absorbs your role that day.</strong> Escalations, supervision
                    and your coverage days revert to the broker with no notice and no handoff.
                  </li>
                </ul>
                <p>
                  The fees below are not a penalty for being late. They pay for the work of
                  unwinding all of that, and for the deals that sit still while it happens.
                </p>
                <ul className={styles.list}>
                  <li>
                    <strong>$750 per sale</strong> and <strong>$250 per lease,</strong> assessed
                    against every deal that is pending or active, and against every closed sale or
                    moved in lease whose payout reaches the firm while your license is inactive.
                  </li>
                  <li>
                    <strong>$350 to reinstate,</strong> once your license is active again.
                  </li>
                  <li>
                    <strong>There is no grace period.</strong> The problems start the day the license
                    goes inactive, not a week later, so the fees start there too. Renewing on time is
                    entirely within your control, and this is the one requirement with no room in it.
                  </li>
                </ul>
              </div>

              <div className={styles.grp}>
                <span className={styles.grpTitle}>This is not a closed door</span>
                <p>
                  Taking the broker associate plan now does not take the other option off the table.
                  If you decide in a year, or in five, that you want your own brokerage, that
                  conversation is still available to you on the same terms.
                </p>
              </div>
            </div>
          </div>

          {/* OPTION TWO */}
          <div className={`${styles.opt} ${styles.optDark}`} id="option-two">
            <div className={styles.optHead}>
              <span className={styles.optNum}>Option two</span>
              <p className={styles.optName}>Broker in a Box</p>
              <p className={styles.optTag}>
                You open your own brokerage, under your own brand, with our systems and our help
                getting it off the ground.
              </p>
            </div>
            <div className={styles.optBody}>
              <div className={styles.figs}>
                <div className={styles.fig}>
                  <span className={styles.figValue}>$10,000</span>
                  <span className={styles.figKey}>One time</span>
                </div>
                <div className={styles.fig}>
                  <span className={styles.figValue}>6 mo</span>
                  <span className={styles.figKey}>Coaching and assistance</span>
                </div>
                <div className={styles.fig}>
                  <span className={styles.figValue}>100%</span>
                  <span className={styles.figKey}>Yours after that</span>
                </div>
              </div>

              <p className={styles.intro}>
                This is not a franchise and it is not a partnership. You are buying{' '}
                <strong>the operating manual for a brokerage</strong>: every document, every process
                we run, and six months of the broker who built it on the phone with you. After that
                it is yours outright, and we have no claim on any of it.
              </p>

              <div className={styles.pull}>
                <span>
                  <strong>No ongoing split.</strong> You pay once, you own your brokerage, and
                  Collective Realty Co. takes nothing from your production ever again.
                </span>
              </div>

              <div className={styles.pull}>
                <span>
                  <strong>Your agents choose for themselves.</strong> No agent on your team is told
                  where to go, and none are held back. That is their decision to make and we will
                  not stand in the way of it either direction.
                </span>
              </div>

              <div className={styles.grp}>
                <span className={styles.grpTitle}>How it works</span>
                <ul className={styles.steps}>
                  <li>
                    <span className={styles.stepWhen}>Before you pay anything</span>
                    <span className={styles.stepWhat}>
                      You see the complete handover list first, every document and every process,
                      item by item. Nothing is signed and nothing is paid until you have read it and
                      asked whatever you want to ask.
                    </span>
                  </li>
                  <li>
                    <span className={styles.stepWhen}>Day one, the handover</span>
                    <span className={styles.stepWhat}>
                      A full day going through the box document by document. You leave with every
                      template, every process written down, and a launch plan with real dates on it.
                    </span>
                  </li>
                  <li>
                    <span className={styles.stepWhen}>Your first 30 days</span>
                    <span className={styles.stepWhat}>
                      You form your entity, put your broker license and your own E&amp;O in place,
                      open your MLS and association accounts, and stand your systems up. We meet
                      weekly. You open for business inside 30 days.
                    </span>
                  </li>
                  <li>
                    <span className={styles.stepWhen}>Months two and three</span>
                    <span className={styles.stepWhat}>
                      Your first deals close and the real questions arrive, the ones no manual
                      covers. We meet every other week and work through them as they happen.
                    </span>
                  </li>
                  <li>
                    <span className={styles.stepWhen}>Months four to six</span>
                    <span className={styles.stepWhat}>
                      Monthly. By now you are running it. We are there for whatever you have not
                      seen before.
                    </span>
                  </li>
                  <li>
                    <span className={styles.stepWhen}>After that</span>
                    <span className={styles.stepWhat}>
                      It is yours. No split, no fees, no reporting to anyone. Call if you want to,
                      but you will not need to.
                    </span>
                  </li>
                </ul>
              </div>

              <div className={styles.grp}>
                <span className={styles.grpTitle}>The systems you receive</span>
                <ul className={styles.list}>
                  <li>
                    <strong>The full onboarding system.</strong> Prospective agent form, join form,
                    payment, checklist, TREC invitation, MLS setup for HAR, MetroTex and NTREIS,
                    welcome sequence, systems access.
                  </li>
                  <li>
                    <strong>Every agreement template.</strong> Independent contractor agreement,
                    commission plan agreement, policies and procedures, team agreements, sponsorship
                    termination notice.
                  </li>
                  <li>
                    <strong>The commission plan architecture.</strong> Cap, no cap, new agent and
                    lease plans, the qualifying transaction graduation, and the team split structures
                    behind them.
                  </li>
                  <li>
                    <strong>The compliance workflow.</strong> Required document lists by transaction
                    type, review checklists, the CDA process, and the side-by-side review model.
                  </li>
                  <li>
                    <strong>Training Center structure and curriculum outline.</strong>
                  </li>
                  <li>
                    <strong>Coaching program design</strong> and the calendar that runs it.
                  </li>
                  <li>
                    <strong>Agent billing setup.</strong> Subscription and invoicing configuration
                    end to end.
                  </li>
                  <li>
                    <strong>Vendor setup guidance.</strong> Associations and MLS, transaction
                    platform, e-signature, email, video, design tools.
                  </li>
                  <li>
                    <strong>Collective Agent is separate.</strong> The app itself is not part of the
                    handover. If you want to keep running on it after you launch, it is available to
                    you by subscription and we will quote it when you ask.
                  </li>
                  <li>
                    <strong>The full inventory comes before you decide.</strong> Every item above
                    breaks down into a line by line list, roughly fifty of them, and it is attached
                    to the agreement so there is never a question about what you were handed.
                  </li>
                </ul>
              </div>

              <div className={styles.grp}>
                <span className={styles.grpTitle}>The coaching you receive</span>
                <ul className={styles.list}>
                  <li>
                    <strong>Six months of coaching and assistance,</strong> starting at handover.
                  </li>
                  <li>
                    Direct broker coaching from Courtney Okanlomo on broker responsibility,
                    supervising sponsored license holders, written policies and procedures,
                    complaint handling and TREC audits.
                  </li>
                  <li>
                    Help standing up your own compliance and payout process before your first deal
                    closes.
                  </li>
                  <li>
                    Someone to call when something comes up that you have not seen before, for the
                    whole six months.
                  </li>
                </ul>
              </div>

              <div className={styles.grp}>
                <span className={styles.grpTitle}>What you commit to</span>
                <ul className={styles.list}>
                  <li>
                    <strong>Launch within 30 days</strong> of the handover starting. This is a fast,
                    deliberate window, and the six months of coaching runs alongside your first
                    months of operating rather than before them.
                  </li>
                  <li>
                    <strong>Paid in full before the handover begins.</strong> No deposit and no
                    balance to chase.
                  </li>
                  <li>
                    <strong>Confidentiality.</strong> Use every one of these systems in your own
                    brokerage. Do not publish them, resell them, or hand them to another brokerage.
                  </li>
                  <li>
                    <strong>Your own brand.</strong> This grants no right to the Collective Realty
                    Co. name, logo or marks.
                  </li>
                </ul>
              </div>

              <div className={styles.grp}>
                <span className={styles.grpTitle}>What is required</span>
                <ul className={`${styles.list} ${styles.plain}`}>
                  <li>
                    An active Texas broker license, plus a business entity broker license if you
                    form an entity
                  </li>
                  <li>Your own errors and omissions policy</li>
                  <li>Your own MLS and association memberships</li>
                  <li>Your own accounts, and a way to receive and disburse commissions</li>
                </ul>
              </div>

              <div className={styles.grp}>
                <span className={styles.grpTitle}>Why we would do this</span>
                <p>
                  Every brokerage eventually loses the people who outgrow it, and most of them lose
                  those people badly. A resignation nobody saw coming, a scramble to cover the files,
                  and a competitor across town who learned the business at your expense.
                </p>
                <p>
                  We would rather hand it over on purpose. You leave ready instead of guessing, we
                  stay on good terms, and we keep sending business to someone we trained and trust.
                  This option exists because leaving well is better for both of us than leaving
                  quietly.
                </p>
              </div>
            </div>
          </div>
        </div>

        <hr className={styles.ruleAfterOpts} />

        <section className={styles.section} id="overhead">
          <p className={styles.eyebrow}>What the 10 covers</p>
          <h2 className={styles.h2}>
            The ten is your overhead, and it is the cheaper way to buy it
          </h2>
          <p>
            The ten percent is not a fee for access. It is the cost of running a brokerage, and
            under option one you are buying it wholesale instead of assembling it yourself.
            Everything below is priced for what you would actually be standing up: you and the five
            agents on your team, at the volume that team closed in the last twelve months, at
            published 2026 rates.
          </p>
          <div className={styles.two}>
            <div className={styles.grp}>
              <span className={styles.grpTitle}>
                What you pay sponsored by Collective Realty Co.
              </span>
              <ul className={`${styles.list} ${styles.plain}`}>
                <li>
                  <strong>Your broker license, $217 every two years.</strong> You pay this in either
                  scenario. TREC charges no separate fee for the associated broker designation.
                </li>
                <li>
                  <strong>$799 a year for errors and omissions,</strong> taken once from your first
                  sale of the year.
                </li>
                <li>
                  <strong>The 10 on your team&apos;s production.</strong> That is the whole of it,
                  and it covers all six of you. It scales with what the team produces, so a slow
                  quarter costs you almost nothing.
                </li>
              </ul>
            </div>
            <div className={styles.grp}>
              <span className={styles.grpTitle}>
                What the same overhead costs with your team at your own firm
              </span>
              <ul className={styles.list}>
                <li>
                  <strong>
                    Firm errors and omissions covering all six license holders, up to $2,000 a year
                    for a small brokerage.
                  </strong>{' '}
                  Your real number is a quote, not a lookup. What changes is not only the price:
                  today your $799 buys you a seat on our policy, and there you are the named
                  insured, holding the deductible and the claims history for all six.
                </li>
                <li>
                  <strong>General liability, roughly $400 a year.</strong>
                </li>
                <li>
                  <strong>
                    A second broker license for the company, $235 to open and $217 every two years
                  </strong>{' '}
                  after, on top of the $217 for your own. Texas requires any business entity that
                  receives commission on behalf of its license holders to hold its own broker
                  license, with you named as its designated broker (Occupations Code 1101.355). You
                  could skip it by operating as a sole proprietor in your own name, but then you are
                  personally on the hook for everything the firm does, which is the reason to form
                  the company in the first place.
                </li>
                <li>
                  <strong>Entity formation, $300</strong> to file in Texas, plus a registered agent
                  every year after that.
                </li>
                <li>
                  <strong>The MLS broker of record slot, $85 a month.</strong> HAR bills the broker
                  of record $85 where a regular subscriber pays $35, so the same MLS costs $600 a
                  year more once it is your name on the participation.
                </li>
                <li>
                  <strong>Coordination and compliance on 109 files.</strong> That is what your six
                  closed in the last twelve months. Contract to close runs $340 to $500 a file
                  outsourced, and an in house coordinator runs about $69,100 fully loaded. Today
                  this is done for you on every one of those files.
                </li>
                <li>
                  <strong>Office space, if you want one.</strong> Class B in Houston averaged $22.13
                  a square foot. Room for six is roughly 1,200 square feet, about $26,500 a year
                  before utilities. Home based is the cheaper start, and it is why the lean range
                  below exists.
                </li>
                <li>
                  <strong>Six seats instead of one firm account</strong> on transaction management,
                  e-signature, email and storage.
                </li>
                <li>
                  <strong>Four years of records</strong> on every one of those files, kept and
                  produceable on demand under TREC Rule 535.2.
                </li>
                <li>
                  <strong>
                    Written policies, supervision, advertising compliance and a trust account,
                  </strong>{' '}
                  plus final responsibility for six license holders, yourself included.
                </li>
              </ul>
            </div>
          </div>
          <div className={styles.pull}>
            <span>
              <strong>Coordination is the line that decides this, not insurance.</strong> At 109
              files a year, contract to close alone is $37,000 to $54,500 outsourced, or one full
              time coordinator. Everything else on the list sits on top of that, and standing the
              firm up costs $10,000 to $25,000 lean before any of it. None of it scales down in the
              months nobody closes.
            </span>
          </div>
          <p className={styles.foot}>
            Figures are published rates: the TREC fee schedule effective December 2025, HAR&apos;s
            current MLS subscription pricing, Houston Class B average asking rent, published firm
            errors and omissions ranges by commission income, and published transaction coordination
            rates. File count is your team&apos;s closed and check received transactions over the
            last twelve months. Your own quotes will land where they land. Sources are listed with
            this page.
          </p>
        </section>

        <hr className={styles.rule} />

        <section className={styles.section} id="difference">
          <p className={styles.eyebrow}>The honest difference</p>
          <h2 className={styles.h2}>One question, two answers</h2>
          <p>
            Option one gives you the best economics in the firm and leaves the infrastructure with
            us. Option two gives you everything and leaves the infrastructure with you. Neither is
            the safe choice or the ambitious one. They are different jobs.
          </p>
          <div className={styles.two}>
            <div className={styles.grp}>
              <span className={styles.grpTitle}>Broker Associate Plan</span>
              <ul className={`${styles.list} ${styles.plain}`}>
                <li>
                  <strong>You carry</strong> your own production, your team, their first escalations,
                  your name on their contracts, your training program, and up to 30 scheduled days
                  covering the brokerage.
                </li>
                <li>
                  <strong>You and your team get covered too,</strong> up to 30 scheduled days a
                  year, by the broker and operations, when you are away three days or more.
                </li>
                <li>
                  <strong>We carry</strong> compliance, payouts, errors and omissions, systems,
                  1099s, and final responsibility for every license holder. That is what the 10
                  buys.
                </li>
                <li>
                  <strong>On a slow month</strong> almost nothing is owed, because the annual fee
                  only comes out of a sale.
                </li>
                <li>
                  <strong>Your ceiling</strong> is how much you and your team can produce.
                </li>
              </ul>
            </div>
            <div className={styles.grp}>
              <span className={styles.grpTitle}>Broker in a Box</span>
              <ul className={`${styles.list} ${styles.plain}`}>
                <li>
                  <strong>You carry</strong> all of it, including licensing, supervision and
                  liability, from day 30 onward.
                </li>
                <li>
                  <strong>We carry</strong> six months of coaching alongside you, and nothing after
                  that.
                </li>
                <li>
                  <strong>On a slow month</strong> your overhead runs whether you close or not.
                </li>
                <li>
                  <strong>Your ceiling</strong> is whatever you decide to build.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <hr className={styles.rule} />

        <section className={styles.section} id="next">
          <p className={styles.eyebrow}>Next</p>
          <h2 className={styles.h2}>Take the time you need</h2>
          <div className={styles.two}>
            <div className={styles.grp}>
              <span className={styles.grpTitle}>If you are leaning toward option one</span>
              <ul className={`${styles.list} ${styles.plain}`}>
                <li>Confirm your broker license status with TREC</li>
                <li>Submit the associate broker request in REALM</li>
                <li>We paper the plan and your team agreements together</li>
              </ul>
            </div>
            <div className={styles.grp}>
              <span className={styles.grpTitle}>If you are leaning toward option two</span>
              <ul className={`${styles.list} ${styles.plain}`}>
                <li>Sit down with Courtney on what your first 30 days look like</li>
                <li>We scope the handover list and the six month coaching schedule</li>
                <li>Nothing is signed and nothing is paid until you have seen every document</li>
              </ul>
            </div>
          </div>
          <p className={styles.foot}>
            Both of these are offers, not deadlines. Neither is final until it is in writing and you
            have had time to read every document. Questions about either one go to Tara Butler or
            Courtney Okanlomo.
          </p>
        </section>
      </div>
    </Shell>
  )
}
