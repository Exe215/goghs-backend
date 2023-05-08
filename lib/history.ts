import { PublicKey } from "@solana/web3.js";
import {
  ExtendedJsonMetadata,
  ImageVariation,
  IndexPath,
  NftHistory,
} from "../types/history";
import { Metaplex } from "@metaplex-foundation/js";
import { getMetadataFromNftMintAddress } from "./solana";
import { indexPathsEqual, dateToString } from "./helper";

/**
 * Get a reference to the variation at the given [indexPath].
 * Returns null if there indexPath is out of bounce
 * for the given history object
 */
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

/**
 * Retrieve image url of variation at [indexPath].
 *
 * Validates [indexPath] is valid for the history of nft.
 * Throws an error if out index is out of bounce
 */
export async function getImageAtPath(
  metaplex: Metaplex,
  nftAddress: PublicKey,
  indexPath: IndexPath
): Promise<string> {
  let imgUrlAtPath: string;

  const nftMetaData = await getMetadataFromNftMintAddress(nftAddress, metaplex);

  if (!nftMetaData.image) {
    throw new Error("");
  }

  const nftCoverImageUrl: string = nftMetaData.image;

  let history: NftHistory = nftMetaData.properties.history;
  if (history) {
    // IndexPath cannot be empty here
    const variationAtPath = getVariationAtPath(history, indexPath);
    if (!variationAtPath) {
      throw new Error("No entry in history for given indexPath");
    }
    imgUrlAtPath = variationAtPath.url;
  } else {
    // Case: no history yet -> index must point to root
    let indexPathPointsToRoot = indexPath.length === 1 && indexPath[0] === 0;
    if (!indexPathPointsToRoot) {
      throw new Error("History is empty but indexPath does not point to root");
    }
    imgUrlAtPath = nftCoverImageUrl;
  }
  return imgUrlAtPath;
}

export function getMetadataWithNewVariations(
  nftMetaData: ExtendedJsonMetadata,
  indexPath: IndexPath,
  newImageUrls: string[]
): ExtendedJsonMetadata {
  // get evolution attribute
  const nftCoverImageUrl = nftMetaData.image;
  const oldAttributes = nftMetaData?.attributes || [
    { trait_type: "Evolution", value: "0" },
  ];
  const oldEvolutionValue = Number(oldAttributes[0].value);
  const newEvolutionValue = oldEvolutionValue + 1;

  // get history property or init if freshly minted
  const currentDate = dateToString(new Date());
  const oldHistory = nftMetaData?.properties?.history || {
    // TODO: in the end we will have a placeholder mint image that is not the actual cover
    coverPath: [0],
    favorites: [],
    baseImages: [
      /// TODO: we should initialize this at mint instead
      { url: nftCoverImageUrl, created: currentDate, variations: [] },
    ],
  };

  // get the parent into which we want to insert the new child
  const parent = getVariationAtPath(oldHistory, indexPath)!;
  newImageUrls.forEach((url) => {
    parent.variations.push({
      url,
      created: currentDate,
      variations: [],
    });
  });

  const newHistory: NftHistory = {
    coverPath: oldHistory.coverPath,
    favorites: oldHistory.favorites,
    baseImages: oldHistory.baseImages, // Now includes new child
  };

  const nftWithChangedMetaData = {
    ...nftMetaData,
    attributes: [
      {
        trait_type: "Evolution",
        value: newEvolutionValue.toString(),
      },
    ],
    properties: {
      ...nftMetaData.properties,
      history: newHistory,
    },
  };

  console.log(JSON.stringify(nftWithChangedMetaData), "nftWithChangedMetaData");

  return nftWithChangedMetaData;
}

/**
 * Sets image and files attribute to new url in metadata
 * Sets `coverPath` to `indexPath`
 *
 * @returns Updated metadata
 */
export async function setNewCoverImage(
  nftMetaData: ExtendedJsonMetadata,
  indexPath: IndexPath,
  newUrl: string
): Promise<ExtendedJsonMetadata> {
  // get history property
  const oldHistory: any = nftMetaData!.properties!.history;

  const newHistory: NftHistory = {
    coverPath: indexPath,
    favorites: oldHistory.favorites,
    baseImages: oldHistory.baseImages, // Unchanged
  };

  const nftWithChangedMetaData = {
    ...nftMetaData,
    properties: {
      ...nftMetaData.properties,
      files: [
        {
          uri: newUrl,
          type: "image/png",
        },
      ],
      history: newHistory,
    },
    image: newUrl,
  };

  return nftWithChangedMetaData;
}

/**
 * Toggle [indexpath] of certain variation in favorites array of history
 */
export async function toggleFavoriteOfVariation(
  nftAddress: PublicKey,
  indexPath: IndexPath,
  metaplex: Metaplex
): Promise<ExtendedJsonMetadata> {
  const nftMetaData = await getMetadataFromNftMintAddress(nftAddress, metaplex);

  let history = nftMetaData.properties.history;

  const existingIndex = history.favorites.findIndex((favorite) =>
    indexPathsEqual(favorite, indexPath)
  );

  if (existingIndex === -1) {
    history.favorites.push(indexPath);
  } else {
    history.favorites.splice(existingIndex, 1);
  }

  const nftWithChangedMetaData = {
    ...nftMetaData,
    properties: {
      ...nftMetaData.properties,
      history, // modified the old history
    },
  };

  return nftWithChangedMetaData;
}
