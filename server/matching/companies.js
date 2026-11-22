// Built-in knowledge table of well-known (mostly US) employers whose names carry no industry word.
// "McKinsey & Company" or "Goldman Sachs" say nothing to a keyword classifier; this table does.
//
// Each group: industries (taxonomy ids), org_type, optional style (investors/banks) and flags.
// Names: entries separated by ';', aliases by '|'. Matching is on companyKey() (case, accents,
// punctuation, "&"/"and", parentheticals and legal suffixes like Inc/LLC/LLP/"& Company" removed).
//   - Multi-word keys also match as a prefix ("Goldman Sachs Asset Management").
//   - A trailing '*' lets a single-word key match as a prefix too ("Deloitte Consulting").
//   - A trailing '=' forces exact match only ("State Street" but not "State Street Dental").
// A prefix match is rejected when the extra words name a different, non-service industry
// ("Susquehanna Health" is not Susquehanna International Group).

const G = (industries, org_type, names, extra = {}) => ({ industries, org_type, names, ...extra });

const GROUPS = [
  // ---------------------------------------------------------------- consulting
  G(['consulting'], 'company', `McKinsey & Company|McKinsey*|McKinsey and Company; Boston Consulting Group*|BCG*|The Boston Consulting Group;
    Bain & Company|Bain=; Oliver Wyman*; Kearney=|A.T. Kearney|AT Kearney; L.E.K. Consulting|LEK Consulting|L.E.K.=; Strategy&|Strategy and=;
    EY-Parthenon|EY Parthenon; Alvarez & Marsal; FTI Consulting; AlphaSights*; Guidepoint*|Guidepoint Global; GLG=|Gerson Lehrman Group;
    Third Bridge; Tegus=; Cornerstone Research; Analysis Group; NERA=|NERA Economic Consulting; Compass Lexecon; Charles River Associates|CRA International;
    Dalberg*|Dalberg Global Development Advisors; ClearView Healthcare Partners|ClearView Healthcare; Altman Solon; West Monroe|West Monroe Partners;
    Booz Allen Hamilton|Booz Allen; Huron Consulting Group|Huron Consulting; Guidehouse*; Navigant*; ZS Associates|ZS=; Simon-Kucher|Simon Kucher|Simon-Kucher & Partners;
    Roland Berger*; Putnam Associates; Trinity Life Sciences; Kaiser Associates; Monitor Deloitte; PA Consulting; Redstone Strategy Group;
    Bates White; Keystone Strategy; Marakon*; Health Advances; Blue Matter Consulting; Avalere Health|Avalere*; Mathematica=|Mathematica Policy Research;
    Gartner*; Forrester Research|Forrester=; Capgemini Invent; Slalom*|Slalom Consulting; Protiviti*; North Highland; Bridgespan|The Bridgespan Group|Bridgespan Group;
    Corporate Executive Board|CEB=; Advisory Board Company|The Advisory Board Company; Mercer=; Towers Watson; Accenture Strategy; HighPoint Associates;
    Education Resource Strategies; Apogee Research; Telos Group; Gotham Consulting Partners; Global Strategy Consulting Group`),
  G(['consulting', 'software_it'], 'company', `Accenture*; Capgemini*; Cognizant*; Infosys*; Wipro*; Tata Consultancy Services|TCS=; IBM Consulting; CGI=|CGI Group`),
  G(['consulting', 'accounting'], 'company', `Deloitte*|Deloitte & Touche|Deloitte Touche Tohmatsu; PwC*|PricewaterhouseCoopers*|PwC US; EY=|Ernst & Young|Ernst and Young;
    KPMG*; Grant Thornton; RSM=|RSM US; BDO=|BDO USA; Crowe=|Crowe LLP; Baker Tilly; CohnReznick; Moss Adams; Marcum=|Marcum LLP; CBIZ*; Plante Moran;
    CliftonLarsonAllen|CLA=; Eisner Amper|EisnerAmper`),
  // PR / communications / advertising
  G(['marketing_advertising'], 'company', `Edelman*; Weber Shandwick; Brunswick Group|Brunswick=; FGS Global; Joele Frank|Joele Frank Wilkinson Brimmer Katcher;
    H/Advisors Abernathy|H Advisors Abernathy|Abernathy MacGregor; Penta Group|Penta=; Teneo*; Kekst CNC|Kekst*; Sard Verbinnen|Sard Verbinnen & Co;
    Prosek Partners; APCO Worldwide; BCW Global|Burson Cohn & Wolfe|Burson*; Ogilvy*; WPP*; Publicis*; Omnicom*; Havas*; Dentsu*; Interpublic Group|IPG=;
    McCann*; BBDO*; Wieden+Kennedy|Wieden Kennedy; Droga5; R/GA|RGA=; VaynerMedia`),
  G(['staffing_hr'], 'company', `Heidrick & Struggles|Heidrick*; Spencer Stuart; Korn Ferry; Russell Reynolds Associates|Russell Reynolds; Egon Zehnder;
    Odyssey Search Partners; Leadenhall Search & Selection; Robert Half; Adecco*; Randstad*; ManpowerGroup|Manpower=; Kelly Services; Insight Global; TEKsystems`),

  // ---------------------------------------------------------------- investment banks (banking + investment)
  G(['banking', 'investment'], 'company', `Goldman Sachs*|Goldman=; Morgan Stanley*; J.P. Morgan*|JP Morgan|JPMorgan|JPMorgan Chase|JPMorganChase|JP Morgan Chase|Chase Bank|Chase=;
    Bank of America*|BofA|BofA Securities|Bank of America Merrill Lynch|Merrill Lynch|Merrill=; Citi=|Citigroup|Citibank|Citi Private Bank|Citi Global Markets;
    Wells Fargo*; Barclays*; UBS*; Credit Suisse*; Deutsche Bank*; HSBC*; BNP Paribas; Societe Generale|SocGen=; Nomura*; Mizuho*; MUFG*; SMBC*; Sumitomo Mitsui;
    RBC Capital Markets|RBC=|Royal Bank of Canada; TD Securities|TD Cowen; BMO Capital Markets|BMO=; Santander*; Jefferies*; Lazard*; Evercore*;
    Centerview Partners; PJT Partners; Moelis*|Moelis & Company; Perella Weinberg Partners|Perella Weinberg; Guggenheim Securities; Houlihan Lokey;
    Harris Williams; William Blair; Piper Sandler; Raymond James*; Stifel*|Stifel Financial; Cowen*; Leerink Partners|SVB Leerink; Greenhill*|Greenhill & Co;
    Qatalyst Partners; LionTree*; Raine Group|The Raine Group; BDT & MSD Partners|BDT Capital Partners; Ziegler*; Canaccord Genuity*; Robert W. Baird|Baird=;
    KeyBanc Capital Markets; Truist Securities; Macquarie*; Oppenheimer & Co|Oppenheimer=; Cantor Fitzgerald; B. Riley|B Riley; Needham & Company|Needham=;
    Rothschild & Co|Rothschild=; Tudor Pickering Holt; Solomon Partners; Ducera Partners; TM Capital; AGC Partners; ThinkEquity*; Natixis*;
    Credit Agricole|Crédit Agricole; ING=|ING Group; Standard Chartered; Brown Brothers Harriman*|BBH=|BBH USA; Charles Schwab*|Schwab=; Virtu Financial|Virtu=;
    State Street Global Advisors; Northern Trust; BNY Mellon|BNY=|Bank of New York Mellon; Interactive Brokers; Pacific Century Securities; Global Platinum Securities;
    Korea Investment & Securities`, { style: 'bank' }),
  G(['banking', 'investment'], 'company', `State Street=|State Street Corporation`, { style: 'bank' }),
  // ---------------------------------------------------------------- commercial / retail banks and payments
  G(['banking'], 'company', `Capital One*; U.S. Bank|US Bank|U.S. Bancorp|US Bancorp; PNC*|PNC Financial Services; Truist*; Citizens Bank|Citizens Financial Group|Citizens Private Bank;
    KeyBank|KeyCorp; M&T Bank; Fifth Third Bank|Fifth Third; Regions Bank|Regions Financial; Huntington Bank|Huntington National Bank; Ally Financial|Ally Bank;
    Discover Financial|Discover Financial Services; American Express|Amex=; Synchrony*|Synchrony Financial; SoFi*; First Republic Bank; Silicon Valley Bank|SVB=;
    TD Bank; Bank of the West; Santander Bank; Popular Bank; Webster Bank; People's United Bank|Peoples United Bank; Union Home Mortgage; Rocket Mortgage;
    Fannie Mae; Freddie Mac; Mastercard*; Visa=|Visa Inc; Jenius Bank; Curinos*; Farm Credit East; AgFirst; CoBank*`, { style: 'bank' }),
  G(['banking', 'federal_government'], 'government', `Federal Reserve*|Federal Reserve Board|Federal Reserve Bank|Federal Reserve System|Board of Governors of the Federal Reserve System;
    Federal Reserve Bank of New York|New York Fed=; FDIC=|Federal Deposit Insurance Corporation; Office of the Comptroller of the Currency|OCC=`),
  G(['software_it', 'banking'], 'company', `PayPal*; Stripe=; Block Inc; Square Inc; Plaid=; Brex=; Ramp=|Ramp Financial; Robinhood*; Coinbase*; Chime=|Chime Financial; Affirm=;
    Ant International|Ant Group|Ant Financial; Adyen*; Wise=|TransferWise`),
  G(['investment'], 'company', `Moodys|Moodys Corporation|Moodys Investors Service|Moodys Analytics; S&P Global|S and P Global|Standard & Poors|Standard and Poors;
    Fitch Ratings; MSCI*; Morningstar*; FactSet*; PitchBook*; Preqin*; Nasdaq=; New York Stock Exchange|NYSE=; Intercontinental Exchange|ICE=; CME Group; Cboe*`),

  // ---------------------------------------------------------------- insurance
  G(['insurance'], 'company', `AIG=|American International Group; Aon*; Marsh McLennan|Marsh & McLennan|Marsh=; Lockton*; Chubb*; Travelers*|The Travelers Companies; Liberty Mutual;
    Progressive Insurance|Progressive Corporation; Allstate*; State Farm; GEICO*; Nationwide=|Nationwide Insurance; MetLife*; Prudential*|Prudential Financial;
    New York Life; Northwestern Mutual; MassMutual*; Guardian Life; Aflac*; The Hartford|Hartford Financial Services; Cigna*; Aetna*; UnitedHealth Group|UnitedHealthcare|UnitedHealth=;
    Humana*; Elevance Health|Anthem=; Centene*; Molina Healthcare; W. R. Berkley|WR Berkley|Berkley=|Berkley Re; Fortitude Re; Swiss Re; Munich Re; Everest Re|Everest Group;
    RenaissanceRe; Group 1001; Lincoln Financial|Lincoln Financial Group; Principal Financial Group; Unum*; Willis Towers Watson|WTW=; Arthur J. Gallagher|Gallagher=;
    Brown & Brown; Markel*; Hiscox*; Lemonade=; Oscar Health; Assurant*; Berkshire Hathaway; Harvard Pilgrim Health Care|Harvard Pilgrim`),

  // ---------------------------------------------------------------- venture / growth
  G(['investment'], 'investor', `Sequoia Capital|Sequoia=; Andreessen Horowitz|a16z*; Accel*|Accel Partners; Kleiner Perkins; Benchmark Capital; Lightspeed Venture Partners|Lightspeed=;
    General Catalyst; Founders Fund; Greylock*|Greylock Partners; Index Ventures; Bessemer Venture Partners|Bessemer=; New Enterprise Associates|NEA=; 8VC*;
    Flagship Pioneering; Khosla Ventures; Thrive Capital; Union Square Ventures|USV=; First Round Capital|First Round=; Y Combinator|YC=; Techstars*; 500 Global|500 Startups;
    Dorm Room Fund; Village Global; Lux Capital; Felicis*|Felicis Ventures; Redpoint*|Redpoint Ventures; Battery Ventures; Spark Capital; GV=|Google Ventures;
    Intel Capital; Bain Capital Ventures; White Star Capital; Kapor Capital; Revolution Ventures|Revolution LLC; Rise of the Rest;
    Draper Associates|Draper Fisher Jurvetson|DFJ=; Insight Venture Partners; Lerer Hippeau; Greycroft*; FirstMark*|FirstMark Capital; Primary Venture Partners;
    IA Ventures; Matrix Partners; Initialized Capital; SV Angel; Floodgate*; Homebrew=; Precursor Ventures; Cowboy Ventures; Pear VC; Contrary=|Contrary Capital`, { style: 'venture' }),
  G(['investment'], 'investor', `Insight Partners; Tiger Global|Tiger Global Management; Coatue*|Coatue Management; General Atlantic; Spectrum Equity; Summit Partners; TA Associates;
    Volition Capital; Level Equity; Prysm Capital; Radial Equity Partners; Susquehanna Growth Equity; Stripes Group|Stripes=; JMI Equity; Updata Partners; Battery=`, { style: 'growth' }),
  // ---------------------------------------------------------------- private equity / alternatives
  G(['investment'], 'investor', `Blackstone*|The Blackstone Group|Blackstone Group; KKR*|Kohlberg Kravis Roberts; Carlyle Group|The Carlyle Group|Carlyle=; Apollo Global Management|Apollo=;
    TPG=|TPG Capital|TPG Inc; Warburg Pincus; Bain Capital*; Advent International; Thoma Bravo; Vista Equity Partners; Silver Lake|Silver Lake Partners; Hellman & Friedman;
    Leonard Green & Partners|Leonard Green; Clayton Dubilier & Rice|CD&R=|CD and R; Ares Management|Ares=; Blue Owl Capital|Blue Owl=; HPS Investment Partners|HPS=;
    Golub Capital; Oak Hill Advisors; Avenue Capital Group|Avenue Capital; Global Infrastructure Partners|GIP=; Shore Capital Partners; Invus*|The Invus Group;
    Permira*; EQT=|EQT Partners; CVC Capital Partners|CVC=; Cinven*; Genstar Capital; Audax Group|Audax=; Platinum Equity; Searchlight Capital; Stone Point Capital;
    Blue Wolf Capital Partners|Blue Wolf Capital; Eldridge=|Eldridge Industries; Partners Group; Hamilton Lane; StepStone Group|StepStone=; GCM Grosvenor*|Grosvenor Capital Management;
    Commonfund*; Partners Capital; Cambridge Associates; iCapital*|iCapital Network; Brookfield*|Brookfield Asset Management|Brookfield Properties; Oaktree*|Oaktree Capital;
    Sixth Street|Sixth Street Partners; Owl Rock; Neuberger Berman; Harbourvest|HarbourVest Partners; Adams Street Partners; Lexington Partners; Arctos*; Clearlake Capital;
    American Securities; Riverside Company|The Riverside Company; Welsh Carson Anderson & Stowe|Welsh Carson; New Mountain Capital; Francisco Partners; Hg Capital;
    Veritas Capital; Arsenal Capital; Kelso & Company; Wind Point Partners; AFL-CIO Housing Investment Trust; Yale Investments Office|Yale Investments;
    Harvard Management Company; Princeton University Investment Company|Princo=; Stanford Management Company; MIT Investment Management Company|MITIMCo=`, { style: 'pe' }),
  // ---------------------------------------------------------------- asset managers
  G(['investment'], 'investor', `BlackRock*; Vanguard=|The Vanguard Group|Vanguard Group; Fidelity Investments*|Fidelity=|Fidelity Management & Research; T. Rowe Price|T Rowe Price;
    Capital Group=|Capital Group Companies|The Capital Group Companies; PIMCO*; Invesco*; Franklin Templeton; Nuveen*; TIAA*; Barings=|Barings LLC; Lord Abbett|Lord Abbett & Co;
    GMO=|Grantham Mayo Van Otterloo; Wellington Management*; Dodge & Cox; AllianceBernstein|Alliance Bernstein; Loomis Sayles; MFS Investment Management|MFS=;
    Putnam Investments; Janus Henderson; Federated Hermes; PPM America; Boston Partners*|Boston Partners Global Investors; Talos Eurisko Asset Management; Guggenheim Partners|Guggenheim Investments;
    Wellington=; Geode Capital Management; Dimensional Fund Advisors|Dimensional=; Northern Trust Asset Management; Goldman Sachs Asset Management; Nuveen a TIAA company;
    Bayview Asset Management; Marblegate Asset Management; Columbia Threadneedle; Western Asset Management; Ninety One; Schroders*; Amundi*; Legal & General Investment Management;
    Edelman Financial Engines; CAPTRUST*; Commonwealth Financial Network; LPL Financial; Ameriprise*|Ameriprise Financial; Edward Jones; Wealthfront*; Betterment*;
    Morgan Stanley Wealth Management; LCG Associates; Cerity Partners; Creative Planning; Fisher Investments; Baird Wealth`, { style: 'am' }),
  // ---------------------------------------------------------------- hedge funds
  G(['investment'], 'investor', `Bridgewater Associates*|Bridgewater=; Citadel=|Citadel LLC|Citadel Investment Group; Two Sigma*|Two Sigma Investments; D. E. Shaw|DE Shaw|D E Shaw|D.E. Shaw & Co|DE Shaw Group;
    Renaissance Technologies; Millennium Management|Millennium=; Point72*|Point72 Asset Management; Elliott Management|Elliott Investment Management; Baupost Group|Baupost=;
    Viking Global Investors|Viking Global; Lone Pine Capital; Third Point*; Pershing Square|Pershing Square Capital Management; Farallon Capital Management|Farallon=;
    Magnetar*|Magnetar Capital; Man Group|Man=; AQR Capital Management|AQR=; Balyasny Asset Management|Balyasny=; ExodusPoint*|ExodusPoint Capital; Rokos Capital Management;
    Brevan Howard; Bracebridge Capital; Davidson Kempner|Davidson Kempner Capital Management; Marshall Wace; Schonfeld*|Schonfeld Strategic Advisors; Cubist Systematic Strategies;
    Kerberos Capital Management; Dymon Asia Capital; Quantinno Capital Management|Quantinno=; PDT Partners; Squarepoint Capital|Squarepoint=; Verition Fund Management|Verition=;
    Hudson Bay Capital; Sculptor Capital|Sculptor=; Glenview Capital; Maverick Capital; HMI Capital|HMI Capital Management; Tudor Investment Corporation|Tudor=;
    Winton*; Graham Capital Management; Arrowstreet Capital; Voloridge*; WorldQuant*; Engineers Gate; Holocene Advisors; Light Street Capital; D1 Capital Partners|D1 Capital;
    Whale Rock Capital; Durable Capital; Darsana Capital; Soroban Capital; Anchorage Capital; Silver Point Capital; King Street Capital; Canyon Partners; Centerbridge Partners;
    Oribel Capital Management; Kibaara Capital Management; Abound Capital; Big Think Capital; Hyde Park Capital Advisors; Octagon Capital Advisors; Camomille Global Opportunities Fund;
    Avenue Capital`, { style: 'hedge' }),
  // ---------------------------------------------------------------- proprietary trading / market making (finance, not startup investors)
  G(['investment'], 'company', `Citadel Securities; Jane Street*|Jane Street Capital; Susquehanna International Group|SIG=|Susquehanna*|Susquehanna International Group LLP;
    Hudson River Trading*|HRT=; Jump Trading|Jump=; IMC Trading|IMC=; Optiver*; DRW=|DRW Trading; Akuna Capital|Akuna=; Five Rings|Five Rings Capital;
    Tower Research Capital|Tower Research; Flow Traders; XTX Markets; Wolverine Trading; Belvedere Trading; Old Mission Capital|Old Mission=; Peak6*|PEAK6 Investments;
    Virtu=; SIG Susquehanna; Chicago Trading Company; Group One Trading; Headlands Technologies; Radix Trading; Vatic Labs; Quantlab*; Maven Securities; Da Vinci Trading`, { style: 'trading' }),
  G(['investment', 'energy'], 'company', `DC Energy; Castleton Commodities International|Castleton Commodities; DXT Commodities; VECO Power Trading; Vitol*; Trafigura*; Glencore*; Mercuria*`, { style: 'trading' }),

  // ---------------------------------------------------------------- big tech and software
  G(['software_it'], 'company', `Google*|Alphabet*|Google DeepMind|DeepMind*; Microsoft*; Amazon Web Services|AWS=; Apple=|Apple Inc; Meta=|Meta Platforms|Facebook=; IBM*; Oracle=|Oracle Corporation;
    Salesforce*; Adobe=|Adobe Inc; Intel=|Intel Corporation; NVIDIA*; AMD=|Advanced Micro Devices; Qualcomm*; Cisco*|Cisco Systems; Dell Technologies|Dell=; HP Inc|Hewlett Packard Enterprise|HPE=;
    Uber=|Uber Technologies; Lyft=; Airbnb*; DoorDash*; Instacart*; Palantir*|Palantir Technologies; Snowflake=|Snowflake Inc; Databricks*; Datadog*; MongoDB*; ServiceNow*;
    Atlassian*; Workday=; Intuit=; Shopify*; Roblox*; OpenAI*; Anthropic*; xAI=|X.AI; Character.AI|CharacterAI|Character AI; Scale AI; Hugging Face; Cohere=; Mistral AI;
    Perplexity*|Perplexity AI; Rippling*; Gusto=; Twitter=|X Corp; Snap Inc|Snapchat*; Pinterest*; LinkedIn*; TikTok*; ByteDance*; Lenovo*; Kyndryl*; CDW=|CDW Corporation;
    Kensho Technologies|Kensho=; ThoughtSpot*; AppFolio*; Ab Initio Software; Dropbox*; Slack=|Slack Technologies; Zoom=|Zoom Video Communications; Twilio*;
    Okta=; Cloudflare*; CrowdStrike*; Palo Alto Networks; Splunk*; VMware*; SAP=; Autodesk*; Epic Games; Electronic Arts|EA=; Activision*; Unity Technologies; Figma*; Notion=|Notion Labs;
    Airtable*; Asana=; Canva*; Duolingo*; Grammarly*; Mintlify*; Vercel*; Supabase*; Retool*; Hebbia*; Harvey=|Harvey AI; Glean=; Sierra=|Sierra AI; Anduril*|Anduril Industries;
    Samsara=; Toast=|Toast Inc; Procore*; Veeva*|Veeva Systems; Benchling*; Encord*; Persado*; r4 Technologies; Ciena*; Analog Devices; Texas Instruments; Micron Technology|Micron=;
    Broadcom*; Applied Materials; Arm=|Arm Holdings; TSMC=|Taiwan Semiconductor; Samsung*; Sony=|Sony Group; Panasonic*; Siemens Digital Industries Software; Bloomberg LP|Bloomberg L.P.;
    Two Six Technologies; Booz Allen Digital; Esri*; Tyler Technologies; CentralSquare Technologies; Etsy*; eBay*; Wayfair*; Expedia*; Booking Holdings|Booking.com`),
  G(['software_it', 'retail'], 'company', `Amazon*|Amazon.com`),
  G(['media_publishing', 'software_it'], 'company', `Bloomberg=; Netflix*; Spotify*; YouTube*; SoundCloud*`),
  G(['health_it'], 'company', `Epic Systems|Epic Systems Corporation; Cerner*|Oracle Health; athenahealth*; InterSystems*; Allscripts|Veradigm*; eClinicalWorks; NextGen Healthcare; Teladoc*|Teladoc Health;
    Amwell*; Doximity*; Zocdoc*; Flatiron Health; Komodo Health; Tempus=|Tempus AI; Hinge Health; Omada Health; Oscar=; Optum*; Change Healthcare; Waystar*; R1 RCM`),
  G(['broadband_telecom'], 'company', `Verizon*; AT&T|AT and T|ATT=; T-Mobile|T Mobile; Comcast*|Xfinity=; Charter Communications|Spectrum=; Cox Communications; Lumen Technologies|Lumen=;
    Frontier Communications; Consolidated Communications; Altice USA|Optimum=; Starlink*; Viasat*; Dish Network|EchoStar*`),

  // ---------------------------------------------------------------- big law
  G(['legal'], 'company', `Cravath*|Cravath Swaine & Moore; Sullivan & Cromwell; Wachtell*|Wachtell Lipton Rosen & Katz; Skadden*|Skadden Arps Slate Meagher & Flom; Davis Polk*|Davis Polk & Wardwell;
    Simpson Thacher*|Simpson Thacher & Bartlett; Latham & Watkins|Latham=; Kirkland & Ellis|Kirkland=; Sidley Austin|Sidley=; Paul Weiss*|Paul Weiss Rifkind Wharton & Garrison;
    Debevoise*|Debevoise & Plimpton; Cleary Gottlieb*|Cleary Gottlieb Steen & Hamilton; Milbank*; Weil Gotshal*|Weil Gotshal & Manges|Weil=; Gibson Dunn*|Gibson Dunn & Crutcher;
    Ropes & Gray; WilmerHale*|Wilmer Cutler Pickering Hale and Dorr; Covington & Burling|Covington=; Jones Day; Morgan Lewis*|Morgan Lewis & Bockius; Orrick*|Orrick Herrington & Sutcliffe;
    Morrison Foerster|Morrison & Foerster|MoFo=; Kaplan Hecker & Fink; Kobre & Kim; MoloLamken*; Clement & Murphy; Fox Rothschild; Hinckley Allen; Cozen OConnor|Cozen*;
    Goodwin Procter|Goodwin=; Wilson Sonsini*|Wilson Sonsini Goodrich & Rosati; Cooley=|Cooley LLP; Fenwick & West|Fenwick=; Proskauer*|Proskauer Rose; Mayer Brown; Baker McKenzie|Baker & McKenzie;
    DLA Piper; Hogan Lovells; White & Case; Freshfields*|Freshfields Bruckhaus Deringer; Allen & Overy|A&O Shearman; Linklaters*; Clifford Chance; Quinn Emanuel*|Quinn Emanuel Urquhart & Sullivan;
    Boies Schiller*|Boies Schiller Flexner; Williams & Connolly; King & Spalding; Akin Gump*|Akin=; Arnold & Porter*; Dechert*; Shearman & Sterling; Willkie*|Willkie Farr & Gallagher;
    Cadwalader*|Cadwalader Wickersham & Taft; Kramer Levin*; Schulte Roth*|Schulte Roth & Zabel; Fried Frank*|Fried Frank Harris Shriver & Jacobson; Greenberg Traurig; Holland & Knight;
    Perkins Coie; Sanford Heisler Sharp|Sanford Heisler Sharp McKnight; Pollock Cohen; Susman Godfrey; Elias Law Group; Jenner & Block; Munger Tolles*|Munger Tolles & Olson;
    Wiley Rein|Wiley=; Steptoe*|Steptoe & Johnson; Venable*; Foley & Lardner; Foley Hoag; Mintz*|Mintz Levin; Choate Hall & Stewart; Day Pitney; Wiggin and Dana; Robinson+Cole|Robinson & Cole;
    Shipman & Goodwin; Pullman & Comley; Reavis Page Jump; McCalla Raymer Leibert Pierce; Paduano & Weintraub; Boss & Young; Gutmann Bartell and Barrows`),

  // ---------------------------------------------------------------- federal government and military
  G(['federal_government'], 'government', `U.S. House of Representatives*|US House of Representatives|United States House of Representatives|U.S. House|US House;
    United States Senate*|US Senate|U.S. Senate; United States Congress*|US Congress|U.S. Congress|Congress=; Library of Congress; Congressional Budget Office|CBO=;
    Congressional Research Service; Government Accountability Office|GAO=|U.S. Government Accountability Office; U.S. Army*|US Army|United States Army|Army National Guard;
    U.S. Navy*|US Navy|United States Navy; U.S. Air Force*|US Air Force|United States Air Force|USAF=; U.S. Marine Corps*|US Marine Corps|United States Marine Corps|USMC=;
    U.S. Coast Guard*|US Coast Guard|United States Coast Guard|USCG=; United States Space Force|US Space Force|U.S. Space Force; National Guard;
    Department of Defense|DoD=|U.S. Department of Defense|US Department of Defense|Pentagon=; U.S. Department of State|US Department of State|United States Department of State|State Department;
    U.S. Department of Justice|US Department of Justice|United States Department of Justice|DOJ=|Antitrust Division; U.S. Department of the Treasury|US Department of the Treasury|US Treasury|U.S. Treasury;
    U.S. Department of Energy|US Department of Energy; U.S. Department of Commerce|US Department of Commerce; U.S. Department of Education|US Department of Education;
    U.S. Department of Labor|US Department of Labor; U.S. Department of Agriculture|US Department of Agriculture; U.S. Department of Health and Human Services|US Department of Health and Human Services;
    U.S. Department of Homeland Security|US Department of Homeland Security|DHS=; U.S. Department of Transportation|US Department of Transportation; U.S. Department of Veterans Affairs|Department of Veterans Affairs;
    U.S. Department of Housing and Urban Development|HUD=; U.S. Department of the Interior|US Department of the Interior; National Institutes of Health|The National Institutes of Health|NIH=;
    Centers for Disease Control and Prevention|CDC=; Food and Drug Administration|FDA=|U.S. Food and Drug Administration; NASA*; NOAA*|National Oceanic and Atmospheric Administration;
    National Institute of Standards and Technology|NIST=; National Science Foundation|NSF=; Securities and Exchange Commission|SEC=|U.S. Securities and Exchange Commission;
    Federal Trade Commission|FTC=; Federal Communications Commission; Consumer Financial Protection Bureau|CFPB=; Central Intelligence Agency|CIA=; Federal Bureau of Investigation|FBI=;
    U.S. Naval Research Laboratory|US Naval Research Laboratory|Naval Research Laboratory; Air Force Research Laboratory; Army Research Laboratory; The White House|White House|Executive Office of the President;
    Office of Management and Budget; U.S. Census Bureau|US Census Bureau|Census Bureau; Social Security Administration; Environmental Protection Agency|EPA=|U.S. Environmental Protection Agency;
    USAID=|U.S. Agency for International Development; Peace Corps; AmeriCorps; Smithsonian Institution|Smithsonian*|Smithsonians*; U.S. Mint; U.S. Postal Service|USPS=|United States Postal Service;
    Department of War; National Security Agency|NSA=; Defense Advanced Research Projects Agency|DARPA=; U.S. Patent and Trademark Office|USPTO=; Internal Revenue Service|IRS=;
    Office of Personnel Management; General Services Administration|GSA=; Small Business Administration|SBA=|U.S. Small Business Administration; Federal Emergency Management Agency|FEMA=;
    Department of Homeland Security; Bureau of Labor Statistics; Bureau of Economic Analysis; U.S. International Trade Commission; Export-Import Bank of the United States|EXIM=;
    Millennium Challenge Corporation; Federal Highway Administration; Federal Aviation Administration|FAA=; Transportation Security Administration|TSA=`),
  G(['federal_government', 'legal'], 'government', `United States District Court*|U.S. District Court|US District Court; United States Court of Appeals*|U.S. Court of Appeals|US Court of Appeals;
    Supreme Court of the United States|U.S. Supreme Court|US Supreme Court; United States Court of Federal Claims; U.S. Attorneys Office|US Attorneys Office|United States Attorneys Office;
    Public Defender Service for the District of Columbia|Federal Public Defender`),
  G(['federal_government', 'higher_education'], 'government', `United States Military Academy|West Point=|U.S. Military Academy; United States Naval Academy|U.S. Naval Academy|US Naval Academy;
    United States Air Force Academy|U.S. Air Force Academy; Naval Postgraduate School; National Defense University`),
  G(['federal_government', 'aerospace_defense'], 'government', `MIT Lincoln Laboratory|Lincoln Laboratory; Jet Propulsion Laboratory|JPL=|NASA Jet Propulsion Laboratory; Sandia National Laboratories|Sandia=;
    Los Alamos National Laboratory|Los Alamos=; Lawrence Livermore National Laboratory; MITRE*|The MITRE Corporation; Johns Hopkins Applied Physics Laboratory|JHU APL|Johns Hopkins APL; RAND Project Air Force`),

  // ---------------------------------------------------------------- media
  G(['media_publishing'], 'company', `New York Times*|The New York Times|NYT=|New York Times Company; Wall Street Journal*|The Wall Street Journal|WSJ=; Washington Post*|The Washington Post;
    Bloomberg News|Bloomberg Media; Reuters*|Thomson Reuters; Associated Press|AP=; CNN*; NBC News|NBCUniversal*|NBC=; CBS News|CBS=|CBS News and Stations; ABC News|ABC=;
    Fox News|Fox Corporation; NPR=|National Public Radio; PBS=|PBS NewsHour; POLITICO*; Axios*; The Atlantic|Atlantic Media; The New Yorker|New Yorker=; Vanity Fair; Conde Nast|Condé Nast;
    Hearst*; Forbes*; Fortune=|Fortune Media; TIME=|Time Magazine|TIME Magazine; The Economist|Economist=|The Economist Group; Financial Times|FT=; Vox Media|Vox=; BuzzFeed*;
    Business Insider|Insider Inc; Boston Globe|The Boston Globe; Los Angeles Times|LA Times; Connecticut Mirror|CT Mirror|The Connecticut Mirror; New Haven Independent; New Haven Register;
    Hartford Courant; Texas Monthly; Texas Tribune|The Texas Tribune; The Nevada Independent|Nevada Independent; Penguin Random House*|Random House; HarperCollins*; Simon & Schuster;
    Macmillan*|Macmillan Publishers; Hachette*; Walt Disney Company*|The Walt Disney Company|Disney*; Warner Bros. Discovery|Warner Bros|Warner Bros Discovery|WarnerMedia;
    Sony Pictures Entertainment|Sony Pictures; Paramount*|Paramount Global; Universal Music Group|UMG=; NBCUniversal; iHeartMedia*; SiriusXM|Sirius XM; The Onion|Onion=; GQ=|GQ Magazine;
    Vogue=; New York Magazine; The Information; Semafor*; ProPublica*; The 19th; The Guardian|Guardian News & Media; BBC*|BBC News; NewsGuard*; Time Out Group|Time Out=;
    Versant Media; E&E News; Penske Media; Dotdash Meredith|People Inc; Gannett*; Lee Enterprises; Sinclair Broadcast Group; Nexstar*; Tegna*; Scripps*|E.W. Scripps;
    Daily Mail; The Economic Times|Economic Times; The Hill; Roll Call; Punchbowl News; Puck=|Puck News; The Free Press; Substack*; Medium=; Vice Media|VICE=; Rolling Stone; Variety=; The Hollywood Reporter; Billboard=;
    Lionsgate*; A24=; Legendary Entertainment; Heyday Films; Untitled Entertainment; Creative Artists Agency|CAA=; William Morris Endeavor|WME=|Endeavor=; United Talent Agency|UTA=;
    Big Ten Network; ESPN*; Sun Sentinel; Austin American-Statesman|Austin American Statesman; Philadelphia Inquirer|The Philadelphia Inquirer; San Francisco Chronicle;
    Carpenter Media Group; Inside Washington Publishers; Island Free Press; New York Focus; Paste Magazine; Berlin Review; The Argument; Indigo River Publishing; Bang Showbiz;
    Targeter Educational Publishers; KUT & KUTX Public Media|KUT=|KUTX=; Texas Standard`),

  // ---------------------------------------------------------------- health systems (providers)
  G(['healthcare_providers'], 'healthcare_provider', `Mayo Clinic; Cleveland Clinic; Mass General Brigham|Partners HealthCare; Massachusetts General Hospital|Mass General Hospital|Mass General=|MGH=;
    Brigham and Womens Hospital|Brigham=; Beth Israel Deaconess Medical Center|BIDMC=|Beth Israel Lahey Health; Yale New Haven Health|Yale New Haven Hospital|Yale New Haven Health System|Yale Medicine;
    NYU Langone Health|NYU Langone*; Mount Sinai Health System*|Mount Sinai=|Mount Sinai Hospital|The Mount Sinai Hospital; NewYork-Presbyterian|New York Presbyterian|NewYork Presbyterian Hospital;
    Kaiser Permanente*; HCA Healthcare|HCA=; CommonSpirit Health|CommonSpirit=; Ascension=|Ascension Health; Intermountain Health|Intermountain Healthcare; Atrium Health; Advocate Health|Advocate Aurora Health;
    Sutter Health; Northwell Health|Northwell=; Tufts Medicine|Tufts Medical Center; UC Davis Health; UCSF Health; UCLA Health; Penn Medicine; Johns Hopkins Medicine|Johns Hopkins Hospital;
    Dartmouth Health|Dartmouth-Hitchcock|Dartmouth Hitchcock Medical Center|Dartmouth Hitchcock; Hartford HealthCare|Hartford Healthcare; MaineHealth*; Baystate Health; UVM Health Network|University of Vermont Health Network|University of Vermont Medical Center;
    Geisinger*; Marshall Health; Appalachian Regional Healthcare|ARH=; WVU Medicine; UPMC*; Cedars-Sinai|Cedars Sinai; Stanford Health Care|Stanford Medicine; Duke Health|Duke University Health System;
    Memorial Sloan Kettering|Memorial Sloan Kettering Cancer Center|MSK=; Dana-Farber Cancer Institute|Dana Farber; MD Anderson|MD Anderson Cancer Center; St. Jude Childrens Research Hospital|St Jude=;
    Boston Childrens Hospital|Boston Children's; Childrens Hospital of Philadelphia|CHOP=; Franciscan Childrens; NYC Health + Hospitals|NYC Health and Hospitals; Cataldo Ambulance Service;
    Providence Health|Providence St. Joseph Health; Trinity Health; Corewell Health; Banner Health; Baylor Scott & White Health; Houston Methodist; Ochsner Health; Lifespan=|Brown University Health;
    Concord Hospital; Elliot Health System; Catholic Medical Center; Wentworth-Douglass Hospital; Exeter Health Resources; Southern New Hampshire Health; Central Maine Healthcare; Northern Light Health;
    Gifford Health Care; Copley Hospital; Bassett Healthcare Network; Albany Med|Albany Medical Center; Clinica De Salud; HAVEN Free Clinic; Skin Dermatology; One Medical; Oak Street Health;
    CVS MinuteClinic|MinuteClinic=; Planned Parenthood; Lighthouse ABA; Autism Learning Partners`),

  // ---------------------------------------------------------------- pharma, biotech, medical devices
  G(['life_sciences'], 'company', `Pfizer*; Merck*|Merck & Co; Johnson & Johnson*|J&J=|Janssen*; Eli Lilly*|Eli Lilly and Company|Lilly=; AbbVie*; Bristol Myers Squibb*|Bristol-Myers Squibb|BMS=;
    Amgen*; Gilead*|Gilead Sciences; Regeneron*; Moderna*; Biogen*; Vertex Pharmaceuticals; GSK*|GlaxoSmithKline; Novartis*; Roche=|Genentech*; Sanofi*; AstraZeneca*; Novo Nordisk;
    Bayer=; Takeda*; Amneal Pharmaceuticals; Stryker*; Medtronic*; Boston Scientific; Abbott=|Abbott Laboratories; Baxter International|Baxter=; Becton Dickinson|BD=;
    GE HealthCare|GE Healthcare; Philips=|Royal Philips; Siemens Healthineers; Intuitive Surgical; Illumina*; Thermo Fisher Scientific|Thermo Fisher*; Danaher*; IQVIA*; Labcorp*; Quest Diagnostics;
    Zimmer Biomet; Edwards Lifesciences; Alnylam*; BioNTech*; Vir Biotechnology; Lila Sciences; Foray Bioscience; Verse Medical; Acsel Health; Beaming Health; Tribunus Health;
    Generation Next Fertility; Harvard Bioscience; Insmed*; Biohaven*; Arvinas*; Cerevel*; Agilent*; Waters Corporation; Bio-Rad|Bio Rad; Charles River Laboratories; Catalent*; Lonza*; Samsung Biologics`),
  G(['life_sciences', 'higher_education'], 'education', `Broad Institute|Broad Institute of MIT and Harvard; Whitehead Institute; Salk Institute; Scripps Research; Feinstein Institutes|The Feinstein Institutes;
    Howard Hughes Medical Institute|HHMI=; Jackson Laboratory|The Jackson Laboratory; Cold Spring Harbor Laboratory; Wyss Institute; Microbial Sciences Institute`),
  G(['aerospace_defense'], 'company', `Lockheed Martin*; RTX*|Raytheon*|Raytheon Technologies; Boeing*; Northrop Grumman*; General Dynamics; L3Harris*; BAE Systems; SpaceX*; Blue Origin;
    Stoke Space; Textron*; GE Aerospace; Pratt & Whitney; Collins Aerospace; Sikorsky*; Leidos*; SAIC=|Science Applications International; Huntington Ingalls; Rocket Lab;
    Relativity Space; Sierra Space; Joby Aviation; Archer Aviation; Shield AI; Saronic*; Hadrian=; Flyby Robotics`),

  // ---------------------------------------------------------------- industrials, energy, autos, real estate, consumer
  G(['manufacturing'], 'company', `General Electric|GE=; 3M=; Caterpillar*; Whirlpool*; Parker Hannifin|Parker=; Emerson Electric; Siemens=; Honeywell*; Procter & Gamble|P&G=; Unilever*; Colgate-Palmolive|Colgate=;
    Kimberly-Clark; Estee Lauder|The Estee Lauder Companies|Estée Lauder; LOreal|L'Oréal|L'Oreal; Nike*; Crocs*; lululemon*|lululemon athletica; Dow=|Dow Chemical; DuPont*; Corning*;
    Eaton=; Danfoss*; ABB=; Schneider Electric; Rockwell Automation; Johnson Controls; Carrier=|Carrier Global; Otis=; Stanley Black & Decker; Illinois Tool Works|ITW=; Cummins*;
    Komline-FluidQuip|Komline*; Innova Drilling & Intervention; Z Modular; Vault Kinetics; Quantum Circuits; Analog Devices Inc`),
  G(['energy'], 'company', `ExxonMobil|Exxon Mobil|Exxon=; Chevron*; Shell=|Shell plc; BP=; ConocoPhillips*; NextEra Energy*; GE Vernova; Duke Energy; Dominion Energy; Exelon*; Constellation Energy;
    Southern Company; Sunrun*; Tesla Energy; Exus Renewables; Ørsted|Orsted*; Enel*; Avangrid*; Plug Power`),
  // Data-center, colocation and GPU-cloud operators (names carry no industry word). Hyperscalers stay software_it;
  // their facilities and data-center roles are recognised from the title (enrich.js).
  G(['data_centers'], 'company', `Equinix*; Digital Realty*|Digital Realty Trust; CyrusOne*; CoreSite*; QTS Data Centers|QTS=; Switch=|Switch Inc; Iron Mountain Data Centers;
    Vantage Data Centers; Aligned Data Centers|Aligned=; STACK Infrastructure|Stack Infrastructure; DataBank=; Flexential*; NTT Global Data Centers; Compass Datacenters;
    EdgeConneX*; Cologix*; TierPoint*; Cyxtera*; Sabey Data Centers|Sabey*; Prime Data Centers; Novva Data Centers|Novva*; Yondr*; Stream Data Centers; T5 Data Centers;
    EdgeCore*|EdgeCore Digital Infrastructure; Lincoln Rackhouse; H5 Data Centers; DartPoints*; Element Critical; 365 Data Centers; Evoque*; Centersquare*;
    CoreWeave*; Lambda Labs; Applied Digital; Core Scientific; Nscale*; Vultr*; Rackspace*|Rackspace Technology;
    DigitalOcean*; Linode*; Hetzner*; OVHcloud|OVH=; Leaseweb*`),
  G(['data_centers', 'energy'], 'company', `Crusoe*|Crusoe Energy|Crusoe Cloud`),
  G(['utilities'], 'company', `Con Edison|Consolidated Edison; National Grid; Eversource*|Eversource Energy; Green Mountain Power; Central Maine Power; Unitil*; Liberty Utilities; NYISO*|New York Independent System Operator;
    ISO New England|ISO-NE; PJM=|PJM Interconnection; PG&E|Pacific Gas and Electric; Southern California Edison; Xcel Energy; Ameren*; Entergy*`),
  G(['automotive', 'energy'], 'company', `Tesla*`),
  G(['automotive'], 'company', `Ford Motor Company|Ford=; General Motors|GM=; Stellantis*; Toyota*; Honda*|American Honda|Honda Research Institute; Rivian*; Lucid Motors; McLaren Racing|McLaren=;
    Waymo*; Cruise=; Hyundai*; Volkswagen*; BMW=; Mercedes-Benz|Mercedes Benz; Cambridge Mobile Telematics; Textron Specialized Vehicles`),
  // Architects and engineers design buildings; they are not building contractors.
  G(['architecture_engineering'], 'company', `Arup=|Arup Group; Thornton Tomasetti; Sage and Coombe Architects; Gensler*; Skidmore Owings & Merrill|SOM=;
    Perkins&Will|Perkins and Will; Williams Lawrence Interior Design`),
  G(['architecture_engineering', 'construction'], 'company', `AECOM*; Jacobs=|Jacobs Engineering`),
  G(['construction'], 'company', `Bechtel*; Turner Construction; Skanska*; Fluor*; Kiewit*; Gilbane*; Whiting-Turner|Whiting Turner`),
  G(['real_estate'], 'company', `Cushman & Wakefield*; CBRE*|CBRE Group; JLL=|Jones Lang LaSalle; Newmark*|Newmark Group; Corcoran Group|The Corcoran Group|Corcoran=; eXp Realty; Douglas Elliman;
    Macerich*; Simon Property Group; Related Companies|The Related Companies; Tishman Speyer; Vornado*; Boston Properties|BXP=; Hines=; Greystar*; Zillow*; Redfin*; Compass Real Estate;
    Keller Williams; Coldwell Banker; RE/MAX|REMAX=; Sothebys International Realty; Opendoor*; WeWork*; Elm Grove Companies; The Westover Companies|Westover Companies; The McEnery Company;
    Brookfield Residential`),
  G(['retail'], 'company', `Walmart*; Target=|Target Corporation; Costco*|Costco Wholesale; The Home Depot|Home Depot; Lowes|Lowe's|Lowes Companies; Best Buy; Macys|Macy's; Nordstrom*; Gap=|Gap Inc;
    Old Navy; TJX*|TJX Companies; Ross Stores; Dollar General; Dollar Tree; IKEA*; Tractor Supply|Tractor Supply Company; Bed Bath & Beyond; Kohls|Kohl's; JCPenney|J.C. Penney;
    Sephora*; Ulta Beauty; Patagonia*; REI=|Recreational Equipment; L.L.Bean|LL Bean|L L Bean; Dicks Sporting Goods; Foot Locker; Urban Outfitters; Anthropologie*; J.Crew|J Crew;
    Ralph Lauren; Tiffany & Co|Tiffany=; Warby Parker; Glossier*; Allbirds*; Chewy*; Petco*; PetSmart*; Staples=; Office Depot; AutoZone*;
    Advance Auto Parts; OReilly Auto Parts; Moët Hennessy|Moet Hennessy|LVMH=; Yale Appliance|Yale Appliance + Lighting; The Abbey Bookshop; Tims Used Books; Barnes & Noble`),
  // Galleries and auction houses sell art to collectors: not retailers, never connectors.
  G(['arts_culture'], 'company', `Christies|Christie's; Sothebys=|Sotheby's; Hauser & Wirth|Hauser and Wirth; C24 Gallery`),
  G(['grocery_retail'], 'company', `Kroger*; Albertsons*; Publix*; Whole Foods Market|Whole Foods; Trader Joes|Trader Joe's; Hannaford*; Price Chopper; Stop & Shop; Market Basket; Wegmans*; ShopRite*;
    H-E-B|HEB=; Aldi*; Lidl*; Safeway*; Shaws|Shaw's; Big Y; Hy-Vee|Hy Vee; Meijer*; Giant Eagle; Food Lion; Sprouts Farmers Market; Fresh Market|The Fresh Market; Martins|Martin's`),
  G(['pharmacy', 'retail'], 'company', `CVS Health|CVS=|CVS Pharmacy; Walgreens*|Walgreens Boots Alliance; Rite Aid`),
  G(['agriculture', 'manufacturing'], 'company', `John Deere|Deere & Company|Deere*; AGCO*; CNH Industrial|Case IH|New Holland Agriculture; Kubota*; Lindsay Corporation; Valmont*`),
  G(['agriculture', 'food_manufacturing'], 'company', `Cargill*; ADM=|Archer Daniels Midland; Bunge*; Corteva*; Syngenta*; Nutrien*; CHS=|CHS Inc; Land OLakes|Land O'Lakes|Land O Lakes;
    Bayer Crop Science; Dairy Farmers of America; Ocean Spray; Cabot Creamery|Cabot Creamery Cooperative; Organic Valley; Agri-Mark|Agri Mark; Driscolls|Driscoll's; Taylor Farms;
    International Feed Corporation; Big Wheat`),
  G(['food_manufacturing'], 'company', `Kraft Heinz|Kraft=|Heinz=; General Mills; Kellogg*|Kellanova*|WK Kellogg; Nestle*|Nestlé; PepsiCo*|Pepsi=|Frito-Lay; Coca-Cola|Coca Cola|The Coca-Cola Company;
    Mondelez*; Hershey*|The Hershey Company; Conagra*|Conagra Brands; Hormel*|Hormel Foods; Danone*; Chobani*; Ben & Jerrys|Ben and Jerrys; King Arthur Baking|King Arthur Flour;
    Tyson Foods|Tyson=; Smithfield Foods; JBS=; Perdue Farms; Campbell Soup|Campbells=; McCormick*|McCormick & Company; Keurig Dr Pepper; Anheuser-Busch|AB InBev; Molson Coors;
    Constellation Brands; Diageo*; Red Bull*; Mars Inc|Mars=|Mars Wrigley; Post Holdings; Blue Diamond Growers; Sweetgreen*; Starbucks*; McDonalds|McDonald's; Chipotle*; Dunkin*|Dunkin';
    Hillstone Restaurant Group; Denim Coffee`),
  G(['wholesale_distribution', 'food_manufacturing'], 'company', `Sysco*; US Foods; Performance Food Group; UNFI=|United Natural Foods; KeHE*|KeHE Distributors; C&S Wholesale Grocers; McLane*|McLane Company`),
  G(['wholesale_distribution', 'healthcare_providers'], 'company', `McKesson*; Cardinal Health; Cencora|AmerisourceBergen; Owens & Minor; Medline*|Medline Industries; Vizient*`),
  G(['wholesale_distribution', 'dental', 'healthcare_providers'], 'company', `Henry Schein*; Patterson Companies|Patterson Dental; Benco Dental; Darby Dental Supply; Dental City`),
  G(['logistics'], 'company', `UPS=|United Parcel Service; FedEx*; DHL*; XPO*|XPO Logistics; C.H. Robinson|CH Robinson; J.B. Hunt|JB Hunt; Maersk*; Flexport*; Mesilla Valley Transportation; STC Logistics;
    San Francisco International Airport|SFO=; Port Authority of New York and New Jersey; Amtrak*; Delta Air Lines; United Airlines; American Airlines; Southwest Airlines; JetBlue*`),

  // ---------------------------------------------------------------- nonprofits, foundations, think tanks
  G(['nonprofit'], 'nonprofit', `Teach For America*|TFA=|Teach For America Ignite Fellowship; City Year*; American Red Cross|Red Cross=; International Committee of the Red Cross|ICRC=; UNICEF*; Doctors Without Borders|MSF=;
    Feeding America; Boys & Girls Clubs of America|Boys and Girls Club; Big Brothers Big Sisters; ACLU=|American Civil Liberties Union; NAACP*; Southern Poverty Law Center; Brookings Institution|Brookings=;
    American Enterprise Institute|AEI=; Carnegie Endowment for International Peace|Carnegie Endowment; Council on Foreign Relations|CFR=; Milken Institute; RAND=|RAND Corporation; Urban Institute;
    Aspen Institute|The Aspen Institute; Center for American Progress; Pew Research Center|Pew Charitable Trusts|The Pew Charitable Trusts; Hoover Institution; Cato Institute; Heritage Foundation;
    Center for Strategic and International Studies|CSIS=; Stimson Center|STIMSON=; New America; Third Way; Bipartisan Policy Center; Kapor Center; Fulbright*|The Fulbright Program|Fulbright Program;
    Rhodes Trust; Marshall Scholarship; Sponsors for Educational Opportunity|SEO=; Yale-China Association|Yale China Association; Breakthrough T1D|JDRF=; Childrens Rights; Equal Citizens; EdTrust*;
    Fund for the City of New York; The Legal Aid Society|Legal Aid Society; Brooklyn Defenders|Brooklyn Defender Services; Exoneration Project; City Bar Justice Center; Native Hawaiian Legal Corporation;
    United Nations*|UN=; World Bank*|World Bank Group; International Monetary Fund|IMF=; Gates Foundation|Bill & Melinda Gates Foundation; Mellon Foundation|Andrew W. Mellon Foundation;
    YMCA*; YWCA*; Habitat for Humanity; United Way*; Goodwill*|Goodwill Industries; Salvation Army|The Salvation Army; Catholic Charities; Second Harvest*; Place2Be*; Sefaria*; Project 351;
    Refugee & Immigrant Voices in Action; Health and Education Advocates for Refugees; Bourse & Bazaar Foundation; Global Goodwill Ambassadors Foundation; Social Equity Action Lab; Vibrant Emotional Health;
    Coro California|Coro=; The Global Teaching Project; Playwrights Horizons; Katharine Hepburn Cultural Arts Center; New Hampshire Humanities; Smithsonians National Museum of American History;
    Fine Arts Museums of San Francisco; Metropolitan Museum of Art|The Met=; Museum of Modern Art|MoMA=; Lyrasis*; Wikimedia Foundation|Wikipedia=; Mozilla*; Khan Academy; Code for America;
    Center for Art Law; Swing Left; Democratic National Committee|DNC=; Republican National Committee|RNC=; J Street; Equal Justice Initiative; Innocence Project; Human Rights Watch; Amnesty International`),
  // ---------------------------------------------------------------- higher education names without University/College/School in them
  G(['higher_education'], 'education', `MIT=|Massachusetts Institute of Technology|MIT Open Learning; Caltech*|California Institute of Technology; UCL=|University College London; LSE=|London School of Economics;
    KAUST=|King Abdullah University of Science and Technology; INSEAD*; Sciences Po; ETH Zurich|ETH=; EPFL*; Wharton=|The Wharton School; Georgia Tech|Georgia Institute of Technology;
    Virginia Tech; Penn State; UPenn=; UChicago=; UC Berkeley|UCLA=|UCSD=|UCSF=|UC San Diego|UC Davis|UC Irvine|UC Santa Barbara; NYU=|New York University; CUNY*; SUNY*; Purdue*; Rutgers*;
    Johns Hopkins University*|Johns Hopkins=|Johns Hopkins Center for Talented Youth; Tsinghua*; Peking University; Oxford=|University of Oxford; Cambridge=|University of Cambridge;
    Harvard Extension School`),
  G(['software_it', 'higher_education'], 'company', `Coursera*; edX=; 2U=; Chegg*; Kaplan=|Kaplan Inc; Princeton Review; Handshake=; Instructure*|Canvas LMS; Blackboard*; Ellucian*; Anthology=; Duolingo=`),
  // ---------------------------------------------------------------- pro sports (never trade associations)
  G([], 'company', `National Basketball Association|NBA=; National Football League|NFL=; Major League Baseball|MLB=; National Hockey League|NHL=; Major League Soccer|MLS=; WNBA*; PGA Tour|PGA=;
    New York Yankees; New York Mets; Boston Red Sox; New England Patriots; Boston Celtics; Seattle Sounders FC|Seattle Sounders; US Sailing Team|US Sailing; U.S. Figure Skating|US Figure Skating;
    USA Track & Field; US Olympic & Paralympic Committee|USOPC=; NCAA=|National Collegiate Athletic Association`, { sports: true }),
];

