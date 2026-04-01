export interface PolicyAckContentParams {
  agentName: string
  effectiveDate: string
}

export function getPolicyAcknowledgmentContent({ agentName, effectiveDate }: PolicyAckContentParams) {
  return {
    title: 'BROKERAGE POLICIES AND PROCEDURES\nACKNOWLEDGMENT AND AGREEMENT',
    sections: [
      {
        body: `CONCERNING THE BROKERAGE POLICIES AND PROCEDURES OF COLLECTIVE REALTY CO.\n\nI, ${agentName} (Sales Associate), state as follows:`,
      },
      {
        body: `(1) I acknowledge receipt of a copy of the Brokerage Policies and Procedures.

(2) I have read and understand the Brokerage Policies and Procedures.

(3) I have had an opportunity to ask questions about the Brokerage Policies and Procedures.

(4) I agree to abide by the terms of the Brokerage Policies and Procedures.

(5) I understand that the Broker may, from time to time, amend the terms of the Brokerage Policies and Procedures.

(6) I understand that the Brokerage Policies and Procedures are not intended as an express or implied contract of employment. The Broker reserves the right to terminate the association of any Sales Associate at any time, with or without cause.`,
      },
      {
        body: `Date: ${effectiveDate}\n\nSponsoring Broker: Courtney Okanlomo\nCollective Realty Co.\n13201 Northwest Fwy Ste 450, Houston, TX 77040\n(281) 989-8604\n\n(TAR-2303) 07-15-13`,
      },
    ],
  }
}