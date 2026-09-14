import { headers } from 'next/headers'
import LuxuryHeader from '@/components/shared/LuxuryHeader'
import AuthFooter from '@/components/shared/AuthFooter'
import CornerLines from '@/components/shared/CornerLines'
import { getUserPermissions } from '@/lib/permissions'
import { Check, AlertTriangle, ArrowRight, ShieldX } from 'lucide-react'

// This is a server component on purpose. The offer terms name specific splits
// and fees for one person, so they must never ship in a client bundle that any
// authenticated user could read. Middleware has already required a session and
// set x-user-id by the time this runs; the permission check happens here, and
// the content below is only rendered for someone who passes it.
export const dynamic = 'force-dynamic'

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex flex-col bg-luxury-light overflow-hidden">
      <CornerLines thickness="normal" />
      <div className="relative z-10 flex flex-col flex-1">
        <div className="h-[3px] w-full bg-luxury-accent" />
        <LuxuryHeader showTrainingCenter={false} />
        <div className="h-20" />
        <div className="flex-1 relative z-[1] p-6">
          <div className="max-w-[900px] mx-auto">{children}</div>
        </div>
        <AuthFooter />
      </div>
    </div>
  )
}

function AccessDenied() {
  return (
    <div className="container-card max-w-md mx-auto text-center py-12">
      <div className="w-16 h-16 rounded-full bg-luxury-gray-6 flex items-center justify-center mx-auto mb-4">
        <ShieldX className="w-8 h-8 text-luxury-gray-3" />
      </div>
      <p className="text-sm font-semibold text-luxury-gray-1 mb-2">Not available</p>
      <p className="text-xs text-luxury-gray-3">
        This page is not available on your account.
      </p>
    </div>
  )
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-4 h-4 rounded-full bg-chart-gold-1 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Check className="w-2.5 h-2.5 text-chart-gold-9" />
      </div>
      <p className="text-xs text-luxury-gray-2">{children}</p>
    </div>
  )
}

function PlainBullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-4 h-4 rounded-full bg-luxury-gray-6 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Check className="w-2.5 h-2.5 text-luxury-gray-3" />
      </div>
      <p className="text-xs text-luxury-gray-2">{children}</p>
    </div>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3 mt-5">
      {children}
    </p>
  )
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <p className="text-3xl font-bold text-chart-gold-9 whitespace-nowrap">{value}</p>
      <p className="text-xs text-luxury-gray-3 uppercase tracking-wider mt-1">{label}</p>
    </div>
  )
}

function Step({ when, what }: { when: string; what: string }) {
  return (
    <div className="flex items-start gap-3">
      <ArrowRight className="w-4 h-4 text-luxury-accent flex-shrink-0 mt-1" />
      <div>
        <p className="text-xs font-semibold text-luxury-gray-1 uppercase tracking-wider mb-1">
          {when}
        </p>
        <p className="text-xs text-luxury-gray-2">{what}</p>
      </div>
    </div>
  )
}

