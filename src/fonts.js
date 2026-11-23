// Noto fonts (OFL) as lazy assets: each URL is fetched only when a document needs that script/weight.
// Keys and files match font-files.js (generated from the same table).
import f0r from '@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf?url';
import f0b from '@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf?url';
import f1r from '@expo-google-fonts/noto-sans-devanagari/400Regular/NotoSansDevanagari_400Regular.ttf?url';
import f1b from '@expo-google-fonts/noto-sans-devanagari/700Bold/NotoSansDevanagari_700Bold.ttf?url';
import f2r from '@expo-google-fonts/noto-sans-bengali/400Regular/NotoSansBengali_400Regular.ttf?url';
import f2b from '@expo-google-fonts/noto-sans-bengali/700Bold/NotoSansBengali_700Bold.ttf?url';
import f3r from '@expo-google-fonts/noto-sans-gurmukhi/400Regular/NotoSansGurmukhi_400Regular.ttf?url';
import f3b from '@expo-google-fonts/noto-sans-gurmukhi/700Bold/NotoSansGurmukhi_700Bold.ttf?url';
import f4r from '@expo-google-fonts/noto-sans-gujarati/400Regular/NotoSansGujarati_400Regular.ttf?url';
import f4b from '@expo-google-fonts/noto-sans-gujarati/700Bold/NotoSansGujarati_700Bold.ttf?url';
import f5r from '@expo-google-fonts/noto-sans-oriya/400Regular/NotoSansOriya_400Regular.ttf?url';
import f5b from '@expo-google-fonts/noto-sans-oriya/700Bold/NotoSansOriya_700Bold.ttf?url';
import f6r from '@expo-google-fonts/noto-sans-tamil/400Regular/NotoSansTamil_400Regular.ttf?url';
import f6b from '@expo-google-fonts/noto-sans-tamil/700Bold/NotoSansTamil_700Bold.ttf?url';
import f7r from '@expo-google-fonts/noto-sans-telugu/400Regular/NotoSansTelugu_400Regular.ttf?url';
import f7b from '@expo-google-fonts/noto-sans-telugu/700Bold/NotoSansTelugu_700Bold.ttf?url';
import f8r from '@expo-google-fonts/noto-sans-kannada/400Regular/NotoSansKannada_400Regular.ttf?url';
import f8b from '@expo-google-fonts/noto-sans-kannada/700Bold/NotoSansKannada_700Bold.ttf?url';
import f9r from '@expo-google-fonts/noto-sans-malayalam/400Regular/NotoSansMalayalam_400Regular.ttf?url';
import f9b from '@expo-google-fonts/noto-sans-malayalam/700Bold/NotoSansMalayalam_700Bold.ttf?url';
import f10r from '@expo-google-fonts/noto-sans-sinhala/400Regular/NotoSansSinhala_400Regular.ttf?url';
import f10b from '@expo-google-fonts/noto-sans-sinhala/700Bold/NotoSansSinhala_700Bold.ttf?url';
import f11r from '@expo-google-fonts/noto-sans-arabic/400Regular/NotoSansArabic_400Regular.ttf?url';
import f11b from '@expo-google-fonts/noto-sans-arabic/700Bold/NotoSansArabic_700Bold.ttf?url';
import f12r from '@expo-google-fonts/noto-sans-hebrew/400Regular/NotoSansHebrew_400Regular.ttf?url';
import f12b from '@expo-google-fonts/noto-sans-hebrew/700Bold/NotoSansHebrew_700Bold.ttf?url';
import f13r from '@expo-google-fonts/noto-sans-thai/400Regular/NotoSansThai_400Regular.ttf?url';
import f13b from '@expo-google-fonts/noto-sans-thai/700Bold/NotoSansThai_700Bold.ttf?url';
import f14r from '@expo-google-fonts/noto-sans-sc/400Regular/NotoSansSC_400Regular.ttf?url';
import f14b from '@expo-google-fonts/noto-sans-sc/700Bold/NotoSansSC_700Bold.ttf?url';
import f15r from '@expo-google-fonts/noto-sans-jp/400Regular/NotoSansJP_400Regular.ttf?url';
import f15b from '@expo-google-fonts/noto-sans-jp/700Bold/NotoSansJP_700Bold.ttf?url';
import f16r from '@expo-google-fonts/noto-sans-kr/400Regular/NotoSansKR_400Regular.ttf?url';
import f16b from '@expo-google-fonts/noto-sans-kr/700Bold/NotoSansKR_700Bold.ttf?url';

const URLS = { 'latin': f0r, 'latin-bold': f0b, 'devanagari': f1r, 'devanagari-bold': f1b, 'bengali': f2r, 'bengali-bold': f2b, 'gurmukhi': f3r, 'gurmukhi-bold': f3b, 'gujarati': f4r, 'gujarati-bold': f4b, 'oriya': f5r, 'oriya-bold': f5b, 'tamil': f6r, 'tamil-bold': f6b, 'telugu': f7r, 'telugu-bold': f7b, 'kannada': f8r, 'kannada-bold': f8b, 'malayalam': f9r, 'malayalam-bold': f9b, 'sinhala': f10r, 'sinhala-bold': f10b, 'arabic': f11r, 'arabic-bold': f11b, 'hebrew': f12r, 'hebrew-bold': f12b, 'thai': f13r, 'thai-bold': f13b, 'sc': f14r, 'sc-bold': f14b, 'jp': f15r, 'jp-bold': f15b, 'kr': f16r, 'kr-bold': f16b };
const cache = new Map();

export function loadFont(key) {
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      try {
        const res = await fetch(URLS[key]);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return new Uint8Array(await res.arrayBuffer());
      } catch (e) {
        cache.delete(key); // allow a retry after a network hiccup
        throw new Error(`Could not load the ${key} font (${e.message})`);
      }
    })());
  }
  return cache.get(key);
}
