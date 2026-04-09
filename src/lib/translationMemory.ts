import localforage from 'localforage';
import largeDictionary from './largeDictionary.json';
import rareDictionary from './rareDictionary.json';

// A small basic dictionary for common words to fallback on
export const basicDictionary: Record<string, string> = {
  "the": "টি", "be": "হওয়া", "to": "দিকে", "of": "এর", "and": "এবং", "a": "একটি", "in": "ভিতরে", "that": "যে", "have": "আছে", "i": "আমি", "it": "এটি", "for": "জন্য", "not": "না", "on": "উপরে", "with": "সাথে", "he": "সে", "as": "হিসাবে", "you": "তুমি", "do": "করা", "at": "তে", "this": "এই", "but": "কিন্তু", "his": "তার", "by": "দ্বারা", "from": "থেকে", "they": "তারা", "we": "আমরা", "say": "বলা", "her": "তার", "she": "সে", "or": "অথবা", "an": "একটি", "will": "ইচ্ছা", "my": "আমার", "one": "এক", "all": "সব", "would": "হবে", "there": "সেখানে", "their": "তাদের", "what": "কি", "so": "তাই", "up": "উপরে", "out": "বাহিরে", "if": "যদি", "about": "সম্পর্কে", "who": "কে", "get": "পাওয়া", "which": "কোনটি", "go": "যাওয়া", "me": "আমাকে", "when": "কখন", "make": "তৈরি করা", "can": "পারা", "like": "পছন্দ", "time": "সময়", "no": "না", "just": "শুধু", "him": "তাকে", "know": "জানা", "take": "নেওয়া", "people": "মানুষ", "into": "ভিতরে", "year": "বছর", "your": "তোমার", "good": "ভাল", "some": "কিছু", "could": "পারত", "them": "তাদের", "see": "দেখা", "other": "অন্যান্য", "than": "চেয়ে", "then": "তারপর", "now": "এখন", "look": "তাকানো", "only": "শুধুমাত্র", "come": "আসা", "its": "এর", "over": "উপরে", "think": "চিন্তা করা", "also": "এছাড়াও", "back": "পিছনে", "after": "পরে", "use": "ব্যবহার করা", "two": "দুই", "how": "কিভাবে", "our": "আমাদের", "work": "কাজ", "first": "প্রথম", "well": "ভাল", "way": "উপায়", "even": "এমনকি", "new": "নতুন", "want": "চাওয়া", "because": "কারণ", "any": "যেকোনো", "these": "এইগুলো", "give": "দেওয়া", "day": "দিন", "most": "সবচেয়ে", "us": "আমাদের",
  "hello": "হ্যালো", "world": "বিশ্ব", "book": "বই", "page": "পৃষ্ঠা", "read": "পড়া", "write": "লেখা", "translate": "অনুবাদ করা", "language": "ভাষা", "english": "ইংরেজি", "bengali": "বাংলা", "offline": "অফলাইন", "online": "অনলাইন", "memory": "স্মৃতি", "word": "শব্দ", "sentence": "বাক্য", "paragraph": "অনুচ্ছেদ", "text": "পাঠ্য", "image": "ছবি", "camera": "ক্যামেরা", "capture": "ধারণ করা", "save": "সংরক্ষণ করা", "delete": "মুছে ফেলা", "share": "শেয়ার করা", "download": "ডাউনলোড করা", "settings": "সেটিংস", "theme": "থিম", "light": "হালকা", "dark": "অন্ধকার", "zoom": "জুম", "layout": "লেআউট", "single": "একক", "facing": "মুখোমুখি", "dashboard": "ড্যাশবোর্ড", "library": "লাইব্রেরি", "open": "খোলা", "close": "বন্ধ করা", "cancel": "বাতিল করা", "confirm": "নিশ্চিত করা", "yes": "হ্যাঁ", "ok": "ঠিক আছে", "error": "ত্রুটি", "success": "সফলতা", "loading": "লোড হচ্ছে", "processing": "প্রক্রিয়াকরণ", "translating": "অনুবাদ করা হচ্ছে", "waiting": "অপেক্ষা করা হচ্ছে", "retry": "পুনরায় চেষ্টা করুন", "failed": "ব্যর্থ হয়েছে", "completed": "সম্পন্ন হয়েছে", "started": "শুরু হয়েছে", "paused": "স্থগিত করা হয়েছে", "resumed": "পুনরায় শুরু হয়েছে", "queued": "সারিবদ্ধ করা হয়েছে", "offline_queued": "অফলাইনে সারিবদ্ধ করা হয়েছে", "already_translated": "ইতিমধ্যে অনুবাদ করা হয়েছে", "already_translating": "ইতিমধ্যে অনুবাদ করা হচ্ছে", "no_pdf": "কোনো পিডিএফ নেই", "no_text": "কোনো পাঠ্য নেই", "no_image": "কোনো ছবি নেই", "no_camera": "কোনো ক্যামেরা নেই", "no_permission": "কোনো অনুমতি নেই", "no_network": "কোনো নেটওয়ার্ক নেই", "no_quota": "কোনো কোটা নেই", "rate_limit": "হার সীমা", "exceeded": "অতিক্রম করেছে", "please": "দয়া করে", "wait": "অপেক্ষা করুন", "while": "যখন", "before": "আগে", "more": "আরও", "pages": "পৃষ্ঠাগুলি", "check": "চেক করুন", "plan": "পরিকল্পনা", "billing": "বিলিং", "details": "বিবরণ", "information": "তথ্য", "head": "মাথা", "monitor": "মনিটর", "current": "বর্তমান", "usage": "ব্যবহার", "exceeded_quota": "কোটা অতিক্রম করেছে", "resource_exhausted": "সম্পদ শেষ হয়ে গেছে",
  "is": "হয়", "am": "হই", "are": "হও", "was": "ছিল", "were": "ছিল", "been": "হয়েছে", "being": "হচ্ছে",
  "has": "আছে", "had": "ছিল", "did": "করেছিল", "done": "করা হয়েছে",
  "eat": "খাওয়া", "eats": "খায়", "ate": "খেয়েছিল", "eating": "খাচ্ছে",
  "went": "গিয়েছিল", "gone": "গেছে", "going": "যাচ্ছে",
  "reads": "পড়ে", "reading": "পড়ছে",
  "writes": "লেখে", "wrote": "লিখেছিল", "written": "লেখা হয়েছে", "writing": "লিখছে",
  "play": "খেলা", "plays": "খেলে", "played": "খেলেছিল", "playing": "খেলছে",
  "saw": "দেখেছিল", "seen": "দেখা হয়েছে", "seeing": "দেখছে",
  "made": "তৈরি করেছিল", "making": "তৈরি করছে",
  "took": "নিয়েছিল", "taken": "নেওয়া হয়েছে", "taking": "নিচ্ছে",
  "came": "এসেছিল", "coming": "আসছে",
  "knew": "জানত", "known": "পরিচিত", "knowing": "জানছে",
  "thought": "ভেবেছিল", "thinking": "ভাবছে",
  "looked": "তাকিয়েছিল", "looking": "তাকাচ্ছে",
  "wanted": "চেয়েছিল", "wanting": "চায়",
  "everyone": "সবাই", "someone": "কেউ", "anyone": "যে কেউ", "no one": "কেউ না", "nobody": "কেউ না", "everything": "সবকিছু", "something": "কিছু", "anything": "যেকোনো কিছু", "nothing": "কিছুই না",
  "everywhere": "সব জায়গায়", "somewhere": "কোথাও", "anywhere": "যেকোনো জায়গায়", "nowhere": "কোথাও না",
  "beautiful": "সুন্দর", "ugly": "কুৎসিত", "happy": "সুখী", "sad": "দুঃখিত", "angry": "রাগান্বিত", "tired": "ক্লান্ত", "hungry": "ক্ষুধার্ত", "thirsty": "তৃষ্ণার্ত",
  "big": "বড়", "small": "ছোট", "tall": "লম্বা", "short": "খাটো", "long": "দীর্ঘ", "wide": "প্রশস্ত", "narrow": "সংকীর্ণ", "thick": "পুরু", "thin": "পাতলা",
  "hot": "গরম", "cold": "ঠান্ডা", "warm": "উষ্ণ", "cool": "শীতল", "wet": "ভিজা", "dry": "শুকনো", "clean": "পরিষ্কার", "dirty": "নোংরা",
  "fast": "দ্রুত", "slow": "ধীর", "early": "তাড়াতাড়ি", "late": "দেরি", "hard": "কঠিন", "soft": "নরম", "easy": "সহজ", "difficult": "কঠিন",
  "bad": "খারাপ", "right": "সঠিক", "wrong": "ভুল", "true": "সত্য", "false": "মিথ্যা", "important": "গুরুত্বপূর্ণ", "necessary": "প্রয়োজনীয়",
  "possible": "সম্ভব", "impossible": "অসম্ভব", "certain": "নিশ্চিত", "uncertain": "অনিশ্চিত", "clear": "স্পষ্ট", "unclear": "অস্পষ্ট",
  "closed": "বন্ধ", "full": "পূর্ণ", "empty": "খালি", "heavy": "ভারী", "strong": "শক্তিশালী", "weak": "দুর্বল",
  "young": "তরুণ", "old": "পুরানো", "recent": "সাম্প্রতিক", "present": "বর্তমান", "future": "ভবিষ্যত",
  "system": "সিস্টেম", "computer": "কম্পিউটার", "software": "সফটওয়্যার", "hardware": "হার্ডওয়্যার", "network": "নেটওয়ার্ক", "internet": "ইন্টারনেট", "website": "ওয়েবসাইট",
  "data": "উপাত্ত", "knowledge": "জ্ঞান", "science": "বিজ্ঞান", "technology": "প্রযুক্তি", "engineering": "প্রকৌশল", "mathematics": "গণিত",
  "history": "ইতিহাস", "geography": "ভূগোল", "literature": "সাহিত্য", "art": "শিল্প", "music": "সঙ্গীত", "culture": "সংস্কৃতি", "religion": "ধর্ম",
  "politics": "রাজনীতি", "economy": "অর্থনীতি", "business": "ব্যবসা", "market": "বাজার", "money": "টাকা", "price": "দাম", "value": "মূল্য",
  "gave": "দিয়েছিল", "given": "দেওয়া হয়েছে", "giving": "দিচ্ছে",
  "used": "ব্যবহার করেছিল", "using": "ব্যবহার করছে",
  "find": "খোঁজা", "finds": "খোঁজে", "found": "খুঁজে পেয়েছিল", "finding": "খুঁজছে",
  "tell": "বলা", "tells": "বলে", "told": "বলেছিল", "telling": "বলছে",
  "ask": "জিজ্ঞাসা করা", "asks": "জিজ্ঞাসা করে", "asked": "জিজ্ঞাসা করেছিল", "asking": "জিজ্ঞাসা করছে",
  "worked": "কাজ করেছিল", "working": "কাজ করছে",
  "understand": "বোঝা", "understands": "বোঝে", "understood": "বুঝেছিল", "understanding": "বুঝছে",
  "speak": "কথা বলা", "speaks": "কথা বলে", "spoke": "কথা বলেছিল", "spoken": "কথা বলা হয়েছে", "speaking": "কথা বলছে",
  "learn": "শেখা", "learns": "শেখে", "learned": "শিখেছিল", "learning": "শিখছে",
  "teach": "শেখানো", "teaches": "শেখায়", "taught": "শিখিয়েছিল", "teaching": "শেখাচ্ছে",
  "buy": "কেনা", "buys": "কেনে", "bought": "কিনেছিল", "buying": "কিনছে",
  "sell": "বিক্রি করা", "sells": "বিক্রি করে", "sold": "বিক্রি করেছিল", "selling": "বিক্রি করছে",
  "bring": "আনা", "brings": "আনে", "brought": "এনেছিল", "bringing": "আনছে",
  "build": "নির্মাণ করা", "builds": "নির্মাণ করে", "built": "নির্মাণ করেছিল", "building": "নির্মাণ করছে",
  "break": "ভাঙ্গা", "breaks": "ভাঙ্গে", "broke": "ভেঙ্গেছিল", "broken": "ভাঙ্গা হয়েছে", "breaking": "ভাঙছে",
  "catch": "ধরা", "catches": "ধরে", "caught": "ধরেছিল", "catching": "ধরছে",
  "choose": "বেছে নেওয়া", "chooses": "বেছে নেয়", "chose": "বেছে নিয়েছিল", "chosen": "বেছে নেওয়া হয়েছে", "choosing": "বেছে নিচ্ছে",
  "draw": "আঁকা", "draws": "আঁকে", "drew": "এঁকেছিল", "drawn": "আঁকা হয়েছে", "drawing": "আঁকছে",
  "drink": "পান করা", "drinks": "পান করে", "drank": "পান করেছিল", "drunk": "পান করা হয়েছে", "drinking": "পান করছে",
  "drive": "চালানো", "drives": "চালায়", "drove": "চালিয়েছিল", "driven": "চালানো হয়েছে", "driving": "চালাচ্ছে",
  "fall": "পড়া", "falls": "পড়ে", "fell": "পড়েছিল", "fallen": "পড়েছে", "falling": "পড়ছে",
  "fly": "ওড়া", "flies": "ওড়ে", "flew": "উড়েছিল", "flown": "উড়েছে", "flying": "উড়ছে",
  "forget": "ভুলে যাওয়া", "forgets": "ভুলে যায়", "forgot": "ভুলে গিয়েছিল", "forgotten": "ভুলে গেছে", "forgetting": "ভুলে যাচ্ছে",
  "gets": "পায়", "got": "পেয়েছিল", "gotten": "পেয়েছে", "getting": "পাচ্ছে",
  "grow": "বৃদ্ধি পাওয়া", "grows": "বৃদ্ধি পায়", "grew": "বৃদ্ধি পেয়েছিল", "grown": "বৃদ্ধি পেয়েছে", "growing": "বৃদ্ধি পাচ্ছে",
  "hear": "শোনা", "hears": "শোনে", "heard": "শুনেছিল", "hearing": "শুনছে",
  "hide": "লুকানো", "hides": "লুকায়", "hid": "লুকিয়েছিল", "hidden": "লুকানো হয়েছে", "hiding": "লুকাচ্ছে",
  "hit": "আঘাত করা", "hits": "আঘাত করে", "hitting": "আঘাত করছে",
  "hold": "ধরে রাখা", "holds": "ধরে রাখে", "held": "ধরে রেখেছিল", "holding": "ধরে রাখছে",
  "keep": "রাখা", "keeps": "রাখে", "kept": "রেখেছিল", "keeping": "রাখছে",
  "lose": "হারানো", "loses": "হারায়", "lost": "হারিয়েছিল", "losing": "হারাচ্ছে",
  "mean": "অর্থ", "means": "অর্থ", "meant": "অর্থ ছিল", "meaning": "অর্থ",
  "meet": "দেখা করা", "meets": "দেখা করে", "met": "দেখা করেছিল", "meeting": "দেখা করছে",
  "pay": "পরিশোধ করা", "pays": "পরিশোধ করে", "paid": "পরিশোধ করেছিল", "paying": "পরিশোধ করছে",
  "put": "রাখা", "puts": "রাখে", "putting": "রাখছে",
  "run": "দৌড়ানো", "runs": "দৌড়ায়", "ran": "দৌড়েছিল", "running": "দৌড়াচ্ছে",
  "send": "পাঠানো", "sends": "পাঠায়", "sent": "পাঠিয়েছিল", "sending": "পাঠাচ্ছে",
  "sit": "বসা", "sits": "বসে", "sat": "বসেছিল", "sitting": "বসছে",
  "sleep": "ঘুমানো", "sleeps": "ঘুমায়", "slept": "ঘুমিয়েছিল", "sleeping": "ঘুমাচ্ছে",
  "spend": "ব্যয় করা", "spends": "ব্যয় করে", "spent": "ব্যয় করেছিল", "spending": "ব্যয় করছে",
  "stand": "দাঁড়ানো", "stands": "দাঁড়ায়", "stood": "দাঁড়িয়েছিল", "standing": "দাঁড়াচ্ছে",
  "swim": "সাঁতার কাটা", "swims": "সাঁতার কাটে", "swam": "সাঁতার কেটেছিল", "swum": "সাঁতার কেটেছে", "swimming": "সাঁতার কাটছে",
  "takes": "নেয়",
  "throw": "ছুঁড়ে মারা", "throws": "ছুঁড়ে মারে", "threw": "ছুঁড়ে মেরেছিল", "thrown": "ছুঁড়ে মারা হয়েছে", "throwing": "ছুঁড়ে মারছে",
  "wake": "জাগা", "wakes": "জাগে", "woke": "জেগেছিল", "woken": "জেগেছে", "waking": "জাগছে",
  "wear": "পরিধান করা", "wears": "পরিধান করে", "wore": "পরিধান করেছিল", "worn": "পরিধান করা হয়েছে", "wearing": "পরিধান করছে",
  "win": "জেতা", "wins": "জেতে", "won": "জিতেছিল", "winning": "জিতছে",
  "seem": "মনে হওয়া", "seems": "মনে হয়", "seemed": "মনে হয়েছিল", "seeming": "মনে হচ্ছে",
  "feel": "অনুভব করা", "feels": "অনুভব করে", "felt": "অনুভব করেছিল", "feeling": "অনুভব করছে",
  "try": "চেষ্টা করা", "tries": "চেষ্টা করে", "tried": "চেষ্টা করেছিল", "trying": "চেষ্টা করছে",
  "leave": "ছেড়ে যাওয়া", "leaves": "ছেড়ে যায়", "left": "ছেড়ে গিয়েছিল", "leaving": "ছেড়ে যাচ্ছে",
  "call": "ডাকা", "calls": "ডাকে", "called": "ডেকেছিল", "calling": "ডাকছে",
  "love": "ভালোবাসা", "loves": "ভালোবাসে", "loved": "বেসেছিল", "loving": "বাসছে",
  "liked": "পছন্দ করেছিল", "liking": "পছন্দ করছে",
  "shall": "করব", "should": "উচিত", "may": "হতে পারে", "might": "হতে পারত", "must": "অবশ্যই",
  "very": "খুব", "really": "সত্যিই", "always": "সবসময়", "never": "কখনো না", "sometimes": "মাঝে মাঝে",
  "often": "প্রায়ই", "usually": "সাধারণত", "already": "ইতিমধ্যে", "yet": "এখনও", "still": "এখনও",
  "here": "এখানে", "where": "কোথায়", "why": "কেন",
  "whom": "কাকে", "whose": "কার",
  "those": "ওইগুলো",
  "nor": "না", "although": "যদিও", "since": "যেহেতু", "unless": "যদি না", "until": "যতক্ষণ না",
  "during": "সময়", "without": "ছাড়া", "within": "মধ্যে", "along": "বরাবর",
  "across": "পারাপার", "behind": "পিছনে", "beyond": "পাড়ে", "except": "ব্যতীত", "near": "কাছে", "off": "বন্ধ",
  "past": "অতীত", "down": "নিচে", "around": "চারপাশে",
  "mine": "আমার", "myself": "আমি নিজে",
  "ours": "আমাদের", "ourselves": "আমরা নিজেরা",
  "yours": "তোমার", "yourself": "তুমি নিজে", "yourselves": "তোমরা নিজেরা",
  "himself": "সে নিজে",
  "hers": "তার", "herself": "সে নিজে",
  "itself": "এটি নিজে",
  "theirs": "তাদের", "themselves": "তারা নিজেরা",
  "don't": "না", "doesn't": "না", "didn't": "না", "can't": "পারি না", "couldn't": "পারিনি", "won't": "করব না", "wouldn't": "করতাম না",
  "isn't": "নয়", "aren't": "নয়", "wasn't": "ছিল না", "weren't": "ছিল না", "haven't": "নেই", "hasn't": "নেই", "hadn't": "ছিল না",
  "shouldn't": "উচিত নয়", "mustn't": "অবশ্যই না",
  "dont": "না", "doesnt": "না", "didnt": "না", "cant": "পারি না", "couldnt": "পারিনি", "wont": "করব না", "wouldnt": "করতাম না",
  "isnt": "নয়", "arent": "নয়", "wasnt": "ছিল না", "werent": "ছিল না", "havent": "নেই", "hasnt": "নেই", "hadnt": "ছিল না",
  "shouldnt": "উচিত নয়", "mustnt": "অবশ্যই না",
  // Complex and Academic Words
  "comprehensive": "ব্যাপক", "significant": "উল্লেখযোগ্য", "fundamental": "মৌলিক", "perspective": "দৃষ্টিভঙ্গি", "consequence": "পরিণতি",
  "implementation": "বাস্তবায়ন", "framework": "কাঠামো", "hypothesis": "অনুমান", "empirical": "অভিজ্ঞতামূলক", "theoretical": "তাত্ত্বিক",
  "analysis": "বিশ্লেষণ", "synthesis": "সংশ্লেষণ", "methodology": "পদ্ধতি", "paradigm": "দৃষ্টান্ত", "infrastructure": "অবকাঠামো",
  "sustainability": "স্থায়িত্ব", "innovation": "উদ্ভাবন", "collaboration": "সহযোগিতা", "diversity": "বৈচিত্র্য", "integration": "একীকরণ",
  "optimization": "অপ্টিমাইজেশন", "efficiency": "দক্ষতা", "effectiveness": "কার্যকারিতা", "strategic": "কৌশলগত", "operational": "কার্যকরী",
  "complexity": "জটিলতা", "simplicity": "সরলতা", "ambiguity": "অস্পষ্টতা", "clarity": "স্পষ্টতা", "precision": "নির্ভুলতা",
  "resilience": "স্থিতিস্থাপকতা", "vulnerability": "ঝুঁকি", "mitigation": "প্রশমন", "adaptation": "অভিযোজন", "transformation": "রূপান্তর",
  "governance": "শাসন", "accountability": "জবাবদিহিতা", "transparency": "স্বচ্ছতা", "integrity": "অখণ্ডতা", "ethics": "নীতিশাস্ত্র",
  "philosophy": "দর্শন", "psychology": "মনোবিজ্ঞান", "sociology": "সমাজবিজ্ঞান", "anthropology": "নৃবিজ্ঞান", "economics": "অর্থনীতি",
  "phenomenon": "ঘটনা", "criterion": "মানদণ্ড", "mechanism": "কৌশল", "component": "উপাদান", "variable": "পরিবর্তনশীল"
};

