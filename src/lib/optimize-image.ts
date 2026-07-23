import "server-only";

import sharp from "sharp";

const MAX_PRODUCT_IMAGE_EDGE = 1200;
const PRODUCT_IMAGE_QUALITY = 72;

export type OptimizedImageUpload = {
  body: File | Buffer;
  contentType: string;
  extension: string;
};

export async function optimizeProductImage(file: File, originalExtension: string): Promise<OptimizedImageUpload> {
  if (file.type === "image/gif") {
    return { body: file, contentType: file.type, extension: originalExtension };
  }

  try {
    const source = Buffer.from(await file.arrayBuffer());
    const body = await sharp(source)
      .rotate()
      .resize({
        width: MAX_PRODUCT_IMAGE_EDGE,
        height: MAX_PRODUCT_IMAGE_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({
        quality: PRODUCT_IMAGE_QUALITY,
        effort: 5,
        smartSubsample: true,
      })
      .toBuffer();

    return { body, contentType: "image/webp", extension: "webp" };
  } catch (error) {
    console.error("Product image optimization failed; uploading the validated original", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : null,
    });
    return { body: file, contentType: file.type, extension: originalExtension };
  }
}
