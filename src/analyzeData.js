// ── BUSINESS TYPE DETECTION ─────────────────────────────────────────────────
export const BIZ_TYPE_SIGNALS = {
  dental: ["dentist","dental","teeth","tooth","orthodont","implant","crown","filling","braces","invisalign","periodon","endodont","oral surgeon","cosmetic dent","sedation dent","smile center","dental spa","dental arts","dental group","dental clinic","dental office","dental center","dental practice","dental health","dental studio","dental surgery","dental wellness","dental associates","general dentist","family dentist","pediatric dentist","implant dentist","holistic dentist","emergency dentist"],
  medical: ["doctor","physician","medical clinic","gp clinic","ent clinic","allergy clinic","dermatology","fertility clinic","sleep clinic","hormone therapy","iv therapy","anti-aging","aesthetic clinic","aesthetics clinic","cosmetic surgeon","plastic surgeon","ophthalmologist","optometrist","optometry","eye clinic","eye care","eye doctor","vision care","vision center","dry eye","lasik","contact lens","audiology","pain management","weight loss clinic","naturopathic","integrative medicine","functional medicine","rejuvenation","hydrafacial","coolsculpting","body contouring","botox","dermal filler","microneedling","hair restoration","addiction treatment","depression treatment","anxiety treatment","eating disorder","psychiatric","rehabilitation","neurological"],
  allied_health: ["physiotherapy","physical therapy","physio","chiropractic","chiropractor","podiatry","occupational therapy","speech therapy","sports medicine","sports rehab","sports physical","orthopedic","spine clinic","back pain clinic","neck pain clinic","aquatic therapy","pediatric physical","pt clinic","wellness clinic"],
  mental_health: ["therapist","therapy practice","counseling","counselling","psychologist","psychiatrist","emdr therapy","mental health","trauma therapy","couples therapy","marriage counseling","group therapy","telehealth therapy","mindset coaching","behavioral health","psychology practice","psychotherapy","ocd treatment"],
  veterinary: ["vet clinic","veterinary","animal hospital","animal clinic","animal care center","pet clinic","pet hospital","dog hospital","cat clinic","exotic animal","holistic vet","emergency animal hospital"],
  automotive: ["dealership","car dealership","auto dealership","automotive group","audi","bmw","mercedes","used car","certified pre-owned","pre-owned vehicles","independent car dealer","luxury car","auto group","auto sales","auto insurance agency"],
  fitness_wellness: ["gym","yoga studio","pilates studio","crossfit","martial arts","boxing gym","kickboxing studio","cycling studio","spin studio","barre studio","hiit studio","dance studio","fitness studio","fitness center","athletic club","strength and conditioning","personal training studio","boutique gym","private gym"],
  salon_beauty: ["hair salon","nail salon","barber shop","beauty salon","med spa","medspa","medical spa","day spa","luxury spa","laser clinic","laser hair removal","lash studio","lash extensions","eyebrow studio","microblading studio","waxing studio","blowout bar","color specialist","men's grooming","organic salon","upscale barber","skin care clinic","skin rejuvenation"],
  legal_finance: ["law firm","attorney","lawyer","legal","cpa firm","accountant","accounting firm","tax","mortgage","insurance agency","insurance broker","real estate","realtor","financial advisory","wealth management","bookkeeping","payroll","audit firm","forensic accounting","business consultant","business advisory","risk management","home loan","lending","refinance","employee benefits","commercial insurance","life insurance"],
  education: ["school","tutoring center","learning center","montessori","music school","dance studio","coding school","stem center","art school","language learning","college prep","enrichment center","test prep","after school","private school","career coaching","leadership coaching","executive coaching"],
  restaurant_food: ["restaurant","bistro","cafe","dining","eatery","sushi restaurant","steakhouse","seafood restaurant","italian restaurant","french restaurant","mediterranean restaurant","japanese restaurant","american restaurant","wine bar","gastropub","brasserie","tasting menu","fine dining","farm to table","fusion restaurant","chef's table","private dining"],
};

export const BIZ_TYPE_LABELS = {
  dental: "Dental Clinic",
  medical: "Medical / Health",
  allied_health: "Allied Health",
  mental_health: "Mental Health",
  veterinary: "Veterinary",
  automotive: "Automotive / Dealership",
  fitness_wellness: "Fitness & Wellness",
  salon_beauty: "Salon / Beauty / Spa",
  legal_finance: "Legal / Finance",
  education: "Education",
  restaurant_food: "Restaurant / Dining",
  generic: "General Business",
};

export function detectBizType(bizName, reviews) {
  const scores = {};
  Object.keys(BIZ_TYPE_SIGNALS).forEach(t => scores[t] = 0);
  const nameL = (bizName || "").toLowerCase();
  const reviewSample = reviews.slice(0, 80).map(r => (r.reviewText || "").toLowerCase()).join(" ");
  const combined = nameL + " " + reviewSample;
  Object.entries(BIZ_TYPE_SIGNALS).forEach(([type, keywords]) => {
    keywords.forEach(kw => {
      if (combined.includes(kw)) {
        scores[type] += nameL.includes(kw) ? 4 : 1;
      }
    });
  });
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : "generic";
}

