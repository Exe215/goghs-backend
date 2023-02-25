import {
  bundlrStorage,
  keypairIdentity,
  Metaplex,
  toMetaplexFile,
} from "@metaplex-foundation/js";
import { clusterApiUrl, Connection, Keypair, PublicKey } from "@solana/web3.js";
import axios from "axios";
import cors from "cors";
import express from "express";
import { Configuration, OpenAIApi } from "openai";
import path from "path";
import secret from "./devnet.json";
import { ExtendedJsonMetadata, IndexPath, NftHistory } from "./types";
import { dateToString, getVariationAtPath, indexPathEqual } from "./helper";

const configuration = new Configuration({
  apiKey: "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",
});
const openai = new OpenAIApi(configuration);

const WALLET = Keypair.fromSecretKey(new Uint8Array(secret));
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
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

// TODO add transaction ID for payment check !!!!!!!!!!!!!!!!!!!!!!!!!!!
/// Parameters:
/// - nft_address   § "2JJ...UcU"
/// - index_path    § [0,1,0]
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

  // ------------------------------------------------------------------
  // Check parameters

  let nftAddress: string;
  let indexPath: Array<number>;
  try {
    nftAddress = req.body.nft_address;
    indexPath = req.body.index_path;
    if (indexPath.length < 1) {
      console.log("ERR empty index path");
      res.sendStatus(400);
      return;
    }
  } catch {
    console.log("ERR missing params", req);
    res.sendStatus(400);
    return;
  }

  try {
    const nft = await metaplex
      .nfts()
      .findByMint({ mintAddress: new PublicKey(nftAddress) });

    const nftMetaData = (await axios.get(nft.uri)).data as ExtendedJsonMetadata;
    if (!nftMetaData) {
      console.log("No metadata in nft");
      res.sendStatus(500);
      return;
    }

    // ------------------------------------------------------------------
    // Check if the path is valid

    let imgUrlAtPath;
    let history = nftMetaData.properties.history;
    if (history) {
      // We return 400 at the top if length is less than one
      imgUrlAtPath = getVariationAtPath(history, indexPath)!.url;
    } else {
      // if the metadata does not have the history prop,
      // it is a freshly minted one and does not need to be set
      console.log(
        "ERR no history yet; does not make sense to request a cover set",
        indexPath
      );
      res.sendStatus(400);
      return;
    }
    console.log("Found imgUrlAtPath:", imgUrlAtPath);

    // ------------------------------------------------------------------
    // Update the nft meta data

    // get history property or init if freshly minted
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
            uri: imgUrlAtPath,
            type: "image/png",
          },
        ],
        history: newHistory,
      },
      image: imgUrlAtPath,
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
    console.log(e);
    res.sendStatus(500);
  }
});

