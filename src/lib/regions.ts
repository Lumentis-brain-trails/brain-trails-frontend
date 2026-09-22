/**
 * Countries and languages as codes, named by the browser.
 *
 * The backend validates these by shape (ISO 3166-1 alpha-2, ISO 639-1) and deliberately
 * does not serve the lists: 250 country names from our API would only go stale, and
 * `Intl.DisplayNames` already knows them in the reader's own language. So the codes live
 * here as data and the words are asked for at render time.
 *
 * Unlike the product's own taxonomies these are not "base categories plus other": a
 * short list would push the twentieth country into `other` and lose exactly the signal
 * worth having - where the interest is coming from.
 */

const COUNTRY_CODES =
  "AD AE AF AG AI AL AM AO AR AT AU AW AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ " +
  "CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM " +
  "FR GA GB GD GE GH GM GN GQ GR GT GW GY HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG " +
  "KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MR " +
  "MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PT PW PY QA RO RS RU " +
  "RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV " +
  "TW TZ UA UG US UY UZ VA VC VE VN VU WS YE ZA ZM ZW";

/** ISO 639-1 codes worth offering: the languages our readers actually record in. */
const LANGUAGE_CODES =
  "ar bg bn cs da de el en es et fa fi fr he hi hr hu id it ja ko lt lv ms nl no pl pt ro ru " +
  "sk sl sr sv sw ta th tr uk ur vi zh";

function named(
  codes: string,
  type: "region" | "language"
): { code: string; name: string }[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(undefined, { type });
  } catch {
    names = null; // very old engine: the codes themselves still work as labels
  }
  return codes
    .split(" ")
    .map((code) => ({ code, name: names?.of(code) ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Every country, sorted by its name in the reader's locale. */
export function countries(): { code: string; name: string }[] {
  return named(COUNTRY_CODES, "region");
}

/** The offered languages, sorted by name in the reader's locale. */
export function languages(): { code: string; name: string }[] {
  return named(LANGUAGE_CODES, "language");
}
