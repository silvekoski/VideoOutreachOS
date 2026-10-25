import { checkBriefText, checkLines, checkScript, countWords } from './checks.ts'
import { fill, t } from './i18n.ts'
import { detectLanguage } from './languages.ts'
import { SLOT_LIMITS, textLength } from './slots.ts'
import type { BuyerScope, DealScope, Financials, InterestLevel, Lang, MeetingBrief, OutreachContext, ScriptSlideNumber } from './types.ts'

export interface ScriptContext {
  lang: Lang
  company: string
  ownerFirstName: string
  analystName: string
  buyerNames: string[]
  buyerScope?: BuyerScope
  buyerCount: number
  figures: Financials
  calculator: boolean
  lines: string[]
  linesSource: 'model' | 'analyst' | null
  hasWebsite: boolean
  dealTexts: string[]
  dealScope?: DealScope
  country: string
}

type QuestionKey =
  | 'revenue'
  | 'profit'
  | 'custom'
  | 'timing'
  | 'staff'
  | 'slide2'
  | 'slide3'
  | 'slide4'
  | 'slide5'
  | 'slide6'
  | 'slide7'
  | 'goals'
  | 'decision'
  | 'successor'

interface WriterTexts {
  scripts: {
    2: string[]
    3: { site: string[]; noSite: string[] }
    4: { figures: string[]; loss: string[]; calculator: string[]; form: string[] }
    5: Record<BuyerScope | 'empty', string[]>
    6: Record<DealScope, string[]>
    7: string[]
    8: string[]
  }
  lines: string[]
  outreach: { subject: string; email: string; short: string }
  brief: {
    booked: string
    interest: Record<InterestLevel, string>
    completed: string
    stopped: string
    notPlayed: string
    formSent: string
    noForm: string
    positive: string
    negative: string
    questions: Record<QuestionKey, string>
  }
}

