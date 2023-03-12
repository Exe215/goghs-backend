import {
  bundlrStorage,
  keypairIdentity,
  Metaplex,
} from "@metaplex-foundation/js";
import {
  AnchorProvider,
  Program,
  setProvider,
  Wallet,
} from "@project-serum/anchor";
import { clusterApiUrl, Connection, Keypair, PublicKey } from "@solana/web3.js";
import axios from "axios";
import cors from "cors";
import express from "express";
import { Configuration, OpenAIApi } from "openai";
import path from "path";
import secret from "./devnet.json";
import { IDL } from "./goghs_program";
import {
  closeReceiptAccount,
  createImageVariationAndUpdateNft,
  getImageAtPath,
  getMetadataFromNftMintAddress,
  getProgramAccounts,
  getReceiptData,
  getVariationAtPath,
  indexPathEqual,
  setNewCoverImageAndUpdateNft,
  startProcessOnReceipt,
} from "./helper";
import { AlreadyInProgressError, ExtendedJsonMetadata } from "./types";

const PROGRAM_ID = new PublicKey(
  "3FuKunkB8zMpFeFKDycDNE7q9ir6Rr1JtE6Wve9vv9UY"
);

// OpenAi Setup
const configuration = new Configuration({
  apiKey: "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",
});
const openai = new OpenAIApi(configuration);

// Wallet Setup
const WALLET = Keypair.fromSecretKey(new Uint8Array(secret));
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

// Anchor Setup
const provider = new AnchorProvider(connection, new Wallet(WALLET), {});
setProvider(provider);
const program = new Program(IDL, PROGRAM_ID);

// Metaplex Setup
const metaplex = new Metaplex(connection);
metaplex.use(keypairIdentity(WALLET));
metaplex.use(
  bundlrStorage({
    address: "https://devnet.bundlr.network",
    providerUrl: "https://api.devnet.solana.com",
    timeout: 60000,
  })
);

var app = express();
app.use(cors());
app.use(express.urlencoded());
app.use(express.json());

app.get("/", function (req, res) {
  res.sendFile(path.join(__dirname, "/index.html"));
});

app.listen(3001, "0.0.0.0", function () {
  console.log("Listening on port 3001!");
});

/// Parameters:
/// - nft_address   § "2JJ...UcU"
/// - index_path    § "3XJ...isJ"
///
/// Checks if [index_path] is valid for the existing history.
/// Extracts the image url for that path.
/// Sets that image to be the new cover.
/// Sets the focusIndex and visiblePath to that new cover.
///
/// Returns error if no history exists yet (means the original nft is untouched => no need to setCover).
app.post("/api/setCover", async function (req, res) {
  console.log("================================");
  console.log("/api/setCover");

  let canKeepMoney = false;

  // ------------------------------------------------------------------
  // Check parameters

  if (!req.body.nft_address || !req.body.user_address) {
    console.log("ERR Missing Params");
    res.sendStatus(400);
    return;
  }

  const nftAddress = new PublicKey(req.body.nft_address);
  const userAddress = new PublicKey(req.body.user_address);

  // ------------------------------------------------------------------
  // Set in_progress state true on receipt

  try {
    startProcessOnReceipt(nftAddress, userAddress, PROGRAM_ID, program, WALLET);
  } catch (e) {
    if (e instanceof AlreadyInProgressError) {
      res.sendStatus(400);
      return;
    }
    // TODO retry
    try {
      await closeReceiptAccount(
        canKeepMoney,
        nftAddress,
        userAddress,
        PROGRAM_ID,
        program,
        WALLET
      );
    } catch (e) {
      console.log("ERR closing receipt account failed", e);
      res.sendStatus(400);
      return;
    }
    console.log("ERR No receipt available", e);
    res.sendStatus(400);
    return;
  }

  // ------------------------------------------------------------------
  // Update nft metadata with new cover image

  try {
    await setNewCoverImageAndUpdateNft(
      nftAddress,
      userAddress,
      PROGRAM_ID,
      program,
      metaplex
    );

    res.sendStatus(200);
  } catch (e) {
    console.log(e);
    res.sendStatus(500);
  } finally {
    try {
      await closeReceiptAccount(
        canKeepMoney,
        nftAddress,
        userAddress,
        PROGRAM_ID,
        program,
        WALLET
      );
    } catch (e) {
      console.log("ERR closing receipt account failed", e);
      res.sendStatus(400);
      return;
    }
  }
});

