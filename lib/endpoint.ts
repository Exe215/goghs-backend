import { Keypair, PublicKey } from "@solana/web3.js";
import {
  AlreadyInProgressError,
  House,
  Modification,
  ReceiptData,
} from "../types/program";
import { Program } from "@project-serum/anchor";
import { GoghsProgram } from "../goghs_program";
import { Metaplex } from "@metaplex-foundation/js";
import { OpenAIApi } from "openai";
import {
  closeReceiptAccount,
  getMetadataFromNftMintAddress,
  getProgramAccounts,
  getReceiptData,
  startProcessOnReceipt,
  updateNftWithNewMetadata,
} from "./solana";
import {
  getImageAtPath,
  getMetadataWithNewVariations,
  setHouseSelection,
  setNewCoverImage,
  toggleFavoriteOfVariation,
} from "./history";
import { getImageBufferFromUrl } from "./helper";
import { ExtendedJsonMetadata } from "../types/history";
import { getDreamStudioImgToImgVariation } from "./api";
import { checkIfSelectedPromptIsValid, generateTextFromPrompt } from "./prompt";

export async function closeNftModification(
  req: any,
  program: Program<GoghsProgram>,
  programId: PublicKey,
  signer: Keypair,
  metaplex: Metaplex
): Promise<void> {
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
): Promise<void> {
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
      case Modification.SelectHouse:
        await selectHouseAndUpdateNft(
          nftAddress,
          userAddress,
          programId,
          program,
          metaplex
        );
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
): Promise<void> {
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
): Promise<void> {
  const { receiptPda } = getProgramAccounts(nftAddress, userAddress, programId);

  const { receiptIndexPath: indexPath, prompt }: ReceiptData =
    await getReceiptData(receiptPda, program);

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

  const metadata = await getMetadataFromNftMintAddress(nftAddress, metaplex);

  // throws an error if a trait in prompt is not valid
  checkIfSelectedPromptIsValid(prompt, metadata);

  const promptText = generateTextFromPrompt(prompt);

  const newMetaplexImageUrl = await getDreamStudioImgToImgVariation(
    promptText,
    0.2,
    imageBuffer,
    metaplex
  );

  const nftWithChangedMetaData = getMetadataWithNewVariations(
    metadata,
    indexPath,
    prompt,
    newMetaplexImageUrl
  );

  console.log(
    `${new Date().toLocaleTimeString()}: Start uploading new Metadata`
  );
  await updateNftWithNewMetadata(metaplex, nftAddress, nftWithChangedMetaData);
  console.log(`${new Date().toLocaleTimeString()}: Finish Modification`);
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
): Promise<void> {
  const nftMetaData = await getMetadataFromNftMintAddress(nftAddress, metaplex);

  const { receiptPda } = getProgramAccounts(nftAddress, userAddress, programId);

  const { receiptIndexPath: indexPath } = await getReceiptData(
    receiptPda,
    program
  );

  const imgUrlAtPath = await getImageAtPath(metaplex, nftAddress, indexPath);

  const metadataWithNewCoverImage: ExtendedJsonMetadata =
    await setNewCoverImage(nftMetaData, indexPath, imgUrlAtPath);

  await updateNftWithNewMetadata(
    metaplex,
    nftAddress,
    metadataWithNewCoverImage
  );
}

export async function selectHouseAndUpdateNft(
  nftAddress: PublicKey,
  userAddress: PublicKey,
  programId: PublicKey,
  program: Program<GoghsProgram>,
  metaplex: Metaplex
) {
  const { receiptPda } = getProgramAccounts(nftAddress, userAddress, programId);

  const nftMetaData = await getMetadataFromNftMintAddress(nftAddress, metaplex);

  // IndexPath is used as variable for the selected house
  const { instructionType, receiptIndexPath: indexPath } = await getReceiptData(
    receiptPda,
    program
  );

  if (instructionType != Modification.SelectHouse) {
    throw new Error("Wrong instruction type in receipt");
  }

  if (indexPath.length != 1 && indexPath[0] >= 0 && indexPath[0] <= 3) {
    throw new Error("House selection not clear");
  }

  const selectedHouse = indexPath[0];

  const metadataWithSelectedHouse = await setHouseSelection(
    selectedHouse,
    nftMetaData
  );

  await updateNftWithNewMetadata(
    metaplex,
    nftAddress,
    metadataWithSelectedHouse
  );
}
