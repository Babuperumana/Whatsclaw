const { Panchang } = require('./panchang-engine');

const panchang = new Panchang();

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_ML = { 'Sunday': 'ഞായർ', 'Monday': 'തിങ്കൾ', 'Tuesday': 'ചൊവ്വ', 'Wednesday': 'ബുധൻ', 'Thursday': 'വ്യാഴം', 'Friday': 'വെള്ളി', 'Saturday': 'ശനി' };

// Nakshathram ML-EN mapping
const NAKS_ML = ['അശ്വതി', 'ഭരണി', 'കാർത്തിക', 'രോഹിണി', 'മകയിരം', 'തിരുവാതിര', 'പുണർതം', 'പൂയം', 'ആയില്യം', 'മകം', 'പൂരം', 'ഉത്രം', 'അത്തം', 'ചിത്തിര', 'ചോതി', 'വിശാഖം', 'അനിഴം', 'തൃക്കേട്ട', 'മൂലം', 'പൂരാടം', 'ഉത്രാടം', 'തിരുവോണം', 'അവിട്ടം', 'ചതയം', 'പൂരുരുട്ടാതി', 'ഉത്രട്ടാതി', 'രേവതി'];
const NAKS_EN = ['Ashwathi', 'Bharani', 'Karthika', 'Rohini', 'Makiryam', 'Thiruvathira', 'Punartham', 'Pooyam', 'Aayilyam', 'Makam', 'Pooram', 'Uthram', 'Atham', 'Chithra', 'Chothi', 'Vishakham', 'Anizham', 'Thrikketta', 'Moolam', 'Pooradam', 'Uthradam', 'Thiruvonam', 'Avittam', 'Chathayam', 'Poororuttathi', 'Uthrattathi', 'Revathi'];
const mlToEn = {};
NAKS_ML.forEach((ml, i) => mlToEn[ml] = NAKS_EN[i]);

// Tithi mapping
const TITH_ML = ["പ്രഥമ", "ദ്വിതീയ", "തൃതീയ", "ചതുർത്ഥി", "പഞ്ചമി", "ഷഷ്ഠി", "സപ്തമി", "അഷ്ടമി", "നവമി", "ദശമി", "ഏകാദശി", "ദ്വാദശി", "ത്രയോദശി", "ചതുർദ്ദശി", "പൗർണ്ണമി", "പ്രഥമ", "ദ്വിതീയ", "തൃതീയ", "ചതുർത്ഥി", "പഞ്ചമി", "ഷഷ്ഠി", "സപ്തമി", "അഷ്ടമി", "നവമി", "ദശമി", "ഏകാദശി", "ദ്വാദശി", "ത്രയോദശി", "ചതുർദ്ദശി", "അമാവാസി"];
const TITH_EN = ["Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi", "Saptami", "Ashtami", "Navami", "Dashami", "Ekadashi", "Dwadashi", "Trayodashi", "Chaturdashi", "Purnima", "Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi", "Saptami", "Ashtami", "Navami", "Dashami", "Ekadashi", "Dwadashi", "Trayodashi", "Chaturdashi", "Amavasya"];

// Rashi mapping
const RASHI_ML = ["മേടം", "ഇടവം", "മിഥുനം", "കർക്കടകം", "ചിങ്ങം", "കന്നി", "തുലാം", "വൃശ്ചികം", "ധനു", "മകരം", "കുംഭം", "മീനം"];
const RASHI_EN = ["Mesha (Aries)", "Vrishabha (Taurus)", "Mithuna (Gemini)", "Karkata (Cancer)", "Simha (Leo)", "Kanya (Virgo)", "Tula (Libra)", "Vrischika (Scorpio)", "Dhanu (Sagittarius)", "Makara (Capricorn)", "Kumbha (Aquarius)", "Meena (Pisces)"];

// Kollavarsham month ML-EN mapping (same order as nak.js ZN array)
const KV_MONTH_ML = ["മേടം", "ഇടവം", "മിഥുനം", "കർക്കടകം", "ചിങ്ങം", "കന്നി", "തുലാം", "വൃശ്ചികം", "ധനു", "മകരം", "കുംഭം", "മീനം"];
const KV_MONTH_EN = ["Medam", "Edavam", "Mithunam", "Karkidakam", "Chingam", "Kanni", "Thulam", "Vrischikam", "Dhanu", "Makaram", "Kumbham", "Meenam"];

