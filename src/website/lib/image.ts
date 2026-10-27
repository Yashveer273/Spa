// Shrinks a photo in the browser before uploading (used by the admin's therapist photos and the
// customer's UPI payment screenshot), so uploads are small and quick.

/** Resizes to at most `maxSide` px on the longest side and returns a JPEG. */
export async function shrinkImage(file: File, maxSide = 1000, quality = 0.85): Promise<Blob> {
  let img: ImageBitmap;
  try { img = await createImageBitmap(file); } catch { throw new Error("This photo format can't be read. Please use a JPG or PNG photo."); }
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // transparent PNGs get a white background
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Could not prepare the photo. Please try another one.');
  return blob;
}