// ---------------------------------------------------------------------------
// Normalisation

const SUFFIX = /\s+(inc|incorporated|llc|llp|lllp|lp|ltd|limited|plc|corp|corporation|co|company|and company|and co|pllc|pc|sa|ag|gmbh|nv|bv|srl|spa|l p|l l c|l l p|the)$/;

/** Normalise a company name for table lookup. */
export function companyKey(s) {
  let x = String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  x = x.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  x = x.replace(/&/g, ' and ').replace(/\+/g, ' ').replace(/['’`.]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  let prev;
  do { prev = x; x = x.replace(SUFFIX, '').trim(); } while (x !== prev);
  return x;
}

function stripThe(k) { return k.startsWith('the ') ? k.slice(4) : k; }

// ---------------------------------------------------------------------------
// Index

// Words that may follow a known multi-word name without changing which organisation it is.
const CORP_WORDS = new Set(`group partners partner management capital advisors advisers securities asset assets global investments investment
  investors holdings international usa us america americas north south east west europe emea asia apac china japan india uk canada
  private bank banking wealth consulting digital labs lab research technologies technology tech services solutions systems financial
  finance trust company companies corporation ventures fund funds equity credit markets market trading energy media news studios studio
  pictures entertainment records publishing analytics cloud web ai ny nyc new york boston chicago sf dc washington london health healthcare
  medical medicine center centre hospital institute school program office division department bureau committee subcommittee joint
  economic staff command district court caucus of and for crypto foundation re reinsurance life specialty commercial leadership development
  strategy operations worldwide alternative alternatives real estate infrastructure growth opportunities enterprise business consumer
  sciences science pharmaceuticals pharma therapeutics biosciences network networks communications retail store stores
  advisory associates llc ltd lp plc se ag nv sa inc corp co`.split(/\s+/).filter(Boolean));

const EXACT = new Map();   // key -> entry
const PREFIX = new Map();  // first word -> [{ key, entry }] longest first

for (const g of GROUPS) {
  const entry = { industries: g.industries, org_type: g.org_type, style: g.style || null, sports: Boolean(g.sports) };
  for (const raw of g.names.split(';')) {
    const aliases = raw.split('|').map((a) => a.trim()).filter(Boolean);
    if (!aliases.length) continue;
    const canonical = aliases[0].replace(/[*=]$/, '');
    for (const a of aliases) {
      const mode = a.endsWith('*') ? 'prefix' : a.endsWith('=') ? 'exact' : 'auto';
      const key = stripThe(companyKey(a.replace(/[*=]$/, '')));
      if (!key) continue;
      const e = { ...entry, name: canonical };
      if (!EXACT.has(key)) EXACT.set(key, e);
      const multi = key.includes(' ');
      if (mode === 'prefix' || (mode === 'auto' && multi)) {
        const first = key.split(' ')[0];
        if (!PREFIX.has(first)) PREFIX.set(first, []);
        PREFIX.get(first).push({ key, entry: e, liberal: mode === 'prefix' });
      }
    }
  }
}
for (const list of PREFIX.values()) list.sort((a, b) => b.key.length - a.key.length);

export const KNOWN_COMPANY_COUNT = new Set([...EXACT.values()].map((e) => e.name)).size;

/**
 * Look up a company. `conflict(remainderWords, entry)` may veto a prefix match.
 * @returns {{ name, industries, org_type, style, sports, match: 'exact'|'prefix' } | null}
 */
export function lookupCompany(company, conflict = null) {
  const raw = String(company || '').trim();
  if (!raw) return null;
  const tries = [];
  const k = companyKey(raw);
  if (k) tries.push(k, stripThe(k));
  // Segments: "Delta Sigma Pi, Miami University", "°1824 - Universal Music Group"
  for (const seg of raw.split(/\s*(?:,|\s-\s|\s\|\s|\s–\s|\s—\s|:)\s*/)) {
    const s = stripThe(companyKey(seg));
    if (s && !tries.includes(s)) tries.push(s);
  }
  for (const key of tries) {
    const e = EXACT.get(key);
    if (e) return { ...e, match: 'exact' };
  }
  for (const key of tries) {
    const first = key.split(' ')[0];
    const list = PREFIX.get(first);
    if (!list) continue;
    for (const { key: pk, entry, liberal } of list) {
      if (key.length > pk.length && key.startsWith(`${pk} `)) {
        const rest = key.slice(pk.length + 1);
        // Ordinary multi-word names ("Silver Lake") extend only with corporate words ("Silver Lake Partners",
        // not "Silver Lake Ski Area"); names marked '*' extend with anything that does not conflict.
        if (!liberal && !rest.split(' ').every((w) => CORP_WORDS.has(w))) continue;
        if (conflict && conflict(rest, entry)) continue;
        return { ...entry, match: 'prefix' };
      }
    }
  }
  return null;
}