// Yoga mapping
const YOG_ML = ["വിഷ്കംഭം", "പ്രീതി", "ആയുഷ്മാൻ", "സൗഭാഗ്യം", "ശോഭനം", "അതിഗണ്ഡം", "സുകർമ്മം", "ധൃതി", "ശൂലം", "ഗണ്ഡം", "വൃദ്ധി", "ധ്രുവം", "വ്യാഘാതം", "ഹർഷണം", "വജ്രം", "സിദ്ധി", "വ്യതീപാതം", "വാരീയാൻ", "പരിഘം", "ശിവം", "സിദ്ധം", "സാധ്യം", "ശുഭം", "ശുക്ലം", "ബ്രഹ്മം", "ഇന്ദ്രം", "വൈധൃതി"];
const YOG_EN = ["Vishkambha", "Priti", "Ayushman", "Saubhagya", "Shobhana", "Atiganda", "Sukarma", "Dhriti", "Shula", "Ganda", "Vriddhi", "Dhruva", "Vyaghata", "Harshana", "Vajra", "Siddhi", "Vyatipata", "Variyan", "Parigha", "Shiva", "Siddha", "Sadhya", "Shubha", "Shukla", "Brahma", "Indra", "Vaidhriti"];

// Karana mapping
const KAR_ML = ["ബവ", "ബാലവ", "കൗലവ", "തൈതുല", "ഗരജ", "വണിജ", "വിഷ്ടി", "ശകുനി", "ചതുഷ്പാദം", "നാഗം", "കിംസ്തുഘ്നൻ"];
const KAR_EN = ["Bava", "Balava", "Kaulava", "Taitila", "Garija", "Vanija", "Vishti", "Shakuni", "Chatushpada", "Naga", "Kimstughna"];

function lookup(arr, enArr, ml) {
  const idx = arr.indexOf(ml);
  return idx >= 0 ? enArr[idx] : ml;
}

function formatAMPM(timeStr) {
  if (!timeStr || timeStr === 'N/A') return timeStr;
  return timeStr.replace(/^0/, '').toUpperCase();
}

function formatTimingAMPM(timeStr) {
  if (!timeStr || timeStr === 'N/A') return timeStr;
  return timeStr.replace(/0(\d:)/g, '$1').toUpperCase();
}