const extendedDictionary = { ...(largeDictionary as Record<string, string>), ...(rareDictionary as Record<string, string>) };

export const saveToMemory = async (english: string, bengali: string) => {
  try {
    const memory = await localforage.getItem<Record<string, string>>('translation_memory') || {};
    memory[english.toLowerCase().trim()] = bengali.trim();
    await localforage.setItem('translation_memory', memory);
  } catch (e) {
    console.error("Failed to save to translation memory", e);
  }
};

export const getAllSavedWords = async (): Promise<Record<string, string>> => {
  try {
    return await localforage.getItem<Record<string, string>>('translation_memory') || {};
  } catch (e) {
    console.error("Failed to get translation memory", e);
    return {};
  }
};

export const deleteFromMemory = async (english: string) => {
  try {
    const memory = await localforage.getItem<Record<string, string>>('translation_memory') || {};
    delete memory[english.toLowerCase().trim()];
    await localforage.setItem('translation_memory', memory);
  } catch (e) {
    console.error("Failed to delete from translation memory", e);
  }
};

export const getFromMemory = async (english: string, cachedMemory?: Record<string, string>): Promise<string | null> => {
  try {
    const memory = cachedMemory || await localforage.getItem<Record<string, string>>('translation_memory') || {};
    const word = english.toLowerCase().trim();
    
    if (memory[word]) return memory[word];
    if (basicDictionary[word]) return basicDictionary[word];
    if (extendedDictionary[word]) return extendedDictionary[word];

    // Morphological Fallbacks
    if (word.endsWith('s') && word.length > 3) {
      const singular = word.slice(0, -1);
      const translatedSingular = memory[singular] || basicDictionary[singular] || extendedDictionary[singular];
      if (translatedSingular) return translatedSingular + "গুলো";
      
      if (word.endsWith('es')) {
        const singularEs = word.slice(0, -2);
        const translatedSingularEs = memory[singularEs] || basicDictionary[singularEs] || extendedDictionary[singularEs];
        if (translatedSingularEs) return translatedSingularEs + "গুলো";
      }
    }

    if (word.endsWith('ing') && word.length > 4) {
      const base = word.slice(0, -3);
      const baseE = base + 'e';
      const translatedBase = memory[base] || basicDictionary[base] || extendedDictionary[base] || 
                             memory[baseE] || basicDictionary[baseE] || extendedDictionary[baseE];
      if (translatedBase) return translatedBase + "ছে";
    }

    if (word.endsWith('ed') && word.length > 3) {
      const base = word.slice(0, -2);
      const baseD = word.slice(0, -1);
      const translatedBase = memory[base] || basicDictionary[base] || extendedDictionary[base] ||
                             memory[baseD] || basicDictionary[baseD] || extendedDictionary[baseD];
      if (translatedBase) return translatedBase + "ছিল";
    }

    if (word.endsWith('ly') && word.length > 3) {
      const base = word.slice(0, -2);
      const translatedBase = memory[base] || basicDictionary[base] || extendedDictionary[base];
      if (translatedBase) return "ভাবে " + translatedBase;
    }

    return null;
  } catch (e) {
    console.error("Failed to get from translation memory", e);
    const word = english.toLowerCase().trim();
    return basicDictionary[word] || extendedDictionary[word] || null;
  }
};

