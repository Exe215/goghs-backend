import axios from "axios";
import * as dotenv from "dotenv";
import { IndexPath } from "../types/history";

dotenv.config();

/**
 * Convert a JS [Date] to a string "yyyy-mm-dd hh:mm.ss"
 * E.g. "1853-03-30 11:00.00"
 */
export function dateToString(date: Date): string {
  const utcString = date.toISOString();
  const year = utcString.substring(0, 4);
  const month = utcString.substring(5, 7);
  const day = utcString.substring(8, 10);
  const hour = utcString.substring(11, 13);
  const minute = utcString.substring(14, 16);
  const second = utcString.substring(17, 19);
  const formattedString = `${year}-${month}-${day} ${hour}:${minute}.${second}`;
  return formattedString;
}

/**
 * Deep comparison of two indexPaths
 * Checks also that the indexPaths are not empty.
 */
export function indexPathsEqual(a: IndexPath, b: IndexPath): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Returns a [Buffer] from an image url
 * Adds the [name] attribute to buffer.
 *
 * Type defined as File because Metaplex upload expects it
 */
export async function getImageBufferFromUrl(
  url: string,
  name: string
): Promise<File> {
  const imgForImgUrlAtPath = (
    await axios.get(url, {
      responseType: "arraybuffer",
    })
  ).data;
  const imgBuffer: any = Buffer.from(imgForImgUrlAtPath, "utf-8");
  imgBuffer.name = `${name}.png`;
  return imgBuffer;
}

export function base64ToArrayBuffer(base64: string) {
  // Decode the Base64 string into a Buffer
  const buffer = Buffer.from(base64, "base64");

  // Create a Uint8Array from the Buffer
  const byteArray = new Uint8Array(buffer);

  // Create an ArrayBuffer from the Uint8Array
  return byteArray.buffer;
}
