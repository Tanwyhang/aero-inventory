import { createClient } from "@/lib/supabase/server";

type RowWithPhoto = {
  photo_path: string | null;
  photo_url?: string | null;
};

export const SKU_PHOTOS_BUCKET = "sku-photos";

export async function withSignedSkuPhotoUrls<T extends RowWithPhoto>(rows: T[]): Promise<T[]> {
  const paths = Array.from(new Set(rows.map((row) => row.photo_path).filter((path): path is string => Boolean(path))));
  if (paths.length === 0) return rows;

  const supabase = await createClient();
  const { data } = await supabase.storage.from(SKU_PHOTOS_BUCKET).createSignedUrls(paths, 60 * 30);
  const urls = new Map(data?.map((item) => [item.path, item.signedUrl]) ?? []);

  return rows.map((row) => ({
    ...row,
    photo_url: row.photo_path ? urls.get(row.photo_path) ?? null : null,
  }));
}