// ── PAIN CATEGORIES BY BUSINESS TYPE ────────────────────────────────────────
export const PAIN_CATEGORIES_BY_TYPE = {
  dental: {
    scheduling: { label: "Booking & Scheduling", color: "#6c63ff", bg: "rgba(108,99,255,0.1)", keywords: ["appointment","schedul","cancel","book","available","rescheduled","slot","couldn't get","no availability","next week","next month","open slot","make an appointment","get an appointment","wait weeks","wait months"], sub: { "No availability": ["no availability","can't get in","no appointment","no opening","next month"], "Last-minute cancel": ["cancelled","cancellation","reschedule","last minute","short notice","day before"], "No callback": ["no call back","didn't call","voicemail","no response","never called"] } },
    wait_times: { label: "Wait Times", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", keywords: ["wait","waited","waiting","hour wait","delay","slow","45 min","an hour","two hours","2 hours","behind schedule","running late","overbooked"], sub: { "Long wait": ["waited","waiting room","sat there","hour wait","2 hours","45 min"], "Overbooked": ["overbook","too many patients","back to back","always late"] } },
    reception: { label: "Reception & Front Desk", color: "#ff5c6c", bg: "rgba(255,92,108,0.1)", keywords: ["receptionist","front desk","front office","secretary","check in","check-in","front staff","person at front","desk staff","admin","rude receptionist","unhelpful","ignored"], sub: { "Rude receptionist": ["receptionist rude","rude receptionist","unprofessional","dismissive","nasty"], "Ignored": ["ignored","didn't help","no help","unhelpful","refused"] } },
    communication: { label: "Communication", color: "#2ecc7d", bg: "rgba(46,204,125,0.1)", keywords: ["communicat","told","didn't tell","not inform","no call","no response","didn't return","voicemail","call back","didn't explain","not explain","never told","didn't know about"], sub: { "Not informed": ["didn't tell","not told","wasn't told","didn't know","never mentioned"], "No follow-up": ["follow up","follow-up","never called","never heard","no update"] } },
    billing: { label: "Billing & Insurance", color: "#3b9eff", bg: "rgba(59,158,255,0.1)", keywords: ["billing","bill","insurance","charge","overcharge","cost","price","fee","payment","claim","out of pocket","unexpected charge","didn't cover","deductible","co-pay","copay"], sub: { "Surprise charges": ["unexpected","surprise","didn't tell","more than quoted"], "Insurance issues": ["insurance","not in network","out of network","denied","coverage","claim"], "Billing errors": ["wrong amount","charged twice","error","incorrect"] } },
    staff_attitude: { label: "Staff Attitude", color: "#f97316", bg: "rgba(249,115,22,0.1)", keywords: ["rude","unprofessional","disrespectful","dismissive","condescending","attitude","mean","impolite","nasty","arrogant","horrible staff","terrible staff","awful staff"], sub: { "Doctor/dentist": ["dentist was rude","doctor was rude","condescending","dismissive doctor","arrogant"], "Support staff": ["staff","team","employees","workers","personnel"] } },
    quality: { label: "Quality of Work", color: "#a78bfa", bg: "rgba(167,139,250,0.1)", keywords: ["fell out","broken","crown","filling","implant","root canal","didn't fix","bad work","redo","failed","came out","not fixed","still hurts","worse after","messed up","ruined","wrong tooth"], sub: { "Work failed": ["fell out","came out","failed","didn't hold"], "Had to redo": ["redo","again","second time","came back","fix again"], "Made worse": ["worse","hurt more","damaged","ruined","messed up"] } },
    hygiene: { label: "Hygiene & Cleanliness", color: "#06b6d4", bg: "rgba(6,182,212,0.1)", keywords: ["dirty","clean","sanitary","hygiene","sterile","unhygienic","contaminated","infection","unclean","not clean","filthy"], sub: { "Dirty equipment": ["equipment","tools","dirty","blood","contaminated"], "Facility": ["dirty office","unclean room","filthy","facility"] } },
  },
  medical: {
    scheduling: { label: "Appointment Booking", color: "#6c63ff", bg: "rgba(108,99,255,0.1)", keywords: ["appointment","book","schedul","cancel","available","slot","no availability","couldn't get","wait weeks","wait months","rescheduled","waitlist","referral","no opening"], sub: { "Can't get in": ["no availability","wait weeks","wait months","no appointment","no opening","waitlist"], "Cancellations": ["cancelled","cancellation","reschedule","last minute","short notice"], "Referral issues": ["referral","referred","specialist","couldn't refer","no referral"] } },
    wait_times: { label: "Wait Times", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", keywords: ["wait","waited","waiting","hour wait","delay","slow","hours","behind schedule","running late","overbooked","queue"], sub: { "Long wait": ["waited","waiting room","sat there","hour wait","2 hours","3 hours"], "Overbooked": ["overbook","too many patients","back to back","always late"] } },
    reception: { label: "Reception & Front Desk", color: "#ff5c6c", bg: "rgba(255,92,108,0.1)", keywords: ["receptionist","front desk","front office","secretary","check in","check-in","admin","rude receptionist","unhelpful","ignored","dismissive","phone"], sub: { "Rude/dismissive": ["rude","dismissive","unprofessional","nasty","condescending"], "Phone issues": ["phone","call","couldn't reach","no answer","on hold","phone manner"], "Ignored": ["ignored","didn't help","no help","unhelpful","refused"] } },
    communication: { label: "Communication", color: "#2ecc7d", bg: "rgba(46,204,125,0.1)", keywords: ["communicat","told","didn't tell","not inform","no call","no response","voicemail","call back","didn't explain","test results","results","follow-up"], sub: { "Test results": ["test results","results","didn't receive","never got","waiting for results"], "No follow-up": ["follow up","follow-up","never called","never heard","no update"], "Not informed": ["didn't tell","not told","wasn't told","didn't know","never mentioned"] } },
    billing: { label: "Billing & Insurance", color: "#3b9eff", bg: "rgba(59,158,255,0.1)", keywords: ["billing","bill","insurance","charge","overcharge","cost","price","fee","claim","out of pocket","unexpected charge","didn't cover","deductible","copay","gap fee","bulk bill","medicare"], sub: { "Surprise charges": ["unexpected","surprise","didn't tell","more than quoted"], "Insurance/Medicare": ["insurance","medicare","bulk bill","not covered","out of network","claim","gap fee"], "Billing errors": ["wrong amount","charged twice","error","incorrect"] } },
    staff_attitude: { label: "Staff Attitude", color: "#f97316", bg: "rgba(249,115,22,0.1)", keywords: ["rude","unprofessional","disrespectful","dismissive","condescending","attitude","mean","impolite","nasty","arrogant","horrible staff","terrible staff","rushed","made me feel"], sub: { "Doctor attitude": ["doctor was rude","dr.","condescending","dismissive doctor","arrogant","rushed me","didn't listen"], "Staff attitude": ["staff","nurses","team","employees","workers"] } },
    quality: { label: "Quality of Care", color: "#a78bfa", bg: "rgba(167,139,250,0.1)", keywords: ["misdiagnos","wrong diagnosis","didn't help","no improvement","still in pain","worse after","bad advice","wrong medication","second opinion","dismissed my symptoms","didn't take seriously"], sub: { "Misdiagnosis": ["misdiagnos","wrong diagnosis","missed diagnosis","didn't catch"], "Dismissed": ["dismissed","didn't take seriously","ignored symptoms","made me feel"], "No improvement": ["no improvement","still in pain","worse after","didn't help","didn't work"] } },
  },
  allied_health: {
    scheduling: { label: "Booking & Access", color: "#6c63ff", bg: "rgba(108,99,255,0.1)", keywords: ["appointment","book","schedul","cancel","available","slot","no availability","couldn't get","wait weeks","rescheduled","waitlist","no opening","referral"], sub: { "Can't get in": ["no availability","wait weeks","no appointment","no opening","waitlist"], "Cancellations": ["cancelled","cancellation","reschedule","last minute","short notice"] } },
    wait_times: { label: "Wait Times", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", keywords: ["wait","waited","waiting","hour wait","delay","slow","behind schedule","running late","overbooked"], sub: { "Long wait": ["waited","waiting room","sat there","hour wait"], "Overbooked": ["overbook","too many","back to back","always late"] } },
    reception: { label: "Reception & Intake", color: "#ff5c6c", bg: "rgba(255,92,108,0.1)", keywords: ["receptionist","front desk","check in","admin","rude","unhelpful","ignored","phone","no answer","on hold"], sub: { "Rude/unhelpful": ["rude","dismissive","unprofessional","nasty","unhelpful"], "Phone issues": ["phone","call","couldn't reach","no answer","on hold"] } },
    communication: { label: "Communication", color: "#2ecc7d", bg: "rgba(46,204,125,0.1)", keywords: ["communicat","didn't explain","not explain","didn't tell","no call","no response","voicemail","call back","never told","follow-up","treatment plan","progress"], sub: { "Treatment plan": ["treatment plan","didn't explain","no plan","what to expect"], "No follow-up": ["follow up","follow-up","never called","never heard","no update"] } },
    billing: { label: "Billing & Insurance", color: "#3b9eff", bg: "rgba(59,158,255,0.1)", keywords: ["billing","bill","insurance","charge","overcharge","cost","price","fee","claim","out of pocket","unexpected","gap fee","medicare","ndis","hicaps"], sub: { "Surprise charges": ["unexpected","surprise","didn't tell","more than quoted"], "Insurance": ["insurance","medicare","ndis","not covered","claim","gap fee"] } },
    staff_attitude: { label: "Practitioner Attitude", color: "#f97316", bg: "rgba(249,115,22,0.1)", keywords: ["rude","unprofessional","dismissive","condescending","attitude","mean","nasty","rushed","didn't listen","made me feel","horrible","terrible"], sub: { "Dismissive": ["dismissed","didn't listen","rushed","condescending","didn't take seriously"], "Rude": ["rude","nasty","mean","impolite","arrogant"] } },
    quality: { label: "Treatment Quality", color: "#a78bfa", bg: "rgba(167,139,250,0.1)", keywords: ["no improvement","still in pain","worse after","bad advice","wrong treatment","didn't help","incompetent","not working","no progress"], sub: { "No improvement": ["no improvement","still in pain","worse after","didn't help","not working"], "Wrong treatment": ["wrong treatment","bad advice","incorrect","incompetent","made it worse"] } },
  },
  mental_health: {
    scheduling: { label: "Booking & Availability", color: "#6c63ff", bg: "rgba(108,99,255,0.1)", keywords: ["appointment","book","schedul","cancel","available","slot","no availability","wait weeks","wait months","rescheduled","waitlist","no opening","crisis","urgent","last minute cancel"], sub: { "Long waitlists": ["wait weeks","wait months","waitlist","no availability","no opening"], "Last-minute cancels": ["cancelled last minute","reschedule","short notice","day of","no notice"], "Crisis access": ["crisis","urgent","emergency","couldn't get help","needed help immediately"] } },
    communication: { label: "Communication & Transparency", color: "#2ecc7d", bg: "rgba(46,204,125,0.1)", keywords: ["communicat","didn't explain","not explain","didn't tell","no call","no response","voicemail","call back","never told","didn't hear back","ghosted","no update","treatment plan"], sub: { "Ghosted/no response": ["ghosted","no response","didn't reply","didn't call back","no update","stopped responding"], "Not transparent": ["didn't explain","no plan","didn't tell","wasn't informed","didn't know"] } },
    therapist_attitude: { label: "Therapist Attitude", color: "#f97316", bg: "rgba(249,115,22,0.1)", keywords: ["therapist","counsellor","psychologist","didn't listen","dismissed","felt judged","not helpful","cold","robotic","not empathetic","made me feel worse","unprofessional","confidentiality"], sub: { "Didn't listen": ["didn't listen","not heard","dismissed","felt judged","not taken seriously"], "Cold/robotic": ["cold","robotic","not empathetic","impersonal","felt like a number"], "Unprofessional": ["unprofessional","breach","confidentiality","inappropriate","boundary"] } },
    billing: { label: "Billing & Insurance", color: "#3b9eff", bg: "rgba(59,158,255,0.1)", keywords: ["billing","bill","insurance","charge","overcharge","cost","price","fee","claim","out of pocket","unexpected","gap fee","medicare","ndis","rebate","mental health plan"], sub: { "Unexpected costs": ["unexpected","surprise charge","didn't tell","more than quoted","hidden fees"], "Insurance/rebates": ["insurance","medicare","ndis","rebate","mental health plan","not covered","claim"] } },
    quality: { label: "Quality of Care", color: "#a78bfa", bg: "rgba(167,139,250,0.1)", keywords: ["no improvement","worse","didn't help","not helpful","made me feel worse","wrong approach","wrong therapy","bad advice","incompetent","not qualified","no progress","waste of time"], sub: { "No progress": ["no improvement","no progress","waste of time","didn't help","not working"], "Wrong approach": ["wrong therapy","bad advice","not qualified","wrong approach","didn't suit"] } },
    privacy: { label: "Privacy & Confidentiality", color: "#ec4899", bg: "rgba(236,72,153,0.1)", keywords: ["privacy","confidential","breach","told someone","shared my","disclosed","not private","overheard","data","records","leaked"], sub: { "Breach": ["breach","told someone","shared my information","disclosed without","leaked"], "Not private": ["not private","overheard","thin walls","public","reception could hear"] } },
  },
  veterinary: {
    scheduling: { label: "Booking & Emergency Access", color: "#6c63ff", bg: "rgba(108,99,255,0.1)", keywords: ["appointment","book","schedul","cancel","available","slot","no availability","couldn't get","emergency","urgent","turned away","no opening","rescheduled","waitlist"], sub: { "Emergency access": ["emergency","urgent","turned away","couldn't get in","no emergency slots"], "Cancellations": ["cancelled","cancellation","reschedule","last minute","short notice"], "Wait for routine": ["wait weeks","no availability","no opening","waitlist"] } },
    wait_times: { label: "Wait Times", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", keywords: ["wait","waited","waiting","hour wait","delay","slow","hours","behind schedule","running late","overbooked"], sub: { "Long wait": ["waited","waiting room","sat there","hour wait","2 hours","3 hours"], "Overbooked": ["overbook","too many","back to back","always late"] } },
    reception: { label: "Reception & Phone", color: "#ff5c6c", bg: "rgba(255,92,108,0.1)", keywords: ["receptionist","front desk","check in","admin","rude","unhelpful","ignored","phone","no answer","on hold","dismissive","didn't care"], sub: { "Rude/dismissive": ["rude","dismissive","unprofessional","nasty","didn't care","condescending"], "Phone issues": ["phone","call","couldn't reach","no answer","on hold","busy signal"] } },
    communication: { label: "Communication", color: "#2ecc7d", bg: "rgba(46,204,125,0.1)", keywords: ["communicat","didn't explain","not explain","didn't tell","no call","no response","voicemail","call back","never told","follow-up","diagnosis","treatment plan","test results"], sub: { "Test/diagnosis": ["test results","diagnosis","didn't explain","no explanation","never received results"], "No follow-up": ["follow up","follow-up","never called","no update","didn't check in"] } },
    billing: { label: "Billing & Costs", color: "#3b9eff", bg: "rgba(59,158,255,0.1)", keywords: ["billing","bill","charge","overcharge","cost","price","fee","payment","unexpected","expensive","quote","estimate","insurance","pet insurance"], sub: { "Overpriced": ["expensive","overpriced","too much","excessive","more than expected"], "No upfront cost": ["didn't quote","no estimate","surprise bill","unexpected charge","didn't tell me cost"], "Insurance": ["insurance","pet insurance","claim","didn't accept","coverage"] } },
    staff_attitude: { label: "Staff & Vet Attitude", color: "#f97316", bg: "rgba(249,115,22,0.1)", keywords: ["rude","unprofessional","dismissive","condescending","attitude","mean","nasty","rushed","didn't listen","made me feel","didn't care","cold","no empathy","about the money"], sub: { "About the money": ["about the money","money hungry","just want money","only care about money"], "Cold/dismissive": ["cold","dismissive","didn't care","no empathy","rushed","didn't listen"] } },
    quality: { label: "Quality of Care", color: "#a78bfa", bg: "rgba(167,139,250,0.1)", keywords: ["misdiagnos","wrong diagnosis","didn't help","no improvement","worse after","bad advice","wrong treatment","wrong medication","incompetent","missed","overlooked","negligent","died","passed away"], sub: { "Misdiagnosis": ["misdiagnos","wrong diagnosis","missed","overlooked","didn't catch"], "Negligence": ["negligent","malpractice","incompetent","could have been saved","died after"], "No improvement": ["no improvement","worse after","didn't help","didn't work"] } },
  },
  automotive: {
    booking: { label: "Sales Contact & Response", color: "#6c63ff", bg: "rgba(108,99,255,0.1)", keywords: ["didn't call back","no response","no reply","never heard","called","emailed","inquiry","enquiry","follow up","reached out","contact","ghosted","never got back","no contact","left message","voicemail"], sub: { "Ghosted after inquiry": ["never called back","no response","ghosted","never got back","left message","no reply"], "Slow follow-up": ["slow to respond","took days","took weeks","eventually","finally called"] } },
    wait_times: { label: "Wait Times & Delays", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", keywords: ["wait","waited","waiting","delay","took forever","hours","slow","service took","vehicle wasn't ready","not ready on time","behind schedule"], sub: { "Service delays": ["vehicle wasn't ready","not ready","took longer","promised date","delayed"], "Showroom wait": ["waited","waiting","hours at dealership","sat there","no one helped"] } },
    sales_attitude: { label: "Sales Staff Attitude", color: "#f97316", bg: "rgba(249,115,22,0.1)", keywords: ["pushy","pressure","high pressure","aggressive","wouldn't take no","salesman","rude","unprofessional","dismissive","condescending","lied","misleading","bait and switch","false advertising","deceptive"], sub: { "Pushy/pressure": ["pushy","pressure","high pressure","aggressive","wouldn't take no"], "Dishonest": ["lied","misleading","deceptive","bait and switch","false advertising","misrepresented"] } },
    communication: { label: "Communication", color: "#2ecc7d", bg: "rgba(46,204,125,0.1)", keywords: ["communicat","didn't tell","no update","no call","didn't inform","never told","wasn't informed","no communication","status","update","progress","delivery"], sub: { "No updates": ["no update","no communication","didn't call","status","delivery update","never told me"], "Misleading info": ["different price","changed price","wasn't told","surprise fee","not what i was told"] } },
    pricing: { label: "Pricing & Hidden Fees", color: "#3b9eff", bg: "rgba(59,158,255,0.1)", keywords: ["price","cost","fee","charge","overcharge","expensive","hidden fee","unexpected charge","different price","quoted","finance","interest","add-on","extra","dealer fee","admin fee","documentation fee"], sub: { "Hidden fees": ["hidden fee","dealer fee","admin fee","documentation fee","extra charge","surprise fee"], "Price changed": ["price changed","different price","quoted","bait","not what i was quoted","agreed price"] } },
    service_quality: { label: "Service Quality", color: "#a78bfa", bg: "rgba(167,139,250,0.1)", keywords: ["damage","damaged","scratched","dent","broke","faulty","recall","issue","problem","noise","defect","warranty","repair","fix","not fixed","still broken","came back","same problem","lemon"], sub: { "Vehicle damaged": ["scratched","dent","damage","broke","damaged my car"], "Not fixed properly": ["not fixed","still broken","same problem","came back","had to return","didn't fix"], "Warranty issues": ["warranty","recall","refused","wouldn't cover","claim denied"] } },
  },
  fitness_wellness: {
    scheduling: { label: "Class Booking & Cancellations", color: "#6c63ff", bg: "rgba(108,99,255,0.1)", keywords: ["book","booking","class","cancel","available","slot","no availability","full","couldn't book","membership","sign up","app","online booking","waitlist","reserve","spot"], sub: { "Booking system": ["app","online booking","system","website","couldn't book","hard to book","booking issue"], "Class full/no spots": ["full","no spots","waitlist","couldn't get in","sold out"], "Cancellation policy": ["cancel","cancellation","no refund","penalty","charged","strict policy","didn't cancel in time"] } },
    staff_attitude: { label: "Staff & Instructor Attitude", color: "#f97316", bg: "rgba(249,115,22,0.1)", keywords: ["instructor","trainer","coach","rude","unprofessional","dismissive","condescending","attitude","mean","impolite","nasty","unhelpful","didn't help","ignored","favouritism","cliquey"], sub: { "Instructor attitude": ["instructor","trainer","coach","rude","condescending","mean","dismissive","unprofessional"], "Ignored/unfriendly": ["ignored","unfriendly","cliquey","unwelcoming","didn't help","didn't acknowledge"] } },
    membership: { label: "Membership & Billing", color: "#3b9eff", bg: "rgba(59,158,255,0.1)", keywords: ["membership","contract","cancel membership","fee","charge","overcharge","billing","direct debit","charged","still being charged","couldn't cancel","hard to cancel","locked in","automatic renewal","refund"], sub: { "Hard to cancel": ["couldn't cancel","hard to cancel","locked in","still being charged","automatic renewal","wouldn't let me cancel"], "Overcharged": ["overcharged","charged twice","wrong amount","unexpected charge","direct debit error"] } },
    facilities: { label: "Facilities & Equipment", color: "#06b6d4", bg: "rgba(6,182,212,0.1)", keywords: ["equipment","machine","broken","not working","out of order","dirty","clean","hygiene","locker","shower","parking","crowded","too busy","not enough","maintenance"], sub: { "Broken equipment": ["broken","not working","out of order","machine","equipment","needs repair"], "Cleanliness": ["dirty","clean","hygiene","shower","locker","smells","not maintained"], "Overcrowded": ["crowded","too busy","not enough","wait for machine","peak hour"] } },
    communication: { label: "Communication", color: "#2ecc7d", bg: "rgba(46,204,125,0.1)", keywords: ["communicat","didn't tell","no update","no email","no response","no call","didn't notify","no notice","short notice","policy","terms","didn't explain","never told"], sub: { "Policy not explained": ["didn't explain","never told","wasn't informed","policy","terms","fine print"], "No notice": ["no notice","short notice","didn't notify","last minute","no warning","no email","no text"] } },
  },
  salon_beauty: {
    scheduling: { label: "Booking & Appointments", color: "#6c63ff", bg: "rgba(108,99,255,0.1)", keywords: ["appointment","book","schedul","cancel","available","slot","no availability","rescheduled","last minute cancel","waitlist","online booking","app","couldn't get","fully booked","no opening"], sub: { "Last-minute cancels": ["cancelled last minute","reschedule","short notice","day of","no notice"], "Booking system": ["app","online booking","system","hard to book","couldn't book"], "Fully booked": ["fully booked","no availability","wait weeks","couldn't get in"] } },
    wait_times: { label: "Wait Times", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", keywords: ["wait","waited","waiting","late","running late","delay","took forever","hours","over time","ran over"], sub: { "Running late": ["running late","started late","behind","not on time","waited ages"], "Took too long": ["took forever","took hours","ran over","longer than expected","over time"] } },
    staff_attitude: { label: "Stylist & Staff Attitude", color: "#f97316", bg: "rgba(249,115,22,0.1)", keywords: ["stylist","technician","therapist","rude","unprofessional","dismissive","condescending","attitude","mean","impolite","nasty","rushed","didn't listen","ignored","unfriendly"], sub: { "Rude/unprofessional": ["rude","unprofessional","nasty","mean","condescending","impolite"], "Didn't listen": ["didn't listen","ignored","rushed","not what i asked","not what i wanted"] } },
    quality: { label: "Quality of Work", color: "#a78bfa", bg: "rgba(167,139,250,0.1)", keywords: ["ruined","damaged","burnt","uneven","blotchy","not what i asked","not what i wanted","wrong colour","wrong color","wrong style","patchy","bald","fell out","bad job","terrible result","came out wrong","allergic","reaction"], sub: { "Wrong result": ["not what i asked","not what i wanted","wrong colour","wrong style","looked nothing like"], "Damaged hair/skin": ["ruined","damaged","burnt","bald","fell out","breakage","allergic reaction","reaction"], "Poor quality": ["bad job","terrible result","came out wrong","patchy","uneven","blotchy"] } },
    pricing: { label: "Pricing & Transparency", color: "#3b9eff", bg: "rgba(59,158,255,0.1)", keywords: ["price","cost","fee","charge","expensive","more than quoted","not what i was told","changed price","hidden fee","surprise charge","extra","didn't tell me"], sub: { "Price changed": ["more than quoted","changed price","not what i was told","agreed price"], "Hidden fees": ["hidden fee","extra charge","surprise","didn't tell me cost","unexpected"] } },
    hygiene: { label: "Hygiene & Cleanliness", color: "#06b6d4", bg: "rgba(6,182,212,0.1)", keywords: ["dirty","clean","sanitary","hygiene","sterile","unhygienic","contaminated","infection","unclean","not clean","filthy","reused","tools"], sub: { "Dirty/unsanitary": ["dirty","filthy","unclean","unhygienic","smell"], "Infection risk": ["infection","reused","sterile","unsanitary","contaminated"] } },
  },
  legal_finance: {
    scheduling: { label: "Response & Availability", color: "#6c63ff", bg: "rgba(108,99,255,0.1)", keywords: ["didn't call back","no response","no reply","never heard","called","emailed","inquiry","contact","ghosted","never got back","no contact","left message","voicemail","couldn't get through","no answer","unreachable"], sub: { "Ghosted": ["never called back","no response","ghosted","never got back","left message","no reply","didn't hear back"], "Unreachable": ["couldn't reach","no answer","always busy","voicemail","unreachable","couldn't get through"] } },
    communication: { label: "Communication & Updates", color: "#2ecc7d", bg: "rgba(46,204,125,0.1)", keywords: ["communicat","didn't update","no update","no call","didn't inform","never told","no communication","status","progress","case update","loan update","waiting","no explanation","didn't explain"], sub: { "Case/loan updates": ["case update","loan update","status","progress","waiting","no update","didn't tell me"], "Poor explanation": ["didn't explain","no explanation","jargon","couldn't understand","confusing","never told me"] } },
    billing: { label: "Fees & Billing", color: "#3b9eff", bg: "rgba(59,158,255,0.1)", keywords: ["fee","charge","overcharge","cost","price","unexpected","hidden fee","billing","invoice","charged","more than quoted","extra","admin fee","processing fee","surprise"], sub: { "Hidden fees": ["hidden fee","admin fee","processing fee","extra charge","surprise","wasn't told"], "Overcharged": ["overcharged","charged twice","wrong amount","incorrect","more than quoted"] } },
    staff_attitude: { label: "Staff & Advisor Attitude", color: "#f97316", bg: "rgba(249,115,22,0.1)", keywords: ["rude","unprofessional","dismissive","condescending","attitude","mean","impolite","nasty","arrogant","didn't listen","rushed","unhelpful","not helpful","wasted my time"], sub: { "Dismissive": ["dismissed","condescending","arrogant","didn't listen","made me feel stupid","rushed"], "Unhelpful": ["not helpful","wasted my time","couldn't help","no solution","unhelpful"] } },
    quality: { label: "Quality of Work", color: "#a78bfa", bg: "rgba(167,139,250,0.1)", keywords: ["mistake","error","wrong advice","bad advice","incorrect","negligence","malpractice","missed","overlooked","wrong filing","wrong document","incompetent","cost me","damaged","lost money"], sub: { "Errors/mistakes": ["mistake","error","wrong filing","incorrect","wrong document","error on"], "Bad advice": ["bad advice","wrong advice","incorrect advice","cost me","negligent","incompetent"], "Negligence": ["negligence","malpractice","missed","overlooked","didn't catch","failed to"] } },
    trust: { label: "Trust & Transparency", color: "#ec4899", bg: "rgba(236,72,153,0.1)", keywords: ["lied","misleading","dishonest","deceptive","not transparent","hidden","didn't disclose","conflict of interest","felt pressured","pushy","didn't tell me","withheld","false","misrepresented"], sub: { "Misleading info": ["lied","misleading","deceptive","false","misrepresented","didn't disclose"], "Pressure tactics": ["felt pressured","pushy","pressure","aggressive","wouldn't take no","convinced me"] } },
  },
  education: {
    scheduling: { label: "Enrollment & Access", color: "#6c63ff", bg: "rgba(108,99,255,0.1)", keywords: ["enroll","enrolment","signup","register","booking","available","slot","no availability","waitlist","couldn't get","fully booked","session","class","schedule","reschedule","cancel"], sub: { "Enrollment issues": ["couldn't enroll","waitlist","no availability","fully booked","no spots"], "Scheduling problems": ["reschedule","cancel","no notice","short notice","last minute","class cancelled"] } },
    communication: { label: "Communication", color: "#2ecc7d", bg: "rgba(46,204,125,0.1)", keywords: ["communicat","didn't tell","no update","no email","no response","didn't notify","no feedback","no progress report","parent","progress","updates","didn't explain","not informed"], sub: { "No progress updates": ["no progress","no feedback","no report","didn't tell parents","no communication about progress"], "Poor communication": ["no response","no email","didn't notify","wasn't told","no update"] } },
    staff_attitude: { label: "Teacher & Staff Attitude", color: "#f97316", bg: "rgba(249,115,22,0.1)", keywords: ["teacher","tutor","instructor","coach","rude","unprofessional","dismissive","condescending","attitude","mean","impolite","unhelpful","didn't care","lazy","unqualified","not qualified"], sub: { "Rude/unprofessional": ["rude","unprofessional","mean","condescending","impolite","dismissive"], "Unqualified": ["not qualified","unqualified","didn't know","incompetent","lazy","didn't care"] } },
    quality: { label: "Teaching Quality", color: "#a78bfa", bg: "rgba(167,139,250,0.1)", keywords: ["no improvement","no progress","didn't learn","waste of money","not effective","poor quality","bad teaching","unprepared","no structure","disorganized","curriculum","material","outdated","not challenging"], sub: { "No improvement": ["no improvement","no progress","didn't learn","didn't get better","waste of money"], "Poor quality": ["bad teaching","unprepared","no structure","disorganized","poor quality","not effective"] } },
    billing: { label: "Fees & Billing", color: "#3b9eff", bg: "rgba(59,158,255,0.1)", keywords: ["fee","charge","overcharge","cost","price","unexpected","hidden fee","billing","invoice","charged","more than quoted","refund","contract","locked in","cancellation fee"], sub: { "Unexpected fees": ["unexpected","hidden fee","surprise","wasn't told","extra charge"], "Refund issues": ["refund","wouldn't refund","no refund","locked in","contract","cancellation fee"] } },
  },
  restaurant_food: {
    booking: { label: "Reservation & Booking", color: "#6c63ff", bg: "rgba(108,99,255,0.1)", keywords: ["reservation","booking","book","reserve","no table","walk in","couldn't get","fully booked","waitlist","wait","no availability","cancelled booking","lost booking","no confirmation"], sub: { "Lost reservation": ["lost booking","lost reservation","no record","didn't have us","no confirmation","messed up booking"], "No availability": ["fully booked","no table","no availability","couldn't get in","waitlist"] } },
    wait_times: { label: "Wait Times", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", keywords: ["wait","waited","waiting","slow","took forever","hours","long time","40 minutes","service slow","no one came","ignored","standing at door","seated late","table wasn't ready"], sub: { "Slow service": ["slow service","took forever","no one came","waited ages","long time","ignored us"], "Seated late": ["table wasn't ready","seated late","waited to be seated","standing","40 minutes"] } },
    food_quality: { label: "Food Quality", color: "#a78bfa", bg: "rgba(167,139,250,0.1)", keywords: ["cold","undercooked","overcooked","raw","tasteless","bland","wrong order","missing item","bad food","awful food","terrible food","food was","not fresh","old","stale","hair","foreign object","disgusting"], sub: { "Cold/undercooked": ["cold","undercooked","raw","lukewarm","not hot"], "Wrong order": ["wrong order","missing item","not what i ordered","different dish","incorrect"], "Bad quality": ["tasteless","bland","bad food","awful food","not fresh","old","stale"] } },
    staff_attitude: { label: "Staff Attitude & Service", color: "#f97316", bg: "rgba(249,115,22,0.1)", keywords: ["rude","unprofessional","dismissive","condescending","attitude","mean","impolite","nasty","unfriendly","waiter","waitress","server","ignored","didn't come back","forgot","no attention","bad service"], sub: { "Rude staff": ["rude","unprofessional","mean","condescending","impolite","nasty","dismissive"], "Ignored/forgotten": ["ignored","didn't come back","forgot","no attention","couldn't find","where is"] } },
    billing: { label: "Billing & Value", color: "#3b9eff", bg: "rgba(59,158,255,0.1)", keywords: ["price","cost","expensive","overpriced","charge","overcharged","bill","wrong bill","extra charge","hidden charge","service charge","value for money","not worth","too expensive","ripoff"], sub: { "Overpriced": ["too expensive","overpriced","not worth","ripoff","value for money"], "Wrong bill": ["wrong bill","overcharged","charged extra","unexpected charge","service charge added","incorrect bill"] } },
    hygiene: { label: "Hygiene & Cleanliness", color: "#06b6d4", bg: "rgba(6,182,212,0.1)", keywords: ["dirty","unclean","hygiene","filthy","disgusting","smell","smells","cockroach","pest","bug","mouse","rat","hair in food","foreign object","not clean","bathroom","toilet"], sub: { "Pests/contamination": ["cockroach","pest","bug","mouse","rat","hair in food","foreign object","contaminated"], "Dirty premises": ["dirty","filthy","unclean","disgusting","smells","bathroom","toilet","not clean"] } },
  },
  generic: {
    scheduling: { label: "Booking & Appointments", color: "#6c63ff", bg: "rgba(108,99,255,0.1)", keywords: ["appointment","book","schedul","cancel","available","slot","no availability","couldn't get","rescheduled","waitlist","no opening","last minute cancel","fully booked"], sub: { "Can't get in": ["no availability","wait weeks","no appointment","no opening","waitlist","fully booked"], "Cancellations": ["cancelled","cancellation","reschedule","last minute","short notice"] } },
    wait_times: { label: "Wait Times", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", keywords: ["wait","waited","waiting","delay","slow","took forever","hours","behind schedule","running late","overbooked"], sub: { "Long wait": ["waited","waiting","sat there","hour wait","too long"], "Running late": ["running late","behind","not on time","delayed","overbooked"] } },
    reception: { label: "Reception & First Contact", color: "#ff5c6c", bg: "rgba(255,92,108,0.1)", keywords: ["receptionist","front desk","check in","admin","rude","unhelpful","ignored","phone","no answer","on hold","dismissive","unwelcoming","cold","unfriendly"], sub: { "Rude/dismissive": ["rude","dismissive","unprofessional","nasty","condescending","unhelpful"], "Phone issues": ["phone","call","couldn't reach","no answer","on hold","voicemail"] } },
    communication: { label: "Communication", color: "#2ecc7d", bg: "rgba(46,204,125,0.1)", keywords: ["communicat","didn't tell","no update","no call","no response","voicemail","call back","never told","didn't explain","not explain","follow-up","no follow"], sub: { "No follow-up": ["follow up","follow-up","never called","never heard","no update","didn't check in"], "Not informed": ["didn't tell","not told","wasn't told","didn't know","never mentioned","didn't explain"] } },
    billing: { label: "Billing & Pricing", color: "#3b9eff", bg: "rgba(59,158,255,0.1)", keywords: ["billing","bill","charge","overcharge","cost","price","fee","payment","unexpected","hidden fee","surprise charge","more than quoted","extra"], sub: { "Surprise charges": ["unexpected","surprise","didn't tell","more than quoted","hidden fee"], "Overcharged": ["overcharged","charged twice","wrong amount","incorrect","billing error"] } },
    staff_attitude: { label: "Staff Attitude", color: "#f97316", bg: "rgba(249,115,22,0.1)", keywords: ["rude","unprofessional","disrespectful","dismissive","condescending","attitude","mean","impolite","nasty","arrogant","horrible staff","terrible staff","awful staff","unhelpful","didn't care"], sub: { "Rude": ["rude","nasty","mean","impolite","arrogant","disrespectful"], "Unhelpful": ["unhelpful","didn't care","didn't help","couldn't help","not helpful","useless"] } },
    quality: { label: "Quality of Work", color: "#a78bfa", bg: "rgba(167,139,250,0.1)", keywords: ["poor quality","bad work","mistake","error","wrong","not what i expected","didn't deliver","incompetent","unprofessional","terrible result","awful result","not good","substandard"], sub: { "Poor quality": ["poor quality","bad work","terrible result","awful result","substandard"], "Errors/mistakes": ["mistake","error","wrong","incorrect","not what i expected","didn't deliver"] } },
  },
};

// Keep legacy export for any remaining references
export const PAIN_CATEGORIES = PAIN_CATEGORIES_BY_TYPE.generic;

// ── TRUST ADVICE BY TYPE ────────────────────────────────────────────────────
export const TRUST_ADVICE_BY_TYPE = {
  dental: {
    scheduling: { headline: "Fix the booking funnel", actions: ["Send SMS confirmation + reminder 24h before", "Add online booking link to Google profile", "Have a clear cancellation policy upfront", "Offer same-week emergency slots daily"] },
    wait_times: { headline: "Respect patient time", actions: ["Text patients if running 15+ min late", "Limit daily bookings to realistic capacity", "Post real wait estimates at reception", "Acknowledge delays proactively"] },
    reception: { headline: "Train your front desk", actions: ["Script a warm greeting for every patient", "Empathy training for all admin staff", "Manager spot-checks during peak hours", "Give reception authority to solve small issues"] },
    communication: { headline: "Over-communicate everything", actions: ["Return all calls within 4 hours", "Pre-visit info pack explaining what to expect", "Post-procedure follow-up text or call", "Assign a named contact per patient"] },
    billing: { headline: "Radical billing transparency", actions: ["Confirm insurance in-network BEFORE appointment", "Send cost estimate before any procedure", "Itemize bills in plain language", "Never discuss finances while patient is in chair"] },
    staff_attitude: { headline: "Culture starts at the top", actions: ["Review staff behavior in team meetings", "Patient-first language training", "Reward staff flagged positively in reviews", "Anonymous feedback form after each visit"] },
    quality: { headline: "Quality assurance protocol", actions: ["Second-opinion culture for complex work", "Follow-up call 48h after any procedure", "Clear warranty/redo policy posted publicly", "Document every treatment plan in writing"] },
    hygiene: { headline: "Make cleanliness visible", actions: ["Change gloves visibly in front of patient", "Display sterilization cert in waiting area", "Deep-clean schedule posted on wall", "Staff in clean scrubs every shift"] },
  },
  automotive: {
    booking: { headline: "Respond faster than competitors", actions: ["Reply to all inquiries within 1 hour", "Set up auto-reply with expected callback time", "Assign leads to specific staff", "Follow up missed calls within 15 minutes"] },
    wait_times: { headline: "Keep customers in the loop", actions: ["Proactive status updates every 2 hours", "Text when vehicle is ready before calling", "Set realistic timelines and stick to them", "Offer loaner car for long jobs"] },
    sales_attitude: { headline: "Sell without pressure", actions: ["Train on consultative selling, not closing tactics", "Let customers take time to decide", "Record calls for quality assurance", "Anonymous customer feedback after every sale"] },
    communication: { headline: "No surprises policy", actions: ["Confirm all details in writing before delivery", "Update customer at every stage", "Assign one point of contact per customer", "Send a handover summary email on delivery day"] },
    pricing: { headline: "Price transparency builds trust", actions: ["Show all fees upfront in the quote", "Never add dealer fees after negotiating", "Provide written itemized quote before signing", "Publish common fees on your website"] },
    service_quality: { headline: "Service right the first time", actions: ["Quality check before every vehicle handover", "Clear written warranty terms at point of sale", "Make it easy to return for warranty work", "Document all service work in writing"] },
  },
  fitness_wellness: {
    scheduling: { headline: "Make booking frictionless", actions: ["Fix app/online booking — test it weekly", "Send class reminder 2h before", "Clear and fair cancellation policy visible upfront", "Allow easy class swaps without penalty"] },
    staff_attitude: { headline: "Build a welcoming culture", actions: ["Train instructors on inclusive language", "Onboarding buddy system for new members", "Instructor feedback surveys monthly", "Address cliquey behaviour immediately"] },
    membership: { headline: "Make cancellation easy", actions: ["No-hassle cancellation — 1 click or 1 call", "Send renewal reminders 30 days before auto-charge", "Clear contract terms at signup", "Process refunds within 5 business days"] },
    facilities: { headline: "Maintain your space", actions: ["Equipment maintenance checklist — weekly", "Cleaning schedule visible to members", "Members can report issues via app", "Act on facility complaints within 48h"] },
    communication: { headline: "Keep members informed", actions: ["Email/SMS for any class changes or cancellations", "Policy changes communicated 2 weeks in advance", "Monthly newsletter with schedule updates", "Staff briefed on all policy changes before members"] },
  },
  salon_beauty: {
    scheduling: { headline: "Protect your appointment slots", actions: ["Send confirmation + reminder 48h and 2h before", "Clear cancellation/no-show policy upfront", "Require card on file for new clients", "Offer quick online rebooking after cancellation"] },
    wait_times: { headline: "Start on time, every time", actions: ["Buffer 10 min between appointments", "Notify client if running late before they arrive", "Train staff on realistic time estimates", "Don't overbook peak hours"] },
    staff_attitude: { headline: "Every client leaves happy", actions: ["Consultation at the start of every appointment", "Follow-up text after first-time visits", "Feedback form after services", "Address complaints same day"] },
    quality: { headline: "Get the result right", actions: ["Thorough consultation before every chemical service", "Show reference photos and confirm before starting", "Patch test policy for all new chemical clients", "Complimentary fix within 7 days if not satisfied"] },
    pricing: { headline: "No pricing surprises", actions: ["Display price list in salon and online", "Quote before adding extra services", "No last-minute add-ons without client approval", "Loyalty pricing for returning clients"] },
    hygiene: { headline: "Visible safety standards", actions: ["Change tools visibly between clients", "Display hygiene certifications", "Clean workstation reset between every client", "Annual hygiene training for all staff"] },
  },
  legal_finance: {
    scheduling: { headline: "Be reachable and responsive", actions: ["Respond to all inquiries within 2 business hours", "Auto-reply acknowledging all messages", "Dedicated intake team for new client calls", "Track and follow up all missed calls daily"] },
    communication: { headline: "Clients deserve regular updates", actions: ["Proactive case/loan status updates weekly", "Plain-English summaries — no jargon", "Named point of contact for every client", "Confirm all advice in writing"] },
    billing: { headline: "Full fee transparency", actions: ["Provide written fee agreement before starting", "No surprise invoices — estimate upfront", "Itemized billing on every invoice", "Explain all fees before client signs"] },
    staff_attitude: { headline: "Treat every client with respect", actions: ["Active listening training for all staff", "Empathy-first communication policy", "Escalation path for dissatisfied clients", "Anonymous feedback after each engagement"] },
    quality: { headline: "Zero errors policy", actions: ["Dual-review all documents before submission", "Checklist sign-off before filing", "Client review of all documents before submission", "Post-engagement review call with client"] },
    trust: { headline: "Earn trust through transparency", actions: ["Disclose all conflicts of interest upfront", "No pressure on product/service upsells", "Client bill of rights posted in office", "Anonymous feedback channel for all clients"] },
  },
  education: {
    scheduling: { headline: "Smooth enrollment and scheduling", actions: ["Clear enrollment process on website", "Waitlist communication with expected timeline", "Cancel sessions with 48h minimum notice", "Flexible rescheduling for students"] },
    communication: { headline: "Keep parents and students informed", actions: ["Weekly progress updates to parents", "Respond to all messages within 24h", "End-of-term written progress report", "Flag concerns early — don't wait for exams"] },
    staff_attitude: { headline: "Teachers set the culture", actions: ["Student satisfaction surveys each term", "Clear code of conduct for all staff", "Escalation path for student complaints", "Recognize and reward excellent teachers"] },
    quality: { headline: "Results are the product", actions: ["Set clear learning outcomes upfront", "Regular assessment of student progress", "Adjust teaching approach based on feedback", "Clear success metrics shared with parents"] },
    billing: { headline: "No fee surprises", actions: ["All fees disclosed before enrollment", "No mid-term fee increases without notice", "Clear refund policy for cancellations", "Itemized invoice for all charges"] },
  },
  restaurant_food: {
    booking: { headline: "Honor every reservation", actions: ["Confirmation SMS on day of booking", "No overbooking policy — enforce it", "Reserve tables for 15 min past booking time", "Apology + priority rebooking if table lost"] },
    wait_times: { headline: "Service must be timely", actions: ["Greet and seat within 2 minutes of arrival", "Set realistic kitchen time expectations", "Check in with tables every 10-15 minutes", "Manager visits tables waiting 30+ minutes"] },
    food_quality: { headline: "Every dish must be right", actions: ["Quality check before every plate leaves kitchen", "Remake policy — no questions asked", "Chef reviews any returned dishes", "Regular mystery diner visits"] },
    staff_attitude: { headline: "Hospitality is the business", actions: ["Monthly service training for all floor staff", "Empower staff to comp a dish for any complaint", "Manager present on floor during peak hours", "Staff feedback channel — address within 48h"] },
    billing: { headline: "Transparent pricing always", actions: ["Menu prices match what's charged", "Service charges disclosed on menu", "Manager reviews any disputed bills immediately", "Never argue with a customer about a bill"] },
    hygiene: { headline: "Cleanliness is non-negotiable", actions: ["Daily opening and closing cleaning checklist", "Pest control inspection monthly", "Food handling training renewed annually", "Post hygiene rating visibly in venue"] },
  },
  generic: {
    scheduling: { headline: "Make it easy to do business", actions: ["Reply to all booking requests within 2 hours", "Clear cancellation policy visible upfront", "Reminder sent 24h before every appointment", "Easy rescheduling — no penalty for first change"] },
    wait_times: { headline: "Respect people's time", actions: ["Communicate delays proactively", "Give realistic time estimates upfront", "Check in with waiting customers every 10 min", "Review booking capacity if delays are frequent"] },
    reception: { headline: "First impressions last", actions: ["Train reception on warm, professional greeting", "Answer all calls within 3 rings", "Return missed calls within 30 minutes", "Give reception authority to solve small issues"] },
    communication: { headline: "No news is bad news", actions: ["Proactive updates at every stage", "Return all messages within 4 business hours", "Confirm all decisions in writing", "Assign one named contact per customer"] },
    billing: { headline: "No surprises on the bill", actions: ["Quote upfront before starting work", "Itemized invoice for every charge", "No add-ons without customer approval", "Address billing disputes same day"] },
    staff_attitude: { headline: "Culture starts at the top", actions: ["Monthly team training on customer service", "Anonymous customer feedback after each visit", "Reward staff recognized positively in reviews", "Zero tolerance for dismissive behavior"] },
    quality: { headline: "Deliver what you promise", actions: ["Set clear expectations before starting", "Quality check before delivering any work", "Follow-up after completion to confirm satisfaction", "Clear redo/fix policy posted publicly"] },
  },
};

// Keep legacy export
export const TRUST_ADVICE = TRUST_ADVICE_BY_TYPE.generic;

export const RATING_MAP = {
  "5 stars": 5, "4 stars": 4, "3 stars": 3, "2 stars": 2, "1 star": 1,
  "5": 5, "4": 4, "3": 3, "2": 2, "1": 1,
};

export function analyzeCSV(rows) {
  const businesses = {};
  const globalNeg = [];

  rows.forEach(row => {
    const name = row.business_name || row.name || row.Business || "";
    const url = row.business_url || row.url || row.URL || "";
    const ratingRaw = row.rating || row.Rating || row.stars || "";
    const reviewText = row.review_text || row.review || row.Review || row.text || "";
    const date = row.date || row.Date || "";

    if (!name) return;
    const ratingNum = RATING_MAP[ratingRaw] || RATING_MAP[String(ratingRaw).trim()] || null;
    if (!ratingNum) return;

    if (!businesses[name]) {
      businesses[name] = { name, url, reviews: [], negReviews: [] };
    }
    businesses[name].reviews.push({ ratingNum, reviewText, date });
    if (ratingNum <= 2 && reviewText) {
      businesses[name].negReviews.push({ ratingNum, reviewText, date });
      globalNeg.push({ text: reviewText, ratingNum });
    }
  });

  const bizStats = {};
  Object.entries(businesses).forEach(([name, biz]) => {
    const total = biz.reviews.length;
    if (total < 3) return;

    const ratings = biz.reviews.map(r => r.ratingNum);
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    ratings.forEach(r => dist[r]++);

    const negCount = biz.negReviews.length;
    const negPct = (negCount / total) * 100;

    // Auto-detect business type
    const bizType = detectBizType(name, biz.reviews);
    const painCategories = PAIN_CATEGORIES_BY_TYPE[bizType] || PAIN_CATEGORIES_BY_TYPE.generic;
    const trustAdvice = TRUST_ADVICE_BY_TYPE[bizType] || TRUST_ADVICE_BY_TYPE.generic;

    const painCats = {};
    const painQuotes = {};
    const painSubs = {};

    Object.entries(painCategories).forEach(([catKey, cat]) => {
      let count = 0;
      const quotes = [];
      const subCounts = {};

      biz.negReviews.forEach(({ reviewText, ratingNum }) => {
        const lower = reviewText.toLowerCase();
        const hit = cat.keywords.some(kw => lower.includes(kw));
        if (hit) {
          count++;
          if (quotes.length < 4) quotes.push({ text: reviewText.slice(0, 220), rating: ratingNum });
          Object.entries(cat.sub || {}).forEach(([subLabel, subKws]) => {
            if (subKws.some(kw => lower.includes(kw))) {
              subCounts[subLabel] = (subCounts[subLabel] || 0) + 1;
            }
          });
        }
      });

      painCats[catKey] = count;
      painQuotes[catKey] = quotes;
      painSubs[catKey] = subCounts;
    });

    const posPct = ((dist[4] + dist[5]) / total) * 100;
    const neuPct = (dist[3] / total) * 100;

    const topPains = Object.entries(painCats)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, count]) => ({ key, count, pct: negCount > 0 ? (count / negCount * 100) : 0 }));

    bizStats[name] = {
      name, url: biz.url, total,
      avg: Math.round(avg * 100) / 100,
      dist, negCount,
      negPct: Math.round(negPct * 10) / 10,
      posPct: Math.round(posPct * 10) / 10,
      neuPct: Math.round(neuPct * 10) / 10,
      painCats, painQuotes, painSubs, topPains,
      bizType, painCategories, trustAdvice,
    };
  });

  const allStats = Object.values(bizStats);
  const globalAvgRating = allStats.reduce((a, b) => a + b.avg, 0) / allStats.length;
  const globalAvgNegPct = allStats.reduce((a, b) => a + b.negPct, 0) / allStats.length;

  const globalPainTotals = {};
  let globalNegTotal = 0;
  Object.values(bizStats).forEach(biz => {
    globalNegTotal += biz.negCount;
    Object.entries(biz.painCats).forEach(([k, v]) => {
      globalPainTotals[k] = (globalPainTotals[k] || 0) + v;
    });
  });

  const globalPainPcts = {};
  Object.entries(globalPainTotals).forEach(([k, v]) => {
    globalPainPcts[k] = globalNegTotal > 0 ? (v / globalNegTotal * 100) : 0;
  });

  return {
    businesses: bizStats,
    businessNames: Object.keys(bizStats).sort(),
    totalBusinesses: Object.keys(bizStats).length,
    totalReviews: rows.length,
    globalAvgRating: Math.round(globalAvgRating * 100) / 100,
    globalAvgNegPct: Math.round(globalAvgNegPct * 10) / 10,
    globalPainPcts,
  };
}