const TEXTS: Record<Lang, WriterTexts> = {
  en: {
    scripts: {
      2: [
        'Thank you for taking a few minutes, {first}. Velho is a strategic AI growth partner. We find the manual work that slows a company down, build the fix with AI and automation, and make sure people actually use it.',
      ],
      3: {
        site: [
          'We took a close look at the website of {company}, {first}. This is how we understand your business: {line} Growing companies like yours often lose time to manual handoffs, and that is where we start looking.',
          'We took a close look at the website of {company}, {first}. On the screen you see in three short lines how we understand your business. Growing companies like yours often lose time to manual handoffs, and that is where we start looking.',
          'We took a close look at your website. On the screen you see in three short lines how we understand your business. Growing companies often lose time to manual handoffs, and that is where we start looking.',
        ],
        noSite: [
          'This is how we understand the business of {company}, {first}: {line} Growing companies like yours often lose time to manual handoffs, and that is where we start looking.',
          'On the screen you see in three short lines how we understand the business of {company}, {first}. Growing companies like yours often lose time to manual handoffs, and that is where we start looking.',
          'On the screen you see in three short lines how we understand your business. Growing companies often lose time to manual handoffs, and that is where we start looking.',
        ],
      },
      4: {
        figures: [
          'According to Asiakastieto, {company} had a revenue of {revenue} euros and an operating profit of {profit} euros in the fiscal year {year}. Growth like this usually adds manual work: more handoffs, more checks and more copying between tools. That is where we look first.',
          'According to Asiakastieto, your company had a revenue of {revenue} euros and an operating profit of {profit} euros in the fiscal year {year}. Growth like this usually adds manual work: more handoffs, more checks and more copying between tools. That is where we look first.',
        ],
        loss: [
          'According to Asiakastieto, {company} had a revenue of {revenue} euros and an operating loss of {profit} euros in the fiscal year {year}. Growth usually adds manual work: more handoffs, more checks and more copying between tools. That is where we look first.',
          'According to Asiakastieto, your company had a revenue of {revenue} euros and an operating loss of {profit} euros in the fiscal year {year}. Growth usually adds manual work: more handoffs, more checks and more copying between tools. That is where we look first.',
        ],
        calculator: [
          'We do not have public figures for your company. Please tell us your size in the form on this page. A rough range is enough. It shows us where manual work grows fastest, and your answers go to Velho only.',
        ],
        form: [
          'We do not have public figures for your company. Please tell us your size in the form on this page. A rough range is enough. With it we can prepare a better working session for you, and your answers go to Velho only.',
        ],
      },
      5: {
        sector: [
          'These are tools we often connect in your sector, for example {buyers}. Time usually goes into copying data between them. In the working session we map where manual work slows {company} down. Below the video you find links to their websites.',
          'These are tools we often connect in your sector. Time usually goes into copying data between them. In the working session we map where manual work slows {company} down. Below the video you find links to their websites, so you can see for yourself what they are.',
          'These are tools we often connect in your sector. Time usually goes into copying data between them. In the working session we map where manual work slows your team down. Below the video you find links to their websites, so you can see for yourself what they are.',
        ],
        featured: [
          'These are tools we often connect, for example {buyers}. Time usually goes into copying data between them. In the working session we map where manual work slows {company} down. Below the video you find links to their websites.',
          'On the screen you see some tools we often connect. Time usually goes into copying data between them. In the working session we map where manual work slows your team down. Below the video you find links to their websites.',
        ],
        empty: [
          'Every company loses time in different places. In the working session we map where manual work slows {company} down and which tools are involved. This way you see where time goes, before you decide anything.',
          'Every company loses time in different places. In the working session we map where manual work slows your team down and which tools are involved. This way you see where time goes, before you decide anything.',
        ],
      },
      6: {
        sector: [
          'Here is a first proof in your sector. {deal} Every company is different, and in the working session we pick the smallest fix that proves the value for {company}.',
          'Here is a first proof in your sector. A good first proof is small, practical and quick to check with your own team. Every company is different, and in the working session we pick the smallest fix that proves the value for {company}.',
          'Here is a first proof in your sector. A good first proof is small, practical and quick to check with your own team. Every company is different, and in the working session we pick the smallest fix that proves the value for you and your company.',
        ],
        recent: [
          'Here is a first proof for teams like yours. {deal} Every company is different, and in the working session we pick the smallest fix that proves the value for {company}.',
          'Here is a first proof for teams like yours. A good first proof is small, practical and quick to check with your own team. Every company is different, and in the working session we pick the smallest fix that proves the value for {company}.',
          'Here is a first proof for teams like yours. A good first proof is small, practical and quick to check with your own team. Every company is different, and in the working session we pick the smallest fix that proves the value for you and your company.',
        ],
      },
      7: [
        'This is how Velho works, {first}. First, we find the manual work that slows your team down. Then we build the fix with AI and automation. Finally, we make sure people actually use it, so the time saved stays saved.',
      ],
      8: [
        'Thank you for watching, {first}. If you want to hear more, book a twenty-minute working session with me below the video. On Teams we pick one manual workflow at {company} and sketch a practical fix. There is no commitment. I look forward to our talk.',
        'Thank you for watching, {first}. If you want to hear more, book a twenty-minute working session with me below the video. On Teams we pick one manual workflow at your company and sketch a practical fix. There is no commitment. I look forward to our talk.',
      ],
    },
    lines: [
      'The company presents its products and services on its website.',
      'It serves its customers with its own team and know-how.',
      'We will confirm the details with you in the meeting.',
    ],
    outreach: {
      subject: 'A short video about {company}',
      email:
        'Hello {first},\n\nI am {analyst}, an analyst at Velho. We are a strategic AI growth partner: we find the manual work that slows a company down, build the fix with AI and automation, and make sure people actually use it. I made a short personal video about {company}.\n\nYou can watch it here: {link}\n\nBelow the video, you can book a twenty-minute working session with me. The link is personal and works until {expires}.\n\nBest regards,\n{analyst}\nVelho',
      short:
        'Hello {first}, this is {analyst} from Velho. I made a short personal video for you about {company}: {link} It takes only a few minutes to watch. The link works until {expires}.',
    },
    brief: {
      booked: '{owner} of {company} booked a meeting.',
      interest: {
        high: 'The interest level is high.',
        medium: 'The interest level is medium.',
        low: 'The interest level is low.',
      },
      completed: 'The owner watched the video to the end.',
      stopped: 'The owner stopped the video at slide {n}.',
      notPlayed: 'The owner did not play the video.',
      formSent: 'The owner sent the form.',
      noForm: 'The owner did not send the form.',
      positive: 'Positive signals: {list}.',
      negative: 'Negative signals: {list}.',
      questions: {
        revenue: 'What was the revenue of your company in the last fiscal year?',
        profit: 'What was the operating profit of your company in the last fiscal year?',
        custom: 'Can we go through the questions in the form that you did not answer yet?',
        timing: 'When would a first automation be useful for you?',
        staff: 'How many people work in your company today?',
        slide2: 'What do you already know about Velho and how we work?',
        slide3: 'How would you describe your company in a few words?',
        slide4: 'Where does manual work grow fastest as your company grows?',
        slide5: 'Which tools and handoffs take the most time in your team?',
        slide6: 'Which small workflow would be the best first proof?',
        slide7: 'What would make sure your team actually uses a new tool?',
        goals: 'What are your goals for the company in the next few years?',
        decision: 'Who else would take part in a decision about this?',
        successor: 'Who in your team would own the change?',
      },
    },
  },
  fi: {
    scripts: {
      2: [
        'Kiitos, että käytät hetken tähän videoon, {first}. Velho on strateginen tekoälykasvukumppani. Löydämme manuaalisen työn, joka hidastaa yrityksesi arkea, rakennamme ratkaisun tekoälyllä ja automaatiolla ja varmistamme, että ihmiset oikeasti käyttävät sitä myös arjessa.',
      ],
      3: {
        site: [
          'Tutustuimme verkkosivuihisi huolella, {first}. Näin ymmärrämme liiketoimintasi: {line} Kasvavat yritykset menettävät usein aikaa manuaalisiin työvaiheiden välisiin siirtoihin, ja juuri sieltä alamme etsiä parannuksia, jotka säästävät aikaa tiimiltäsi ja vapauttavat sen kasvuun.',
          'Tutustuimme verkkosivuihisi huolella, {first}. Ruudulla näet kolmella lyhyellä rivillä, miten ymmärrämme liiketoimintasi. Kasvavat yritykset menettävät usein aikaa manuaalisiin työvaiheiden välisiin siirtoihin, ja juuri sieltä alamme etsiä parannuksia, jotka säästävät aikaa tiimiltäsi ja vapauttavat sen kasvuun.',
          'Tutustuimme verkkosivuihisi huolella. Ruudulla näet kolmella lyhyellä rivillä, miten ymmärrämme liiketoimintasi. Kasvavat yritykset menettävät usein aikaa manuaalisiin työvaiheiden välisiin siirtoihin, ja juuri sieltä alamme etsiä parannuksia, jotka säästävät aikaa tiimiltäsi ja vapauttavat sen kasvuun.',
        ],
        noSite: [
          'Näin ymmärrämme liiketoimintasi, {first}: {line} Kasvavat yritykset menettävät usein aikaa manuaalisiin työvaiheiden välisiin siirtoihin, ja juuri sieltä alamme etsiä parannuksia, jotka säästävät aikaa tiimiltäsi ja vapauttavat sen kasvuun.',
          'Ruudulla näet kolmella lyhyellä rivillä, miten ymmärrämme liiketoimintasi, {first}. Kasvavat yritykset menettävät usein aikaa manuaalisiin työvaiheiden välisiin siirtoihin, ja juuri sieltä alamme etsiä parannuksia, jotka säästävät aikaa tiimiltäsi ja vapauttavat sen kasvuun.',
          'Ruudulla näet kolmella lyhyellä rivillä, miten ymmärrämme liiketoimintasi. Kasvavat yritykset menettävät usein aikaa manuaalisiin työvaiheiden välisiin siirtoihin, ja juuri sieltä alamme etsiä parannuksia, jotka säästävät aikaa tiimiltäsi ja vapauttavat sen kasvuun.',
        ],
      },
      4: {
        figures: [
          'Asiakastiedon mukaan {company} teki tilikaudella {year} liikevaihtoa {revenue} euroa ja liikevoittoa {profit} euroa. Kasvu lisää yleensä manuaalista työtä: enemmän siirtoja, tarkistuksia ja kopiointia työkalujen välillä. Sieltä me aloitamme.',
          'Asiakastiedon mukaan yrityksesi teki tilikaudella {year} liikevaihtoa {revenue} euroa ja liikevoittoa {profit} euroa. Kasvu lisää yleensä manuaalista työtä: enemmän siirtoja, tarkistuksia ja kopiointia työkalujen välillä. Sieltä me aloitamme.',
        ],
        loss: [
          'Asiakastiedon mukaan {company} teki tilikaudella {year} liikevaihtoa {revenue} euroa, ja liiketappio oli {profit} euroa. Kasvu lisää yleensä manuaalista työtä: enemmän siirtoja, tarkistuksia ja kopiointia työkalujen välillä. Sieltä me aloitamme.',
          'Asiakastiedon mukaan yrityksesi teki tilikaudella {year} liikevaihtoa {revenue} euroa, ja liiketappio oli {profit} euroa. Kasvu lisää yleensä manuaalista työtä: enemmän siirtoja, tarkistuksia ja kopiointia työkalujen välillä. Sieltä me aloitamme.',
        ],
        calculator: [
          'Yrityksestäsi ei ole saatavilla julkisia lukuja. Kerro meille yrityksesi koko tämän sivun lomakkeella. Karkea suuruusluokka riittää hyvin. Sen avulla näemme tarkemmin, missä manuaalinen työ kasvaa nopeimmin, ja vastauksesi menevät vain Velholle.',
        ],
        form: [
          'Yrityksestäsi ei ole saatavilla julkisia lukuja. Kerro meille yrityksesi koko tämän sivun lomakkeella. Karkea suuruusluokka riittää hyvin. Sen avulla voimme valmistella työsession paremmin juuri sinua ja tiimiäsi varten, ja vastauksesi menevät vain Velholle.',
        ],
      },
      5: {
        sector: [
          'Nämä ovat työkaluja, joita yhdistämme usein toimialallasi, esimerkiksi {buyers}. Aika kuluu yleensä tiedon kopioimiseen niiden välillä. Työsessiossa kartoitamme, missä manuaalinen työ hidastaa yritystä {company}. Videon alta löydät linkit niiden verkkosivuille.',
          'Nämä ovat työkaluja, joita yhdistämme usein toimialallasi. Aika kuluu yleensä tiedon kopioimiseen niiden välillä. Työsessiossa kartoitamme, missä manuaalinen työ hidastaa yritystä {company}. Videon alta löydät linkit niiden verkkosivuille, joten voit itse tutustua niihin.',
          'Nämä ovat työkaluja, joita yhdistämme usein toimialallasi. Aika kuluu yleensä tiedon kopioimiseen niiden välillä. Työsessiossa kartoitamme, missä manuaalinen työ hidastaa tiimiäsi. Videon alta löydät linkit niiden verkkosivuille, joten voit itse tutustua niihin.',
        ],
        featured: [
          'Nämä ovat työkaluja, joita yhdistämme usein, esimerkiksi {buyers}. Aika kuluu yleensä tiedon kopioimiseen niiden välillä. Työsessiossa kartoitamme, missä manuaalinen työ hidastaa yritystä {company}. Videon alta löydät linkit niiden verkkosivuille.',
          'Ruudulla näet joitakin työkaluja, joita yhdistämme usein. Aika kuluu yleensä tiedon kopioimiseen niiden välillä. Työsessiossa kartoitamme, missä manuaalinen työ hidastaa tiimiäsi. Videon alta löydät linkit niiden verkkosivuille.',
        ],
        empty: [
          'Jokainen yritys menettää aikaa eri paikoissa. Työsessiossa kartoitamme, missä manuaalinen työ hidastaa yritystä {company} ja mitkä työkalut liittyvät asiaan. Näin näet, mihin aika kuluu, ennen kuin päätät mitään.',
          'Jokainen yritys menettää aikaa eri paikoissa. Työsessiossa kartoitamme, missä manuaalinen työ hidastaa tiimiäsi ja mitkä työkalut liittyvät asiaan. Näin näet, mihin aika kuluu, ennen kuin päätät mitään.',
        ],
      },
      6: {
        sector: [
          'Tässä on ensimmäinen todiste toimialallasi. {deal} Jokainen yritys on erilainen, ja työsessiossa valitsemme pienimmän ratkaisun, joka osoittaa hyödyn yritykselle {company}.',
          'Tässä on ensimmäinen todiste toimialallasi. Hyvä ensimmäinen todiste on pieni, käytännöllinen ja nopea tarkistaa oman tiimin kanssa. Jokainen yritys on erilainen, ja työsessiossa valitsemme pienimmän ratkaisun, joka osoittaa hyödyn yritykselle {company}.',
          'Tässä on ensimmäinen todiste toimialallasi. Hyvä ensimmäinen todiste on pieni, käytännöllinen ja nopea tarkistaa oman tiimin kanssa. Jokainen yritys on erilainen, ja työsessiossa valitsemme pienimmän ratkaisun, joka osoittaa hyödyn sinun yrityksellesi.',
        ],
        recent: [
          'Tässä on ensimmäinen todiste kaltaisillesi tiimeille. {deal} Jokainen yritys on erilainen, ja työsessiossa valitsemme pienimmän ratkaisun, joka osoittaa hyödyn yritykselle {company}.',
          'Tässä on ensimmäinen todiste kaltaisillesi tiimeille. Hyvä ensimmäinen todiste on pieni, käytännöllinen ja nopea tarkistaa oman tiimin kanssa. Jokainen yritys on erilainen, ja työsessiossa valitsemme pienimmän ratkaisun, joka osoittaa hyödyn yritykselle {company}.',
          'Tässä on ensimmäinen todiste kaltaisillesi tiimeille. Hyvä ensimmäinen todiste on pieni, käytännöllinen ja nopea tarkistaa oman tiimin kanssa. Jokainen yritys on erilainen, ja työsessiossa valitsemme pienimmän ratkaisun, joka osoittaa hyödyn sinun yrityksellesi.',
        ],
      },
      7: [
        'Näin Velho toimii, {first}. Ensin löydämme manuaalisen työn, joka hidastaa tiimiäsi. Sitten rakennamme ratkaisun tekoälyllä ja automaatiolla. Lopuksi varmistamme, että ihmiset oikeasti käyttävät sitä, jotta säästynyt aika pysyy säästyneenä ja on tiimisi käytössä myös jatkossa.',
      ],
      8: [
        'Kiitos, että katsoit videon, {first}. Jos haluat kuulla lisää, varaa kanssani kahdenkymmenen minuutin työsessio tämän videon alta. Teamsissa valitsemme yrityksestä {company} yhden manuaalisen työnkulun ja hahmottelemme sille käytännöllisen ratkaisun. Tapaaminen ei sido sinua mihinkään. Odotan keskusteluamme mielenkiinnolla.',
        'Kiitos, että katsoit videon, {first}. Jos haluat kuulla lisää, varaa kanssani kahdenkymmenen minuutin työsessio tämän videon alta. Teamsissa valitsemme yrityksestäsi yhden manuaalisen työnkulun ja hahmottelemme sille käytännöllisen ratkaisun. Tapaaminen ei sido sinua mihinkään. Odotan keskusteluamme mielenkiinnolla.',
      ],
    },
    lines: [
      'Yritys esittelee tuotteitaan ja palveluitaan verkkosivuillaan.',
      'Se palvelee asiakkaitaan omalla henkilöstöllään ja osaamisellaan.',
      'Tarkennamme tiedot kanssasi tapaamisessa.',
    ],
    outreach: {
      subject: 'Lyhyt video yrityksestä {company}',
      email:
        'Hei {first},\n\nolen {analyst}, analyytikko Velholta. Olemme strateginen tekoälykasvukumppani: löydämme manuaalisen työn, joka hidastaa yritystä, rakennamme ratkaisun tekoälyllä ja automaatiolla ja varmistamme, että ihmiset oikeasti käyttävät sitä. Tein yrityksestä {company} lyhyen henkilökohtaisen videon.\n\nVoit katsoa videon tästä: {link}\n\nVideon alla voit varata kanssani kahdenkymmenen minuutin työsession. Linkki on henkilökohtainen ja toimii {expires} asti.\n\nYstävällisin terveisin\n{analyst}\nVelho',
      short:
        'Hei {first}, täällä {analyst} Velholta. Tein sinulle lyhyen henkilökohtaisen videon yrityksestä {company}: {link} Videon katsominen vie vain muutaman minuutin. Linkki toimii {expires} asti.',
    },
    brief: {
      booked: '{owner} ({company}) varasi tapaamisen.',
      interest: {
        high: 'Kiinnostus videota kohtaan on korkea.',
        medium: 'Kiinnostus videota kohtaan on keskitasoa.',
        low: 'Kiinnostus videota kohtaan on matala.',
      },
      completed: 'Omistaja katsoi videon loppuun asti.',
      stopped: 'Omistaja lopetti katselun dian {n} kohdalla.',
      notPlayed: 'Omistaja ei toistanut videota.',
      formSent: 'Omistaja lähetti lomakkeen.',
      noForm: 'Omistaja ei lähettänyt lomaketta.',
      positive: 'Myönteiset signaalit: {list}.',
      negative: 'Kielteiset signaalit: {list}.',
      questions: {
        revenue: 'Mikä oli yrityksesi liikevaihto viime tilikaudella?',
        profit: 'Mikä oli yrityksesi liikevoitto viime tilikaudella?',
        custom: 'Voimmeko käydä läpi lomakkeen kysymykset, joihin et vielä vastannut?',
        timing: 'Milloin ensimmäinen automaatio olisi sinulle hyödyllinen?',
        staff: 'Kuinka monta henkilöä yrityksessäsi työskentelee tällä hetkellä?',
        slide2: 'Mitä tiedät jo Velhosta ja tavastamme toimia?',
        slide3: 'Miten kuvailisit yritystäsi muutamalla sanalla?',
        slide4: 'Missä manuaalinen työ kasvaa nopeimmin yrityksesi kasvaessa?',
        slide5: 'Mitkä työkalut ja työvaiheiden siirrot vievät tiimiltäsi eniten aikaa?',
        slide6: 'Mikä pieni työnkulku olisi paras ensimmäinen todiste?',
        slide7: 'Mikä varmistaisi, että tiimisi oikeasti käyttää uutta työkalua?',
        goals: 'Mitkä ovat tavoitteesi yrityksen suhteen lähivuosina?',
        decision: 'Kuka muu osallistuisi tätä koskevaan päätökseen?',
        successor: 'Kuka tiimissäsi vastaisi muutoksesta?',
      },
    },
  },
  sv: {
    scripts: {
      2: [
        'Tack för att du tar dig tid, {first}. Velho är en strategisk AI-partner för tillväxt. Vi hittar det manuella arbete som bromsar ett företag, bygger lösningen med AI och automation och ser till att människor faktiskt använder den.',
      ],
      3: {
        site: [
          'Vi har tittat noga på webbplatsen för {company}, {first}. Så här förstår vi din verksamhet: {line} Växande företag förlorar ofta tid på manuella överlämningar, och det är där vi börjar leta.',
          'Vi har tittat noga på webbplatsen för {company}, {first}. På skärmen ser du i tre korta rader hur vi förstår din verksamhet. Växande företag förlorar ofta tid på manuella överlämningar, och det är där vi börjar leta.',
          'Vi har tittat noga på din webbplats. På skärmen ser du i tre korta rader hur vi förstår din verksamhet. Växande företag förlorar ofta tid på manuella överlämningar, och det är där vi börjar leta.',
        ],
        noSite: [
          'Så här förstår vi verksamheten i {company}, {first}: {line} Växande företag förlorar ofta tid på manuella överlämningar, och det är där vi börjar leta.',
          'På skärmen ser du i tre korta rader hur vi förstår verksamheten i {company}, {first}. Växande företag förlorar ofta tid på manuella överlämningar, och det är där vi börjar leta.',
          'På skärmen ser du i tre korta rader hur vi förstår din verksamhet. Växande företag förlorar ofta tid på manuella överlämningar, och det är där vi börjar leta.',
        ],
      },
      4: {
        figures: [
          'Enligt Asiakastieto hade {company} en omsättning på {revenue} euro och ett rörelseresultat på {profit} euro under räkenskapsåret {year}. Tillväxt innebär oftast mer manuellt arbete: fler överlämningar, fler kontroller och mer kopiering mellan verktyg. Det är där vi tittar först.',
          'Enligt Asiakastieto hade ditt företag en omsättning på {revenue} euro och ett rörelseresultat på {profit} euro under räkenskapsåret {year}. Tillväxt innebär oftast mer manuellt arbete: fler överlämningar, fler kontroller och mer kopiering mellan verktyg. Det är där vi tittar först.',
        ],
        loss: [
          'Enligt Asiakastieto hade {company} en omsättning på {revenue} euro och en rörelseförlust på {profit} euro under räkenskapsåret {year}. Tillväxt innebär oftast mer manuellt arbete: fler överlämningar, fler kontroller och mer kopiering mellan verktyg. Det är där vi tittar först.',
          'Enligt Asiakastieto hade ditt företag en omsättning på {revenue} euro och en rörelseförlust på {profit} euro under räkenskapsåret {year}. Tillväxt innebär oftast mer manuellt arbete: fler överlämningar, fler kontroller och mer kopiering mellan verktyg. Det är där vi tittar först.',
        ],
        calculator: [
          'Vi har inga offentliga siffror för ditt företag. Berätta hur stort ni är i formuläret på den här sidan. Ett ungefärligt intervall räcker. Då ser vi var manuellt arbete växer snabbast, och dina svar går bara till Velho.',
        ],
        form: [
          'Vi har inga offentliga siffror för ditt företag. Berätta hur stort ni är i formuläret på den här sidan. Ett ungefärligt intervall räcker. Då kan vi förbereda en bättre arbetssession för dig, och dina svar går bara till Velho.',
        ],
      },
      5: {
        sector: [
          'Det här är verktyg som vi ofta kopplar ihop i din bransch, till exempel {buyers}. Tiden går oftast åt till att kopiera data mellan dem. I arbetssessionen kartlägger vi var manuellt arbete bromsar {company}. Under videon hittar du länkar till deras webbplatser.',
          'Det här är verktyg som vi ofta kopplar ihop i din bransch. Tiden går oftast åt till att kopiera data mellan dem. I arbetssessionen kartlägger vi var manuellt arbete bromsar {company}. Under videon hittar du länkar till deras webbplatser, så att du själv kan se vilka de är.',
          'Det här är verktyg som vi ofta kopplar ihop i din bransch. Tiden går oftast åt till att kopiera data mellan dem. I arbetssessionen kartlägger vi var manuellt arbete bromsar ditt team. Under videon hittar du länkar till deras webbplatser, så att du själv kan se vilka de är.',
        ],
        featured: [
          'Det här är verktyg som vi ofta kopplar ihop, till exempel {buyers}. Tiden går oftast åt till att kopiera data mellan dem. I arbetssessionen kartlägger vi var manuellt arbete bromsar {company}. Under videon hittar du länkar till deras webbplatser.',
          'På skärmen ser du några verktyg som vi ofta kopplar ihop. Tiden går oftast åt till att kopiera data mellan dem. I arbetssessionen kartlägger vi var manuellt arbete bromsar ditt team. Under videon hittar du länkar till deras webbplatser.',
        ],
        empty: [
          'Varje företag förlorar tid på olika ställen. I arbetssessionen kartlägger vi var manuellt arbete bromsar {company} och vilka verktyg som är inblandade. Så ser du vart tiden går, innan du bestämmer något.',
          'Varje företag förlorar tid på olika ställen. I arbetssessionen kartlägger vi var manuellt arbete bromsar ditt team och vilka verktyg som är inblandade. Så ser du vart tiden går, innan du bestämmer något.',
        ],
      },
      6: {
        sector: [
          'Här är ett första bevis i din bransch. {deal} Varje företag är olika, och i arbetssessionen väljer vi den minsta lösningen som visar värdet för {company}.',
          'Här är ett första bevis i din bransch. Ett bra första bevis är litet, praktiskt och snabbt att kontrollera tillsammans med ditt eget team. Varje företag är olika, och i arbetssessionen väljer vi den minsta lösningen som visar värdet för {company}.',
          'Här är ett första bevis i din bransch. Ett bra första bevis är litet, praktiskt och snabbt att kontrollera tillsammans med ditt eget team. Varje företag är olika, och i arbetssessionen väljer vi den minsta lösningen som visar värdet för dig och ditt företag.',
        ],
        recent: [
          'Här är ett första bevis för team som ditt. {deal} Varje företag är olika, och i arbetssessionen väljer vi den minsta lösningen som visar värdet för {company}.',
          'Här är ett första bevis för team som ditt. Ett bra första bevis är litet, praktiskt och snabbt att kontrollera tillsammans med ditt eget team. Varje företag är olika, och i arbetssessionen väljer vi den minsta lösningen som visar värdet för {company}.',
          'Här är ett första bevis för team som ditt. Ett bra första bevis är litet, praktiskt och snabbt att kontrollera tillsammans med ditt eget team. Varje företag är olika, och i arbetssessionen väljer vi den minsta lösningen som visar värdet för dig och ditt företag.',
        ],
      },
      7: [
        'Så här fungerar Velho, {first}. Först hittar vi det manuella arbete som bromsar ditt team. Sedan bygger vi lösningen med AI och automation. Till sist ser vi till att människor faktiskt använder den, så att den sparade tiden blir kvar.',
      ],
      8: [
        'Tack för att du tittade, {first}. Om du vill höra mer kan du boka en arbetssession på tjugo minuter med mig under videon. I Teams väljer vi ett manuellt arbetsflöde i {company} och skissar en praktisk lösning. Det förpliktar dig inte till något. Jag ser fram emot vårt samtal.',
        'Tack för att du tittade, {first}. Om du vill höra mer kan du boka en arbetssession på tjugo minuter med mig under videon. I Teams väljer vi ett manuellt arbetsflöde i ditt företag och skissar en praktisk lösning. Det förpliktar dig inte till något. Jag ser fram emot vårt samtal.',
      ],
    },
    lines: [
      'Företaget presenterar sina produkter och tjänster på sin webbplats.',
      'Det betjänar sina kunder med egen personal och egen kunskap.',
      'Vi stämmer av detaljerna med dig på mötet.',
    ],
    outreach: {
      subject: 'En kort video om {company}',
      email:
        'Hej {first},\n\njag heter {analyst} och är analytiker på Velho. Vi är en strategisk AI-partner för tillväxt: vi hittar det manuella arbete som bromsar ett företag, bygger lösningen med AI och automation och ser till att människor faktiskt använder den. Jag har gjort en kort personlig video om {company}.\n\nDu kan se videon här: {link}\n\nUnder videon kan du boka en arbetssession på tjugo minuter med mig. Länken är personlig och fungerar till och med {expires}.\n\nMed vänliga hälsningar\n{analyst}\nVelho',
      short:
        'Hej {first}, det är {analyst} från Velho. Jag har gjort en kort personlig video till dig om {company}: {link} Det tar bara några minuter att se den. Länken fungerar till och med {expires}.',
    },
    brief: {
      booked: '{owner} ({company}) har bokat ett möte.',
      interest: {
        high: 'Intressenivån är hög.',
        medium: 'Intressenivån är medel.',
        low: 'Intressenivån är låg.',
      },
      completed: 'Ägaren såg videon till slutet.',
      stopped: 'Ägaren stoppade videon vid bild {n}.',
      notPlayed: 'Ägaren spelade inte upp videon.',
      formSent: 'Ägaren skickade formuläret.',
      noForm: 'Ägaren skickade inte formuläret.',
      positive: 'Positiva signaler: {list}.',
      negative: 'Negativa signaler: {list}.',
      questions: {
        revenue: 'Vad var omsättningen i ditt företag under det senaste räkenskapsåret?',
        profit: 'Vad var rörelseresultatet i ditt företag under det senaste räkenskapsåret?',
        custom: 'Kan vi gå igenom frågorna i formuläret som du inte har besvarat ännu?',
        timing: 'När skulle en första automatisering vara användbar för dig?',
        staff: 'Hur många personer arbetar i ditt företag i dag?',
        slide2: 'Vad vet du redan om Velho och hur vi arbetar?',
        slide3: 'Hur skulle du beskriva ditt företag med några få ord?',
        slide4: 'Var växer manuellt arbete snabbast när ditt företag växer?',
        slide5: 'Vilka verktyg och överlämningar tar mest tid i ditt team?',
        slide6: 'Vilket litet arbetsflöde skulle vara det bästa första beviset?',
        slide7: 'Vad skulle se till att ditt team faktiskt använder ett nytt verktyg?',
        goals: 'Vilka mål har du för företaget under de närmaste åren?',
        decision: 'Vem mer skulle delta i ett beslut om detta?',
        successor: 'Vem i ditt team skulle ansvara för förändringen?',
      },
    },
  },
  nb: {
    scripts: {
      2: [
        'Takk for at du tar deg tid, {first}. Velho er en strategisk partner for vekst. Vi finner det manuelle arbeidet som bremser selskapet ditt, bygger løsningen med AI og automatisering, og vi sørger for at folk faktisk tar den i bruk.',
      ],
      3: {
        site: [
          'Vi har sett nøye på nettstedet til {company}, {first}. Slik forstår vi virksomheten din: {line} Voksende selskaper taper ofte tid på manuelle overleveringer, og det er der vi begynner å lete.',
          'Vi har sett nøye på nettstedet til {company}, {first}. På skjermen ser du i tre korte linjer hvordan vi forstår virksomheten din. Voksende selskaper taper ofte tid på manuelle overleveringer, og det er der vi begynner å lete.',
          'Vi har sett nøye på nettstedet ditt. På skjermen ser du i tre korte linjer hvordan vi forstår virksomheten din. Voksende selskaper taper ofte tid på manuelle overleveringer, og det er der vi begynner å lete.',
        ],
        noSite: [
          'Slik forstår vi virksomheten til {company}, {first}: {line} Voksende selskaper taper ofte tid på manuelle overleveringer, og det er der vi begynner å lete.',
          'På skjermen ser du i tre korte linjer hvordan vi forstår virksomheten til {company}, {first}. Voksende selskaper taper ofte tid på manuelle overleveringer, og det er der vi begynner å lete.',
          'På skjermen ser du i tre korte linjer hvordan vi forstår virksomheten din. Voksende selskaper taper ofte tid på manuelle overleveringer, og det er der vi begynner å lete.',
        ],
      },
      4: {
        figures: [
          'Ifølge Asiakastieto hadde {company} en omsetning på {revenue} euro og et driftsresultat på {profit} euro i regnskapsåret {year}. Vekst betyr som regel mer manuelt arbeid: flere overleveringer, flere kontroller og mer kopiering mellom verktøy. Det er der vi ser først.',
          'Ifølge Asiakastieto hadde selskapet ditt en omsetning på {revenue} euro og et driftsresultat på {profit} euro i regnskapsåret {year}. Vekst betyr som regel mer manuelt arbeid: flere overleveringer, flere kontroller og mer kopiering mellom verktøy. Det er der vi ser først.',
        ],
        loss: [
          'Ifølge Asiakastieto hadde {company} en omsetning på {revenue} euro og et driftsunderskudd på {profit} euro i regnskapsåret {year}. Vekst betyr som regel mer manuelt arbeid: flere overleveringer, flere kontroller og mer kopiering mellom verktøy. Det er der vi ser først.',
          'Ifølge Asiakastieto hadde selskapet ditt en omsetning på {revenue} euro og et driftsunderskudd på {profit} euro i regnskapsåret {year}. Vekst betyr som regel mer manuelt arbeid: flere overleveringer, flere kontroller og mer kopiering mellom verktøy. Det er der vi ser først.',
        ],
        calculator: [
          'Vi har ingen offentlige tall for selskapet ditt. Fortell oss hvor stor dere er i skjemaet på denne siden. Et omtrentlig intervall holder. Da ser vi hvor manuelt arbeid vokser raskest, og svarene dine går bare til Velho.',
        ],
        form: [
          'Vi har ingen offentlige tall for selskapet ditt. Fortell oss hvor stor dere er i skjemaet på denne siden. Et omtrentlig intervall holder. Da kan vi forberede en bedre arbeidsøkt for deg, og svarene dine går bare til Velho.',
        ],
      },
      5: {
        sector: [
          'Dette er verktøy vi ofte kobler sammen i din bransje, for eksempel {buyers}. Tiden går som regel til å kopiere data mellom dem. I arbeidsøkten kartlegger vi hvor manuelt arbeid bremser {company}. Under videoen finner du lenker til nettstedene deres.',
          'Dette er verktøy vi ofte kobler sammen i din bransje. Tiden går som regel til å kopiere data mellom dem. I arbeidsøkten kartlegger vi hvor manuelt arbeid bremser {company}. Under videoen finner du lenker til nettstedene deres, så du selv kan se hva de er.',
          'Dette er verktøy vi ofte kobler sammen i din bransje. Tiden går som regel til å kopiere data mellom dem. I arbeidsøkten kartlegger vi hvor manuelt arbeid bremser teamet ditt. Under videoen finner du lenker til nettstedene deres, så du selv kan se hva de er.',
        ],
        featured: [
          'Dette er verktøy vi ofte kobler sammen, for eksempel {buyers}. Tiden går som regel til å kopiere data mellom dem. I arbeidsøkten kartlegger vi hvor manuelt arbeid bremser {company}. Under videoen finner du lenker til nettstedene deres.',
          'På skjermen ser du noen verktøy vi ofte kobler sammen. Tiden går som regel til å kopiere data mellom dem. I arbeidsøkten kartlegger vi hvor manuelt arbeid bremser teamet ditt. Under videoen finner du lenker til nettstedene deres.',
        ],
        empty: [
          'Hvert selskap taper tid på ulike steder. I arbeidsøkten kartlegger vi hvor manuelt arbeid bremser {company} og hvilke verktøy som er involvert. Slik ser du hvor tiden går, før du bestemmer deg for noe.',
          'Hvert selskap taper tid på ulike steder. I arbeidsøkten kartlegger vi hvor manuelt arbeid bremser teamet ditt og hvilke verktøy som er involvert. Slik ser du hvor tiden går, før du bestemmer deg for noe.',
        ],
      },
      6: {
        sector: [
          'Her er et første bevis i din bransje. {deal} Hvert selskap er forskjellig, og i arbeidsøkten velger vi den minste løsningen som viser verdien for {company}.',
          'Her er et første bevis i din bransje. Et godt første bevis er lite, praktisk og raskt å sjekke sammen med ditt eget team. Hvert selskap er forskjellig, og i arbeidsøkten velger vi den minste løsningen som viser verdien for {company}.',
          'Her er et første bevis i din bransje. Et godt første bevis er lite, praktisk og raskt å sjekke sammen med ditt eget team. Hvert selskap er forskjellig, og i arbeidsøkten velger vi den minste løsningen som viser verdien for deg og selskapet ditt.',
        ],
        recent: [
          'Her er et første bevis for team som ditt. {deal} Hvert selskap er forskjellig, og i arbeidsøkten velger vi den minste løsningen som viser verdien for {company}.',
          'Her er et første bevis for team som ditt. Et godt første bevis er lite, praktisk og raskt å sjekke sammen med ditt eget team. Hvert selskap er forskjellig, og i arbeidsøkten velger vi den minste løsningen som viser verdien for {company}.',
          'Her er et første bevis for team som ditt. Et godt første bevis er lite, praktisk og raskt å sjekke sammen med ditt eget team. Hvert selskap er forskjellig, og i arbeidsøkten velger vi den minste løsningen som viser verdien for deg og selskapet ditt.',
        ],
      },
      7: [
        'Slik arbeider Velho, {first}. Først finner vi det manuelle arbeidet som bremser selskapet ditt. Deretter bygger vi løsningen med kunstig intelligens og automatisering. Til slutt sørger vi for at ansatte faktisk tar den i bruk, så tiden dere sparer, ikke går tapt igjen.',
      ],
      8: [
        'Takk for at du så videoen, {first}. Hvis du vil høre mer, kan du booke en arbeidsøkt på tjue minutter med meg under videoen. I Teams velger vi én manuell arbeidsflyt i {company} og skisserer en praktisk løsning. Det forplikter deg ikke til noe. Jeg ser frem til samtalen vår.',
        'Takk for at du så videoen, {first}. Hvis du vil høre mer, kan du booke en arbeidsøkt på tjue minutter med meg under videoen. I Teams velger vi én manuell arbeidsflyt i selskapet ditt og skisserer en praktisk løsning. Det forplikter deg ikke til noe. Jeg ser frem til samtalen vår.',
      ],
    },
    lines: [
      'Selskapet presenterer produktene og tjenestene sine på nettstedet sitt.',
      'Det betjener kundene sine med egne ansatte og egen kompetanse.',
      'Vi avklarer detaljene med deg i møtet.',
    ],
    outreach: {
      subject: 'En kort video om {company}',
      email:
        'Hei {first},\n\njeg heter {analyst} og er analytiker i Velho. Vi er en strategisk AI-partner for vekst: vi finner det manuelle arbeidet som bremser et selskap, bygger løsningen med AI og automatisering og sørger for at folk faktisk bruker den. Jeg har laget en kort personlig video om {company}.\n\nDu kan se videoen her: {link}\n\nUnder videoen kan du booke en arbeidsøkt på tjue minutter med meg. Lenken er personlig og virker til og med {expires}.\n\nMed vennlig hilsen\n{analyst}\nVelho',
      short:
        'Hei {first}, dette er {analyst} fra Velho. Jeg har laget en kort personlig video til deg om {company}: {link} Det tar bare noen minutter å se den. Lenken virker til og med {expires}.',
    },
    brief: {
      booked: '{owner} ({company}) har booket et møte.',
      interest: {
        high: 'Interessenivået er høyt.',
        medium: 'Interessenivået er middels.',
        low: 'Interessenivået er lavt.',
      },
      completed: 'Eieren så videoen til slutten.',
      stopped: 'Eieren stoppet videoen ved lysbilde {n}.',
      notPlayed: 'Eieren spilte ikke av videoen.',
      formSent: 'Eieren sendte skjemaet.',
      noForm: 'Eieren sendte ikke skjemaet.',
      positive: 'Positive signaler: {list}.',
      negative: 'Negative signaler: {list}.',
      questions: {
        revenue: 'Hva var omsetningen i selskapet ditt i det siste regnskapsåret?',
        profit: 'Hva var driftsresultatet i selskapet ditt i det siste regnskapsåret?',
        custom: 'Kan vi gå gjennom spørsmålene i skjemaet som du ikke har svart på ennå?',
        timing: 'Når ville en første automatisering vært nyttig for deg?',
        staff: 'Hvor mange personer jobber i selskapet ditt i dag?',
        slide2: 'Hva vet du allerede om Velho og hvordan vi jobber?',
        slide3: 'Hvordan vil du beskrive selskapet ditt med noen få ord?',
        slide4: 'Hvor vokser manuelt arbeid raskest når selskapet ditt vokser?',
        slide5: 'Hvilke verktøy og overleveringer tar mest tid i teamet ditt?',
        slide6: 'Hvilken liten arbeidsflyt ville vært det beste første beviset?',
        slide7: 'Hva ville sørget for at teamet ditt faktisk bruker et nytt verktøy?',
        goals: 'Hvilke mål har du for selskapet de neste årene?',
        decision: 'Hvem andre vil være med på en beslutning om dette?',
        successor: 'Hvem i teamet ditt ville eid endringen?',
      },
    },
  },
  da: {
    scripts: {
      2: [
        'Tak, fordi du tager dig tid, {first}. Velho er en strategisk AI-partner for vækst. Vi finder det manuelle arbejde, der bremser en virksomhed, bygger løsningen med AI og automatisering og sørger for, at folk faktisk bruger den.',
      ],
      3: {
        site: [
          'Vi har kigget grundigt på hjemmesiden for {company}, {first}. Sådan forstår vi din forretning: {line} Voksende virksomheder mister ofte tid på manuelle overleveringer, og det er dér, vi begynder at lede.',
          'Vi har kigget grundigt på hjemmesiden for {company}, {first}. På skærmen ser du i tre korte linjer, hvordan vi forstår din forretning. Voksende virksomheder mister ofte tid på manuelle overleveringer, og det er dér, vi begynder at lede.',
          'Vi har kigget grundigt på din hjemmeside. På skærmen ser du i tre korte linjer, hvordan vi forstår din forretning. Voksende virksomheder mister ofte tid på manuelle overleveringer, og det er dér, vi begynder at lede.',
        ],
        noSite: [
          'Sådan forstår vi forretningen i {company}, {first}: {line} Voksende virksomheder mister ofte tid på manuelle overleveringer, og det er dér, vi begynder at lede.',
          'På skærmen ser du i tre korte linjer, hvordan vi forstår forretningen i {company}, {first}. Voksende virksomheder mister ofte tid på manuelle overleveringer, og det er dér, vi begynder at lede.',
          'På skærmen ser du i tre korte linjer, hvordan vi forstår din forretning. Voksende virksomheder mister ofte tid på manuelle overleveringer, og det er dér, vi begynder at lede.',
        ],
      },
      4: {
        figures: [
          'Ifølge Asiakastieto havde {company} en omsætning på {revenue} euro og et driftsresultat på {profit} euro i regnskabsåret {year}. Vækst giver som regel mere manuelt arbejde: flere overleveringer, flere kontroller og mere kopiering mellem værktøjer. Det er dér, vi kigger først.',
          'Ifølge Asiakastieto havde din virksomhed en omsætning på {revenue} euro og et driftsresultat på {profit} euro i regnskabsåret {year}. Vækst giver som regel mere manuelt arbejde: flere overleveringer, flere kontroller og mere kopiering mellem værktøjer. Det er dér, vi kigger først.',
        ],
        loss: [
          'Ifølge Asiakastieto havde {company} en omsætning på {revenue} euro og et driftsunderskud på {profit} euro i regnskabsåret {year}. Vækst giver som regel mere manuelt arbejde: flere overleveringer, flere kontroller og mere kopiering mellem værktøjer. Det er dér, vi kigger først.',
          'Ifølge Asiakastieto havde din virksomhed en omsætning på {revenue} euro og et driftsunderskud på {profit} euro i regnskabsåret {year}. Vækst giver som regel mere manuelt arbejde: flere overleveringer, flere kontroller og mere kopiering mellem værktøjer. Det er dér, vi kigger først.',
        ],
        calculator: [
          'Vi har ingen offentlige tal for din virksomhed. Fortæl os, hvor stor I er, i formularen på denne side. Et omtrentligt interval er nok. Så kan vi se, hvor manuelt arbejde vokser hurtigst, og dine svar går kun til Velho.',
        ],
        form: [
          'Vi har ingen offentlige tal for din virksomhed. Fortæl os, hvor stor I er, i formularen på denne side. Et omtrentligt interval er nok. Så kan vi forberede en bedre arbejdssession for dig, og dine svar går kun til Velho.',
        ],
      },
      5: {
        sector: [
          'Det er værktøjer, som vi ofte forbinder i din branche, for eksempel {buyers}. Tiden går som regel med at kopiere data mellem dem. I arbejdssessionen kortlægger vi, hvor manuelt arbejde bremser {company}. Under videoen finder du links til deres hjemmesider.',
          'Det er værktøjer, som vi ofte forbinder i din branche. Tiden går som regel med at kopiere data mellem dem. I arbejdssessionen kortlægger vi, hvor manuelt arbejde bremser {company}. Under videoen finder du links til deres hjemmesider, så du selv kan se, hvad de er.',
          'Det er værktøjer, som vi ofte forbinder i din branche. Tiden går som regel med at kopiere data mellem dem. I arbejdssessionen kortlægger vi, hvor manuelt arbejde bremser dit team. Under videoen finder du links til deres hjemmesider, så du selv kan se, hvad de er.',
        ],
        featured: [
          'Det er værktøjer, som vi ofte forbinder, for eksempel {buyers}. Tiden går som regel med at kopiere data mellem dem. I arbejdssessionen kortlægger vi, hvor manuelt arbejde bremser {company}. Under videoen finder du links til deres hjemmesider.',
          'På skærmen ser du nogle værktøjer, som vi ofte forbinder. Tiden går som regel med at kopiere data mellem dem. I arbejdssessionen kortlægger vi, hvor manuelt arbejde bremser dit team. Under videoen finder du links til deres hjemmesider.',
        ],
        empty: [
          'Hver virksomhed mister tid forskellige steder. I arbejdssessionen kortlægger vi, hvor manuelt arbejde bremser {company}, og hvilke værktøjer der er involveret. Sådan ser du, hvor tiden går, før du beslutter noget.',
          'Hver virksomhed mister tid forskellige steder. I arbejdssessionen kortlægger vi, hvor manuelt arbejde bremser dit team, og hvilke værktøjer der er involveret. Sådan ser du, hvor tiden går, før du beslutter noget.',
        ],
      },
      6: {
        sector: [
          'Her er et første bevis i din branche. {deal} Hver virksomhed er forskellig, og i arbejdssessionen vælger vi den mindste løsning, der viser værdien for {company}.',
          'Her er et første bevis i din branche. Et godt første bevis er lille, praktisk og hurtigt at tjekke sammen med dit eget team. Hver virksomhed er forskellig, og i arbejdssessionen vælger vi den mindste løsning, der viser værdien for {company}.',
          'Her er et første bevis i din branche. Et godt første bevis er lille, praktisk og hurtigt at tjekke sammen med dit eget team. Hver virksomhed er forskellig, og i arbejdssessionen vælger vi den mindste løsning, der viser værdien for dig og din virksomhed.',
        ],
        recent: [
          'Her er et første bevis for teams som dit. {deal} Hver virksomhed er forskellig, og i arbejdssessionen vælger vi den mindste løsning, der viser værdien for {company}.',
          'Her er et første bevis for teams som dit. Et godt første bevis er lille, praktisk og hurtigt at tjekke sammen med dit eget team. Hver virksomhed er forskellig, og i arbejdssessionen vælger vi den mindste løsning, der viser værdien for {company}.',
          'Her er et første bevis for teams som dit. Et godt første bevis er lille, praktisk og hurtigt at tjekke sammen med dit eget team. Hver virksomhed er forskellig, og i arbejdssessionen vælger vi den mindste løsning, der viser værdien for dig og din virksomhed.',
        ],
      },
      7: [
        'Sådan virker Velho, {first}. Først finder vi det manuelle arbejde, der bremser dit team. Derefter bygger vi løsningen med AI og automatisering. Til sidst sørger vi for, at folk faktisk bruger den, så den sparede tid også forbliver sparet.',
      ],
      8: [
        'Tak, fordi du så videoen, {first}. Hvis du vil høre mere, kan du booke en arbejdssession på tyve minutter med mig under videoen. På Teams vælger vi ét manuelt arbejdsforløb i {company} og skitserer en praktisk løsning. Det forpligter dig ikke til noget. Jeg glæder mig til vores samtale.',
        'Tak, fordi du så videoen, {first}. Hvis du vil høre mere, kan du booke en arbejdssession på tyve minutter med mig under videoen. På Teams vælger vi ét manuelt arbejdsforløb i din virksomhed og skitserer en praktisk løsning. Det forpligter dig ikke til noget. Jeg glæder mig til vores samtale.',
      ],
    },
    lines: [
      'Virksomheden præsenterer sine produkter og tjenester på sin hjemmeside.',
      'Den betjener sine kunder med egne medarbejdere og egen viden.',
      'Vi afklarer detaljerne med dig på mødet.',
    ],
    outreach: {
      subject: 'En kort video om {company}',
      email:
        'Hej {first},\n\njeg hedder {analyst} og er analytiker hos Velho. Vi er en strategisk AI-partner for vækst: vi finder det manuelle arbejde, der bremser en virksomhed, bygger løsningen med AI og automatisering og sørger for, at folk faktisk bruger den. Jeg har lavet en kort personlig video om {company}.\n\nDu kan se videoen her: {link}\n\nUnder videoen kan du booke en arbejdssession på tyve minutter med mig. Linket er personligt og virker til og med {expires}.\n\nMed venlig hilsen\n{analyst}\nVelho',
      short:
        'Hej {first}, det er {analyst} fra Velho. Jeg har lavet en kort personlig video til dig om {company}: {link} Det tager kun et par minutter at se den. Linket virker til og med {expires}.',
    },
    brief: {
      booked: '{owner} ({company}) har booket et møde.',
      interest: {
        high: 'Interesseniveauet er højt.',
        medium: 'Interesseniveauet er middel.',
        low: 'Interesseniveauet er lavt.',
      },
      completed: 'Ejeren så videoen til ende.',
      stopped: 'Ejeren stoppede videoen ved dias {n}.',
      notPlayed: 'Ejeren afspillede ikke videoen.',
      formSent: 'Ejeren sendte formularen.',
      noForm: 'Ejeren sendte ikke formularen.',
      positive: 'Positive signaler: {list}.',
      negative: 'Negative signaler: {list}.',
      questions: {
        revenue: 'Hvad var omsætningen i din virksomhed i det seneste regnskabsår?',
        profit: 'Hvad var driftsresultatet i din virksomhed i det seneste regnskabsår?',
        custom: 'Kan vi gennemgå de spørgsmål i formularen, som du ikke har besvaret endnu?',
        timing: 'Hvornår ville en første automatisering være nyttig for dig?',
        staff: 'Hvor mange medarbejdere har din virksomhed i dag?',
        slide2: 'Hvad ved du allerede om Velho, og hvordan vi arbejder?',
        slide3: 'Hvordan vil du beskrive din virksomhed med få ord?',
        slide4: 'Hvor vokser manuelt arbejde hurtigst, når din virksomhed vokser?',
        slide5: 'Hvilke værktøjer og overleveringer tager mest tid i dit team?',
        slide6: 'Hvilket lille arbejdsforløb ville være det bedste første bevis?',
        slide7: 'Hvad ville sikre, at dit team faktisk bruger et nyt værktøj?',
        goals: 'Hvilke mål har du for virksomheden i de kommende år?',
        decision: 'Hvem ellers vil være med i en beslutning om dette?',
        successor: 'Hvem i dit team ville eje forandringen?',
      },
    },
  },
  de: {
    scripts: {
      2: [
        'Vielen Dank, dass Sie sich kurz Zeit nehmen. Velho ist ein strategischer KI-Partner für Wachstum. Wir finden die manuelle Arbeit, die ein Unternehmen ausbremst, bauen die Lösung mit KI und Automatisierung und sorgen dafür, dass die Menschen sie wirklich nutzen.',
      ],
      3: {
        site: [
          'Wir haben uns die Website von {company} genau angesehen. So verstehen wir Ihr Geschäft: {line} Wachsende Unternehmen verlieren oft Zeit durch manuelle Übergaben, und genau dort beginnen wir zu suchen.',
          'Wir haben uns die Website von {company} genau angesehen. Auf dem Bildschirm sehen Sie in drei kurzen Zeilen, wie wir Ihr Geschäft verstehen. Wachsende Unternehmen verlieren oft Zeit durch manuelle Übergaben, und genau dort beginnen wir zu suchen.',
          'Wir haben uns Ihre Website genau angesehen. Auf dem Bildschirm sehen Sie in drei kurzen Zeilen, wie wir Ihr Geschäft verstehen. Wachsende Unternehmen verlieren oft Zeit durch manuelle Übergaben, und genau dort beginnen wir zu suchen.',
        ],
        noSite: [
          'So verstehen wir das Geschäft von {company}: {line} Wachsende Unternehmen verlieren oft Zeit durch manuelle Übergaben, und genau dort beginnen wir zu suchen.',
          'Auf dem Bildschirm sehen Sie in drei kurzen Zeilen, wie wir das Geschäft von {company} verstehen. Wachsende Unternehmen verlieren oft Zeit durch manuelle Übergaben, und genau dort beginnen wir zu suchen.',
          'Auf dem Bildschirm sehen Sie in drei kurzen Zeilen, wie wir Ihr Geschäft verstehen. Wachsende Unternehmen verlieren oft Zeit durch manuelle Übergaben, und genau dort beginnen wir zu suchen.',
        ],
      },
      4: {
        figures: [
          'Laut Asiakastieto erzielte {company} im Geschäftsjahr {year} einen Umsatz von {revenue} Euro und ein Betriebsergebnis von {profit} Euro. Wachstum bringt meist mehr manuelle Arbeit mit sich: mehr Übergaben, mehr Kontrollen und mehr Kopieren zwischen Tools. Dort schauen wir zuerst hin.',
          'Laut Asiakastieto erzielte Ihr Unternehmen im Geschäftsjahr {year} einen Umsatz von {revenue} Euro und ein Betriebsergebnis von {profit} Euro. Wachstum bringt meist mehr manuelle Arbeit mit sich: mehr Übergaben, mehr Kontrollen und mehr Kopieren zwischen Tools. Dort schauen wir zuerst hin.',
        ],
        loss: [
          'Laut Asiakastieto erzielte {company} im Geschäftsjahr {year} einen Umsatz von {revenue} Euro und einen Betriebsverlust von {profit} Euro. Wachstum bringt meist mehr manuelle Arbeit mit sich: mehr Übergaben, mehr Kontrollen und mehr Kopieren zwischen Tools. Dort schauen wir zuerst hin.',
          'Laut Asiakastieto erzielte Ihr Unternehmen im Geschäftsjahr {year} einen Umsatz von {revenue} Euro und einen Betriebsverlust von {profit} Euro. Wachstum bringt meist mehr manuelle Arbeit mit sich: mehr Übergaben, mehr Kontrollen und mehr Kopieren zwischen Tools. Dort schauen wir zuerst hin.',
        ],
        calculator: [
          'Für Ihr Unternehmen liegen uns keine öffentlichen Zahlen vor. Bitte geben Sie im Formular auf dieser Seite Ihre Größe an. Eine grobe Spanne genügt. So sehen wir, wo manuelle Arbeit am schnellsten wächst, und Ihre Angaben gehen nur an Velho.',
        ],
        form: [
          'Für Ihr Unternehmen liegen uns keine öffentlichen Zahlen vor. Bitte geben Sie im Formular auf dieser Seite Ihre Größe an. Eine grobe Spanne genügt. So können wir eine bessere Arbeitssitzung für Sie vorbereiten, und Ihre Angaben gehen nur an Velho.',
        ],
      },
      5: {
        sector: [
          'Das sind Tools, die wir in Ihrer Branche oft verbinden, zum Beispiel {buyers}. Die Zeit geht meist ins Kopieren von Daten zwischen ihnen. In der Arbeitssitzung erfassen wir, wo manuelle Arbeit {company} ausbremst. Unter dem Video finden Sie Links zu ihren Websites.',
          'Das sind Tools, die wir in Ihrer Branche oft verbinden. Die Zeit geht meist ins Kopieren von Daten zwischen ihnen. In der Arbeitssitzung erfassen wir, wo manuelle Arbeit {company} ausbremst. Unter dem Video finden Sie Links zu ihren Websites, damit Sie sich selbst ein Bild machen können.',
          'Das sind Tools, die wir in Ihrer Branche oft verbinden. Die Zeit geht meist ins Kopieren von Daten zwischen ihnen. In der Arbeitssitzung erfassen wir, wo manuelle Arbeit Ihr Team ausbremst. Unter dem Video finden Sie Links zu ihren Websites, damit Sie sich selbst ein Bild machen können.',
        ],
        featured: [
          'Das sind Tools, die wir oft verbinden, zum Beispiel {buyers}. Die Zeit geht meist ins Kopieren von Daten zwischen ihnen. In der Arbeitssitzung erfassen wir, wo manuelle Arbeit {company} ausbremst. Unter dem Video finden Sie Links zu ihren Websites.',
          'Auf dem Bildschirm sehen Sie einige Tools, die wir oft verbinden. Die Zeit geht meist ins Kopieren von Daten zwischen ihnen. In der Arbeitssitzung erfassen wir, wo manuelle Arbeit Ihr Team ausbremst. Unter dem Video finden Sie Links zu ihren Websites.',
        ],
        empty: [
          'Jedes Unternehmen verliert Zeit an anderen Stellen. In der Arbeitssitzung erfassen wir, wo manuelle Arbeit {company} ausbremst und welche Tools beteiligt sind. So sehen Sie, wohin die Zeit geht, bevor Sie etwas entscheiden.',
          'Jedes Unternehmen verliert Zeit an anderen Stellen. In der Arbeitssitzung erfassen wir, wo manuelle Arbeit Ihr Team ausbremst und welche Tools beteiligt sind. So sehen Sie, wohin die Zeit geht, bevor Sie etwas entscheiden.',
        ],
      },
      6: {
        sector: [
          'Das ist ein erster Beweis in Ihrer Branche. {deal} Jedes Unternehmen ist anders, und in der Arbeitssitzung wählen wir die kleinste Lösung, die den Nutzen für {company} zeigt.',
          'Das ist ein erster Beweis in Ihrer Branche. Ein guter erster Beweis ist klein, praktisch und mit Ihrem eigenen Team schnell zu prüfen. Jedes Unternehmen ist anders, und in der Arbeitssitzung wählen wir die kleinste Lösung, die den Nutzen für {company} zeigt.',
          'Das ist ein erster Beweis in Ihrer Branche. Ein guter erster Beweis ist klein, praktisch und mit Ihrem eigenen Team schnell zu prüfen. Jedes Unternehmen ist anders, und in der Arbeitssitzung wählen wir die kleinste Lösung, die den Nutzen für Sie und Ihr Unternehmen zeigt.',
        ],
        recent: [
          'Das ist ein erster Beweis für Teams wie Ihres. {deal} Jedes Unternehmen ist anders, und in der Arbeitssitzung wählen wir die kleinste Lösung, die den Nutzen für {company} zeigt.',
          'Das ist ein erster Beweis für Teams wie Ihres. Ein guter erster Beweis ist klein, praktisch und mit Ihrem eigenen Team schnell zu prüfen. Jedes Unternehmen ist anders, und in der Arbeitssitzung wählen wir die kleinste Lösung, die den Nutzen für {company} zeigt.',
          'Das ist ein erster Beweis für Teams wie Ihres. Ein guter erster Beweis ist klein, praktisch und mit Ihrem eigenen Team schnell zu prüfen. Jedes Unternehmen ist anders, und in der Arbeitssitzung wählen wir die kleinste Lösung, die den Nutzen für Sie und Ihr Unternehmen zeigt.',
        ],
      },
      7: [
        'So arbeitet Velho. Zuerst finden wir die manuelle Arbeit, die Ihr Team ausbremst. Dann bauen wir die Lösung mit KI und Automatisierung. Zum Schluss sorgen wir dafür, dass die Menschen sie wirklich nutzen, damit die gewonnene Zeit auch gewonnen bleibt.',
      ],
      8: [
        'Vielen Dank, dass Sie sich das Video angesehen haben. Wenn Sie mehr erfahren möchten, buchen Sie unter dem Video eine Arbeitssitzung von zwanzig Minuten mit mir. Per Teams wählen wir einen manuellen Arbeitsablauf bei {company} und skizzieren eine praktische Lösung. Das verpflichtet Sie zu nichts. Ich freue mich auf unser Gespräch.',
        'Vielen Dank, dass Sie sich das Video angesehen haben. Wenn Sie mehr erfahren möchten, buchen Sie unter dem Video eine Arbeitssitzung von zwanzig Minuten mit mir. Per Teams wählen wir einen manuellen Arbeitsablauf in Ihrem Unternehmen und skizzieren eine praktische Lösung. Das verpflichtet Sie zu nichts. Ich freue mich auf unser Gespräch.',
      ],
    },
    lines: [
      'Das Unternehmen stellt seine Produkte und Leistungen auf seiner Website vor.',
      'Es betreut seine Kunden mit eigenem Team und eigenem Know-how.',
      'Die Einzelheiten klären wir gern mit Ihnen im Gespräch.',
    ],
    outreach: {
      subject: 'Ein kurzes Video über {company}',
      email:
        'Guten Tag {name},\n\nmein Name ist {analyst}, ich arbeite bei Velho. Wir sind ein strategischer KI-Partner für Wachstum: Wir finden die manuelle Arbeit, die ein Unternehmen ausbremst, bauen die Lösung mit KI und Automatisierung und sorgen dafür, dass die Menschen sie wirklich nutzen. Ich habe ein kurzes persönliches Video über {company} erstellt.\n\nSie können das Video hier ansehen: {link}\n\nUnter dem Video können Sie eine Arbeitssitzung von zwanzig Minuten mit mir buchen. Der Link ist persönlich und gilt bis zum {expires}.\n\nMit freundlichen Grüßen\n{analyst}\nVelho',
      short:
        'Guten Tag {name}, hier ist {analyst} von Velho. Ich habe ein kurzes persönliches Video für Sie über {company} erstellt: {link} Es dauert nur wenige Minuten. Der Link gilt bis zum {expires}.',
    },
    brief: {
      booked: '{owner} ({company}) hat einen Termin gebucht.',
      interest: {
        high: 'Das Interesse ist hoch.',
        medium: 'Das Interesse ist mittel.',
        low: 'Das Interesse ist niedrig.',
      },
      completed: 'Der Inhaber hat das Video bis zum Ende angesehen.',
      stopped: 'Der Inhaber hat das Video bei Folie {n} beendet.',
      notPlayed: 'Der Inhaber hat das Video nicht abgespielt.',
      formSent: 'Der Inhaber hat das Formular gesendet.',
      noForm: 'Der Inhaber hat das Formular nicht gesendet.',
      positive: 'Positive Signale: {list}.',
      negative: 'Negative Signale: {list}.',
      questions: {
        revenue: 'Wie hoch war der Umsatz Ihres Unternehmens im letzten Geschäftsjahr?',
        profit: 'Wie hoch war das Betriebsergebnis Ihres Unternehmens im letzten Geschäftsjahr?',
        custom: 'Können wir die Fragen im Formular durchgehen, die Sie noch nicht beantwortet haben?',
        timing: 'Wann wäre eine erste Automatisierung für Sie nützlich?',
        staff: 'Wie viele Mitarbeitende hat Ihr Unternehmen heute?',
        slide2: 'Was wissen Sie bereits über Velho und unsere Arbeitsweise?',
        slide3: 'Wie würden Sie Ihr Unternehmen in wenigen Worten beschreiben?',
        slide4: 'Wo wächst manuelle Arbeit am schnellsten, wenn Ihr Unternehmen wächst?',
        slide5: 'Welche Tools und Übergaben kosten Ihr Team am meisten Zeit?',
        slide6: 'Welcher kleine Arbeitsablauf wäre der beste erste Beweis?',
        slide7: 'Was würde sicherstellen, dass Ihr Team ein neues Tool wirklich nutzt?',
        goals: 'Welche Ziele haben Sie für das Unternehmen in den nächsten Jahren?',
        decision: 'Wer wäre außer Ihnen an einer Entscheidung dazu beteiligt?',
        successor: 'Wer in Ihrem Team würde die Veränderung verantworten?',
      },
    },
  },
}

