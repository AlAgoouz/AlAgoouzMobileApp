type MenuPrice = number | null;
type MenuSection = {
  title: string;
  columns: readonly string[];
  rows: ReadonlyArray<readonly [name: string, ...prices: MenuPrice[]]>;
};

const imageDigest = '24b4b613d30f84ae57c538076b9e8d6e6e3fa7ecd15fc9b8ef2420ed08a0f4db';
const weights = ['الكيلو', 'الربع كيلو'];

// Transcribed from the matching public menu image. A replacement image needs its own verified transcript.
export const menuTranscript = {
  sections: [
    {
      title: 'ركن البن السادة',
      columns: weights,
      rows: [
        ['برازيلي', 600, 150], ['حبشي', 800, 220], ['كولومبي', 1000, 260],
        ['هندي روبيستا', 560, null], ['هندي أرابيكا', 900, 240], ['يمني', 1400, 360],
      ],
    },
    {
      title: 'التوليفات والخلطات الخاصة',
      columns: weights,
      rows: [
        ['توليفة شرقي', 540, 140], ['توليفة اسبشيال', 640, 160], ['توليفة العجوز', 680, 175],
        ['توليفة مزاج العجوز', 800, 200], ['توليفة اسبرسو', 1000, 250], ['بن نكهات', 800, 200],
      ],
    },
    {
      title: 'المشروبات السريعة',
      columns: ['السعر'],
      rows: [
        ['نسكافيه بلاك', 25], ['هوت شوكلت', 40], ['كابتشينو', 45],
        ['اسبرسو سنجل', 30], ['اسبرسو دبل', 40], ['قهوة تركي [سنجل]', 20],
        ['تركي دبل', 30], ['فرنساوي [كوب]', 30], ['بن نكهات', 35],
      ],
    },
    {
      title: 'التحويجات [إضافات]',
      columns: ['السعر'],
      rows: [
        ['تحويجة شرقي', 40], ['تحويجة العجوز', 60], ['تحويجة عدلات', 80], ['إضافة نكهات', 30],
      ],
    },
  ] satisfies MenuSection[],
  phone: '01211444388',
  phoneText: '012-11444388',
  address: 'شارع المطافي متفرع من شارع المطرية الرئيسي، الزيتون الغربية',
};

export async function hasMenuTranscript(image: string): Promise<boolean> {
  if (!globalThis.crypto?.subtle) return false;
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(image));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') === imageDigest;
  } catch {
    return false;
  }
}
