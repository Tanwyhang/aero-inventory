import { getRequestAccessToken } from "@/lib/auth";
import { getCachedSignedPhotoUrls } from "@/lib/cached-data";

type RowWithPhoto = {
  photo_path: string | null;
  photo_url?: string | null;
};

export const SKU_PHOTOS_BUCKET = "sku-photos";

export async function withSignedSkuPhotoUrls<T extends RowWithPhoto>(rows: T[]): Promise<T[]> {
  const paths = Array.from(new Set(rows.map((row) => row.photo_path).filter((path): path is string => Boolean(path))));
  if (paths.length === 0) return rows;

  const accessToken = await getRequestAccessToken();
  if (!accessToken) return rows.map((row) => ({ ...row, photo_url: null }));

  const urls = await getCachedSignedPhotoUrls(paths, accessToken);

  return rows.map((row) => ({
    ...row,
    photo_url: row.photo_path ? urls.get(row.photo_path) ?? null : null,
  }));
}
