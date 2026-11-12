import {z} from 'zod';

export const menuUrl = 'https://agouz.vercel.app/menu';
const menuItemLimit = 200;
const imageLimit = 90000;
const photo = z.string().max(imageLimit).regex(/^(|data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2})$/);
const phone = z.string().regex(/^(|[+][1-9][0-9]{7,14})$/);
const title = (limit: number) => z.string().trim().min(1).max(limit);
const location = z.string().max(500).refine(value => {
  if (!value) return true;
  if (!/^https:\/\/[^/\s@?#]+[^\s]*$/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
});
const price = z.number().min(0).max(999999.99).multipleOf(0.01);
const menuItem = z.strictObject({
  id: z.string().regex(/^[a-f0-9-]{36}$/),
  name: title(100),
  section: title(60),
  description: z.string().max(240),
  photo,
  visible: z.boolean(),
  prices: z.array(z.strictObject({label: z.string().max(40), amount: price.nullable()})).min(1).max(8),
});
const menuSchema = z.strictObject({
  name: title(80),
  intro: z.string().max(300),
  logo: photo,
  template: z.enum(['classic', 'photos', 'compact']),
  phone,
  whatsapp: phone,
  location,
  items: z.array(menuItem).max(menuItemLimit),
});
export type ShopMenu = z.infer<typeof menuSchema>;
export type MenuItem = ShopMenu['items'][number];
const menuImageLimit = 1200000;
export const menuImageSchema = z.strictObject({
  image: z.string().max(menuImageLimit).regex(/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/),
});
const publicationSchema = z.union([menuImageSchema, menuSchema]);
export type MenuPublication = z.infer<typeof publicationSchema>;

export async function fetchPublishedMenu(signal?: AbortSignal) {
  const env = (import.meta as ImportMeta & {env?: Record<string, string>}).env;
  const url = env?.VITE_SUPABASE_URL?.trim();
  const key = (env?.VITE_SUPABASE_PUBLISHABLE_KEY || env?.VITE_SUPABASE_ANON_KEY)?.trim();
  if (!url || !key) throw Error('Menu service unavailable');
  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/agouz_menu_publication?id=eq.1&select=content,published_at`, {
    headers: {apikey: key},
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw Error('Menu service unavailable');
  const rows: unknown = await response.json();
  const [row] = z.array(z.object({content: publicationSchema, published_at: z.string()})).max(1).parse(rows);
  return row ?? null;
}

export async function compressMenuPhoto(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
    throw Error('اختر صورة JPG أو PNG أو WebP حجمها لحد ٨ ميجابايت.');
  }
  const bitmap = await createImageBitmap(file).catch(() => {
    throw Error('تعذر فتح الصورة. جرّب تختار ملف صورة سليم.');
  });
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw Error('تعذر تجهيز الصورة.');
    for (const maxSide of [3200, 2600, 2000, 1600]) {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL('image/jpeg', 0.86);
      if (menuImageSchema.shape.image.safeParse(image).success) return image;
    }
    throw Error('تعذر تصغير الصورة بما يكفي.');
  } finally {
    bitmap.close();
  }
}