const MAX_BUYER_NAMES = 3
const MAX_SUMMARY_WORDS = 60
const MAX_QUESTIONS = 5
const MIN_LINE_WORDS = 6
const MAX_LINE_WORDS = 18
const WATCHED_S = 1
const FIRST_PERSON: Record<Lang, ReadonlySet<string>> = {
  en: new Set(['i', 'me', 'my', 'we', 'us', 'our', 'ours']),
  fi: new Set(['minä', 'minun', 'minulla', 'me', 'meidän', 'meillä', 'meille', 'meitä', 'meistä', 'meihin', 'meissä']),
  sv: new Set(['jag', 'mig', 'min', 'mitt', 'mina', 'vi', 'oss', 'vår', 'vårt', 'våra']),
  nb: new Set(['jeg', 'meg', 'min', 'mitt', 'mine', 'vi', 'oss', 'vår', 'vårt', 'våre']),
  da: new Set(['jeg', 'mig', 'min', 'mit', 'mine', 'vi', 'os', 'vor', 'vort', 'vore', 'vores']),
  de: new Set(['ich', 'mich', 'mir', 'mein', 'meine', 'meinem', 'meinen', 'meiner', 'wir', 'uns', 'unser', 'unsere', 'unserem', 'unseren', 'unserer', 'unseres']),
}
const SECOND_PERSON: Record<Lang, ReadonlySet<string>> = {
  en: new Set(['you', 'your', 'yours', 'yourself', 'yourselves']),
  fi: new Set(['sinä', 'sinun', 'sinua', 'sinut', 'sinussa', 'sinusta', 'sinuun', 'sinulla', 'sinulta', 'sinulle', 'te', 'teidän', 'teitä', 'teidät', 'teissä', 'teistä', 'teihin', 'teillä', 'teiltä', 'teille']),
  sv: new Set(['du', 'dig', 'din', 'ditt', 'dina', 'ni', 'er', 'ert', 'era']),
  nb: new Set(['du', 'deg', 'din', 'ditt', 'dine', 'dere']),
  da: new Set(['du', 'dig', 'din', 'dit', 'dine', 'jer', 'jeres']),
  de: new Set(['du', 'dich', 'dir', 'dein', 'deine', 'deinem', 'deinen', 'deiner', 'deines']),
}
const GERMAN_FORMAL: ReadonlySet<string> = new Set(['Sie', 'Ihnen', 'Ihr', 'Ihre', 'Ihrem', 'Ihren', 'Ihrer', 'Ihres'])
const REFERS_BACK: Record<Lang, ReadonlySet<string>> = {
  en: new Set(['it', 'its', 'this', 'that', 'these', 'those', 'they', 'their', 'them', 'such', 'he', 'she', 'his', 'her', 'also', 'additionally', 'furthermore', 'moreover', 'therefore', 'thus', 'hence']),
  fi: new Set(['se', 'sen', 'sitä', 'siitä', 'siinä', 'sillä', 'siihen', 'ne', 'niiden', 'niitä', 'niistä', 'niillä', 'tämä', 'tämän', 'tätä', 'tästä', 'tässä', 'nämä', 'näiden', 'näitä', 'näin', 'siksi', 'siten', 'täten', 'lisäksi', 'myös', 'hän', 'hänen']),
  sv: new Set(['det', 'den', 'detta', 'denna', 'dessa', 'de', 'dem', 'deras', 'dess', 'han', 'hon', 'hans', 'hennes', 'därför', 'dessutom', 'också', 'så', 'sådana']),
  nb: new Set(['det', 'den', 'dette', 'denne', 'disse', 'de', 'dem', 'deres', 'dens', 'han', 'hun', 'hans', 'hennes', 'derfor', 'dessuten', 'også', 'slik', 'sånn']),
  da: new Set(['det', 'den', 'dette', 'denne', 'disse', 'de', 'dem', 'deres', 'dens', 'han', 'hun', 'hans', 'hendes', 'derfor', 'desuden', 'også', 'sådan']),
  de: new Set(['es', 'er', 'sie', 'dies', 'diese', 'dieser', 'dieses', 'diesem', 'diesen', 'damit', 'dadurch', 'dabei', 'dafür', 'deshalb', 'daher', 'darum', 'dazu', 'außerdem', 'zudem', 'auch', 'so', 'solche']),
}
const GERMAN_ARTICLES: ReadonlySet<string> = new Set(['das', 'der', 'die', 'den', 'dem'])
const NOISE =
  /cookie|eväste|kakor|informasjonskaps|datenschutz|privacy|tietosuoja|integritet|personvern|privatliv|copyright|©|@|https?:|www\./iu

