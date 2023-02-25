import { ImageVariation, IndexPath, NftHistory } from "./types";

export function getVariationAtPath(
  history: NftHistory,
  indexPath: IndexPath
): ImageVariation | null {
  if (!indexPath) return null;

  let current = history.baseImages[indexPath[0]];
  for (let i = 1; i < indexPath.length; i++) {
    // Overwrite reference stored in [current]
    // This way we follow the path with each step
    current = current.variations[indexPath[i]];
  }
  return current;
}

export function dateToString(date: Date): string {
  const utcString = date.toISOString();
  const year = utcString.substring(0, 4);
  const month = utcString.substring(5, 7);
  const day = utcString.substring(8, 10);
  const hour = utcString.substring(11, 13);
  const minute = utcString.substring(14, 16);
  const second = utcString.substring(17, 19);
  console.log(utcString, "test");
  const formattedString = `${year}-${month}-${day} ${hour}:${minute}.${second}`;
  console.log(formattedString, "tttt");
  return formattedString;
}

export function indexPathEqual(a: IndexPath, b: IndexPath): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;

  for (var i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