const levenshteinDistance = (a: string, b: string): number => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
      else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
    }
  }
  return matrix[b.length][a.length];
};

export const getSuggestionsFromMemory = async (prefix: string, limit: number = 5): Promise<{english: string, bengali: string, isCorrection?: boolean}[]> => {
  try {
    const memory = await localforage.getItem<Record<string, string>>('translation_memory') || {};
    const wordPrefix = prefix.toLowerCase().trim();
    if (!wordPrefix) return [];

    const suggestions: {english: string, bengali: string, isCorrection?: boolean}[] = [];
    const addSuggestion = (eng: string, ben: string, isCorrection: boolean = false) => {
      if (suggestions.length < limit && !suggestions.some(s => s.english === eng)) {
        suggestions.push({ english: eng, bengali: ben, isCorrection });
      }
    };

    for (const eng in memory) {
      if (eng.startsWith(wordPrefix)) addSuggestion(eng, memory[eng]);
      if (suggestions.length >= limit) return suggestions;
    }
    for (const eng in basicDictionary) {
      if (eng.startsWith(wordPrefix)) addSuggestion(eng, basicDictionary[eng]);
      if (suggestions.length >= limit) return suggestions;
    }
    for (const eng in extendedDictionary) {
      if (eng.startsWith(wordPrefix)) addSuggestion(eng, extendedDictionary[eng]);
      if (suggestions.length >= limit) return suggestions;
    }

    if (suggestions.length < limit && wordPrefix.length >= 3) {
      const firstChar = wordPrefix[0];
      const queryLen = wordPrefix.length;
      const maxDist = queryLen >= 5 ? 2 : 1;

      const checkCorrections = (dict: Record<string, string>) => {
        for (const eng in dict) {
          if (eng[0] === firstChar && Math.abs(eng.length - queryLen) <= 2) {
            const dist = levenshteinDistance(wordPrefix, eng);
            if (dist > 0 && dist <= maxDist) {
              addSuggestion(eng, dict[eng], true);
              if (suggestions.length >= limit) return true;
            }
          }
        }
        return false;
      };

      if (checkCorrections(memory)) return suggestions;
      if (checkCorrections(basicDictionary)) return suggestions;
      checkCorrections(extendedDictionary);
    }
    return suggestions;
  } catch (e) {
    console.error("Failed to get suggestions", e);
    return [];
  }
};