function sentence(text: string | undefined): string {
  const trimmed = text?.replace(/\s+/gu, ' ').trim() ?? ''
  return trimmed === '' || /[.!?]$/u.test(trimmed) ? trimmed : `${trimmed}.`
}

function firstPerson(text: string, lang: Lang): boolean {
  return text
    .split(/[^\p{L}]+/u)
    .some((word) => word !== 'US' && (FIRST_PERSON[lang].has(word.toLowerCase()) || (lang === 'fi' && /mme$/iu.test(word))))
}

function addressesReader(text: string, lang: Lang): boolean {
  return (
    /\?$/u.test(text) ||
    text
      .split(/[^\p{L}]+/u)
      .filter(Boolean)
      .some((word, index) => SECOND_PERSON[lang].has(word.toLowerCase()) || (lang === 'de' && index > 0 && GERMAN_FORMAL.has(word)))
  )
}

function refersBack(text: string, lang: Lang): boolean {
  const [first = '', second = ''] = text.split(/[^\p{L}]+/u).filter(Boolean)
  const word = first.toLowerCase()
  return REFERS_BACK[lang].has(word) || (lang === 'de' && GERMAN_ARTICLES.has(word) && /^\p{Ll}/u.test(second))
}

function inLanguage(texts: string[], lang: Lang): boolean {
  return detectLanguage(texts.join(' ')) === lang
}