export default async function BrokerAssociateOfferPage() {
  const userId = (await headers()).get('x-user-id')
  const permissions = userId ? await getUserPermissions(userId) : new Set<string>()

  if (!permissions.has('can_view_broker_offer')) {
    return (
      <PageShell>
        <AccessDenied />
      </PageShell>
    )
  }

  return (
    <PageShell>
      <div className="text-center mb-8">
        <h1 className="page-title mb-1">Broker Associate or Broker in a Box</h1>
        <p className="text-xs font-semibold text-luxury-accent uppercase tracking-widest mb-3">
          Collective Realty Co. · Two Paths
        </p>
        <p className="text-sm text-luxury-gray-2 max-w-xl mx-auto">
          One keeps you sponsored by Collective Realty Co. on the top split in the firm. The other
          hands you our systems so you can open your own brokerage. They are different jobs, not
          better and worse versions of the same one.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* OPTION ONE */}
        <div className="container-card">
          <p className="section-title">Option One</p>
          <p className="text-xl font-bold text-luxury-gray-1 mb-1">Broker Associate Plan</p>
          <p className="text-xs text-luxury-gray-3 mb-4">
            You stay sponsored by Collective Realty Co., keep your team, and take the top split in
            the firm.
          </p>

          <div className="inner-card grid grid-cols-2 gap-4 mb-2">
            <Figure value="97/3" label="Your sales" />
            <Figure value="95/5" label="Your leases" />
            <Figure value="85/15" label="Your team" />
            <Figure value="$799" label="Per year, all in" />
          </div>

          <div className="inner-card bg-chart-gold-1 mt-3">
            <p className="text-xs text-luxury-gray-1">
              <strong>The 85 is yours to carve.</strong> On every deal your agents close, eighty
              five percent comes to your team and you decide how it splits between you and the
              agent. Collective Realty Co. takes fifteen and nothing else.
            </p>
          </div>

          <GroupLabel>Your economics</GroupLabel>
          <div className="space-y-3">
            <Bullet>
              <strong>97/3 on every sale you personally close.</strong> No cap.
            </Bullet>
            <Bullet>
              <strong>95/5 on every lease you personally close.</strong> No cap.
            </Bullet>
            <Bullet>
              <strong>85/15 on your team&apos;s production.</strong> Sales and leases both. You
              carve your share out of the 85.
            </Bullet>
            <Bullet>Processing fees stay exactly as they are today. Nothing new added.</Bullet>
            <Bullet>
              The New Agent Plan coaching fee still applies to your agents&apos; first five deals,
              unchanged.
            </Bullet>
            <Bullet>Your agents continue on the standard monthly agent fee.</Bullet>
            <Bullet>
              <strong>$799 a year for errors and omissions,</strong> deducted once from your first
              sale of the year. Never from a lease. If you close no sales, it does not come out of
              a lease to reach it.
            </Bullet>
          </div>

          <GroupLabel>What the firm carries for you</GroupLabel>
          <div className="space-y-3">
            <PlainBullet>
              TREC sponsorship, and the firm accepts your broker associate association
            </PlainBullet>
            <PlainBullet>Errors and omissions coverage under the firm&apos;s policy</PlainBullet>
            <PlainBullet>Full compliance and contract review on every file, both offices</PlainBullet>
            <PlainBullet>CDA and commission statement preparation on every deal</PlainBullet>
            <PlainBullet>Commission calculation and payout processing</PlainBullet>
            <PlainBullet>1099 and W-9 administration</PlainBullet>
            <PlainBullet>
              Collective Agent: transaction management, checklists, compliance tracking, reporting
            </PlainBullet>
            <PlainBullet>Microsoft 365 mailbox and firm email</PlainBullet>
            <PlainBullet>
              Training Center, on demand, contracts through systems and process
            </PlainBullet>
            <PlainBullet>
              Coaching calendar, including your own training program carried by the firm
            </PlainBullet>
            <PlainBullet>Branded listing flyers and a firm email signature</PlainBullet>
            <PlainBullet>Canva Pro</PlainBullet>
            <PlainBullet>Your profile on the public roster</PlainBullet>
            <PlainBullet>
              Your team registered with the firm, agreements and splits administered by operations
            </PlainBullet>
            <PlainBullet>
              Coverage of your team by operations when you travel, up to 30 scheduled days a year
            </PlainBullet>
            <PlainBullet>Two offices, Houston and Irving</PlainBullet>
          </div>

          <GroupLabel>What you take on</GroupLabel>
          <div className="space-y-3">
            <Bullet>
              <strong>First escalation for your team.</strong> Your agents bring their questions to
              you before they come to the firm. Agents outside your team continue to route to the
              broker.
            </Bullet>
            <Bullet>
              <strong>Delegated supervisor for your team.</strong> The firm appoints you under TREC
              Rule 535.2. It comes with the six hour Broker Responsibility course in every
              continuing education cycle, and the broker remains ultimately responsible for every
              sponsored license holder, as the rule requires.
            </Bullet>
            <Bullet>
              <strong>Which means you go on their contracts.</strong> Your name and license number
              appear as the Licensed Supervisor of Sales Agent/Associate on your agents&apos;
              Information About Brokerage Services form, and you are named on their agreements.
              Every client they sign sees your name on the paperwork, and every file they submit
              carries it.
            </Bullet>
            <Bullet>
              <strong>A monthly training program in your specialty,</strong> run as a firm program
              and open to every agent, not only yours.
            </Bullet>
            <Bullet>
              <strong>Coverage that runs both ways, up to 30 scheduled days a year each.</strong>{' '}
              You cover the broker on sales and leases when she is away. Operations covers your team
              when you travel. It applies to any absence of three days or more. Anything shorter is
              resolved by whoever is out rather than handed off. Scheduled in advance either
              direction, not on call, and not open ended.
            </Bullet>
          </div>

          <GroupLabel>What is required</GroupLabel>
          <div className="space-y-3">
            <PlainBullet>An active Texas broker license, kept active</PlainBullet>
            <PlainBullet>
              Submit the associate broker request in the TREC REALM portal so the firm can approve it
            </PlainBullet>
            <PlainBullet>
              Every deal through brokerage compliance, yours and your team&apos;s
            </PlainBullet>
            <PlainBullet>Your agents keep their monthly fees current</PlainBullet>
          </div>

          <div className="container-card mt-5 border-2 border-yellow-500">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-yellow-800 uppercase tracking-wider mb-2">
                  If your license lapses or goes inactive
                </p>
                <p className="text-xs text-luxury-gray-1 mb-3">
                  Texas is not flexible on this. An active license is required to negotiate a
                  transaction, and doing brokerage work with an inactive one is a violation subject
                  to sanctions (Texas Occupations Code 1101.351(c)). So the day your license goes
                  inactive, three things happen at once and none of them can wait.
                </p>
                <div className="space-y-3 mb-3">
                  <PlainBullet>
                    <strong>You cannot be paid.</strong> The firm cannot legally disburse a
                    commission to an inactive license holder. Every payout that lands during the
                    lapse stops where it is.
                  </PlainBullet>
                  <PlainBullet>
                    <strong>Your agents&apos; paperwork breaks.</strong> Your name sits on their
                    contracts as their Licensed Supervisor. With an inactive license you are not
                    one, so every affected file has to be corrected, re-papered, and in some cases
                    re-disclosed to the client.
                  </PlainBullet>
                  <PlainBullet>
                    <strong>The firm absorbs your role that day.</strong> Escalations, supervision
                    and your coverage days revert to the broker with no notice and no handoff.
                  </PlainBullet>
                </div>
                <p className="text-xs text-luxury-gray-1 mb-3">
                  The fees below are not a penalty for being late. They pay for the work of
                  unwinding all of that, and for the deals that sit still while it happens.
                </p>
                <div className="space-y-3">
                  <Bullet>
                    <strong>$750 per sale</strong> and <strong>$250 per lease,</strong> assessed
                    against every deal that is pending or active, and against every closed sale or
                    moved in lease whose payout reaches the firm while your license is inactive.
                  </Bullet>
                  <Bullet>
                    <strong>$350 to reinstate,</strong> once your license is active again.
                  </Bullet>
                  <Bullet>
                    <strong>There is no grace period.</strong> The problems start the day the
                    license goes inactive, not a week later, so the fees start there too. Renewing
                    on time is entirely within your control, and this is the one requirement with no
                    room in it.
                  </Bullet>
                </div>
              </div>
            </div>
          </div>

          <GroupLabel>This is not a closed door</GroupLabel>
          <p className="text-xs text-luxury-gray-2">
            Taking the broker associate plan now does not take the other option off the table. If
            you decide in a year, or in five, that you want your own brokerage, that conversation is
            still available to you on the same terms.
          </p>
        </div>

        {/* OPTION TWO */}
        <div className="container-card">
          <p className="section-title">Option Two</p>
          <p className="text-xl font-bold text-luxury-gray-1 mb-1">Broker in a Box</p>
          <p className="text-xs text-luxury-gray-3 mb-4">
            You open your own brokerage, under your own brand, with our systems and our help getting
            it off the ground.
          </p>

          <div className="inner-card grid grid-cols-3 gap-3 mb-2">
            <Figure value="$10,000" label="One time" />
            <Figure value="6 mo" label="Coaching" />
            <Figure value="100%" label="Yours after" />
          </div>

          <p className="text-xs text-luxury-gray-2 mt-3">
            This is not a franchise and it is not a partnership. You are buying{' '}
            <strong>the operating manual for a brokerage</strong>: every document, every process we
            run, and six months of the broker who built it on the phone with you. After that it is
            yours outright, and we have no claim on any of it.
          </p>

          <div className="inner-card bg-chart-gold-1 mt-3">
            <p className="text-xs text-luxury-gray-1 mb-2">
              <strong>No ongoing split.</strong> You pay once, you own your brokerage, and
              Collective Realty Co. takes nothing from your production ever again.
            </p>
            <p className="text-xs text-luxury-gray-1">
              <strong>Your agents choose for themselves.</strong> No agent on your team is told
              where to go, and none are held back. That is their decision to make and we will not
              stand in the way of it either direction.
            </p>
          </div>

          <GroupLabel>How it works</GroupLabel>
          <div className="space-y-4">
            <Step
              when="Before you pay anything"
              what="You see the complete handover list first, every document and every process, item by item. Nothing is signed and nothing is paid until you have read it and asked whatever you want to ask."
            />
            <Step
              when="Day one, the handover"
              what="A full day going through the box document by document. You leave with every template, every process written down, and a launch plan with real dates on it."
            />
            <Step
              when="Your first 30 days"
              what="You form your entity, put your broker license and your own E&O in place, open your MLS and association accounts, and stand your systems up. We meet weekly. You open for business inside 30 days."
            />
            <Step
              when="Months two and three"
              what="Your first deals close and the real questions arrive, the ones no manual covers. We meet every other week and work through them as they happen."
            />
            <Step
              when="Months four to six"
              what="Monthly. By now you are running it. We are there for whatever you have not seen before."
            />
            <Step
              when="After that"
              what="It is yours. No split, no fees, no reporting to anyone. Call if you want to, but you will not need to."
            />
          </div>

          <GroupLabel>The systems you receive</GroupLabel>
          <div className="space-y-3">
            <Bullet>
              <strong>The full onboarding system.</strong> Prospective agent form, join form,
              payment, checklist, TREC invitation, MLS setup for HAR, MetroTex and NTREIS, welcome
              sequence, systems access.
            </Bullet>
            <Bullet>
              <strong>Every agreement template.</strong> Independent contractor agreement,
              commission plan agreement, policies and procedures, team agreements, sponsorship
              termination notice.
            </Bullet>
            <Bullet>
              <strong>The commission plan architecture.</strong> Cap, no cap, new agent and lease
              plans, the qualifying transaction graduation, and the team split structures behind
              them.
            </Bullet>
            <Bullet>
              <strong>The compliance workflow.</strong> Required document lists by transaction type,
              review checklists, the CDA process, and the side by side review model.
            </Bullet>
            <Bullet>
              <strong>Training Center structure and curriculum outline.</strong>
            </Bullet>
            <Bullet>
              <strong>Coaching program design</strong> and the calendar that runs it.
            </Bullet>
            <Bullet>
              <strong>Agent billing setup.</strong> Subscription and invoicing configuration end to
              end.
            </Bullet>
            <Bullet>
              <strong>Vendor setup guidance.</strong> Associations and MLS, transaction platform,
              e-signature, email, video, design tools.
            </Bullet>
            <Bullet>
              <strong>Collective Agent is separate.</strong> The app itself is not part of the
              handover. If you want to keep running on it after you launch, it is available to you
              by subscription and we will quote it when you ask.
            </Bullet>
            <Bullet>
              <strong>The full inventory comes before you decide.</strong> Every item above breaks
              down into a line by line list, roughly fifty of them, and it is attached to the
              agreement so there is never a question about what you were handed.
            </Bullet>
          </div>

          <GroupLabel>The coaching you receive</GroupLabel>
          <div className="space-y-3">
            <Bullet>
              <strong>Six months of coaching and assistance,</strong> starting at handover.
            </Bullet>
            <Bullet>
              Direct broker coaching on broker responsibility, supervising sponsored license
              holders, written policies and procedures, complaint handling and TREC audits.
            </Bullet>
            <Bullet>
              Help standing up your own compliance and payout process before your first deal closes.
            </Bullet>
            <Bullet>
              Someone to call when something comes up that you have not seen before, for the whole
              six months.
            </Bullet>
          </div>

          <GroupLabel>What you commit to</GroupLabel>
          <div className="space-y-3">
            <Bullet>
              <strong>Launch within 30 days</strong> of the handover starting. This is a fast,
              deliberate window, and the six months of coaching runs alongside your first months of
              operating rather than before them.
            </Bullet>
            <Bullet>
              <strong>Paid in full before the handover begins.</strong> No deposit and no balance to
              chase.
            </Bullet>
            <Bullet>
              <strong>Confidentiality.</strong> Use every one of these systems in your own
              brokerage. Do not publish them, resell them, or hand them to another brokerage.
            </Bullet>
            <Bullet>
              <strong>Your own brand.</strong> This grants no right to the Collective Realty Co.
              name, logo or marks.
            </Bullet>
          </div>

          <GroupLabel>What is required</GroupLabel>
          <div className="space-y-3">
            <PlainBullet>
              An active Texas broker license, plus a business entity broker license if you form an
              entity
            </PlainBullet>
            <PlainBullet>Your own errors and omissions policy</PlainBullet>
            <PlainBullet>Your own MLS and association memberships</PlainBullet>
            <PlainBullet>Your own accounts, and a way to receive and disburse commissions</PlainBullet>
          </div>

          <GroupLabel>Why we would do this</GroupLabel>
          <p className="text-xs text-luxury-gray-2 mb-2">
            Every brokerage eventually loses the people who outgrow it, and most of them lose those
            people badly. A resignation nobody saw coming, a scramble to cover the files, and a
            competitor across town who learned the business at your expense.
          </p>
          <p className="text-xs text-luxury-gray-2">
            We would rather hand it over on purpose. You leave ready instead of guessing, we stay on
            good terms, and we keep sending business to someone we trained and trust. This option
            exists because leaving well is better for both of us than leaving quietly.
          </p>
        </div>
      </div>

      <div className="container-card mb-4">
        <p className="section-title">The honest difference</p>
        <p className="text-sm text-luxury-gray-2 mb-4">
          Option one gives you the best economics in the firm and leaves the infrastructure with us.
          Option two gives you everything and leaves the infrastructure with you. Neither is the
          safe choice or the ambitious one. They are different jobs.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-luxury-gray-1 uppercase tracking-wider mb-3">
              Broker Associate Plan
            </p>
            <div className="space-y-3">
              <PlainBullet>
                <strong>You carry</strong> your own production, your team, their first escalations,
                your name on their contracts, your training program, and up to 30 scheduled days
                covering the broker.
              </PlainBullet>
              <PlainBullet>
                <strong>You get covered too,</strong> up to 30 scheduled days a year, when you are
                away three days or more.
              </PlainBullet>
              <PlainBullet>
                <strong>We carry</strong> compliance, payouts, errors and omissions, systems, 1099s,
                and final responsibility for every license holder.
              </PlainBullet>
              <PlainBullet>
                <strong>On a slow month</strong> almost nothing is owed, because the annual fee only
                comes out of a sale.
              </PlainBullet>
              <PlainBullet>
                <strong>Your ceiling</strong> is how much you and your team can produce.
              </PlainBullet>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-luxury-gray-1 uppercase tracking-wider mb-3">
              Broker in a Box
            </p>
            <div className="space-y-3">
              <PlainBullet>
                <strong>You carry</strong> all of it, including licensing, supervision and
                liability, from day 30 onward.
              </PlainBullet>
              <PlainBullet>
                <strong>We carry</strong> six months of coaching alongside you, and nothing after
                that.
              </PlainBullet>
              <PlainBullet>
                <strong>On a slow month</strong> your overhead runs whether you close or not.
              </PlainBullet>
              <PlainBullet>
                <strong>Your ceiling</strong> is whatever you decide to build.
              </PlainBullet>
            </div>
          </div>
        </div>
      </div>

      <div className="container-card mb-4">
        <p className="section-title">Take the time you need</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-luxury-gray-1 uppercase tracking-wider mb-3">
              If you are leaning toward option one
            </p>
            <div className="space-y-3">
              <PlainBullet>Confirm your broker license status with TREC</PlainBullet>
              <PlainBullet>Submit the associate broker request in REALM</PlainBullet>
              <PlainBullet>We paper the plan and your team agreements together</PlainBullet>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-luxury-gray-1 uppercase tracking-wider mb-3">
              If you are leaning toward option two
            </p>
            <div className="space-y-3">
              <PlainBullet>Sit down with the broker on what your first 30 days look like</PlainBullet>
              <PlainBullet>We scope the handover list and the six month coaching schedule</PlainBullet>
              <PlainBullet>
                Nothing is signed and nothing is paid until you have seen every document
              </PlainBullet>
            </div>
          </div>
        </div>
        <p className="text-xs text-luxury-gray-3 mt-4">
          Both of these are offers, not deadlines. Neither is final until it is in writing and you
          have had time to read every document.
        </p>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-luxury-gray-5">
        <span className="text-xs font-semibold text-luxury-gray-1 uppercase tracking-wider">
          Collective Realty Co.
        </span>
        <span className="text-xs text-luxury-gray-3">TREC Licensed Brokerage · Texas</span>
      </div>
    </PageShell>
  )
}