const commonVerbs = new Set([
  "is", "am", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "done",
  "eat", "eats", "ate", "eating", "go", "goes", "went", "gone", "going",
  "read", "reads", "reading", "write", "writes", "wrote", "written", "writing",
  "play", "plays", "played", "playing", "see", "sees", "saw", "seen", "seeing",
  "make", "makes", "made", "making", "take", "takes", "took", "taken", "taking",
  "come", "comes", "came", "coming", "know", "knows", "knew", "known", "knowing",
  "think", "thinks", "thought", "thinking", "look", "looks", "looked", "looking",
  "want", "wants", "wanted", "wanting", "give", "gives", "gave", "given", "giving",
  "use", "uses", "used", "using", "find", "finds", "found", "finding",
  "tell", "tells", "told", "telling", "ask", "asks", "asked", "asking",
  "work", "works", "worked", "working", "seem", "seems", "seemed", "seeming",
  "feel", "feels", "felt", "feeling", "try", "tries", "tried", "trying",
  "leave", "leaves", "left", "leaving", "call", "calls", "called", "calling",
  "love", "loves", "loved", "loving", "like", "likes", "liked", "liking",
  "understand", "understands", "understood", "understanding",
  "speak", "speaks", "spoke", "spoken", "speaking",
  "learn", "learns", "learned", "learning", "teach", "teaches", "taught", "teaching",
  "buy", "buys", "bought", "buying", "sell", "sells", "sold", "selling",
  "bring", "brings", "brought", "bringing", "build", "builds", "built", "building",
  "break", "breaks", "broke", "broken", "breaking", "catch", "catches", "caught", "catching",
  "choose", "chooses", "chose", "chosen", "choosing", "draw", "draws", "drew", "drawn", "drawing",
  "drink", "drinks", "drank", "drunk", "drinking", "drive", "drives", "drove", "driven", "driving",
  "fall", "falls", "fell", "fallen", "falling", "fly", "flies", "flew", "flown", "flying",
  "forget", "forgets", "forgot", "forgotten", "forgetting", "get", "gets", "got", "gotten", "getting",
  "grow", "grows", "grew", "grown", "growing", "hear", "hears", "heard", "hearing",
  "hide", "hides", "hid", "hidden", "hiding", "hit", "hits", "hitting",
  "hold", "holds", "held", "holding", "keep", "keeps", "kept", "keeping",
  "lose", "loses", "lost", "losing", "mean", "means", "meant", "meaning",
  "meet", "meets", "met", "meeting", "pay", "pays", "paid", "paying",
  "put", "puts", "putting", "run", "runs", "ran", "running",
  "send", "sends", "sent", "sending", "sit", "sits", "sat", "sitting",
  "sleep", "sleeps", "slept", "sleeping", "spend", "spends", "spent", "spending",
  "stand", "stands", "stood", "standing", "swim", "swims", "swam", "swum", "swimming",
  "throw", "throws", "threw", "thrown", "throwing", "wake", "wakes", "woke", "woken", "waking",
  "wear", "wears", "wore", "worn", "wearing", "win", "wins", "won", "winning",
  "can", "could", "will", "would", "shall", "should", "may", "might", "must",
  "dont", "doesnt", "didnt", "cant", "couldnt", "wont", "wouldnt",
  "isnt", "arent", "wasnt", "werent", "havent", "hasnt", "hadnt",
  "shouldnt", "mustnt"
]);

