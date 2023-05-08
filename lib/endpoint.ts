import { Keypair, PublicKey } from "@solana/web3.js";
import { AlreadyInProgressError, Modification } from "../types/program";
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
  setNewCoverImage,
  toggleFavoriteOfVariation,
} from "./history";
import { getImageBufferFromUrl } from "./helper";
import { ExtendedJsonMetadata } from "../types/history";
import { getDreamStudioImgToImgVariation } from "./api";

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

  const metadataWithNewCoverImage: ExtendedJsonMetadata =
    await setNewCoverImage(nftMetaData, indexPath, imgUrlAtPath);

  await updateNftWithNewMetadata(
    metaplex,
    nftAddress,
    metadataWithNewCoverImage
  );
}