function fillTemplate(template: string, vars: Record<string, string>): string | null {
  let text = vars.first ? template : template.replace(/, \{first\}/gu, '')
  let missing = false
  text = text.replace(/\{(\w+)\}/gu, (_, key: string) => {
    const value = vars[key]
    if (!value) missing = true
    return value ?? ''
  })
  return missing ? null : text
}

function scriptTemplates(slide: ScriptSlideNumber, ctx: ScriptContext): string[] {
  const scripts = TEXTS[ctx.lang].scripts
  if (slide === 3) return ctx.hasWebsite ? scripts[3].site : scripts[3].noSite
  if (slide === 5) return scripts[5][ctx.buyerNames.some((name) => name.trim() !== '') ? (ctx.buyerScope ?? 'sector') : 'empty']
  if (slide === 6) return scripts[6][ctx.dealScope ?? 'sector']
  if (slide !== 4) return scripts[slide]
  if (ctx.figures.source === 'asiakastieto') return ctx.figures.profit < 0 ? scripts[4].loss : scripts[4].figures
  return ctx.calculator ? scripts[4].calculator : scripts[4].form
}

function quotableLine(lines: string[], lang: Lang): string {
  const first = lines[0] ?? ''
  return inLanguage(lines, lang) && !firstPerson(first, lang) && !addressesReader(first, lang) && !refersBack(first, lang)
    ? sentence(first)
    : ''
}

