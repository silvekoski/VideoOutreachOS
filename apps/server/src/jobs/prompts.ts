import { LANGUAGE_NAMES, OUTREACH_LINK, OUTREACH_WORDS, SLOT_LIMITS } from '@mergero/shared'
import type { Channel, Lang, OutreachContext, ScriptContext, ScriptSlideNumber } from '@mergero/shared'

export const MODEL_MAX_TOKENS = 16_384

const LANGUAGE_LABELS: Record<Lang, string> = {
  ...LANGUAGE_NAMES,
  nb: 'Norwegian Bokmål',
}

const MERGERO =
  'Mergero is an M&A advisory firm. It helps owners of established, profitable companies in the Nordics and the DACH region find the right buyer. Its MGX platform connects owners with buyers that look for companies to acquire.'

const SLIDE_PURPOSES: Record<Exclude<ScriptSlideNumber, 3 | 5 | 6>, string> = {
  2: 'This is slide 2, "Who Mergero is". Say in a few sentences who Mergero is and how it helps owners. The slide shows the logos of some buyers from Mergero deals and a few recent deals (facts.featuredBuyers and facts.recentDeals). Do not say that a buyer wants to buy the company. Keep it short and concrete. Do not describe charts.',
  4: 'This is slide 4, "Your figures". If facts.figures.source is "asiakastieto", mention the revenue and the profit at a high level, with the fiscal year. Say the amounts as facts.revenueText and facts.profitText give them, or as the exact numbers in facts.figures. Otherwise, ask the owner to enter the revenue and the profit in the form on this page. A rough range is enough, and an exact number is also possible. When facts.calculator is true, say that the calculator then shows a value range based on real deals in the sector.',
  7: 'This is slide 7, "Your data stays private". Explain the points in facts.points: buyers see the company only as an anonymous profile until the owner agrees, the answers in the form go to Mergero only, and the data of the page is deleted when the link expires.',
  8: 'This is slide 8, "Book a meeting". Invite the owner to book a meeting in the calendar below the video. Say in one sentence what the meeting covers, from facts.meeting. The meeting does not commit the owner to anything.',
}

function companySlidePurpose(context: ScriptContext): string {
  return [
    'This is slide 3, "Your company".',
    context.hasWebsite
      ? 'The slide shows a screenshot of the website of the company and the lines in context.lines.'
      : 'The slide shows the name of the company and the lines in context.lines. The tool did not read a website of this company, so do not say that you looked at its website.',
    context.linesSource === 'analyst' ? 'You wrote the lines yourself from what you know about the company.' : '',
    'Show that Mergero understands the business: say in your own words what the company does, based on context.lines. If context.lines is empty, speak about the company in general terms and do not invent details.',
  ]
    .filter(Boolean)
    .join(' ')
}

function buyersSlidePurpose(context: ScriptContext): string {
  if (context.buyerNames.length === 0) {
    return 'This is slide 5, "Buyers from Mergero deals". The slide shows no buyers (facts.buyers is empty). It says that the meeting goes through the buyers on the platform that fit the company. Say that each buyer on the platform has told Mergero what it wants to buy, and that you go through the buyers that fit the company in the meeting. Do not name a buyer, do not invent details, and do not say that there are links below the video.'
  }
  return context.buyerScope === 'featured'
    ? 'This is slide 5, "Buyers from Mergero deals". MGX has no buyers from deals in the sector of this company, so the slide shows some buyers from other Mergero deals (facts.buyers). Name some of them and say which deal each one made with Mergero, as its focus text states. Do not say that a buyer wants to buy the company, looks for companies like it, or is interested in it. Say that the meeting shows which buyers fit the company, and that the links to the buyers are below the video.'
    : 'This is slide 5, "Buyers from Mergero deals in your sector". Name some of the buyers in facts.buyers and say which deal each one made with Mergero, as its focus text states. Do not say that a buyer wants to buy the company, looks for companies like it, or is interested in it. Say that the links to the buyers are below the video.'
}

