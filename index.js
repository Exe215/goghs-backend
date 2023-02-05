import express from 'express';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import fetch, { Headers } from 'node-fetch';
import cors from 'cors';
import { toMetaplexFile } from '@metaplex-foundation/js';
import { Configuration, OpenAIApi } from "openai"

const configuration = new Configuration({
  apiKey: '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',
});
const openai = new OpenAIApi(configuration);

var app = express();
app.use(cors());
app.use(express.urlencoded());
app.use(express.json());

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, '/index.html'));
});


app.listen(3001,'0.0.0.0', function () {
  console.log('Listening on port 3001!');
});

app.post('/api/getImage', async function (req, res) {
    const url = req.body.imageurl;
    console.log(url);
    
    try{
      const responso = await axios.get(url,  { responseType: 'arraybuffer' });
      const buffer = Buffer.from(responso.data, "utf-8");
      buffer.name = "image.png"
  
      const response = await openai.createImageVariation(
          buffer,
          1,
          "1024x1024"
        );
        console.log(response, 'response')
        const image_url = response.data.data[0].url;

        
        console.log(image_url)
        let file ;
        fetch(image_url)
          .then(response => response.arrayBuffer())
          .then(arrayBuffer => {
            file = toMetaplexFile(arrayBuffer, 'image.jpg');
            console.log(file)
            res.send({file});
          });


      
    }catch(e) {
      console.log(e);
      res.send({ error: e});
    }
    


});







