import { Metaplex, toMetaplexFile } from "@metaplex-foundation/js";
import { Program } from "@project-serum/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { GoghsProgram } from "./goghs_program";
import {
  AccountData,
  AlreadyInProgressError,
  ExtendedJsonMetadata,
  ImageVariation,
  IndexPath,
  NftHistory,
  ReceiptData,
} from "./types";
import axios from "axios";
import { OpenAIApi } from "openai";

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
 * Derives and returns the addresses of:
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
 * Throws an error if the indexPath is empty
 */
export async function getReceiptData(
  receiptPda: PublicKey,
  program: Program<GoghsProgram>
): Promise<ReceiptData> {
  try {
    // Retrieve the varation instruction from the receipt account
    const receiptState = await program.account.receiptState.fetch(receiptPda);
    const receiptIndexPath = receiptState.indexPath;
    const inProgress = receiptState.inProgress;
    const receiptTimestamp = receiptState.time.toNumber();
    const paymentType = receiptState.paymentType;

    if (receiptIndexPath.length < 1 || !Array.isArray(receiptIndexPath)) {
      throw new Error("IndexPath not valid");
    }

    return {
      receiptIndexPath,
      receiptTimestamp,
      inProgress,
      paymentType,
    };
  } catch (e) {
    throw e;
  }
}

export async function getImageAtPath(
  metaplex: Metaplex,
  nftAddress: PublicKey,
  indexPath: IndexPath
): Promise<string> {
  try {
    let imgUrlAtPath: string;

    const nftMetaData = await getMetadataFromNftMintAddress(
      nftAddress,
      metaplex
    );

    // Image cannot be null here
    const nftCoverImageUrl: string = nftMetaData.image!;

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
        throw new Error(
          "History is empty but indexPath does not point to root"
        );
      }
      imgUrlAtPath = nftCoverImageUrl;
    }
    console.log("Found imgUrlAtPath:", imgUrlAtPath);
    return imgUrlAtPath;
  } catch (e) {
    throw e;
  }
}

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

export async function getOpenAiVariation(
  imageBuffer: File,
  openai: OpenAIApi
): Promise<string> {
  try {
    const responseOpenAI = await openai.createImageVariation(
      imageBuffer,
      1,
      "1024x1024"
    );

    const openAiImageUrl = responseOpenAI.data.data[0].url;
    console.log(
      "Received temporary variation url from OpenAi:",
      openAiImageUrl
    );

    if (!openAiImageUrl) {
      throw new Error("OpenAI Imageurl undefined");
    }

    return openAiImageUrl;
  } catch (e) {
    throw e;
  }
}

export async function uploadFileToMetaplex(
  url: string,
  metaplex: Metaplex
): Promise<string> {
  const responseMetaPlex = await axios.get(url, {
    responseType: "arraybuffer",
  });

  let metaplexFile = toMetaplexFile(responseMetaPlex.data, "image.jpg");

  const newMetaplexImageUrl = await metaplex.storage().upload(metaplexFile);

  console.log(
    "Uploaded variation to permanent metaplex url:",
    newMetaplexImageUrl
  );

  return newMetaplexImageUrl;
}

export function getUpdatedNftMetadata(
  nftMetaData: ExtendedJsonMetadata,
  indexPath: IndexPath,
  newImageUrl: string
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
  parent.variations.push({
    url: newImageUrl,
    created: currentDate,
    variations: [],
  });

  let lastIndexInParent = parent.variations.length - 1;
  console.log(lastIndexInParent, "lastIndexInParent");

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
      files: [
        {
          uri: newImageUrl,
          type: "image/png",
        },
      ],
      history: newHistory,
    },
    image: newImageUrl,
  };

  console.log(JSON.stringify(nftWithChangedMetaData), "nftWithChangedMetaData");

  return nftWithChangedMetaData;
}

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

export async function startProcessOnReceipt(
  nftAddress: PublicKey,
  userAddress: PublicKey,
  programId: PublicKey,
  program: Program<GoghsProgram>,
  signerWallet: Keypair
) {
  try {
    const { receiptPda } = getProgramAccounts(
      nftAddress,
      userAddress,
      programId
    );

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
  } catch (e) {
    throw e;
  }
}

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

  const openAiImageUrl = await getOpenAiVariation(imageBuffer, openai);

  const newMetaplexImageUrl = await uploadFileToMetaplex(
    openAiImageUrl,
    metaplex
  );

  const metadata = await getMetadataFromNftMintAddress(nftAddress, metaplex);

  const nftWithChangedMetaData = getUpdatedNftMetadata(
    metadata,
    indexPath,
    newMetaplexImageUrl
  );

  await updateNftWithNewMetadata(metaplex, nftAddress, nftWithChangedMetaData);
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

  console.log(JSON.stringify(nftWithChangedMetaData), "nftWithChangedMetaData");

  return nftWithChangedMetaData;
}

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

export async function closeReceiptAccount(
  isSuccessful: boolean,
  nftAddress: PublicKey,
  userAddress: PublicKey,
  programId: PublicKey,
  program: Program<GoghsProgram>,
  signer: Keypair
) {
  const { creditsPda, receiptPda } = getProgramAccounts(
    nftAddress,
    userAddress,
    programId
  );

  const tx = await program.methods
    .close(isSuccessful)
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
