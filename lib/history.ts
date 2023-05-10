import { PublicKey } from "@solana/web3.js";
import {
  ExtendedJsonMetadata,
  ImageResult,
  IndexPath,
  NftHistory,
  Prompt,
} from "../types/history";
import { Metaplex } from "@metaplex-foundation/js";
import { getMetadataFromNftMintAddress } from "./solana";
import { indexPathsEqual, dateToString } from "./helper";
import { House } from "../types/program";

const MONA_LISA =
  "https://arweave.net/vAWGoT2FW6CU6C_E4Iz6lf46B_aQJPZPegjkuk82Ps0?ext=png";

const FRIDA_KAHLO =
  "https://arweave.net/o63XgEa9qmdTNjY7KvQ-VXu69NZ--C3y_ACbS11HefU?ext=png";

const VAN_GOGH =
  "https://arweave.net/Prrf0cwGZkSb3mip7BL8D5rZVkzYxCCGQW9bkAYGLd8?ext=png";

/**
 * Get a reference to the variation at the given [indexPath].
 * Returns null if there indexPath is out of bounce
 * for the given history object
 */
export function getVariationAtPath(
  history: NftHistory,
  indexPath: IndexPath
): ImageResult | null {
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
  prompt: Prompt,
  newImageUrls: string[]
): ExtendedJsonMetadata {
  const oldAttributes = nftMetaData?.attributes;

  if (!oldAttributes) {
    throw new Error("Can't find attributes in metadata");
  }
  const oldEvolutionValue = Number(oldAttributes[0].value);
  const newEvolutionValue = oldEvolutionValue + 1;

  // get history property or init if freshly minted
  const currentDate = dateToString(new Date());
  const oldHistory: NftHistory = nftMetaData?.properties?.history;

  const newHistory = { ...oldHistory };

  // find index of prompt in prompt array
  // adds prompt to newHistory if needed
  let promptIndex: number = newHistory.prompts.indexOf(prompt);

  if (promptIndex === -1) {
    newHistory.prompts.push(prompt);
    promptIndex = newHistory.prompts.length - 1;
  }

  // get parent into which we want to insert the new child
  // adds the variations to newHistory
  const parent = getVariationAtPath(newHistory, indexPath)!;
  newImageUrls.forEach((url) => {
    parent.variations.push({
      url,
      created: currentDate,
      prompt: promptIndex,
      variations: [],
    });
  });

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
    ...oldHistory,
    coverPath: indexPath,
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

export async function setHouseSelection(
  selectedHouse: House,
  nftMetaData: ExtendedJsonMetadata
): Promise<ExtendedJsonMetadata> {
  const houseString = Object.keys(House).find(
    (key) => House[key as keyof typeof House] === selectedHouse
  );
  const imageUrl = getBaseImageFromHouse(selectedHouse);
  const history = getInitialHistory(imageUrl);
  const nftWithChangedMetaData = {
    ...nftMetaData,
    attributes: [
      {
        trait_type: "Evolution",
        value: "0",
      },
      {
        trait_type: "Pioneer",
        value: houseString,
      },
    ],
    properties: {
      ...nftMetaData.properties,
      files: [
        {
          uri: imageUrl,
          type: "image/png",
        },
      ],
      history: history,
    },
    image: imageUrl,
  };
  return nftWithChangedMetaData;
}

function getInitialHistory(imageUrl: string): NftHistory {
  const currentDate = dateToString(new Date());

  return {
    coverPath: [0],
    favorites: [],
    baseImages: [
      {
        url: imageUrl,
        created: currentDate,
        prompt: 0,
        variations: [],
      },
    ],
    prompts: [],
    traitValues: [
      "eyes:sunglasses",
      "head:crown",
      "body:hoodie",
      "misc:globe",
      "bg:clouds",
    ],
  };
}

function getBaseImageFromHouse(selectedHouse: House): string {
  let imageUrl = "";

  switch (selectedHouse) {
    case House.Frida:
      imageUrl = FRIDA_KAHLO;
      break;
    case House.Gogh:
      imageUrl = VAN_GOGH;
      break;
    case House.Mona:
      imageUrl = MONA_LISA;
      break;
    default:
      throw new Error("House out of range");
  }
  console.log(`selected base image at: ${imageUrl}`);

  return imageUrl;
}