function formatDateTimeIST(d) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const ist = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const mon = months[ist.getMonth()];
  const day = ist.getDate().toString().padStart(2, '0');
  let h = ist.getHours();
  const m = ist.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${mon} ${day} ${h}:${m} ${ampm}`;
}

function getPanchangam(dateStr, lat = 11.074462304803008, lng = 76.28244022235538) {
  const date = new Date(dateStr + 'T12:00:00');
  const dayIndex = date.getDay();
  const dayNameEn = WEEKDAY_NAMES[dayIndex];

  // All calculations from panchang engine
  const nakData = panchang.calculate(date, { lat, lon: lng });

  // Malayalam/Kollavarsham date from engine
  const malMonth = nakData.Malayalam.month;
  const kvMonthEn = lookup(KV_MONTH_ML, KV_MONTH_EN, malMonth);

  // Nakshathram
  const nakName = nakData.Nakshatra.name;
  const isNakshatramLess = nakName === 'ഇന്ന് നാൾ ഇല്ല';
  let dayNakshathram;
  if (isNakshatramLess) {
    const lastNak = nakData.DayNakshatras[nakData.DayNakshatras.length - 1];
    dayNakshathram = { en: mlToEn[lastNak.name] || lastNak.name, ml: lastNak.name };
  } else {
    const baseName = nakName.split(' & ')[0];
    dayNakshathram = { en: mlToEn[baseName] || baseName, ml: nakName };
  }

  // Tithi
  const tithiName = nakData.Tithi.name;
  const tithiIdx = TITH_ML.indexOf(tithiName);
  const paksha = tithiIdx >= 0 && tithiIdx < 15 ? 'Shukla' : 'Krishna';
  const pakshaMl = tithiIdx >= 0 && tithiIdx < 15 ? 'ശുക്ല' : 'കൃഷ്ണ';

  // Nakshatram details (transition times)
  const nakshatramDetails = nakData.DayNakshatras.map(n => ({
    nakshatram: { en: mlToEn[n.name] || n.name, ml: n.name },
    start: formatDateTimeIST(n.start),
    end: formatDateTimeIST(n.end)
  }));

  return {
    gregorian: {
      date: dateStr,
      day: dayNameEn
    },
    kollavarsham: {
      year: nakData.Malayalam.year,
      month: kvMonthEn,
      monthMl: malMonth,
      day: nakData.Malayalam.date
    },
    weekday: {
      en: dayNameEn,
      ml: WEEKDAY_ML[dayNameEn]
    },
    nakshathram: dayNakshathram,
    isNakshatramLess: isNakshatramLess,
    nakshatramDetails: nakshatramDetails,
    tithi: {
      name: lookup(TITH_ML, TITH_EN, tithiName),
      nameMl: tithiName,
      paksha,
      pakshaMl
    },
    rashi: {
      en: lookup(RASHI_ML, RASHI_EN, nakData.Malayalam.month),
      ml: nakData.Malayalam.month
    },
    yoga: {
      en: lookup(YOG_ML, YOG_EN, nakData.Yoga.name),
      ml: nakData.Yoga.name
    },
    karana: {
      en: lookup(KAR_ML, KAR_EN, nakData.Karna.name),
      ml: nakData.Karna.name
    },
    sunrise: formatAMPM(nakData.SunTimes.sunrise),
    sunset: formatAMPM(nakData.SunTimes.sunset),
    vishesham: nakData.Vishesham || [],
    timings: {
      rahukalam: formatTimingAMPM(nakData.Timings.Rahukalam),
      yamagandam: formatTimingAMPM(nakData.Timings.Yamagandam),
      gulika: formatTimingAMPM(nakData.Timings.Gulika)
    },
    location: { lat, lng, name: 'Kerala' }
  };
}

// === Tool Functions ===

function getNextNakshatraDates(nakName, count = 1, lat = 11.074462304803008, lng = 76.28244022235538) {
  const results = [];
  let startDate = new Date();
  startDate.setHours(12, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    // Manual search with includes() to handle compound names like "അശ്വതി & ഭരണി"
    let found = null;
    let curr = new Date(startDate);
    for (let d = 0; d < 40; d++) {
      const res = panchang.calculate(curr, { lat, lon: lng });
      if (res.Nakshatra.name.includes(nakName)) {
        found = { date: new Date(curr), details: res };
        break;
      }
      curr.setDate(curr.getDate() + 1);
    }
    if (!found) break;
    const dateStr = found.date.toISOString().split('T')[0];
    const p = getPanchangam(dateStr, lat, lng);
    results.push({
      date: dateStr,
      weekday: { en: p.weekday.en, ml: p.weekday.ml },
      kollavarsham: p.kollavarsham,
      nakshathram: p.nakshathram
    });
    startDate = new Date(found.date);
    startDate.setDate(startDate.getDate() + 1);
  }
  return results;
}

function convertKvToGregorian(year, monthStr, day) {
  const result = panchang.kollamToGregorian(year, monthStr, day);
  if (!result) return null;
  const dateStr = result.toISOString().split('T')[0];
  const p = getPanchangam(dateStr);
  return {
    gregorianDate: dateStr,
    weekday: p.weekday,
    nakshathram: p.nakshathram
  };
}

function getUpcomingEvents(count = 5, search = '') {
  const events = panchang.findUpcomingEvents(new Date(), count * 3);
  let filtered = events;
  if (search) {
    filtered = events.filter(e => e.name.includes(search));
  }
  return filtered.slice(0, count).map(e => {
    const dateStr = e.date.toISOString().split('T')[0];
    const d = new Date(dateStr + 'T12:00:00');
    const dayNameEn = WEEKDAY_NAMES[d.getDay()];
    const p = panchang.getMalayalamDateFast(d, 11.074462304803008, 76.28244022235538);
    const kvMonthEn = lookup(KV_MONTH_ML, KV_MONTH_EN, p.month);
    return {
      date: dateStr,
      weekday: { en: dayNameEn, ml: WEEKDAY_ML[dayNameEn] },
      kollavarsham: { year: p.year, month: kvMonthEn, monthMl: lookup(KV_MONTH_EN, KV_MONTH_ML, p.month), day: p.date },
      event: e.name
    };
  });
}

function getAllNakshatras() {
  return panchang.getNakshatras();
}

// Static list of the 27 nakshathram names in Malayalam and English.
// Exposed so callers can build selection menus without invoking the engine.
function getNakshatramList() {
  return NAKS_ML.map((ml, i) => ({ ml, en: NAKS_EN[i], index: i }));
}

module.exports = { getPanchangam, getNextNakshatraDates, convertKvToGregorian, getUpcomingEvents, getAllNakshatras, getNakshatramList };
