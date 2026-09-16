// Plain constants shared by the recording detail page and the server side namer.
// Kept free of server imports so the client bundle can use them too.

// Program names offered in the Program dropdown, and given to the AI as the list
// it must choose from.
export const PROGRAM_NAMES = [
  'Industry Intelligence & Market Mastery Meeting',
  'Next Level Lead Gen & Marketing Coaching',
  'New Agent Coaching Circle',
  'Convert & Close Coaching',
  'Seasoned Agent Coaching Circle',
  'Monthly Apartment Locator Q&A With Maureen Eno',
  'Collective Access Coaching In Dallas With Terraneka Hill',
  'Collective Access Coaching In Houston With Eric Roberts',
  'Collective Access Coaching In Houston And Dallas With Eric Roberts And Terraneka Hill',
  'Monthly Lease Training With Briana Thomas',
  'Navigating the Training Center, Coaching & Onboarding',
  'Other',
]

// The request behind the Suggest button on the recording page. The notification
// cron sends the identical message so an automatically named recording comes out
// the same way a pressed button would.
export const AI_SUGGEST_ALL_PROMPT = 'Based on the calendar and transcript data, suggest the correct program name, 3-4 topic tags, and the best SharePoint folder for this recording. Respond with only this JSON: {"program": "Program Name", "topics": ["Topic 1", "Topic 2", "Topic 3"], "folder": "Folder Name", "title": "Full title in correct format"}'

export const AI_TOPIC_TAGS_PROMPT = 'Based on this transcript, suggest exactly 3 to 4 short topic tags (3-6 words each, title case) for this recording. Respond with ONLY a JSON array of strings, nothing else. Example: ["Buyer Consultation Scripts", "Objection Handling", "Follow Up Systems"]'
