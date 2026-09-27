import { checkBriefText, checkLines, checkScript, countWords } from './checks.ts'
import { fill, t } from './i18n.ts'
import { detectLanguage } from './languages.ts'
import { SLOT_LIMITS, textLength } from './slots.ts'
import type { BuyerScope, DealScope, Financials, InterestLevel, Lang, MeetingBrief, ScriptSlideNumber } from './types.ts'

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
        'Thank you for taking a few minutes, {first}. Mergero helps owners of established companies find the right buyer. On our MGX platform, {buyerCount} buyers look for companies to acquire. On the screen you see some buyers from our deals, and a few deals that we closed recently.',
      ],
      3: {
        site: [
          'We took a close look at the website of {company}, {first}. This is how we understand your business: {line} Companies like yours are exactly what our buyers ask about. If we missed something, you can correct us in the meeting.',
          'We took a close look at the website of {company}, {first}. On the screen you see in three short lines how we understand your business. Companies like yours are exactly what our buyers ask about. If we missed something, you can correct us in the meeting.',
          'We took a close look at your website. On the screen you see in three short lines how we understand your business. Companies like yours are exactly what our buyers ask about. If we missed something, you can correct us in the meeting.',
        ],
        noSite: [
          'This is how we understand the business of {company}, {first}: {line} Companies like yours are exactly what our buyers ask about. If we missed something, you can correct us in the meeting, so that the picture of your company is right.',
          'On the screen you see in three short lines how we understand the business of {company}, {first}. Companies like yours are exactly what our buyers ask about. If we missed something, you can correct us in the meeting, so that the picture of your company is right.',
          'On the screen you see in three short lines how we understand your business. Companies like yours are exactly what our buyers ask about. If we missed something, you can correct us in the meeting, so that the picture of your company is right.',
        ],
      },
      4: {
        figures: [
          'According to Asiakastieto, {company} had a revenue of {revenue} euros and an operating profit of {profit} euros in the fiscal year {year}. These public figures are a good starting point. In the meeting we can look at what they mean for the value of your company.',
          'According to Asiakastieto, your company had a revenue of {revenue} euros and an operating profit of {profit} euros in the fiscal year {year}. These public figures are a good starting point. In the meeting we can look at what they mean for the value of your company.',
        ],
        loss: [
          'According to Asiakastieto, {company} had a revenue of {revenue} euros and an operating loss of {profit} euros in the fiscal year {year}. These public figures are a good starting point. In the meeting we can look at what they mean for the value of your company.',
          'According to Asiakastieto, your company had a revenue of {revenue} euros and an operating loss of {profit} euros in the fiscal year {year}. These public figures are a good starting point. In the meeting we can look at what they mean for the value of your company.',
        ],
        calculator: [
          'We do not have public figures for your company. If you enter a range for revenue and profit in the form on this page, the calculator shows a value range for your company. It uses real deals from your sector. A rough range is enough, and your answers go to Mergero only.',
        ],
        form: [
          'We do not have public figures for your company. If you like, you can enter your revenue and profit in the form on this page. A rough range is enough. With these figures we can prepare a better meeting for you, and your answers go to Mergero only.',
        ],
      },
      5: {
        sector: [
          'These buyers made deals in your sector with Mergero. On the list you find, for example, {buyers}. Under each name you see the deal that the buyer made with us. In the meeting we look at which buyers could fit {company}. Below the video you find the links to their websites.',
          'These buyers made deals in your sector with Mergero. Under each name you see the deal that the buyer made with us. In the meeting we look at which buyers could fit {company}. Below the video you find the links to their websites, so you can see for yourself who they are.',
          'These buyers made deals in your sector with Mergero. Under each name you see the deal that the buyer made with us. In the meeting we look at which buyers could fit your company. Below the video you find the links to their websites, so you can see for yourself who they are.',
        ],
        featured: [
          'These buyers made deals with Mergero, for example {buyers}. Under each name you see the deal that the buyer made with us. In the meeting we look at which buyers could fit {company}. Below the video you find the links to their websites.',
          'On the screen you see some buyers that made deals with Mergero. Under each name you see the deal that the buyer made with us. In the meeting we look at which buyers could fit your company. Below the video you find the links to their websites.',
        ],
        empty: [
          'Each buyer on our platform has told us what kind of companies it wants to buy. In the meeting we go through the buyers that fit {company} best and what each of them looks for. This way you see who could be interested, before you decide anything.',
          'Each buyer on our platform has told us what kind of companies it wants to buy. In the meeting we go through the buyers that fit your company best and what each of them looks for. This way you see who could be interested, before you decide anything.',
        ],
      },
      6: {
        sector: [
          'Here is what is possible in your sector. {deal} Deals like this show that there is real demand for companies like {company}. Every sale is different, and in the meeting we can talk about what a deal could look like for you.',
          'Here is what is possible in your sector. In recent years, owners of similar companies have sold to buyers on our platform. Every sale is different, and in the meeting we can talk about what a deal could look like for {company}.',
          'Here is what is possible in your sector. In recent years, owners of similar companies have sold to buyers on our platform. Every sale is different, and in the meeting we can talk about what a deal could look like for you and your company.',
        ],
        recent: [
          'Here is what is possible for owners like you. {deal} Deals like this show that buyers on our platform look for established companies. Every sale is different, and in the meeting we can talk about what a deal could look like for {company}.',
          'Here is what is possible for owners like you. In recent years, owners of established companies have sold to buyers on our platform. Every sale is different, and in the meeting we can talk about what a deal could look like for {company}.',
          'Here is what is possible for owners like you. In recent years, owners of established companies have sold to buyers on our platform. Every sale is different, and in the meeting we can talk about what a deal could look like for you and your company.',
        ],
      },
      7: [
        'Your data stays private, {first}. Buyers see your company only as an anonymous profile, and we reveal its name only after you say yes. Your answers in the form go to Mergero only, and we delete the recording of this page when the link expires.',
      ],
      8: [
        'Thank you for watching, {first}. If you want to hear more, book a short meeting with me below the video. On Teams we talk about your goals, the interested buyers and a possible value range for {company}. The meeting does not commit you to anything. I look forward to our talk.',
        'Thank you for watching, {first}. If you want to hear more, book a short meeting with me below the video. On Teams we talk about your goals, the interested buyers and a possible value range for your company. The meeting does not commit you to anything. I look forward to our talk.',
      ],
    },
    lines: [
      'The company presents its products and services on its website.',
      'It serves its customers with its own team and know-how.',
      'We will confirm the details with you in the meeting.',
    ],
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
        timing: 'When could a sale be a realistic option for you?',
        staff: 'How many people work in your company today?',
        slide2: 'What do you already know about Mergero and how we work?',
        slide3: 'How would you describe your company in a few words?',
        slide4: 'How do you see the financial development of your company in the next years?',
        slide5: 'What kind of buyer would suit your company best?',
        slide6: 'Do you know of other company sales in your sector in recent years?',
        slide7: 'How important is confidentiality to you in a possible sale?',
        goals: 'What are your goals for the company in the next few years?',
        decision: 'Who else would take part in a decision about a sale?',
        successor: 'Is there a successor in the family or in the management team?',
      },
    },
  },
  fi: {
    scripts: {
      2: [
        'Kiitos, että käytät hetken tähän videoon, {first}. Mergero auttaa vakiintuneiden yritysten omistajia löytämään yritykselleen oikean ostajan. MGX-alustallamme on {buyerCount} ostajaa, jotka etsivät jatkuvasti uusia yrityksiä ostettavaksi. Ruudulla näet joitakin ostajia kaupoistamme ja muutaman kaupan, jonka olemme saaneet päätökseen viime aikoina.',
      ],
      3: {
        site: [
          'Tutustuimme verkkosivuihisi huolella, {first}. Näin ymmärrämme liiketoimintasi: {line} {company} on juuri sellainen yritys, josta ostajamme kysyvät meiltä. Jos jokin meni mielestäsi väärin, voit korjata sen tapaamisessa, niin kuva yrityksestäsi on oikea.',
          'Tutustuimme verkkosivuihisi huolella, {first}. Ruudulla näet kolmella lyhyellä rivillä, miten ymmärrämme liiketoimintasi. {company} on juuri sellainen yritys, josta ostajamme kysyvät meiltä. Jos jokin meni mielestäsi väärin, voit korjata sen tapaamisessa, niin kuva yrityksestäsi on oikea.',
          'Tutustuimme verkkosivuihisi huolella. Ruudulla näet kolmella lyhyellä rivillä, miten ymmärrämme liiketoimintasi. Yrityksesi on juuri sellainen, josta ostajamme kysyvät meiltä usein. Jos jokin meni mielestäsi väärin, voit korjata sen tapaamisessa, niin kuva yrityksestäsi on varmasti oikea.',
        ],
        noSite: [
          'Näin ymmärrämme liiketoimintasi, {first}: {line} {company} on juuri sellainen yritys, josta ostajamme kysyvät meiltä. Jos jokin meni mielestäsi väärin, voit korjata sen tapaamisessa, niin kuva yrityksestäsi on varmasti oikea.',
          'Ruudulla näet kolmella lyhyellä rivillä, miten ymmärrämme liiketoimintasi, {first}. {company} on juuri sellainen yritys, josta ostajamme kysyvät meiltä. Jos jokin meni mielestäsi väärin, voit korjata sen tapaamisessa, niin kuva yrityksestäsi on varmasti oikea.',
          'Ruudulla näet kolmella lyhyellä rivillä, miten ymmärrämme liiketoimintasi. Yrityksesi on juuri sellainen, josta ostajamme kysyvät meiltä usein. Jos jokin meni mielestäsi väärin, voit korjata sen tapaamisessa, niin kuva yrityksestäsi on varmasti oikea ja ajan tasalla.',
        ],
      },
      4: {
        figures: [
          'Asiakastiedon mukaan {company} teki tilikaudella {year} liikevaihtoa {revenue} euroa ja liikevoittoa {profit} euroa. Nämä julkiset luvut ovat hyvä lähtökohta keskustelullemme. Tapaamisessa voimme katsoa yhdessä, mitä luvut tarkoittavat yrityksesi arvolle ja millaisia ostajia ne kiinnostavat.',
          'Asiakastiedon mukaan yrityksesi teki tilikaudella {year} liikevaihtoa {revenue} euroa ja liikevoittoa {profit} euroa. Nämä julkiset luvut ovat hyvä lähtökohta keskustelullemme. Tapaamisessa voimme katsoa yhdessä, mitä luvut tarkoittavat yrityksesi arvolle ja millaisia ostajia ne kiinnostavat.',
        ],
        loss: [
          'Asiakastiedon mukaan {company} teki tilikaudella {year} liikevaihtoa {revenue} euroa, ja liiketappio oli {profit} euroa. Nämä julkiset luvut ovat hyvä lähtökohta keskustelullemme. Tapaamisessa voimme katsoa yhdessä, mitä luvut tarkoittavat yrityksesi arvolle ja millaisia ostajia ne kiinnostavat.',
          'Asiakastiedon mukaan yrityksesi teki tilikaudella {year} liikevaihtoa {revenue} euroa, ja liiketappio oli {profit} euroa. Nämä julkiset luvut ovat hyvä lähtökohta keskustelullemme. Tapaamisessa voimme katsoa yhdessä, mitä luvut tarkoittavat yrityksesi arvolle ja millaisia ostajia ne kiinnostavat.',
        ],
        calculator: [
          'Yrityksestäsi ei ole saatavilla julkisia lukuja. Jos annat liikevaihdon ja liikevoiton suuruusluokan tämän sivun lomakkeella, laskuri näyttää yrityksesi arvohaarukan. Laskuri perustuu toimialasi toteutuneisiin kauppoihin. Karkea arvio riittää hyvin, ja vastauksesi menevät vain Mergerolle.',
        ],
        form: [
          'Yrityksestäsi ei ole saatavilla julkisia lukuja. Jos haluat, voit kertoa liikevaihdon ja liikevoiton tämän sivun lomakkeella. Karkea suuruusluokka riittää hyvin. Lukujen avulla voimme valmistella tapaamisen paremmin juuri sinua varten, ja vastauksesi menevät vain Mergerolle.',
        ],
      },
      5: {
        sector: [
          'Nämä ostajat ovat ostaneet yrityksiä toimialaltasi Mergeron kautta. Listalla on esimerkiksi {buyers}. Jokaisen nimen alla näet kaupan, jonka ostaja teki kanssamme. Tapaamisessa katsomme yhdessä, mitkä ostajat voisivat sopia yritykselle {company}. Videon alta löydät linkit niiden verkkosivuille.',
          'Nämä ostajat ovat ostaneet yrityksiä toimialaltasi Mergeron kautta. Jokaisen nimen alla näet kaupan, jonka ostaja teki kanssamme. Tapaamisessa katsomme yhdessä, mitkä ostajat voisivat sopia yritykselle {company}. Videon alta löydät linkit niiden verkkosivuille, joten voit itse tutustua niihin.',
          'Nämä ostajat ovat ostaneet yrityksiä toimialaltasi Mergeron kautta. Jokaisen nimen alla näet kaupan, jonka ostaja teki kanssamme. Tapaamisessa katsomme yhdessä, mitkä ostajat voisivat sopia sinun yrityksellesi. Videon alta löydät linkit niiden verkkosivuille, joten voit itse tutustua niihin.',
        ],
        featured: [
          'Nämä ostajat ovat tehneet kauppoja Mergeron kanssa, esimerkiksi {buyers}. Jokaisen nimen alla näet kaupan, jonka ostaja teki kanssamme. Tapaamisessa katsomme yhdessä, mitkä ostajat voisivat sopia yritykselle {company}. Videon alta löydät linkit niiden verkkosivuille, joten voit itse tutustua niihin.',
          'Ruudulla näet joitakin ostajia, jotka ovat tehneet kauppoja Mergeron kanssa. Jokaisen nimen alla näet kaupan, jonka ostaja teki kanssamme. Tapaamisessa katsomme yhdessä, mitkä ostajat voisivat sopia sinun yrityksellesi. Videon alta löydät linkit niiden verkkosivuille, joten voit itse tutustua niihin.',
        ],
        empty: [
          'Jokainen alustamme ostaja on kertonut meille, millaisia yrityksiä se haluaa ostaa. Tapaamisessa käymme yhdessä läpi ostajat, joille {company} sopisi parhaiten, ja kerromme, mitä kukin niistä etsii. Näin näet, ketkä voisivat olla kiinnostuneita, ennen kuin teet päätöksiä.',
          'Jokainen alustamme ostaja on kertonut meille, millaisia yrityksiä se haluaa ostaa. Tapaamisessa käymme yhdessä läpi ostajat, jotka sopivat parhaiten yrityksellesi, ja kerromme, mitä kukin niistä etsii. Näin näet, ketkä voisivat olla kiinnostuneita, ennen kuin teet päätöksiä.',
        ],
      },
      6: {
        sector: [
          'Tässä on esimerkki siitä, mikä toimialallasi on mahdollista. {deal} Tällaiset kaupat osoittavat, että kaltaisillesi yrityksille on todellista kysyntää. Jokainen kauppa on erilainen, ja tapaamisessa voimme keskustella siitä, miltä kauppa voisi näyttää sinun kohdallasi.',
          'Tässä näet, mikä toimialallasi on mahdollista. Viime vuosina samankaltaisten yritysten omistajat ovat myyneet yrityksensä alustamme ostajille, ja kysyntä jatkuu edelleen. Jokainen kauppa on erilainen, ja tapaamisessa voimme keskustella siitä, miltä kauppa voisi näyttää sinun kohdallasi.',
        ],
        recent: [
          'Tässä on esimerkki siitä, mikä kaltaisillesi omistajille on mahdollista. {deal} Tällaiset kaupat osoittavat, että alustamme ostajat etsivät vakiintuneita yrityksiä. Jokainen kauppa on erilainen, ja tapaamisessa voimme keskustella siitä, miltä kauppa voisi näyttää sinun kohdallasi.',
          'Tässä näet, mikä kaltaisillesi omistajille on mahdollista. Viime vuosina vakiintuneiden yritysten omistajat ovat myyneet yrityksensä alustamme ostajille, ja kysyntä jatkuu edelleen. Jokainen kauppa on erilainen, ja tapaamisessa voimme keskustella siitä, miltä kauppa voisi näyttää sinun kohdallasi.',
        ],
      },
      7: [
        'Tietosi pysyvät luottamuksellisina, {first}. Ostajat näkevät yrityksesi vain nimettömänä profiilina, ja kerromme yrityksesi nimen vasta, kun annat siihen luvan. Lomakkeen vastauksesi menevät vain Mergerolle, ja tämän sivun tallenne poistetaan, kun linkki vanhenee. Sinä päätät, mitä seuraavaksi tapahtuu.',
      ],
      8: [
        'Kiitos, että katsoit videon, {first}. Jos haluat kuulla lisää, varaa lyhyt tapaaminen kanssani tämän videon alta ja valitse sinulle sopiva aika. Teamsissa keskustelemme tavoitteistasi, kiinnostuneista ostajista ja yrityksesi mahdollisesta arvosta. Tapaaminen ei sido sinua mihinkään. Odotan keskusteluamme mielenkiinnolla.',
      ],
    },
    lines: [
      'Yritys esittelee tuotteitaan ja palveluitaan verkkosivuillaan.',
      'Se palvelee asiakkaitaan omalla henkilöstöllään ja osaamisellaan.',
      'Tarkennamme tiedot kanssasi tapaamisessa.',
    ],
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
        timing: 'Milloin myynti voisi olla sinulle realistinen vaihtoehto?',
        staff: 'Kuinka monta henkilöä yrityksessäsi työskentelee tällä hetkellä?',
        slide2: 'Mitä tiedät jo Mergerosta ja tavastamme toimia?',
        slide3: 'Miten kuvailisit yritystäsi muutamalla sanalla?',
        slide4: 'Miten näet yrityksesi taloudellisen kehityksen lähivuosina?',
        slide5: 'Millainen ostaja sopisi yrityksellesi parhaiten?',
        slide6: 'Tiedätkö muista yrityskaupoista toimialallasi viime vuosilta?',
        slide7: 'Kuinka tärkeää luottamuksellisuus on sinulle mahdollisessa myynnissä?',
        goals: 'Mitkä ovat tavoitteesi yrityksen suhteen lähivuosina?',
        decision: 'Kuka muu osallistuisi päätökseen myynnistä?',
        successor: 'Onko perheessä tai johdossa jatkajaa yritykselle?',
      },
    },
  },
  sv: {
    scripts: {
      2: [
        'Tack för att du tar dig tid, {first}. Mergero hjälper ägare till etablerade företag att hitta rätt köpare. På vår plattform MGX finns {buyerCount} köpare som letar efter företag att förvärva. På skärmen ser du några köpare från våra affärer och några affärer som vi har genomfört nyligen.',
      ],
      3: {
        site: [
          'Vi har tittat noga på webbplatsen för {company}, {first}. Så här förstår vi din verksamhet: {line} Företag som ditt är precis vad våra köpare frågar efter. Om vi har missat något kan du rätta oss på mötet.',
          'Vi har tittat noga på webbplatsen för {company}, {first}. På skärmen ser du i tre korta rader hur vi förstår din verksamhet. Företag som ditt är precis vad våra köpare frågar efter. Om vi har missat något kan du rätta oss på mötet.',
          'Vi har tittat noga på din webbplats. På skärmen ser du i tre korta rader hur vi förstår din verksamhet. Företag som ditt är precis vad våra köpare frågar efter. Om vi har missat något kan du rätta oss på mötet.',
        ],
        noSite: [
          'Så här förstår vi verksamheten i {company}, {first}: {line} Företag som ditt är precis vad våra köpare frågar efter. Om vi har missat något kan du rätta oss på mötet, så att bilden av ditt företag blir rätt.',
          'På skärmen ser du i tre korta rader hur vi förstår verksamheten i {company}, {first}. Företag som ditt är precis vad våra köpare frågar efter. Om vi har missat något kan du rätta oss på mötet, så att bilden av ditt företag blir rätt.',
          'På skärmen ser du i tre korta rader hur vi förstår din verksamhet. Företag som ditt är precis vad våra köpare frågar efter. Om vi har missat något kan du rätta oss på mötet, så att bilden av ditt företag blir rätt.',
        ],
      },
      4: {
        figures: [
          'Enligt Asiakastieto hade {company} en omsättning på {revenue} euro och ett rörelseresultat på {profit} euro under räkenskapsåret {year}. De här offentliga siffrorna är en bra utgångspunkt. På mötet kan vi titta på vad de betyder för värdet på ditt företag.',
          'Enligt Asiakastieto hade ditt företag en omsättning på {revenue} euro och ett rörelseresultat på {profit} euro under räkenskapsåret {year}. De här offentliga siffrorna är en bra utgångspunkt. På mötet kan vi titta på vad de betyder för värdet på ditt företag.',
        ],
        loss: [
          'Enligt Asiakastieto hade {company} en omsättning på {revenue} euro och en rörelseförlust på {profit} euro under räkenskapsåret {year}. De här offentliga siffrorna är en bra utgångspunkt. På mötet kan vi titta på vad de betyder för värdet på ditt företag.',
          'Enligt Asiakastieto hade ditt företag en omsättning på {revenue} euro och en rörelseförlust på {profit} euro under räkenskapsåret {year}. De här offentliga siffrorna är en bra utgångspunkt. På mötet kan vi titta på vad de betyder för värdet på ditt företag.',
        ],
        calculator: [
          'Vi har inga offentliga siffror för ditt företag. Om du anger ett intervall för omsättning och resultat i formuläret på den här sidan visar kalkylatorn ett värdeintervall för ditt företag. Den bygger på verkliga affärer i din bransch. Ett ungefärligt intervall räcker, och dina svar går bara till Mergero.',
        ],
        form: [
          'Vi har inga offentliga siffror för ditt företag. Om du vill kan du ange omsättning och resultat i formuläret på den här sidan. Ett ungefärligt intervall räcker. Med siffrorna kan vi förbereda ett bättre möte för dig, och dina svar går bara till Mergero.',
        ],
      },
      5: {
        sector: [
          'De här köparna har gjort affärer i din bransch med Mergero. På listan finns till exempel {buyers}. Under varje namn ser du affären som köparen gjorde med oss. På mötet tittar vi på vilka köpare som kan passa {company}. Under videon hittar du länkar till deras webbplatser.',
          'De här köparna har gjort affärer i din bransch med Mergero. Under varje namn ser du affären som köparen gjorde med oss. På mötet tittar vi på vilka köpare som kan passa {company}. Under videon hittar du länkar till deras webbplatser, så att du själv kan se vilka de är.',
          'De här köparna har gjort affärer i din bransch med Mergero. Under varje namn ser du affären som köparen gjorde med oss. På mötet tittar vi på vilka köpare som kan passa ditt företag. Under videon hittar du länkar till deras webbplatser, så att du själv kan se vilka de är.',
        ],
        featured: [
          'De här köparna har gjort affärer med Mergero, till exempel {buyers}. Under varje namn ser du affären som köparen gjorde med oss. På mötet tittar vi på vilka köpare som kan passa {company}. Under videon hittar du länkar till deras webbplatser.',
          'På skärmen ser du några köpare som har gjort affärer med Mergero. Under varje namn ser du affären som köparen gjorde med oss. På mötet tittar vi på vilka köpare som kan passa ditt företag. Under videon hittar du länkar till deras webbplatser.',
        ],
        empty: [
          'Varje köpare på vår plattform har berättat för oss vilka företag den vill köpa. På mötet går vi igenom de köpare som passar {company} bäst och vad var och en av dem letar efter. Så ser du vem som kan vara intresserad, innan du bestämmer något.',
          'Varje köpare på vår plattform har berättat för oss vilka företag den vill köpa. På mötet går vi igenom de köpare som passar ditt företag bäst och vad var och en av dem letar efter. Så ser du vem som kan vara intresserad, innan du bestämmer något.',
        ],
      },
      6: {
        sector: [
          'Här är vad som är möjligt i din bransch. {deal} Affärer som denna visar att det finns en verklig efterfrågan på företag som {company}. Varje försäljning är unik, och på mötet kan vi prata om hur en affär skulle kunna se ut för dig.',
          'Här är vad som är möjligt i din bransch. Under de senaste åren har ägare till liknande företag sålt till köpare på vår plattform. Varje försäljning är unik, och på mötet kan vi prata om hur en affär skulle kunna se ut för {company}.',
          'Här är vad som är möjligt i din bransch. Under de senaste åren har ägare till liknande företag sålt till köpare på vår plattform. Varje försäljning är unik, och på mötet kan vi prata om hur en affär skulle kunna se ut för dig och ditt företag.',
        ],
        recent: [
          'Här är vad som är möjligt för ägare som du. {deal} Affärer som denna visar att köparna på vår plattform letar efter etablerade företag. Varje försäljning är unik, och på mötet kan vi prata om hur en affär skulle kunna se ut för {company}.',
          'Här är vad som är möjligt för ägare som du. Under de senaste åren har ägare till etablerade företag sålt till köpare på vår plattform. Varje försäljning är unik, och på mötet kan vi prata om hur en affär skulle kunna se ut för {company}.',
          'Här är vad som är möjligt för ägare som du. Under de senaste åren har ägare till etablerade företag sålt till köpare på vår plattform. Varje försäljning är unik, och på mötet kan vi prata om hur en affär skulle kunna se ut för dig och ditt företag.',
        ],
      },
      7: [
        'Dina uppgifter hålls konfidentiella, {first}. Köpare ser ditt företag bara som en anonym profil, och vi visar företagets namn först när du säger ja. Dina svar i formuläret går bara till Mergero, och vi raderar inspelningen av den här sidan när länken går ut.',
      ],
      8: [
        'Tack för att du tittade, {first}. Om du vill höra mer kan du boka ett kort möte med mig under videon. I Teams pratar vi om dina mål, de intresserade köparna och ett möjligt värdeintervall för {company}. Mötet förpliktar dig inte till något. Jag ser fram emot vårt samtal.',
        'Tack för att du tittade, {first}. Om du vill höra mer kan du boka ett kort möte med mig under videon. I Teams pratar vi om dina mål, de intresserade köparna och ett möjligt värdeintervall för ditt företag. Mötet förpliktar dig inte till något. Jag ser fram emot vårt samtal.',
      ],
    },
    lines: [
      'Företaget presenterar sina produkter och tjänster på sin webbplats.',
      'Det betjänar sina kunder med egen personal och egen kunskap.',
      'Vi stämmer av detaljerna med dig på mötet.',
    ],
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
        timing: 'När skulle en försäljning kunna vara ett realistiskt alternativ för dig?',
        staff: 'Hur många personer arbetar i ditt företag i dag?',
        slide2: 'Vad vet du redan om Mergero och hur vi arbetar?',
        slide3: 'Hur skulle du beskriva ditt företag med några få ord?',
        slide4: 'Hur ser du på företagets ekonomiska utveckling under de närmaste åren?',
        slide5: 'Vilken typ av köpare skulle passa ditt företag bäst?',
        slide6: 'Känner du till andra företagsförsäljningar i din bransch under de senaste åren?',
        slide7: 'Hur viktig är konfidentialitet för dig vid en eventuell försäljning?',
        goals: 'Vilka mål har du för företaget under de närmaste åren?',
        decision: 'Vem mer skulle delta i ett beslut om en försäljning?',
        successor: 'Finns det en efterträdare i familjen eller i ledningen?',
      },
    },
  },
  nb: {
    scripts: {
      2: [
        'Takk for at du tar deg tid, {first}. Mergero hjelper eiere av etablerte selskaper med å finne riktig kjøper. På plattformen vår MGX er det {buyerCount} kjøpere som leter etter selskaper å kjøpe. På skjermen ser du noen kjøpere fra transaksjonene våre og noen transaksjoner vi har gjennomført nylig.',
      ],
      3: {
        site: [
          'Vi har sett nøye på nettstedet til {company}, {first}. Slik forstår vi virksomheten din: {line} Selskaper som ditt er akkurat det kjøperne våre spør etter. Hvis vi har misforstått noe, kan du rette oss i møtet.',
          'Vi har sett nøye på nettstedet til {company}, {first}. På skjermen ser du i tre korte linjer hvordan vi forstår virksomheten din. Selskaper som ditt er akkurat det kjøperne våre spør etter. Hvis vi har misforstått noe, kan du rette oss i møtet.',
          'Vi har sett nøye på nettstedet ditt. På skjermen ser du i tre korte linjer hvordan vi forstår virksomheten din. Selskaper som ditt er akkurat det kjøperne våre spør etter. Hvis vi har misforstått noe, kan du rette oss i møtet.',
        ],
        noSite: [
          'Slik forstår vi virksomheten til {company}, {first}: {line} Selskaper som ditt er akkurat det kjøperne våre spør etter. Hvis vi har misforstått noe, kan du rette oss i møtet, slik at bildet av selskapet ditt blir riktig.',
          'På skjermen ser du i tre korte linjer hvordan vi forstår virksomheten til {company}, {first}. Selskaper som ditt er akkurat det kjøperne våre spør etter. Hvis vi har misforstått noe, kan du rette oss i møtet, slik at bildet av selskapet ditt blir riktig.',
          'På skjermen ser du i tre korte linjer hvordan vi forstår virksomheten din. Selskaper som ditt er akkurat det kjøperne våre spør etter. Hvis vi har misforstått noe, kan du rette oss i møtet, slik at bildet av selskapet ditt blir riktig.',
        ],
      },
      4: {
        figures: [
          'Ifølge Asiakastieto hadde {company} en omsetning på {revenue} euro og et driftsresultat på {profit} euro i regnskapsåret {year}. Disse offentlige tallene er et godt utgangspunkt. I møtet kan vi se på hva de betyr for verdien av selskapet ditt.',
          'Ifølge Asiakastieto hadde selskapet ditt en omsetning på {revenue} euro og et driftsresultat på {profit} euro i regnskapsåret {year}. Disse offentlige tallene er et godt utgangspunkt. I møtet kan vi se på hva de betyr for verdien av selskapet ditt.',
        ],
        loss: [
          'Ifølge Asiakastieto hadde {company} en omsetning på {revenue} euro og et driftsunderskudd på {profit} euro i regnskapsåret {year}. Disse offentlige tallene er et godt utgangspunkt. I møtet kan vi se på hva de betyr for verdien av selskapet ditt.',
          'Ifølge Asiakastieto hadde selskapet ditt en omsetning på {revenue} euro og et driftsunderskudd på {profit} euro i regnskapsåret {year}. Disse offentlige tallene er et godt utgangspunkt. I møtet kan vi se på hva de betyr for verdien av selskapet ditt.',
        ],
        calculator: [
          'Vi har ingen offentlige tall for selskapet ditt. Hvis du oppgir et intervall for omsetning og resultat i skjemaet på denne siden, viser kalkulatoren et verdiintervall for selskapet ditt. Den bygger på faktiske transaksjoner i din bransje. Et omtrentlig intervall holder, og svarene dine går bare til Mergero.',
        ],
        form: [
          'Vi har ingen offentlige tall for selskapet ditt. Hvis du vil, kan du oppgi omsetning og resultat i skjemaet på denne siden. Et omtrentlig intervall holder. Med tallene kan vi forberede et bedre møte for deg, og svarene dine går bare til Mergero.',
        ],
      },
      5: {
        sector: [
          'Disse kjøperne har gjort avtaler i din bransje med Mergero. På listen finner du for eksempel {buyers}. Under hvert navn ser du avtalen som kjøperen gjorde med oss. I møtet ser vi på hvilke kjøpere som kan passe for {company}. Under videoen finner du lenker til nettstedene deres.',
          'Disse kjøperne har gjort avtaler i din bransje med Mergero. Under hvert navn ser du avtalen som kjøperen gjorde med oss. I møtet ser vi på hvilke kjøpere som kan passe for {company}. Under videoen finner du lenker til nettstedene deres, så du selv kan se hvem de er.',
          'Disse kjøperne har gjort avtaler i din bransje med Mergero. Under hvert navn ser du avtalen som kjøperen gjorde med oss. I møtet ser vi på hvilke kjøpere som kan passe for selskapet ditt. Under videoen finner du lenker til nettstedene deres, så du selv kan se hvem de er.',
        ],
        featured: [
          'Disse kjøperne har gjort avtaler med Mergero, for eksempel {buyers}. Under hvert navn ser du avtalen som kjøperen gjorde med oss. I møtet ser vi på hvilke kjøpere som kan passe for {company}. Under videoen finner du lenker til nettstedene deres.',
          'På skjermen ser du noen kjøpere som har gjort avtaler med Mergero. Under hvert navn ser du avtalen som kjøperen gjorde med oss. I møtet ser vi på hvilke kjøpere som kan passe for selskapet ditt. Under videoen finner du lenker til nettstedene deres.',
        ],
        empty: [
          'Hver kjøper på plattformen vår har fortalt oss hvilke selskaper den vil kjøpe. I møtet går vi gjennom kjøperne som passer best for {company}, og hva hver av dem ser etter. Slik ser du hvem som kan være interessert, før du bestemmer deg for noe.',
          'Hver kjøper på plattformen vår har fortalt oss hvilke selskaper den vil kjøpe. I møtet går vi gjennom kjøperne som passer best for selskapet ditt, og hva hver av dem ser etter. Slik ser du hvem som kan være interessert, før du bestemmer deg for noe.',
        ],
      },
      6: {
        sector: [
          'Her er hva som er mulig i din bransje. {deal} Slike transaksjoner viser at det er reell etterspørsel etter selskaper som {company}. Hvert salg er forskjellig, og i møtet kan vi snakke om hvordan en transaksjon kan se ut for deg.',
          'Her er hva som er mulig i din bransje. De siste årene har eiere av lignende selskaper solgt til kjøpere på plattformen vår. Hvert salg er forskjellig, og i møtet kan vi snakke om hvordan en transaksjon kan se ut for {company}.',
          'Her er hva som er mulig i din bransje. De siste årene har eiere av lignende selskaper solgt til kjøpere på plattformen vår. Hvert salg er forskjellig, og i møtet kan vi snakke om hvordan en transaksjon kan se ut for deg og selskapet ditt.',
        ],
        recent: [
          'Her er hva som er mulig for eiere som deg. {deal} Slike transaksjoner viser at kjøperne på plattformen vår ser etter etablerte selskaper. Hvert salg er forskjellig, og i møtet kan vi snakke om hvordan en transaksjon kan se ut for {company}.',
          'Her er hva som er mulig for eiere som deg. De siste årene har eiere av etablerte selskaper solgt til kjøpere på plattformen vår. Hvert salg er forskjellig, og i møtet kan vi snakke om hvordan en transaksjon kan se ut for {company}.',
          'Her er hva som er mulig for eiere som deg. De siste årene har eiere av etablerte selskaper solgt til kjøpere på plattformen vår. Hvert salg er forskjellig, og i møtet kan vi snakke om hvordan en transaksjon kan se ut for deg og selskapet ditt.',
        ],
      },
      7: [
        'Opplysningene dine holdes fortrolige, {first}. Kjøpere ser selskapet ditt bare som en anonym profil, og vi viser navnet på selskapet først når du sier ja. Svarene dine i skjemaet går bare til Mergero, og vi sletter opptaket av denne siden når lenken utløper.',
      ],
      8: [
        'Takk for at du så videoen, {first}. Hvis du vil høre mer, kan du booke et kort møte med meg under videoen. I Teams snakker vi om målene dine, de interesserte kjøperne og et mulig verdiintervall for {company}. Møtet forplikter deg ikke til noe. Jeg ser frem til samtalen vår.',
        'Takk for at du så videoen, {first}. Hvis du vil høre mer, kan du booke et kort møte med meg under videoen. I Teams snakker vi om målene dine, de interesserte kjøperne og et mulig verdiintervall for selskapet ditt. Møtet forplikter deg ikke til noe. Jeg ser frem til samtalen vår.',
      ],
    },
    lines: [
      'Selskapet presenterer produktene og tjenestene sine på nettstedet sitt.',
      'Det betjener kundene sine med egne ansatte og egen kompetanse.',
      'Vi avklarer detaljene med deg i møtet.',
    ],
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
        timing: 'Når kan et salg være et realistisk alternativ for deg?',
        staff: 'Hvor mange personer jobber i selskapet ditt i dag?',
        slide2: 'Hva vet du allerede om Mergero og hvordan vi jobber?',
        slide3: 'Hvordan vil du beskrive selskapet ditt med noen få ord?',
        slide4: 'Hvordan ser du på den økonomiske utviklingen i selskapet de neste årene?',
        slide5: 'Hvilken type kjøper vil passe best for selskapet ditt?',
        slide6: 'Kjenner du til andre salg av selskaper i din bransje de siste årene?',
        slide7: 'Hvor viktig er fortrolighet for deg ved et mulig salg?',
        goals: 'Hvilke mål har du for selskapet de neste årene?',
        decision: 'Hvem andre vil være med på en beslutning om salg?',
        successor: 'Finnes det en etterfølger i familien eller i ledelsen?',
      },
    },
  },
  da: {
    scripts: {
      2: [
        'Tak, fordi du tager dig tid, {first}. Mergero hjælper ejere af etablerede virksomheder med at finde den rette køber. På vores platform MGX er der {buyerCount} købere, som leder efter virksomheder at købe. På skærmen ser du nogle købere fra vores handler og nogle handler, som vi har gennemført for nylig.',
      ],
      3: {
        site: [
          'Vi har kigget grundigt på hjemmesiden for {company}, {first}. Sådan forstår vi din forretning: {line} Virksomheder som din er præcis, hvad vores købere spørger efter. Hvis vi har misforstået noget, kan du rette os på mødet.',
          'Vi har kigget grundigt på hjemmesiden for {company}, {first}. På skærmen ser du i tre korte linjer, hvordan vi forstår din forretning. Virksomheder som din er præcis, hvad vores købere spørger efter. Hvis vi har misforstået noget, kan du rette os på mødet.',
          'Vi har kigget grundigt på din hjemmeside. På skærmen ser du i tre korte linjer, hvordan vi forstår din forretning. Virksomheder som din er præcis, hvad vores købere spørger efter. Hvis vi har misforstået noget, kan du rette os på mødet.',
        ],
        noSite: [
          'Sådan forstår vi forretningen i {company}, {first}: {line} Virksomheder som din er præcis, hvad vores købere spørger efter. Hvis vi har misforstået noget, kan du rette os på mødet, så billedet af din virksomhed bliver rigtigt.',
          'På skærmen ser du i tre korte linjer, hvordan vi forstår forretningen i {company}, {first}. Virksomheder som din er præcis, hvad vores købere spørger efter. Hvis vi har misforstået noget, kan du rette os på mødet, så billedet af din virksomhed bliver rigtigt.',
          'På skærmen ser du i tre korte linjer, hvordan vi forstår din forretning. Virksomheder som din er præcis, hvad vores købere spørger efter. Hvis vi har misforstået noget, kan du rette os på mødet, så billedet af din virksomhed bliver rigtigt.',
        ],
      },
      4: {
        figures: [
          'Ifølge Asiakastieto havde {company} en omsætning på {revenue} euro og et driftsresultat på {profit} euro i regnskabsåret {year}. Disse offentlige tal er et godt udgangspunkt. På mødet kan vi se på, hvad de betyder for værdien af din virksomhed.',
          'Ifølge Asiakastieto havde din virksomhed en omsætning på {revenue} euro og et driftsresultat på {profit} euro i regnskabsåret {year}. Disse offentlige tal er et godt udgangspunkt. På mødet kan vi se på, hvad de betyder for værdien af din virksomhed.',
        ],
        loss: [
          'Ifølge Asiakastieto havde {company} en omsætning på {revenue} euro og et driftsunderskud på {profit} euro i regnskabsåret {year}. Disse offentlige tal er et godt udgangspunkt. På mødet kan vi se på, hvad de betyder for værdien af din virksomhed.',
          'Ifølge Asiakastieto havde din virksomhed en omsætning på {revenue} euro og et driftsunderskud på {profit} euro i regnskabsåret {year}. Disse offentlige tal er et godt udgangspunkt. På mødet kan vi se på, hvad de betyder for værdien af din virksomhed.',
        ],
        calculator: [
          'Vi har ingen offentlige tal for din virksomhed. Hvis du angiver et interval for omsætning og resultat i formularen på denne side, viser beregneren et værdiinterval for din virksomhed. Den bygger på faktiske handler i din branche. Et omtrentligt interval er nok, og dine svar går kun til Mergero.',
        ],
        form: [
          'Vi har ingen offentlige tal for din virksomhed. Hvis du vil, kan du angive omsætning og resultat i formularen på denne side. Et omtrentligt interval er nok. Med tallene kan vi forberede et bedre møde for dig, og dine svar går kun til Mergero.',
        ],
      },
      5: {
        sector: [
          'Disse købere har lavet handler i din branche med Mergero. På listen finder du for eksempel {buyers}. Under hvert navn ser du den handel, som køberen lavede med os. På mødet ser vi på, hvilke købere der kan passe til {company}. Under videoen finder du links til deres hjemmesider.',
          'Disse købere har lavet handler i din branche med Mergero. Under hvert navn ser du den handel, som køberen lavede med os. På mødet ser vi på, hvilke købere der kan passe til {company}. Under videoen finder du links til deres hjemmesider, så du selv kan se, hvem de er.',
          'Disse købere har lavet handler i din branche med Mergero. Under hvert navn ser du den handel, som køberen lavede med os. På mødet ser vi på, hvilke købere der kan passe til din virksomhed. Under videoen finder du links til deres hjemmesider, så du selv kan se, hvem de er.',
        ],
        featured: [
          'Disse købere har lavet handler med Mergero, for eksempel {buyers}. Under hvert navn ser du den handel, som køberen lavede med os. På mødet ser vi på, hvilke købere der kan passe til {company}. Under videoen finder du links til deres hjemmesider.',
          'På skærmen ser du nogle købere, der har lavet handler med Mergero. Under hvert navn ser du den handel, som køberen lavede med os. På mødet ser vi på, hvilke købere der kan passe til din virksomhed. Under videoen finder du links til deres hjemmesider.',
        ],
        empty: [
          'Hver køber på vores platform har fortalt os, hvilke virksomheder den vil købe. På mødet gennemgår vi de købere, der passer bedst til {company}, og hvad hver af dem leder efter. Sådan ser du, hvem der kunne være interesseret, før du beslutter noget.',
          'Hver køber på vores platform har fortalt os, hvilke virksomheder den vil købe. På mødet gennemgår vi de købere, der passer bedst til din virksomhed, og hvad hver af dem leder efter. Sådan ser du, hvem der kunne være interesseret, før du beslutter noget.',
        ],
      },
      6: {
        sector: [
          'Her er, hvad der er muligt i din branche. {deal} Handler som denne viser, at der er reel efterspørgsel efter virksomheder som {company}. Hvert salg er forskelligt, og på mødet kan vi tale om, hvordan en handel kunne se ud for dig.',
          'Her er, hvad der er muligt i din branche. I de seneste år har ejere af lignende virksomheder solgt til købere på vores platform. Hvert salg er forskelligt, og på mødet kan vi tale om, hvordan en handel kunne se ud for {company}.',
          'Her er, hvad der er muligt i din branche. I de seneste år har ejere af lignende virksomheder solgt til købere på vores platform. Hvert salg er forskelligt, og på mødet kan vi tale om, hvordan en handel kunne se ud for dig og din virksomhed.',
        ],
        recent: [
          'Her er, hvad der er muligt for ejere som dig. {deal} Handler som denne viser, at køberne på vores platform leder efter etablerede virksomheder. Hvert salg er forskelligt, og på mødet kan vi tale om, hvordan en handel kunne se ud for {company}.',
          'Her er, hvad der er muligt for ejere som dig. I de seneste år har ejere af etablerede virksomheder solgt til købere på vores platform. Hvert salg er forskelligt, og på mødet kan vi tale om, hvordan en handel kunne se ud for {company}.',
          'Her er, hvad der er muligt for ejere som dig. I de seneste år har ejere af etablerede virksomheder solgt til købere på vores platform. Hvert salg er forskelligt, og på mødet kan vi tale om, hvordan en handel kunne se ud for dig og din virksomhed.',
        ],
      },
      7: [
        'Dine oplysninger forbliver fortrolige, {first}. Købere ser kun din virksomhed som en anonym profil, og vi viser først virksomhedens navn, når du siger ja. Dine svar i formularen går kun til Mergero, og vi sletter optagelsen af denne side, når linket udløber.',
      ],
      8: [
        'Tak, fordi du så videoen, {first}. Hvis du vil høre mere, kan du booke et kort møde med mig under videoen. På Teams taler vi om dine mål, de interesserede købere og et muligt værdiinterval for {company}. Mødet forpligter dig ikke til noget. Jeg glæder mig til vores samtale.',
        'Tak, fordi du så videoen, {first}. Hvis du vil høre mere, kan du booke et kort møde med mig under videoen. På Teams taler vi om dine mål, de interesserede købere og et muligt værdiinterval for din virksomhed. Mødet forpligter dig ikke til noget. Jeg glæder mig til vores samtale.',
      ],
    },
    lines: [
      'Virksomheden præsenterer sine produkter og tjenester på sin hjemmeside.',
      'Den betjener sine kunder med egne medarbejdere og egen viden.',
      'Vi afklarer detaljerne med dig på mødet.',
    ],
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
        timing: 'Hvornår kunne et salg være en realistisk mulighed for dig?',
        staff: 'Hvor mange medarbejdere har din virksomhed i dag?',
        slide2: 'Hvad ved du allerede om Mergero, og hvordan vi arbejder?',
        slide3: 'Hvordan vil du beskrive din virksomhed med få ord?',
        slide4: 'Hvordan ser du virksomhedens økonomiske udvikling i de kommende år?',
        slide5: 'Hvilken type køber ville passe bedst til din virksomhed?',
        slide6: 'Kender du til andre virksomhedssalg i din branche i de seneste år?',
        slide7: 'Hvor vigtig er fortrolighed for dig ved et muligt salg?',
        goals: 'Hvilke mål har du for virksomheden i de kommende år?',
        decision: 'Hvem ellers vil være med i en beslutning om et salg?',
        successor: 'Er der en efterfølger i familien eller i ledelsen?',
      },
    },
  },
  de: {
    scripts: {
      2: [
        'Vielen Dank, dass Sie sich kurz Zeit nehmen. Mergero hilft Inhabern etablierter Unternehmen, den passenden Käufer zu finden. Auf unserer Plattform MGX suchen {buyerCount} Käufer nach Unternehmen, die sie übernehmen können. Auf dem Bildschirm sehen Sie einige Käufer aus unseren Transaktionen und einige Transaktionen, die wir kürzlich abgeschlossen haben.',
      ],
      3: {
        site: [
          'Wir haben uns die Website von {company} genau angesehen. So verstehen wir Ihr Geschäft: {line} Unternehmen wie Ihres sind genau das, wonach unsere Käufer fragen. Falls wir etwas falsch verstanden haben, können Sie uns im Gespräch gern korrigieren.',
          'Wir haben uns die Website von {company} genau angesehen. Auf dem Bildschirm sehen Sie in drei kurzen Zeilen, wie wir Ihr Geschäft verstehen. Unternehmen wie Ihres sind genau das, wonach unsere Käufer fragen. Falls wir etwas falsch verstanden haben, können Sie uns im Gespräch gern korrigieren.',
          'Wir haben uns Ihre Website genau angesehen. Auf dem Bildschirm sehen Sie in drei kurzen Zeilen, wie wir Ihr Geschäft verstehen. Unternehmen wie Ihres sind genau das, wonach unsere Käufer fragen. Falls wir etwas falsch verstanden haben, können Sie uns im Gespräch gern korrigieren.',
        ],
        noSite: [
          'So verstehen wir das Geschäft von {company}: {line} Unternehmen wie Ihres sind genau das, wonach unsere Käufer fragen. Falls wir etwas falsch verstanden haben, können Sie uns im Gespräch gern korrigieren, damit das Bild Ihres Unternehmens stimmt.',
          'Auf dem Bildschirm sehen Sie in drei kurzen Zeilen, wie wir das Geschäft von {company} verstehen. Unternehmen wie Ihres sind genau das, wonach unsere Käufer fragen. Falls wir etwas falsch verstanden haben, können Sie uns im Gespräch gern korrigieren.',
          'Auf dem Bildschirm sehen Sie in drei kurzen Zeilen, wie wir Ihr Geschäft verstehen. Unternehmen wie Ihres sind genau das, wonach unsere Käufer fragen. Falls wir etwas falsch verstanden haben, können Sie uns im Gespräch gern korrigieren.',
        ],
      },
      4: {
        figures: [
          'Laut Asiakastieto erzielte {company} im Geschäftsjahr {year} einen Umsatz von {revenue} Euro und ein Betriebsergebnis von {profit} Euro. Diese öffentlichen Zahlen sind ein guter Ausgangspunkt. Im Gespräch können wir uns ansehen, was sie für den Wert Ihres Unternehmens bedeuten.',
          'Laut Asiakastieto erzielte Ihr Unternehmen im Geschäftsjahr {year} einen Umsatz von {revenue} Euro und ein Betriebsergebnis von {profit} Euro. Diese öffentlichen Zahlen sind ein guter Ausgangspunkt. Im Gespräch können wir uns ansehen, was sie für den Wert Ihres Unternehmens bedeuten.',
        ],
        loss: [
          'Laut Asiakastieto erzielte {company} im Geschäftsjahr {year} einen Umsatz von {revenue} Euro und einen Betriebsverlust von {profit} Euro. Diese öffentlichen Zahlen sind ein guter Ausgangspunkt. Im Gespräch können wir uns ansehen, was sie für den Wert Ihres Unternehmens bedeuten.',
          'Laut Asiakastieto erzielte Ihr Unternehmen im Geschäftsjahr {year} einen Umsatz von {revenue} Euro und einen Betriebsverlust von {profit} Euro. Diese öffentlichen Zahlen sind ein guter Ausgangspunkt. Im Gespräch können wir uns ansehen, was sie für den Wert Ihres Unternehmens bedeuten.',
        ],
        calculator: [
          'Für Ihr Unternehmen liegen uns keine öffentlichen Zahlen vor. Wenn Sie im Formular auf dieser Seite eine Spanne für Umsatz und Ergebnis eingeben, zeigt Ihnen der Rechner eine Wertspanne für Ihr Unternehmen. Er beruht auf echten Transaktionen aus Ihrer Branche. Eine grobe Spanne genügt, und Ihre Angaben gehen nur an Mergero.',
        ],
        form: [
          'Für Ihr Unternehmen liegen uns keine öffentlichen Zahlen vor. Wenn Sie möchten, können Sie Umsatz und Ergebnis im Formular auf dieser Seite angeben. Eine grobe Spanne genügt. Mit diesen Zahlen können wir das Gespräch besser vorbereiten, und Ihre Angaben gehen nur an Mergero.',
        ],
      },
      5: {
        sector: [
          'Diese Käufer haben mit Mergero Transaktionen in Ihrer Branche abgeschlossen, zum Beispiel {buyers}. Unter jedem Namen sehen Sie ihre Transaktion mit uns. Im Gespräch schauen wir, welche Käufer zu {company} passen könnten. Unter dem Video finden Sie die Links zu ihren Websites.',
          'Diese Käufer haben mit Mergero Transaktionen in Ihrer Branche abgeschlossen. Unter jedem Namen sehen Sie die Transaktion, die der Käufer mit uns abgeschlossen hat. Im Gespräch schauen wir, welche Käufer zu {company} passen könnten. Unter dem Video finden Sie die Links zu ihren Websites, so können Sie selbst sehen, wer sie sind.',
          'Diese Käufer haben mit Mergero Transaktionen in Ihrer Branche abgeschlossen. Unter jedem Namen sehen Sie die Transaktion, die der Käufer mit uns abgeschlossen hat. Im Gespräch schauen wir, welche Käufer zu Ihrem Unternehmen passen könnten. Unter dem Video finden Sie die Links zu ihren Websites, so können Sie selbst sehen, wer sie sind.',
        ],
        featured: [
          'Diese Käufer haben Transaktionen mit Mergero abgeschlossen, zum Beispiel {buyers}. Unter jedem Namen sehen Sie ihre Transaktion mit uns. Im Gespräch schauen wir, welche Käufer zu {company} passen könnten. Unter dem Video finden Sie die Links zu ihren Websites.',
          'Auf dem Bildschirm sehen Sie einige Käufer, die Transaktionen mit Mergero abgeschlossen haben. Unter jedem Namen sehen Sie die Transaktion, die der Käufer mit uns abgeschlossen hat. Im Gespräch schauen wir, welche Käufer zu Ihrem Unternehmen passen könnten. Unter dem Video finden Sie die Links zu ihren Websites.',
        ],
        empty: [
          'Jeder Käufer auf unserer Plattform hat uns gesagt, welche Unternehmen er kaufen möchte. Im Gespräch gehen wir die Käufer durch, die am besten zu {company} passen, und was jeder von ihnen sucht. So sehen Sie, wer interessiert sein könnte, bevor Sie etwas entscheiden.',
          'Jeder Käufer auf unserer Plattform hat uns gesagt, welche Unternehmen er kaufen möchte. Im Gespräch gehen wir die Käufer durch, die am besten zu Ihrem Unternehmen passen, und was jeder von ihnen sucht. So sehen Sie, wer interessiert sein könnte, bevor Sie etwas entscheiden.',
        ],
      },
      6: {
        sector: [
          'Das ist in Ihrer Branche möglich. {deal} Transaktionen wie diese zeigen, dass es eine echte Nachfrage nach Unternehmen wie {company} gibt. Jeder Verkauf ist anders, und im Gespräch können wir darüber sprechen, wie eine Transaktion für Sie aussehen könnte.',
          'Das ist in Ihrer Branche möglich. In den letzten Jahren haben Inhaber ähnlicher Unternehmen an Käufer auf unserer Plattform verkauft. Jeder Verkauf ist anders, und im Gespräch können wir darüber sprechen, wie eine Transaktion für {company} aussehen könnte.',
          'Das ist in Ihrer Branche möglich. In den letzten Jahren haben Inhaber ähnlicher Unternehmen an Käufer auf unserer Plattform verkauft. Jeder Verkauf ist anders, und im Gespräch können wir darüber sprechen, wie eine Transaktion für Sie und Ihr Unternehmen aussehen könnte.',
        ],
        recent: [
          'Das ist für Inhaber wie Sie möglich. {deal} Transaktionen wie diese zeigen, dass die Käufer auf unserer Plattform etablierte Unternehmen suchen. Jeder Verkauf ist anders, und im Gespräch können wir darüber sprechen, wie eine Transaktion für {company} aussehen könnte.',
          'Das ist für Inhaber wie Sie möglich. In den letzten Jahren haben Inhaber etablierter Unternehmen an Käufer auf unserer Plattform verkauft. Jeder Verkauf ist anders, und im Gespräch können wir darüber sprechen, wie eine Transaktion für {company} aussehen könnte.',
          'Das ist für Inhaber wie Sie möglich. In den letzten Jahren haben Inhaber etablierter Unternehmen an Käufer auf unserer Plattform verkauft. Jeder Verkauf ist anders, und im Gespräch können wir darüber sprechen, wie eine Transaktion für Sie und Ihr Unternehmen aussehen könnte.',
        ],
      },
      7: [
        'Ihre Daten bleiben vertraulich. Käufer sehen Ihr Unternehmen nur als anonymes Profil, und den Namen nennen wir erst, wenn Sie zustimmen. Ihre Angaben im Formular gehen nur an Mergero, und die Aufzeichnung dieser Seite löschen wir, wenn der Link abläuft. Sie entscheiden, wie es weitergeht.',
      ],
      8: [
        'Vielen Dank, dass Sie sich das Video angesehen haben. Wenn Sie mehr erfahren möchten, buchen Sie unter dem Video einen kurzen Termin mit mir. Per Teams sprechen wir über Ihre Ziele, die interessierten Käufer und eine mögliche Wertspanne für {company}. Das Gespräch ist für Sie unverbindlich. Ich freue mich darauf.',
        'Vielen Dank, dass Sie sich das Video angesehen haben. Wenn Sie mehr erfahren möchten, buchen Sie unter dem Video einen kurzen Termin mit mir. Per Teams sprechen wir über Ihre Ziele, die interessierten Käufer und eine mögliche Wertspanne für Ihr Unternehmen. Das Gespräch ist für Sie unverbindlich. Ich freue mich darauf.',
      ],
    },
    lines: [
      'Das Unternehmen stellt seine Produkte und Leistungen auf seiner Website vor.',
      'Es betreut seine Kunden mit eigenem Team und eigenem Know-how.',
      'Die Einzelheiten klären wir gern mit Ihnen im Gespräch.',
    ],
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
        timing: 'Wann könnte ein Verkauf für Sie eine realistische Option sein?',
        staff: 'Wie viele Mitarbeitende hat Ihr Unternehmen heute?',
        slide2: 'Was wissen Sie bereits über Mergero und unsere Arbeitsweise?',
        slide3: 'Wie würden Sie Ihr Unternehmen in wenigen Worten beschreiben?',
        slide4: 'Wie sehen Sie die finanzielle Entwicklung Ihres Unternehmens in den nächsten Jahren?',
        slide5: 'Welche Art von Käufer würde am besten zu Ihrem Unternehmen passen?',
        slide6: 'Kennen Sie andere Unternehmensverkäufe in Ihrer Branche aus den letzten Jahren?',
        slide7: 'Wie wichtig ist Ihnen Vertraulichkeit bei einem möglichen Verkauf?',
        goals: 'Welche Ziele haben Sie für das Unternehmen in den nächsten Jahren?',
        decision: 'Wer wäre außer Ihnen an einer Entscheidung über einen Verkauf beteiligt?',
        successor: 'Gibt es eine Nachfolge in der Familie oder im Management?',
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