export function fallbackScript(slide: ScriptSlideNumber, ctx: ScriptContext): string {
  const locale = t(ctx.lang).locale
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
  const buyers = ctx.buyerNames.map((name) => name.trim()).filter(Boolean).slice(0, MAX_BUYER_NAMES)
  const vars: Record<string, string> = {
    first: ctx.ownerFirstName.trim(),
    company: ctx.company.trim(),
    buyerCount: number.format(ctx.buyerCount),
    buyers: buyers.length > 0 ? new Intl.ListFormat(locale, { type: 'conjunction' }).format(buyers) : '',
    line: quotableLine(ctx.lines, ctx.lang),
    deal: inLanguage(ctx.dealTexts, ctx.lang) ? sentence(ctx.dealTexts[0]) : '',
  }
  if (ctx.figures.source === 'asiakastieto') {
    vars.revenue = number.format(ctx.figures.revenue)
    vars.profit = number.format(Math.abs(ctx.figures.profit))
    vars.year = String(ctx.figures.fiscalYear)
  }
  const candidates = scriptTemplates(slide, ctx)
    .map((template) => fillTemplate(template, vars))
    .filter((text): text is string => text !== null)
  return candidates.find((text) => checkScript(text, ctx.lang, ctx).ok) ?? candidates.at(-1) ?? ''
}