// TODO add transaction ID for payment check !!!!!!!!!!!!!!!!!!!!!!!!!!!
/// Parameters:
/// - nft_address   § "2JJ...UcU"
/// - index_path    § [0,1,0]
///
/// Extracts the image belonging to [index_path] from the history.
/// Generates a new variation for that image.
/// Inserts that new variation back into the tree as a child of [index_path].
/// Sets the focusIndex and visiblePath to that new variation.
/// Sets that image to be the new cover.
app.post("/api/variation", async function (req, res) {
  console.log("================================");
  console.log("/api/variation");

  // ------------------------------------------------------------------
  // Check parameters

  let nftAddress: string;
  let indexPath: Array<number>;
  try {
    nftAddress = req.body.nft_address;
    indexPath = req.body.index_path;
    if (indexPath.length < 1) {
      console.log("ERR empty index path");
      res.sendStatus(400);
      return;
    }
  } catch {
    console.log("ERR missing params", req);
    res.sendStatus(400);
    return;
  }

  try {
    // ------------------------------------------------------------------
    // Extract the image URL that we want to create a variation from

    let imgUrlAtPath: string;

    const nft = await metaplex
      .nfts()
      .findByMint({ mintAddress: new PublicKey(nftAddress) });

    // TODO: handle if data not available
    const nftMetaData = (await axios.get(nft.uri)).data as ExtendedJsonMetadata;

    if (!nftMetaData) {
      console.log("No metadata in nft");
      res.sendStatus(500);
      return;
    }
    const nftCoverImageUrl: string = nftMetaData.image!;

    let history: NftHistory = nftMetaData.properties.history;
    if (history) {
      // index path cannot be empty here
      imgUrlAtPath = getVariationAtPath(history, indexPath)!.url;
    } else {
      let indexPathPointsToRoot = indexPath.length === 1 && indexPath[0] === 0;
      if (!indexPathPointsToRoot) {
        console.log(
          "ERR no history yet, but index path does not point to root",
          indexPath
        );
        res.sendStatus(400);
        return;
      }
      imgUrlAtPath = nftCoverImageUrl;
    }
    console.log("Found imgUrlAtPath:", imgUrlAtPath);

    // ------------------------------------------------------------------
    // Get the actual image for the URL

    const imgForImgUrlAtPath = (
      await axios.get(imgUrlAtPath, {
        responseType: "arraybuffer",
      })
    ).data;
    const imgBuffer: any = Buffer.from(imgForImgUrlAtPath, "utf-8");
    imgBuffer.name = "image.png";

    // ------------------------------------------------------------------
    // Create a variation for the image via OpenAi api

    const responseOpenAI = await openai.createImageVariation(
      imgBuffer,
      1,
      "1024x1024"
    );
    const openAiImageUrl = responseOpenAI.data.data[0].url;
    console.log(
      "Received temporary variation url from OpenAi:",
      openAiImageUrl
    );

    if (!openAiImageUrl) {
      // TODO need to retry or refund the user
      res.sendStatus(500);
      return;
    }

    // ------------------------------------------------------------------
    // Upload new variation as Metaplex File

    const responseMetaPlex = await axios.get(openAiImageUrl, {
      responseType: "arraybuffer",
    });

    let metaplexFile = toMetaplexFile(responseMetaPlex.data, "image.jpg");

    const newMetaplexImageUrl = await metaplex.storage().upload(metaplexFile);

    console.log(
      "Uploaded variation to permanent metaplex url:",
      newMetaplexImageUrl
    );

    // ------------------------------------------------------------------
    // Update the nft meta data

    // get evolution attribute
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
      url: newMetaplexImageUrl,
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
            uri: newMetaplexImageUrl,
            type: "image/png",
          },
        ],
        history: newHistory,
      },
      image: newMetaplexImageUrl,
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
    console.log(e);
    res.sendStatus(500);
  }
});

app.post("/api/toggleFavorite", async function (req, res) {
  console.log("================================");
  console.log("/api/toggleFavorite");

  // ------------------------------------------------------------------
  // Check parameters

  let nftAddress: string;
  let indexPath: IndexPath;
  try {
    nftAddress = req.body.nft_address;
    indexPath = req.body.index_path;
    if (indexPath.length < 1) {
      console.log("ERR empty index path");
      res.sendStatus(400);
      return;
    }
  } catch {
    console.log("ERR missing params", req);
    res.sendStatus(400);
    return;
  }

  try {
    const nft = await metaplex
      .nfts()
      .findByMint({ mintAddress: new PublicKey(nftAddress) });

    const nftMetaData = (await axios.get(nft.uri)).data as ExtendedJsonMetadata;
    if (!nftMetaData) {
      console.log("No metadata in nft");
      res.sendStatus(500);
      return;
    }

    // ------------------------------------------------------------------
    // Check if the path is valid

    let imgUrlAtPath;
    let history = nftMetaData.properties.history;
    if (history) {
      // We return 400 at the top if length is less than one
      try {
        imgUrlAtPath = getVariationAtPath(history, indexPath)!.url;
      } catch (e) {
        console.log("Index path does not exist");
        res.sendStatus(400);
        return;
      }
    } else {
      // TODO: this will never happen if we initialize history at mint
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
    console.log(e);
    res.sendStatus(500);
  }
});
export default app;
