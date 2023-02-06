import {
  bundlrStorage,
  keypairIdentity,
  Metaplex,
  MetaplexFile,
  toMetaplexFile,
} from "@metaplex-foundation/js";
import { clusterApiUrl, Connection, Keypair, PublicKey } from "@solana/web3.js";
import axios from "axios";
import cors from "cors";
import express from "express";
//import fetch from "node-fetch";
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
  const mintAddress = req.body.mintAddress;
  //const mintAddress = "2JJUoWhpJK32CoZjkH8w8dSzH9YF7fzXN3zFuvkrrUcU";

  try {

    const mint = mintAddress
    // Get Image from NFT 
    const nft = await metaplex
      .nfts()
      .findByMint({ mintAddress: new PublicKey(mint) });
    const imageUrl = await axios.get(nft.uri);
    console.log(imageUrl)
    const url = imageUrl.data.image

    //OPENAI Variation
    const responseNFT = await axios.get(url, { responseType: "arraybuffer" });
    const buffer = Buffer.from(responseNFT.data, "utf-8");
    const imagefile: any = buffer;
    imagefile.name = "image.png";

    const responseOpenAI = await openai.createImageVariation(imagefile, 1, "1024x1024");
    console.log(responseOpenAI, "response");
    const image_url = responseOpenAI.data.data[0].url;

    let file: MetaplexFile;
    //Get Image and Convert to Metaplex File
    if (!image_url) {
      return
    }
    const responseMetaPlex = await axios.get(image_url, { responseType: 'arraybuffer' });
    file = toMetaplexFile(responseMetaPlex.data, "image.jpg");
    const imageUri = await metaplex.storage().upload(file);


    console.log("Trying to upload the Metadata");

    const { uri } = await metaplex.nfts().uploadMetadata({
      name: "Test",
      description: "My Updated Metadata Description",
      image: imageUri,
    });

    const updatedNft = await metaplex.nfts().update({
      nftOrSft: nft,
      uri,
    });

    res.sendStatus(200)



  } catch (e) {
    console.log(e);
    res.send({ error: e });
  }

});

