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
import fetch from "node-fetch";
import { Configuration, OpenAIApi } from "openai";
import path from "path";
import secret from "./devnet.json";

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

app.post("/api/getImage", async function (req, res) {
  // const mintAddress = req.body.mintAddress;
  const mintAddress = "2JJUoWhpJK32CoZjkH8w8dSzH9YF7fzXN3zFuvkrrUcU";

  try {
    // Find Image Url of metadata
    const nft = await metaplex
      .nfts()
      .findByMint({ mintAddress: new PublicKey(mintAddress) });
    const imageUrl = await axios.get(nft.uri);
    console.log(imageUrl);

    // Fetch
    // const responso = await axios.get(url, { responseType: "arraybuffer" });
    // const buffer = Buffer.from(responso.data, "utf-8");
    // buffer.name = "image.png";

    // const response = await openai.createImageVariation(buffer, 1, "1024x1024");
    // console.log(response, "response");
    // const image_url = response.data.data[0].url;

    // console.log(image_url);
    // let file;
    // fetch(image_url)
    //   .then((response) => response.arrayBuffer())
    //   .then((arrayBuffer) => {
    //     file = toMetaplexFile(arrayBuffer, "image.jpg");
    //     console.log(file);
    //     res.send({ file });
    //   });
  } catch (e) {
    console.log(e);
    res.send({ error: e });
  }
});