const prepositions = new Set([
  "in", "on", "at", "to", "from", "with", "by", "about", "for", "of", "into", "over", "under", "between", "through", "after", "before", "without", "within", "during"
]);

const timeWords = new Set([
  "today", "tomorrow", "yesterday", "now", "then", "always", "never", "often", "sometimes", "usually", "soon", "later", "early", "late", "tonight", "morning", "afternoon", "evening", "night"
]);

const placeWords = new Set([
  "here", "there", "everywhere", "nowhere", "somewhere", "anywhere", "home", "away", "out", "inside", "outside", "upstairs", "downstairs"
]);

const reorderSentence = (sentence: string): string[] => {
  const clauses = sentence.split(/([,;:\.\!\?]+)/);
  let finalReordered: string[] = [];
  for (let c of clauses) {
    if (c.match(/[,;:\.\!\?]+/)) {
      finalReordered.push(c.trim());
      continue;
    }
    const words = c.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length <= 2) {
      finalReordered.push(...words);
      continue;
    }
    let subject: string[] = [];
    let verbPhrase: string[] = [];
    let object: string[] = [];
    let timePhrase: string[] = [];
    let placePhrase: string[] = [];
    let currentPart = 'subject';
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const cleanWord = word.replace(/[^a-zA-Z]/g, '').toLowerCase();
        if (commonVerbs.has(cleanWord)) {
            currentPart = 'verb';
            verbPhrase.push(word);
        } else if (currentPart === 'verb') {
            const isAdverb = ["not", "always", "never", "just", "already", "really", "very", "often", "still"].includes(cleanWord);
            if (isAdverb) verbPhrase.push(word);
            else {
                currentPart = 'object';
                if (timeWords.has(cleanWord)) timePhrase.push(word);
                else if (placeWords.has(cleanWord)) placePhrase.push(word);
                else object.push(word);
            }
        } else if (currentPart === 'subject') subject.push(word);
        else {
            if (timeWords.has(cleanWord)) timePhrase.push(word);
            else if (placeWords.has(cleanWord)) placePhrase.push(word);
            else object.push(word);
        }
    }
    let reordered: string[] = [...subject, ...timePhrase, ...placePhrase, ...object, ...verbPhrase];
    for (let i = 0; i < reordered.length - 1; i++) {
      const cleanWord = reordered[i].replace(/[^a-zA-Z]/g, '').toLowerCase();
      if (prepositions.has(cleanWord)) {
        let npEnd = i + 1;
        while (npEnd < reordered.length) {
            const nextClean = reordered[npEnd].replace(/[^a-zA-Z]/g, '').toLowerCase();
            if (prepositions.has(nextClean) || commonVerbs.has(nextClean)) break;
            npEnd++;
        }
        if (npEnd > i + 1) {
            const prep = reordered[i];
            reordered.splice(i, 1);
            reordered.splice(npEnd - 1, 0, prep);
            i = npEnd - 1;
        }
      }
    }
    finalReordered.push(...reordered);
  }
  return finalReordered;
};