/// Parameters:
/// - nft_address   § "2JJ...UcU"
/// - index_path    § "3XJ...isJ"
///
/// Extracts the image belonging to [index_path] from the history.
/// Generates a new variation for that image.
/// Inserts that new variation back into the tree as a child of [index_path].
/// Sets the focusIndex and visiblePath to that new variation.
/// Sets that image to be the new cover.
app.post("/api/variation", async function (req, res) {
  console.log("================================");
  console.log("/api/variation");

  // TODO: negate
  let canKeepMoney = false;

  // ------------------------------------------------------------------
  // Check parameters

  if (!req.body.nft_address || !req.body.user_address) {
    console.log("ERR Missing Params");
    res.sendStatus(400);
    return;
  }

  const nftAddress = new PublicKey(req.body.nft_address);
  const userAddress = new PublicKey(req.body.user_address);

  // ------------------------------------------------------------------
  // Set in_progress state true on receipt

  try {
    startProcessOnReceipt(nftAddress, userAddress, PROGRAM_ID, program, WALLET);
  } catch (e) {
    if (e instanceof AlreadyInProgressError) {
      res.sendStatus(400);
      return;
    }
    // TODO retry
    try {
      await closeReceiptAccount(
        canKeepMoney,
        nftAddress,
        userAddress,
        PROGRAM_ID,
        program,
        WALLET
      );
    } catch (e) {
      console.log("ERR closing receipt account failed", e);
      res.sendStatus(400);
      return;
    }
    console.log("ERR No receipt available", e);
    res.sendStatus(400);
    return;
  }

  // ------------------------------------------------------------------
  // Get Image Variation and Update NFT

  try {
    await createImageVariationAndUpdateNft(
      nftAddress,
      userAddress,
      PROGRAM_ID,
      program,
      metaplex,
      openai
    );
    canKeepMoney = true;
    res.sendStatus(200);
  } catch (e) {
    console.log(e);
    res.sendStatus(500);
  } finally {
    try {
      await closeReceiptAccount(
        canKeepMoney,
        nftAddress,
        userAddress,
        PROGRAM_ID,
        program,
        WALLET
      );
    } catch (e) {
      console.log("ERR closing receipt account failed", e);
      res.sendStatus(400);
      return;
    }
  }
});

app.post("/api/toggleFavorite", async function (req, res) {
  console.log("================================");
  console.log("/api/toggleFavorite");

  // Determine if user should be refunded
  let isSuccessful = true;

  // ------------------------------------------------------------------
  // Check parameters

  let indexPath: number[];

  if (!req.body.nft_address || !req.body.user_address) {
    console.log("ERR Missing Params");
    res.sendStatus(400);
    return;
  }

  const nftAddress = new PublicKey(req.body.nft_address);
  const userAddress = new PublicKey(req.body.user_address);

  const { creditsPda, receiptPda } = getProgramAccounts(
    nftAddress,
    userAddress,
    PROGRAM_ID
  );

  try {
    // Throws error if index is no array or empty
    const { receiptIndexPath, inProgress } = await getReceiptData(
      receiptPda,
      program
    );
    indexPath = receiptIndexPath;

    // If receipt is already in progress we should not handle another request
    if (inProgress) {
      console.log("ERR Receipt already in progress");
      res.sendStatus(400);
      return;
    }

    // Set inProgress to true on receipt pda
    const startTx = await program.methods
      .startProcess()
      .accounts({
        receipt: receiptPda,
        backend: WALLET.publicKey,
        user: userAddress,
        nftMint: nftAddress,
      })
      .signers([WALLET])
      .rpc();

    console.log(
      `https://explorer.solana.com/tx/${startTx}?cluster=devnet`,
      "StartTransaction"
    );

    const nft = await metaplex
      .nfts()
      .findByMint({ mintAddress: new PublicKey(nftAddress) });

    const nftMetaData = (await axios.get(nft.uri)).data as ExtendedJsonMetadata;
    if (!nftMetaData) {
      isSuccessful = false;
      console.log("No metadata in nft");
      res.sendStatus(500);
      return;
    }

    // ------------------------------------------------------------------
    // Check if the path is valid

    let history = nftMetaData.properties.history;
    if (history) {
      // We return 400 at the top if length is less than one
      if (!getVariationAtPath(history, indexPath)) {
        isSuccessful = false;
        console.log("Index path does not exist");
        res.sendStatus(400);
        return;
      }
    } else {
      // TODO: this will never happen if we initialize history at mint
      isSuccessful = false;
      console.log("History is not available");
      res.sendStatus(400);
      return;
    }

    // ------------------------------------------------------------------
    // Remove or add indexPath to favorites

    const existingIndex = history.favorites.findIndex((favorite) =>
      indexPathEqual(favorite, indexPath)
    );

    if (existingIndex === -1) {
      history.favorites.push(indexPath);
    } else {
      history.favorites.splice(existingIndex, 1);
    }

    // ------------------------------------------------------------------
    // Update metadata

    const nftWithChangedMetaData = {
      ...nftMetaData,
      properties: {
        ...nftMetaData.properties,
        history, // modified the old history
      },
    };

    console.log(
      JSON.stringify(nftWithChangedMetaData),
      "nftWithChangedMetaData"
    );

    const { uri: newNftMetaDataUrl } = await metaplex
      .nfts()
      .uploadMetadata(nftWithChangedMetaData);

    await metaplex.nfts().update({
      nftOrSft: nft,
      uri: newNftMetaDataUrl,
    });

    res.sendStatus(200);
  } catch (e) {
    isSuccessful = false;
    console.log(e);
    res.sendStatus(500);
  } finally {
    const tx = await program.methods
      .close(isSuccessful)
      .accounts({
        receipt: receiptPda,
        nftMint: nftAddress,
        user: userAddress,
        credits: creditsPda,
        backend: WALLET.publicKey,
      })
      .rpc();
    console.log(
      `https://explorer.solana.com/tx/${tx}?cluster=devnet`,
      "FINALLY CLOSE Transaction"
    );
  }
});
export default app;
