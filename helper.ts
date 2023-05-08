import { Metaplex, toMetaplexFile } from "@metaplex-foundation/js";
import { Program } from "@project-serum/anchor";
import { clusterApiUrl, Connection, Keypair, PublicKey } from "@solana/web3.js";
import axios from "axios";
import * as dotenv from "dotenv";
import { OpenAIApi } from "openai";
import { GoghsProgram } from "./goghs_program";
import {
  AccountData,
  AlreadyInProgressError,
  ExtendedJsonMetadata,
  ImageVariation,
  IndexPath,
  Modification,
  NftHistory,
  ReceiptData,
} from "./types";

dotenv.config();

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
export function indexPathEqual(a: IndexPath, b: IndexPath): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;

  for (var i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Derives and returns the [PublicKey] of:
 * - Receipt PDA: Holds instruction data for the nft modification
 * - Credit PDA: Holds the count for the free credits
 */
export function getProgramAccounts(
  nftAddress: PublicKey,
  userAddress: PublicKey,
  programId: PublicKey
): AccountData {
  // Derive the receipt account based on req parameters
  const [receiptPda] = PublicKey.findProgramAddressSync(
    [nftAddress.toBuffer(), userAddress.toBuffer(), Buffer.from("receipt")],
    programId
  );

  // Derive the credits account in case we need to refund the credit
  const [creditsPda] = PublicKey.findProgramAddressSync(
    [nftAddress.toBuffer(), Buffer.from("credits")],
    programId
  );

  return {
    receiptPda,
    creditsPda,
  };
}

/**
 * Fetch and return the data of [receiptPda]
 * Throws an error if the indexPath is empty or not of type [Array]
 */
export async function getReceiptData(
  receiptPda: PublicKey,
  program: Program<GoghsProgram>
): Promise<ReceiptData> {
  // Retrieve the varation instruction from the receipt account
  const receiptState = await program.account.receiptState.fetch(receiptPda);
  const receiptIndexPath = receiptState.indexPath;
  const inProgress = receiptState.inProgress;
  const receiptTimestamp = receiptState.time.toNumber();
  const paymentType = receiptState.paymentType;
  const instructionType = receiptState.instructionType;
  const oldMetadataUri = receiptState.oldMetadata;

  if (receiptIndexPath.length < 1 || !Array.isArray(receiptIndexPath)) {
    throw new Error("IndexPath not valid");
  }

  return {
    receiptIndexPath,
    receiptTimestamp,
    inProgress,
    paymentType,
    instructionType,
    oldMetadataUri,
  };
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

/**
 * Fetches metadata for an nft.
 *
 * Checks if the [image] property is defined.
 * Casts metadata to [ExtendedJsonMetadata] - (Metadata + History).
 *
 * @returns Metadata object of Nft
 */
export async function getMetadataFromNftMintAddress(
  nftAddress: PublicKey,
  metaplex: Metaplex
): Promise<ExtendedJsonMetadata> {
  const nft = await metaplex.nfts().findByMint({ mintAddress: nftAddress });

  const nftMetaData = (await axios.get(nft.uri)).data as ExtendedJsonMetadata;

  if (!nftMetaData.image) {
    throw new Error("Metadata has no cover image attached to it");
  }

  return nftMetaData;
}

/**
 * @returns New DALLE variation of an image as link.
 */
export async function getOpenAiVariation(
  imageBuffer: File,
  openai: OpenAIApi
): Promise<string> {
  const responseOpenAI = await openai.createImageVariation(
    imageBuffer,
    1,
    "1024x1024"
  );

  const openAiImageUrl = responseOpenAI.data.data[0].url;
  console.log("Received temporary variation url from OpenAi:", openAiImageUrl);

  if (!openAiImageUrl) {
    throw new Error("OpenAI Imageurl undefined");
  }

  return openAiImageUrl;
}

export async function getDreamStudioImgToImgVariation(
  prompt: string,
  imageStrenght: number,
  file: File,
  metaplex: Metaplex
): Promise<string[]> {
  console.log(
    `${new Date().toLocaleTimeString()}: Start image generation call`
  );

  const response = await fetch(
    "https://api.stability.ai/v1/generation/stable-diffusion-xl-beta-v2-2-2/text-to-image",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${process.env.DREAMSTUDIO_API_KEY}`,
      },
      body: JSON.stringify({
        init_image: file,
        init_image_mode: "IMAGE_STRENGTH",
        image_strength: imageStrenght,
        text_prompts: [
          {
            text: prompt,
          },
        ],
        cfg_scale: 7,
        clip_guidance_preset: "FAST_BLUE",
        samples: 3,
        steps: 30,
      }),
    }
  );

  console.log(
    `${new Date().toLocaleTimeString()}: Finish image generation call`
  );
  if (!response.ok) {
    throw new Error(`Non-200 response: ${await response.text()}`);
  }

  interface GenerationResponse {
    artifacts: Array<{
      base64: string;
      seed: number;
      finishReason: string;
    }>;
  }

  const responseJSON = (await response.json()) as GenerationResponse;

  const newMetaplexImageUrls: string[] = [];
  // TODO: Modify to allow a variable number of images
  responseJSON.artifacts.forEach(async (artifact, i) => {
    const buffer = base64ToArrayBuffer(artifact.base64);
    const metaplexFile = toMetaplexFile(buffer, "image.png");

    console.log(
      `${new Date().toLocaleTimeString()}: Start uploading image ${i} to Metaplex`
    );

    const newMetaplexImageUrl = await metaplex.storage().upload(metaplexFile);

    console.log(
      `${new Date().toLocaleTimeString()}: Finish uploading image ${i} to Metaplex`
    );

    newMetaplexImageUrls.push(newMetaplexImageUrl);
  });
  return newMetaplexImageUrls;
}

/**
 *  Creates MetaplexFile.
 *  Uploads it to chosen metaplex storage provider
 *
 *  @returns Link to uploaded file
 */
export async function uploadFileToMetaplex(
  url: string,
  metaplex: Metaplex
): Promise<string> {
  const responseMetaPlex = await axios.get(url, {
    responseType: "arraybuffer",
  });

  let metaplexFile = toMetaplexFile(responseMetaPlex.data, "image.png");

  const newMetaplexImageUrl = await metaplex.storage().upload(metaplexFile);

  console.log(
    "Uploaded variation to permanent metaplex url:",
    newMetaplexImageUrl
  );

  return newMetaplexImageUrl;
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
    focusIndex: 0,
    visiblePath: [0],
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

  let lastIndexInParent = parent.variations.length - 1;

  // adjust the visible path and focus
  let newVisiblePath = [...indexPath, lastIndexInParent];
  let newFocusIndex = newVisiblePath.length - 1;

  const newHistory = {
    focusIndex: newFocusIndex,
    visiblePath: newVisiblePath,
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
 * Fetches nft by mint
 * Uploads a new metadata file to metaplex
 * Updates nft with new metadata file
 */
export async function updateNftWithNewMetadata(
  metaplex: Metaplex,
  nftAddress: PublicKey,
  newMetadata: ExtendedJsonMetadata
) {
  const nft = await metaplex.nfts().findByMint({ mintAddress: nftAddress });

  const { uri: newNftMetaDataUrl } = await metaplex
    .nfts()
    .uploadMetadata(newMetadata);

  await metaplex.nfts().update({
    nftOrSft: nft,
    uri: newNftMetaDataUrl,
  });
}

/**
 * Derive receipt PDA.
 * Return error if receipt is already in progress.
 * Toggle progess indicator on receipt PDA.
 */
export async function startProcessOnReceipt(
  nftAddress: PublicKey,
  userAddress: PublicKey,
  programId: PublicKey,
  program: Program<GoghsProgram>,
  signerWallet: Keypair
) {
  const { receiptPda } = getProgramAccounts(nftAddress, userAddress, programId);

  // Retrieve receipt account data
  // Throws error if index is no array or empty
  const { inProgress } = await getReceiptData(receiptPda, program);

  // Don't handle another request
  if (inProgress) {
    throw new AlreadyInProgressError("Receipt process already started");
  }

  // Set inProgress to true on receipt pda
  await program.methods
    .startProcess()
    .accounts({
      receipt: receiptPda,
      backend: signerWallet.publicKey,
      user: userAddress,
      nftMint: nftAddress,
    })
    .signers([signerWallet])
    .rpc();
}

/**
 * - Fetch data from receipt PDA to get [indexPath]
 * - Get image url at [indexPath] from nft metadata [history]
 * - Create new Variation with openAi
 * - Add to history of metadata
 * - Upload to metaplex and update the nft
 */
export async function createImageVariationAndUpdateNft(
  nftAddress: PublicKey,
  userAddress: PublicKey,
  programId: PublicKey,
  program: Program<GoghsProgram>,
  metaplex: Metaplex,
  openai: OpenAIApi
) {
  const { receiptPda } = getProgramAccounts(nftAddress, userAddress, programId);

  const { receiptIndexPath: indexPath } = await getReceiptData(
    receiptPda,
    program
  );

  const imgUrlAtPath = await getImageAtPath(metaplex, nftAddress, indexPath);

  const imageBuffer = await getImageBufferFromUrl(imgUrlAtPath, "image");

  // ---- CODE FOR DALLE VARIATION ----
  // const openAiImageUrl = await getOpenAiVariation(imageBuffer, openai);

  // console.log(`${new Date().toLocaleTimeString()}: Upload File to Metaplex`);
  // const newMetaplexImageUrl = await uploadFileToMetaplex(
  //   openAiImageUrl,
  //   metaplex
  // );
  // console.log(`${new Date().toLocaleTimeString()}: Successfully uploaded file`);

  const newMetaplexImageUrl = await getDreamStudioImgToImgVariation(
    "a oil portrait of a man wearing sunglasses, in the style of vincent van gogh",
    0.35,
    imageBuffer,
    metaplex
  );

  const metadata = await getMetadataFromNftMintAddress(nftAddress, metaplex);

  const nftWithChangedMetaData = getMetadataWithNewVariations(
    metadata,
    indexPath,
    newMetaplexImageUrl
  );

  console.log(
    `${new Date().toLocaleTimeString()}: Start uploading new Metadata`
  );
  await updateNftWithNewMetadata(metaplex, nftAddress, nftWithChangedMetaData);
  console.log(`${new Date().toLocaleTimeString()}: Finish Modification`);
}

/**
 * Sets image and files attribute to new url in metadata
 * Sets visiblePath to indexPath
 * Sets focusIndex to cover position
 *
 * @returns Updated metadata
 */
export async function setNewCoverImage(
  nftMetaData: ExtendedJsonMetadata,
  indexPath: IndexPath,
  newUrl: string
) {
  // get history property
  const oldHistory: any = nftMetaData!.properties!.history;

  // adjust the visible path and focus
  let newVisiblePath = indexPath;
  let newFocusIndex = newVisiblePath.length - 1;

  const newHistory = {
    focusIndex: newFocusIndex,
    visiblePath: newVisiblePath,
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
    indexPathEqual(favorite, indexPath)
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

/**
 * - Fetch data from receipt PDA to get [indexPath]
 * - Get image url at [indexPath] from nft metadata [history]
 * - Sets new image as [image] attribute on nft metadata
 * - Upload new metadata to metaplex and update the nft
 */
export async function setNewCoverImageAndUpdateNft(
  nftAddress: PublicKey,
  userAddress: PublicKey,
  programId: PublicKey,
  program: Program<GoghsProgram>,
  metaplex: Metaplex
) {
  const nftMetaData = await getMetadataFromNftMintAddress(nftAddress, metaplex);

  const { receiptPda } = getProgramAccounts(nftAddress, userAddress, programId);

  const { receiptIndexPath: indexPath } = await getReceiptData(
    receiptPda,
    program
  );

  const imgUrlAtPath = await getImageAtPath(metaplex, nftAddress, indexPath);

  const metadataWithNewCoverImage = await setNewCoverImage(
    nftMetaData,
    indexPath,
    imgUrlAtPath
  );
  await updateNftWithNewMetadata(
    metaplex,
    nftAddress,
    metadataWithNewCoverImage
  );
}

/**
 * - Fetch data from receipt PDA to get [indexPath]
 * - Get [favorites] array from nft metadata [history]
 * - Toggle existance of [indexPath] in [favorites] array in metadata
 * - Upload new metadata to metaplex and update the nft
 */
export async function toggleFavoriteAndUpdateNft(
  nftAddress: PublicKey,
  userAddress: PublicKey,
  programId: PublicKey,
  program: Program<GoghsProgram>,
  metaplex: Metaplex
) {
  const { receiptPda } = getProgramAccounts(nftAddress, userAddress, programId);

  const { receiptIndexPath: indexPath } = await getReceiptData(
    receiptPda,
    program
  );

  // Check if the indexPath is valid for nft
  // We don't need the uri here
  await getImageAtPath(metaplex, nftAddress, indexPath);

  const newMetadata = await toggleFavoriteOfVariation(
    nftAddress,
    indexPath,
    metaplex
  );

  console.log(JSON.stringify(newMetadata), "nftWithChangedMetaData");

  await updateNftWithNewMetadata(metaplex, nftAddress, newMetadata);
}

/**
 * Closes the receipt PDA account.
 *
 * @param canKeepMoney If this is false, the user will receive a refund.
 */
export async function closeReceiptAccount(
  nftAddress: PublicKey,
  userAddress: PublicKey,
  programId: PublicKey,
  program: Program<GoghsProgram>,
  signer: Keypair,
  metaplex: Metaplex
) {
  let canKeepMoney = true;

  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

  const { creditsPda, receiptPda } = getProgramAccounts(
    nftAddress,
    userAddress,
    programId
  );

  const {
    receiptIndexPath: indexPath,
    inProgress,
    instructionType,
    oldMetadataUri,
  } = await getReceiptData(receiptPda, program);

  const slot = await connection.getSlot();
  const solanaTimestamp = await connection.getBlockTime(slot);

  if (!solanaTimestamp) {
    throw new Error("Could not get the solana time");
  }

  const imgUrlAtPath = await getImageAtPath(metaplex, nftAddress, indexPath);

  const nftMetaData = await getMetadataFromNftMintAddress(nftAddress, metaplex);

  const oldMetadata = (await axios.get(oldMetadataUri))
    .data as ExtendedJsonMetadata;

  const newHistory: NftHistory = nftMetaData.properties.history;
  const oldHistory = oldMetadata.properties.history;

  const nft = await metaplex.nfts().findByMint({ mintAddress: nftAddress });

  // metadata did not change -> update failed
  if (nft.uri === oldMetadataUri) {
    canKeepMoney = false;
  }

  // check if modification was successful
  switch (instructionType) {
    case Modification.CoverChange:
      console.log(imgUrlAtPath, nftMetaData.image, "is the image the same?");
      if (imgUrlAtPath != nftMetaData.image) {
        canKeepMoney = false;
      }
      break;
    case Modification.ToggleFavorite:
      if (oldHistory.favorites.length === newHistory.favorites.length) {
        canKeepMoney = false;
      }
      break;
    case Modification.Variation:
      if (!nftMetaData.attributes || !oldMetadata.attributes) return;
      if (nftMetaData.attributes[0].value === oldMetadata.attributes[0].value) {
        canKeepMoney = false;
      }
      break;
  }

  const tx = await program.methods
    .close(canKeepMoney)
    .accounts({
      receipt: receiptPda,
      nftMint: nftAddress,
      user: userAddress,
      credits: creditsPda,
      backend: signer.publicKey,
    })
    .rpc();

  console.log(
    "CLOSE Transaction",
    `https://explorer.solana.com/tx/${tx}?cluster=devnet`
  );
}

/**
 * Expected req.[params]
 * - nft_address   § "2JJ...UcU"
 * - index_path    § "3XJ...isJ"
 *
 * - Starts process on receipt PDA.
 * - Modify and update Nft metadata.
 * - Close receipt account afterwards.
 * - Refunds user if the modification failed.
 */
export async function modifyNft(
  req: any,
  modification: Modification,
  programId: PublicKey,
  signer: Keypair,
  program: Program<GoghsProgram>,
  metaplex: Metaplex,
  openAi?: OpenAIApi
) {
  // -----------------------------------------------------------------
  // Check parameters

  if (!req.body.nft_address || !req.body.user_address) {
    console.log("ERR Missing Params");
    throw new Error("Missing Params");
  }

  const nftAddress = new PublicKey(req.body.nft_address);
  const userAddress = new PublicKey(req.body.user_address);

  // ------------------------------------------------------------------
  // Set in_progress state true on receipt

  try {
    await startProcessOnReceipt(
      nftAddress,
      userAddress,
      programId,
      program,
      signer
    );
  } catch (e) {
    if (e instanceof AlreadyInProgressError) {
      throw e;
    }
    // TODO retry
    try {
      await closeReceiptAccount(
        nftAddress,
        userAddress,
        programId,
        program,
        signer,
        metaplex
      );
    } catch (e) {
      console.log("ERR closing receipt account failed", e);
      throw new Error("closing receipt account failed");
    }
    console.log("ERR No receipt available", e);
    throw new Error("receipt not available");
  }

  try {
    switch (modification) {
      case Modification.Variation:
        if (!openAi) {
          throw new Error("openAiApi not available");
        }
        await createImageVariationAndUpdateNft(
          nftAddress,
          userAddress,
          programId,
          program,
          metaplex,
          openAi
        );
        break;
      case Modification.CoverChange:
        await setNewCoverImageAndUpdateNft(
          nftAddress,
          userAddress,
          programId,
          program,
          metaplex
        );
        break;
      case Modification.ToggleFavorite:
        await toggleFavoriteAndUpdateNft(
          nftAddress,
          userAddress,
          programId,
          program,
          metaplex
        );
        break;
      default:
        break;
    }
  } catch (e) {
    console.log(e);
    throw new Error("Nft modification failed");
  } finally {
    try {
      await closeReceiptAccount(
        nftAddress,
        userAddress,
        programId,
        program,
        signer,
        metaplex
      );
    } catch (e) {
      console.log("ERR closing receipt account failed", e);
      throw e;
    }
  }
}

export async function closeNftModification(
  req: any,
  program: Program<GoghsProgram>,
  programId: PublicKey,
  signer: Keypair,
  metaplex: Metaplex
) {
  // -----------------------------------------------------------------
  // Check parameters

  if (!req.body.nft_address || !req.body.user_address) {
    console.log("ERR Missing Params");
    throw new Error("Missing Params");
  }

  const nftAddress = new PublicKey(req.body.nft_address);
  const userAddress = new PublicKey(req.body.user_address);

  // check if in progress is true
  // check timer

  await closeReceiptAccount(
    nftAddress,
    userAddress,
    programId,
    program,
    signer,
    metaplex
  );
}

function base64ToArrayBuffer(base64: string) {
  // Decode the Base64 string into a Buffer
  const buffer = Buffer.from(base64, "base64");

  // Create a Uint8Array from the Buffer
  const byteArray = new Uint8Array(buffer);

  // Create an ArrayBuffer from the Uint8Array
  return byteArray.buffer;
}