const transliterateToBengali = (word: string): string => {
  const rules: [RegExp, string][] = [
    [/tion/g, 'শন'], [/sion/g, 'শন'], [/ture/g, 'চার'],
    [/sh/g, 'শ'], [/ch/g, 'চ'], [/th/g, 'থ'], [/ph/g, 'ফ'], [/gh/g, 'ঘ'], [/kh/g, 'খ'], [/dh/g, 'ধ'], [/bh/g, 'ভ'], [/zh/g, 'ঝ'], [/ng/g, 'ং'],
    [/ee/g, 'ী'], [/oo/g, 'ু'], [/ou/g, 'াউ'], [/oi/g, 'য়ি'], [/au/g, 'অউ'],
    [/a/g, 'া'], [/b/g, 'ব'], [/c/g, 'ক'], [/d/g, 'ড'], [/e/g, 'ে'], [/f/g, 'ফ'], [/g/g, 'গ'], [/h/g, 'হ'], [/i/g, 'ি'], [/j/g, 'জ'], [/k/g, 'ক'], [/l/g, 'ল'], [/m/g, 'ম'], [/n/g, 'ন'], [/o/g, 'ো'], [/p/g, 'প'], [/q/g, 'ক'], [/r/g, 'র'], [/s/g, 'স'], [/t/g, 'ট'], [/u/g, 'ু'], [/v/g, 'ভ'], [/w/g, 'ওয়'], [/x/g, 'ক্স'], [/y/g, 'য়'], [/z/g, 'জ'],
  ];
  let result = word.toLowerCase();
  const firstCharMap: Record<string, string> = { 'a': 'অ', 'e': 'এ', 'i': 'ই', 'o': 'ও', 'u': 'উ' };
  let isFirstVowel = !!firstCharMap[result[0]];
  for (const [regex, replacement] of rules) result = result.replace(regex, replacement);
  if (isFirstVowel) {
    const dependentToIndependent: Record<string, string> = { 'া': 'আ', 'ে': 'এ', 'ি': 'ই', 'ো': 'ও', 'ু': 'উ' };
    if (dependentToIndependent[result[0]]) result = dependentToIndependent[result[0]] + result.slice(1);
  }
  return result;
};