function possibleSlidePurpose(context: ScriptContext): string {
  return context.dealScope === 'recent'
    ? 'This is slide 6, "What is possible". MGX has no closed deals in the sector of this company, so the slide shows recent deals from other sectors (facts.deals). Tell one of them as a short story of what another owner has done. Do not say that the deals are from the sector of the company. If facts.deals is empty, speak about deals on the platform in general terms and do not invent details.'
    : 'This is slide 6, "What is possible". Tell the deals in facts.deals as a short story of what another owner in the sector has done. If facts.deals is empty, speak about deals in the sector in general terms and do not invent details.'
}

function addressRule(lang: Lang): string {
  return lang === 'de'
    ? 'Speak directly to the owner. In German, use the formal "Sie" and do not use the first name of the owner.'
    : 'Speak directly to the owner and use the first name in context.ownerFirstName once. If it is empty, do not use a name.'
}

function slidePurpose(slide: ScriptSlideNumber, context: ScriptContext): string {
  switch (slide) {
    case 3:
      return companySlidePurpose(context)
    case 5:
      return buyersSlidePurpose(context)
    case 6:
      return possibleSlidePurpose(context)
    default:
      return SLIDE_PURPOSES[slide]
  }
}

export function slideScriptPrompt(slide: ScriptSlideNumber, context: ScriptContext): string {
  return [
    `You write the voice-over for one slide of a short personalized video from Mergero. ${MERGERO}`,
    `You are ${context.analystName}, an analyst at Mergero. The owner of the company hears the text in your cloned voice, so write in the first person.`,
    slidePurpose(slide, context),
    'Rules:',
    `- Write in ${LANGUAGE_LABELS[context.lang]} only.`,
    `- ${addressRule(context.lang)}`,
    '- Write 40 to 50 words (never fewer than 30 or more than 60) in a natural spoken style: short sentences, no lists, no headings, no markdown, no emojis.',
    '- Use only facts from the input JSON. Do not write any number that is not in the input.',
    '- Never promise a price, a valuation or a sale.',
    '- Return a JSON object with one field "script".',
  ].join('\n')
}

export function companyLinesPrompt(lang: Lang): string {
  const max = SLOT_LIMITS['your-company.line'] ?? 90
  return [
    `You write three short lines about a company for slide 3 of a personalized video from Mergero. ${MERGERO}`,
    'The lines show the owner that Mergero understands the business. The input field "text" is the text of the company website.',
    'Rules:',
    `- Write exactly three lines. Each line is one complete sentence of 50 to 75 characters. The check rejects a line of more than ${max} characters.`,
    `- Write in ${LANGUAGE_LABELS[lang]} only, also when the website text is in another language.`,
    '- Write in the third person about the company: what it does, for whom and where. Use plain facts, no marketing words and no superlatives.',
    '- Use only facts from the website text. Do not write any number that is not in the text.',
    '- Ignore cookie banners, menus and contact details.',
    '- Return a JSON object with one field "lines", an array of three strings.',
  ].join('\n')
}

export function translateTextsPrompt(lang: Lang): string {
  return [
    `You translate short texts for the slides and the page of a personalized video from Mergero. ${MERGERO}`,
    'The input field "texts" holds texts from the MGX platform: what a buyer looks for, or a short description of a closed deal.',
    'Rules:',
    `- Translate each text into ${LANGUAGE_LABELS[lang]}. Keep the meaning. Do not add or remove facts.`,
    '- Keep company names and product names as they are. Keep each number as digits and do not add numbers.',
    '- Each translated text must have at most the number of characters in its field "max".',
    '- Return a JSON object with one field "texts": an array with one object { "id", "text" } for each input text, with the same ids in the same order.',
  ].join('\n')
}