interface SourceSentence {
  text: string
  index: number
  refersBack: boolean
}

function markdownSentences(markdown: string, lang: Lang): SourceSentence[] {
  const max = SLOT_LIMITS['your-company.line'] ?? 90
  const seen = new Set<string>()
  const sentences: SourceSentence[] = []
  let index = 0
  for (const rawLine of markdown.split(/\n+/u)) {
    const line = rawLine
      .replace(/^\s*(?:[-+*]|\d+[.)])\s+/u, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/gu, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/gu, '$1')
      .replace(/<[^>]+>/gu, ' ')
      .replace(/[`*_~>|#]+/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim()
    for (const part of line.split(/(?<=[.!?])\s+/u)) {
      const text = sentence(part)
      const current = index++
      const words = countWords(text)
      if (words < MIN_LINE_WORDS || words > MAX_LINE_WORDS || textLength(text) > max) continue
      if (NOISE.test(text) || !/^[\p{Lu}\p{N}]/u.test(text) || !/(?:^|[^\p{L}])\p{Ll}/u.test(text)) continue
      if (firstPerson(text, lang) || addressesReader(text, lang)) continue
      const key = text.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      sentences.push({ text, index: current, refersBack: refersBack(text, lang) })
    }
  }
  return sentences
}

function linked(sentences: readonly SourceSentence[]): string[] {
  const kept: SourceSentence[] = []
  for (const item of sentences) {
    if (item.refersBack && kept.at(-1)?.index !== item.index - 1) continue
    kept.push(item)
  }
  return kept.map((item) => item.text)
}

export function fallbackLines(markdown: string, lang: Lang, company: string): string[] {
  const input = { task: 'company-lines', lang, company, text: markdown }
  const generic = TEXTS[lang].lines
  const sources = markdownSentences(markdown, lang)
  const sentences = linked(sources)
  const native = linked(sources.filter((item) => detectLanguage(item.text) === lang))
  const options = [sentences, native, [...sentences, ...generic], [...native, ...generic]].map((lines) => lines.slice(0, 3))
  return options.find((lines) => lines.length === 3 && checkLines(lines, lang, input).ok) ?? [...generic]
}

function briefQuestions(texts: WriterTexts['brief'], brief: Omit<MeetingBrief, 'questions'>): string[] {
  const keys: QuestionKey[] = []
  const answered = new Set(brief.form?.answers.map((answer) => answer.key) ?? [])
  if (brief.figures.revenue === null) keys.push('revenue')
  if (brief.figures.profit === null) keys.push('profit')
  if (brief.customQuestions.some((c) => !c.answer?.trim())) keys.push('custom')
  if (!answered.has('timing')) keys.push('timing')
  const completed = brief.signals.some((s) => s.key === 'watched_to_end')
  const reached = completed ? 8 : (brief.engagement.stopSlide ?? 0)
  for (const slide of brief.engagement.perSlide) {
    if (slide.slide >= 2 && slide.slide <= 7 && slide.slide < reached && slide.watchS < WATCHED_S) {
      keys.push(`slide${slide.slide}` as QuestionKey)
    }
  }
  if (brief.company.staffCount === null && !answered.has('staff')) keys.push('staff')
  keys.push('goals', 'decision', 'successor')
  return [...new Set(keys)].slice(0, MAX_QUESTIONS).map((key) => texts.questions[key])
}

function briefSummary(lang: Lang, texts: WriterTexts['brief'], brief: Omit<MeetingBrief, 'questions'>): string {
  const names = t(lang).signals
  const positive = brief.signals.filter((s) => s.type === 'positive').map((s) => names[s.key])
  const negative = brief.signals.filter((s) => s.type === 'negative').map((s) => names[s.key])
  const completed = brief.signals.some((s) => s.key === 'watched_to_end')
  const stop = brief.engagement.stopSlide
  const parts = [
    fill(texts.booked, { owner: brief.header.owner, company: brief.header.company }),
    texts.interest[brief.header.interest],
    completed ? texts.completed : stop !== null ? fill(texts.stopped, { n: stop }) : texts.notPlayed,
    brief.form ? texts.formSent : texts.noForm,
    positive.length > 0 ? fill(texts.positive, { list: positive.join(', ') }) : null,
    negative.length > 0 ? fill(texts.negative, { list: negative.join(', ') }) : null,
  ].filter((part): part is string => part !== null)
  while (parts.length > 1 && countWords(parts.join(' ')) > MAX_SUMMARY_WORDS) parts.pop()
  return parts.join(' ')
}

export function fallbackBriefText(input: { lang: Lang; brief: Omit<MeetingBrief, 'questions'> }): {
  summary: string
  questions: string[]
} {
  const texts = TEXTS[input.lang].brief
  const output = {
    summary: briefSummary(input.lang, texts, input.brief),
    questions: briefQuestions(texts, input.brief),
  }
  const request = { task: 'brief-text', lang: input.lang, brief: input.brief }
  if (checkBriefText(output, input.lang, request).ok) return output
  return { summary: texts.interest[input.brief.header.interest], questions: output.questions }
}

export function fallbackOutreach(context: OutreachContext): { subject: string; message: string } {
  const texts = TEXTS[context.lang].outreach
  const vars = { company: context.company, analyst: context.analystName, expires: context.expiresOn }
  const greeted = (context.channel === 'email' ? texts.email : texts.short)
    .replace(' {first}', context.ownerFirstName ? ` ${context.ownerFirstName}` : '')
    .replace(' {name}', context.ownerName ? ` ${context.ownerName}` : '')
  return { subject: fill(texts.subject, vars), message: fill(greeted, vars) }
}