const englishToBengaliDigits = (str: string): string => {
  const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return str.replace(/[0-9]/g, w => bengaliDigits[parseInt(w)]);
};

export const translateTextOffline = async (text: string): Promise<string> => {
  const cachedMemory = await localforage.getItem<Record<string, string>>('translation_memory') || {};
  const segments = text.split(/([.!?\n]+)/);
  let finalTranslatedText = '';
  for (const segment of segments) {
    if (!segment.trim() || segment.match(/^[.!?\n]+$/)) {
      finalTranslatedText += segment;
      continue;
    }
    const reorderedWords = reorderSentence(segment);
    let translatedWords: string[] = [];
    for (let i = 0; i < reorderedWords.length; i++) {
      const word = reorderedWords[i];
      if (!word.trim()) continue;
      const cleanWordMatch = word.match(/[a-zA-Z\-']+/);
      if (!cleanWordMatch) {
          translatedWords.push(englishToBengaliDigits(word));
          continue;
      }
      const cleanWord = cleanWordMatch[0].toLowerCase();
      const prefix = englishToBengaliDigits(word.substring(0, cleanWordMatch.index));
      const suffix = englishToBengaliDigits(word.substring(cleanWordMatch.index + cleanWordMatch[0].length));
      
      if (cleanWord === "the" && i + 1 < reorderedWords.length) {
          const nextWord = reorderedWords[i+1];
          const nextCleanMatch = nextWord.match(/[a-zA-Z\-']+/);
          if (nextCleanMatch) {
              const nextClean = nextCleanMatch[0].toLowerCase();
              const nextTranslated = await getFromMemory(nextClean, cachedMemory);
              if (nextTranslated) {
                  translatedWords.push(`${prefix}${nextWord.substring(0, nextCleanMatch.index)}${nextTranslated}টি${nextWord.substring(nextCleanMatch.index + nextCleanMatch[0].length)}${suffix}`);
                  i++; continue;
              }
          }
      }
      if ((cleanWord === "a" || cleanWord === "an") && i + 1 < reorderedWords.length) {
          const nextWord = reorderedWords[i+1];
          const nextCleanMatch = nextWord.match(/[a-zA-Z\-']+/);
          if (nextCleanMatch) {
              const nextClean = nextCleanMatch[0].toLowerCase();
              const nextTranslated = await getFromMemory(nextClean, cachedMemory);
              if (nextTranslated) {
                  translatedWords.push(`${prefix}একটি ${nextTranslated}${suffix}`);
                  i++; continue;
              }
          }
      }
      const translated = await getFromMemory(cleanWordMatch[0], cachedMemory);
      if (translated) translatedWords.push(`${prefix}${translated}${suffix}`);
      else {
        const isCapitalized = cleanWordMatch[0][0] === cleanWordMatch[0][0].toUpperCase();
        if (isCapitalized && i > 0) translatedWords.push(`${prefix}${cleanWordMatch[0]}${suffix}`);
        else translatedWords.push(`${prefix}${transliterateToBengali(cleanWord)}${suffix}`);
      }
    }
    finalTranslatedText += translatedWords.join(' ').replace(/\s+([,;:.!?])/g, '$1') + ' ';
  }
  return finalTranslatedText.trim();
};