export function briefTextPrompt(lang: Lang): string {
  return [
    `You write two parts of a meeting brief for a Mergero analyst: a summary and questions for the meeting. ${MERGERO}`,
    'The analyst reads the brief in less than two minutes before a Teams meeting with the owner of the company. The input field "brief" holds all data that the tool has: the company, the figures, the engagement with the video, the signals, the form answers, the custom questions ("customQuestions", an answer of null means no answer) and the buyers.',
    'Rules:',
    `- Write in ${LANGUAGE_LABELS[lang]} only.`,
    '- summary: at most 60 words. Say what the owner did with the video and the form, and give the interest level. The interest level shows engagement with the video. It does not show if the owner wants to sell.',
    '- questions: 3 to 5 questions for the meeting. Each question comes from a gap in the data, for example a missing figure, an unanswered custom question, a missing form answer or a slide that the owner skipped.',
    '- Do not write figures. Do not write any number that is not in the input.',
    '- Return a JSON object with the fields "summary" (a string) and "questions" (an array of strings).',
  ].join('\n')
}

const OUTREACH_CHANNELS: Record<Channel, string> = {
  email:
    'The message is an email. Write a subject line of at most 60 characters in "subject". Start the body with a greeting, use short paragraphs with an empty line between them, and end with a sign-off and the full name of the analyst.',
  linkedin:
    'The message is a LinkedIn direct message. Leave "subject" empty. Write two or three short paragraphs and end with the first name of the analyst.',
  sms: 'The message is a text message (SMS). Leave "subject" empty. Write one short paragraph and sign it with the name of the analyst.',
  whatsapp: 'The message is a WhatsApp message. Leave "subject" empty. Write one or two short paragraphs in a friendly, direct tone.',
}

export function outreachPrompt(context: OutreachContext): string {
  const { min, max } = OUTREACH_WORDS[context.channel]
  return [
    `You write a short message from a Mergero analyst to the owner of a company. ${MERGERO}`,
    'The analyst made a short personalized video for the owner. The video page shows the company, buyers from Mergero deals, deals that other owners made, a form, and a calendar to book a meeting with the analyst. The message makes the owner open the link.',
    'The input field "context" holds the company, the owner, the analyst and the date until which the link works ("expiresOn"). "context.companyLines" describe the company, maybe in another language.',
    OUTREACH_CHANNELS[context.channel],
    'Rules:',
    `- Write in ${LANGUAGE_LABELS[context.lang]} only.`,
    context.lang === 'de'
      ? '- In German, use the formal "Sie" and greet the owner with "Guten Tag" and the full name in context.ownerName.'
      : '- Greet the owner with the first name in context.ownerFirstName. If it is empty, do not use a name.',
    '- Write in the first person as the analyst. Say who you are in one short sentence.',
    `- Write ${min} to ${max} words in "message".`,
    `- Put the placeholder ${OUTREACH_LINK} exactly once in "message", where the link to the video goes. Do not write any other URL. The tool replaces the placeholder with the personal link.`,
    '- Give one concrete reason to watch: mention one detail about the company from context.companyLines, if there is one. Say that the video takes only a few minutes.',
    '- Say that the link is personal and works until context.expiresOn. Write the date exactly as in the input.',
    '- Do not say that a buyer wants to buy the company, looks for companies like it, or is interested in it. Never promise a price, a valuation or a sale.',
    '- Use only facts from the input JSON. Do not write any number that is not in the input.',
    '- No markdown, no emojis, no marketing words, no superlatives.',
    '- Never use a dash: no en dash (\u2013), no em dash (\u2014) and no hyphen with spaces around it. To show a pause, use a comma, a period or parentheses, or write two sentences.',
    '- Return a JSON object with the fields "subject" (a string) and "message" (a string).',
  ].join('\n')
}

export function rejectionNote(errors: readonly string[]): string {
  return `Your previous answer was rejected for these reasons: ${errors.join('; ')}. Write a new answer that fixes all of them.`
}
