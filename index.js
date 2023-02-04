var express = require('express');
var app = express();
const path = require('path');
const fs = require('fs')
const axios = require('axios')
const { Configuration, OpenAIApi } = require("openai");
const configuration = new Configuration({
  apiKey: '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',
});
const openai = new OpenAIApi(configuration);
const fileUpload = require('express-fileupload');
app.use(express.urlencoded());
app.use(express.json());

app.use(fileUpload());

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, '/index.html'));
});


app.listen(3000, function () {
  console.log('Listening on port 3000!');
});

app.post('/api/getImage', async function (req, res) {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
    const url = req.body.imageurl;
    console.log(url);
    
     const responso = await axios.get(url,  { responseType: 'arraybuffer' });
    const buffer = Buffer.from(responso.data, "utf-8");
    buffer.name = "image.png"

    const response = await openai.createImageVariation(
        buffer,
        1,
        "1024x1024"
      );
      image_url = response.data.data[0].url;

    res.send(image_url)


});







